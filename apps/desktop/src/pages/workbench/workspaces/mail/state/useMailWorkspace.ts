import { useEffect, useRef, useState } from 'react'
import { loadImageDataUrl, loadTextAsset } from '@entities/game/api'
import {
  getAllTextureAssetNames,
  loadItemTextureAssetState,
  loadItemWorkspaceEntries,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '@entities/item'
import type { AssetDraftPort } from '@features/cp-maker'
import type { LocaleCode } from '@locales'
import { useLocale } from '@locales/provider'
import { useWorkbenchEnvironment, useWorkbenchProject } from '@pages/workbench/model/workbenchModuleContexts'
import { useWorkbenchAssetDraftPort, type WorkbenchDraftSaveState } from '@pages/workbench/model/useWorkbenchAssetDraftPort'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
import { deferToTimeout } from '@shared/lib/react'
import {
  buildMailDeliveryGroups,
  classifyMailDelivery,
  getLetterBgSheetGeometry,
  LETTER_BG_ASSET_NAME,
  type LetterBgSheetGeometry,
  mailDraftFromString,
  mailDraftToString,
  type MailDeliveryGroup,
  type MailLetterDraft,
  type MailLetterSummary,
  type MailTriggerDraft,
  type MailValidationIssue,
  parseMailString,
  summarizeIssues,
  triggerDraftFromEntry,
  triggerDraftToEntry,
  validateMailLetter,
} from '../entities/mail'

const MAIL_WORKSPACE_ID = 'mail' as const

/** CP asset holding the letters themselves; the game spells it lowercase. */
const MAIL_TARGET = 'Data/mail'

/** CP asset holding the trigger entries that deliver the letters. */
const TRIGGER_TARGET = 'Data/TriggerActions'

const MAIL_PATCH_LOG_NAME = 'Mail letters'
const TRIGGER_PATCH_LOG_NAME = 'Mail delivery triggers'
const VANILLA_MAIL_ASSET_PATH = 'Content\\Data\\mail.xnb'

export type MailLetterBgState = {
  status: 'idle' | 'loading' | 'ready' | 'missing'
  url: string | null
  geometry: LetterBgSheetGeometry | null
}

export type VanillaMailLetter = { key: string; title: string | null; value: string }

export type VanillaMailState = {
  status: 'idle' | 'loading' | 'ready' | 'missing'
  letters: VanillaMailLetter[]
}

export type MailItemTextureState = {
  status: 'idle' | 'loading' | 'ready' | 'missing'
  items: ItemWorkspaceEntry[]
  textures: Record<string, ItemTextureAssetState>
  springobjects: ItemTextureAssetState | null
}

export type MailTriggerRow = {
  /** Key of the entry inside the Data/TriggerActions entries map. */
  entryKey: string
  draft: MailTriggerDraft
}

const vanillaMailCache = new Map<string, Promise<VanillaMailLetter[]>>()
const letterBgCache = new Map<string, Promise<{ url: string; geometry: LetterBgSheetGeometry }>>()

function readCachedPromise<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>): Promise<T> {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  const pending = loader().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, pending)
  return pending
}

async function loadVanillaMailLetters(rootPath: string, locale: LocaleCode): Promise<VanillaMailLetter[]> {
  return readCachedPromise(vanillaMailCache, `${rootPath}::${locale}`, async () => {
    const asset = await loadTextAsset(rootPath, VANILLA_MAIL_ASSET_PATH, locale).catch(() => null)
    if (!asset) {
      return []
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(asset.content) as Record<string, unknown>
    } catch {
      return []
    }
    return Object.entries(parsed).flatMap(([key, value]) =>
      typeof value === 'string' ? [{ key, title: parseMailString(value).title, value }] : [],
    )
  })
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('letterBG image failed to decode'))
    image.src = url
  })
}

async function loadLetterBgSheet(rootPath: string, locale: LocaleCode) {
  return readCachedPromise(letterBgCache, `${rootPath}::${locale}`, async () => {
    const path = buildGameContentPath(rootPath, LETTER_BG_ASSET_NAME)
    if (!path) {
      throw new Error('letterBG path unavailable')
    }
    const url = await loadImageDataUrl(path, locale)
    const size = await measureImage(url)
    return { url, geometry: getLetterBgSheetGeometry(size.width, size.height) }
  })
}

/** Staged letter bodies, keyed by mail id, read straight from the draft. */
function readLetterEntries(port: AssetDraftPort | null): Record<string, string> {
  if (!port) {
    return {}
  }
  const letters: Record<string, string> = {}
  for (const key of port.listEntries(MAIL_TARGET)) {
    const value = port.readValue(MAIL_TARGET, key)
    letters[key] = typeof value === 'string' ? value : ''
  }
  return letters
}

/** Staged trigger entries in their raw CP shape, so unknown fields survive. */
function readTriggerEntries(port: AssetDraftPort | null): Record<string, unknown> {
  if (!port) {
    return {}
  }
  return Object.fromEntries(port.listEntries(TRIGGER_TARGET).map((key) => [key, port.readValue(TRIGGER_TARGET, key)]))
}

function generateUniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base
  }
  let suffix = 2
  while (taken.has(`${base}_${suffix}`)) {
    suffix += 1
  }
  return `${base}_${suffix}`
}

export type RenameResult = 'ok' | 'duplicate' | 'unchanged'

/** A write waiting for the patch that was just added to reach the port. */
type PendingWrite = { target: string; patchId: string; logName: string; entryKey: string; value: unknown }

/**
 * State for the mail authoring module: the letters (`Data/mail`) and the delivery triggers
 * (`Data/TriggerActions`) staged through the shared `AssetDraftPort`, plus the read-only vanilla
 * mail reference and the letter background sheet loaded from the game root.
 *
 * Editing only stages into the draft; nothing reaches disk until `save` commits, and `revert`
 * drops every staged change — the same policy the schedule, character and building pages use.
 */
export function useMailWorkspace() {
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const locale = useLocale()
  const { port, saveState } = useWorkbenchAssetDraftPort(MAIL_WORKSPACE_ID)
  const rootPath = environment.directoryInfo?.rootPath ?? null

  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [vanillaMail, setVanillaMail] = useState<VanillaMailState>({ status: 'idle', letters: [] })
  const [letterBg, setLetterBg] = useState<MailLetterBgState>({ status: 'idle', url: null, geometry: null })
  const [itemTextures, setItemTextures] = useState<MailItemTextureState>({
    status: 'idle',
    items: [],
    textures: {},
    springobjects: null,
  })
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([])
  // Patches added during this render pass; the port only sees them next render,
  // so a second write to the same asset must reuse the id instead of adding again.
  const pendingPatchIds = useRef(new Map<string, string>())

  const draftKey = project.activeDraft?.draftStorageKey ?? null
  useEffect(() => {
    setSelectedMailId(null)
    setPendingWrites([])
    pendingPatchIds.current.clear()
  }, [draftKey])

  // ── Vanilla mail reference ──
  useEffect(() => {
    if (!rootPath) {
      return deferToTimeout(() => {
        setVanillaMail({ status: 'missing', letters: [] })
      })
    }
    let cancelled = false
    const cancel = deferToTimeout(() => {
      setVanillaMail({ status: 'loading', letters: [] })
      void (async () => {
        const letters = await loadVanillaMailLetters(rootPath, locale).catch(() => [])
        if (!cancelled) {
          setVanillaMail({ status: 'ready', letters })
        }
      })()
    })
    return () => {
      cancelled = true
      cancel()
    }
  }, [locale, rootPath])

  // ── Letter background sheet ──
  useEffect(() => {
    if (!rootPath) {
      return deferToTimeout(() => {
        setLetterBg({ status: 'missing', url: null, geometry: null })
      })
    }
    let cancelled = false
    const cancel = deferToTimeout(() => {
      setLetterBg({ status: 'loading', url: null, geometry: null })
      void (async () => {
        try {
          const sheet = await loadLetterBgSheet(rootPath, locale)
          if (!cancelled) {
            setLetterBg({ status: 'ready', url: sheet.url, geometry: sheet.geometry })
          }
        } catch {
          if (!cancelled) {
            setLetterBg({ status: 'missing', url: null, geometry: null })
          }
        }
      })()
    })
    return () => {
      cancelled = true
      cancel()
    }
  }, [locale, rootPath])

  // ── Item catalog and textures ──
  useEffect(() => {
    if (!rootPath) {
      return deferToTimeout(() => {
        setItemTextures({ status: 'missing', items: [], textures: {}, springobjects: null })
      })
    }
    let cancelled = false
    const cancel = deferToTimeout(() => {
      setItemTextures({ status: 'loading', items: [], textures: {}, springobjects: null })
      void (async () => {
        try {
          const items = await loadItemWorkspaceEntries(rootPath, locale)
          const textureEntries = await Promise.all(
            getAllTextureAssetNames(items).map(async (assetName) => {
              const texture = await loadItemTextureAssetState(rootPath, assetName, locale)
              return [assetName.replaceAll('\\', '/').toLowerCase(), texture] as const
            }),
          )
          const textures = Object.fromEntries(textureEntries)
          if (!cancelled) {
            setItemTextures({
              status: 'ready',
              items,
              textures,
              springobjects: textures['maps/springobjects'] ?? null,
            })
          }
        } catch {
          if (!cancelled) {
            setItemTextures({ status: 'missing', items: [], textures: {}, springobjects: null })
          }
        }
      })()
    })
    return () => {
      cancelled = true
      cancel()
    }
  }, [locale, rootPath])

  // ── Staged draft projection ──
  const lettersById = readLetterEntries(port)
  const triggerEntries = readTriggerEntries(port)
  const allMailIds = Object.keys(lettersById)

  const triggerRowsAll: MailTriggerRow[] = Object.entries(triggerEntries).flatMap(([entryKey, raw]) => {
    const draft = triggerDraftFromEntry(entryKey, raw)
    return draft ? [{ entryKey, draft }] : []
  })
  const allTriggerIds = triggerRowsAll.map((row) => row.draft.id)

  // Applies the writes whose freshly added patch has landed in the draft.
  useEffect(() => {
    if (pendingWrites.length === 0 || port === null) {
      return
    }
    const ready = pendingWrites.filter((write) => port.hasAsset(write.target))
    if (ready.length === 0) {
      return
    }

    const byTarget = new Map<string, { patchId: string; logName: string; values: Record<string, unknown> }>()
    for (const write of ready) {
      const bucket = byTarget.get(write.target) ?? { patchId: write.patchId, logName: write.logName, values: {} }
      bucket.values[write.entryKey] = write.value
      byTarget.set(write.target, bucket)
    }
    for (const [target, bucket] of byTarget) {
      port.updatePatch(bucket.patchId, { logName: bucket.logName })
      port.stageValues(target, bucket.values)
      pendingPatchIds.current.delete(target)
    }

    setPendingWrites((current) => current.filter((write) => !ready.includes(write)))
  }, [pendingWrites, port])

  /**
   * Stages one entry write, creating the asset's EditData patch when the draft
   * has none. The write is replayed once the new patch reaches the port.
   */
  function stageEntry(target: string, logName: string, entryKey: string, value: unknown) {
    if (port === null) {
      return
    }
    if (port.hasAsset(target)) {
      port.stageValue(target, entryKey, value)
      return
    }
    const patchId = pendingPatchIds.current.get(target) ?? port.addPatch('EditData', target)
    if (patchId === null) {
      return
    }
    pendingPatchIds.current.set(target, patchId)
    setPendingWrites((current) => [...current, { target, patchId, logName, entryKey, value }])
  }

  function stageLetter(mailId: string, value: string | null) {
    stageEntry(MAIL_TARGET, MAIL_PATCH_LOG_NAME, mailId, value)
  }

  function stageTrigger(entryKey: string, entry: Record<string, unknown> | null) {
    stageEntry(TRIGGER_TARGET, TRIGGER_PATCH_LOG_NAME, entryKey, entry)
  }

  /**
   * Batch-stages trigger writes (`null` deletes) in one patch update. Every
   * caller edits rows that are already on screen, so the trigger patch exists.
   */
  function stageTriggers(writes: Record<string, unknown>) {
    if (port === null || Object.keys(writes).length === 0) {
      return
    }
    port.stageValues(TRIGGER_TARGET, writes)
  }

  // ── Derived views ──
  function triggersForLetter(mailId: string): MailTriggerRow[] {
    return triggerRowsAll.filter((row) => row.draft.mailId === mailId)
  }

  /** Returns all triggers indexed by their parent letter's mail ID. */
  function allTriggersByLetter(): Map<string, MailTriggerRow[]> {
    const byLetter = new Map<string, MailTriggerRow[]>()
    for (const row of triggerRowsAll) {
      const existing = byLetter.get(row.draft.mailId) ?? []
      existing.push(row)
      byLetter.set(row.draft.mailId, existing)
    }
    return byLetter
  }

  function validateLetter(mailId: string): MailValidationIssue[] {
    return validateMailLetter({
      mailId,
      draft: mailDraftFromString(lettersById[mailId] ?? ''),
      allMailIds,
      triggers: triggersForLetter(mailId).map((row) => row.draft),
      allTriggerIds,
      letterBgFrameCount: letterBg.geometry?.frameCount ?? null,
    })
  }

  const letterSummaries: MailLetterSummary[] = allMailIds.map((mailId) => {
    const summary = summarizeIssues(validateLetter(mailId))
    const draft = mailDraftFromString(lettersById[mailId] ?? '')
    return {
      mailId,
      title: draft.title,
      bodyPreview: draft.body,
      errors: summary.errors,
      warnings: summary.warnings,
      deliveryGroup: classifyMailDelivery(triggersForLetter(mailId).map((row) => row.draft)),
    }
  })
  const deliveryGroups: MailDeliveryGroup[] = buildMailDeliveryGroups(letterSummaries)

  const activeMailId = selectedMailId !== null && selectedMailId in lettersById ? selectedMailId : null
  const activeDraft: MailLetterDraft | null = activeMailId === null ? null : mailDraftFromString(lettersById[activeMailId] ?? '')
  const activeRawValue = activeMailId === null ? '' : (lettersById[activeMailId] ?? '')
  const activeTriggers = activeMailId === null ? [] : triggersForLetter(activeMailId)
  const activeIssues = activeMailId === null ? [] : validateLetter(activeMailId)

  // ── Mutations ──
  function selectLetter(mailId: string) {
    setSelectedMailId(mailId)
  }

  function closeLetter() {
    setSelectedMailId(null)
  }

  function createLetter(): string {
    const taken = new Set(allMailIds)
    let index = 1
    while (taken.has(`{{ModId}}_Mail_${index}`)) {
      index += 1
    }
    const mailId = `{{ModId}}_Mail_${index}`
    stageLetter(mailId, '')
    setSelectedMailId(mailId)
    return mailId
  }

  function createLetterFromVanilla(vanillaKey: string): string | null {
    const template = vanillaMail.letters.find((letter) => letter.key === vanillaKey)
    if (!template) {
      return null
    }
    const mailId = generateUniqueId(`{{ModId}}_${vanillaKey}`, new Set(allMailIds))
    stageLetter(mailId, template.value)
    setSelectedMailId(mailId)
    return mailId
  }

  function updateActiveDraft(nextDraft: MailLetterDraft) {
    if (activeMailId === null) {
      return
    }
    stageLetter(activeMailId, mailDraftToString(nextDraft))
  }

  function updateActiveRawValue(value: string) {
    if (activeMailId !== null) {
      stageLetter(activeMailId, value)
    }
  }

  function renameActiveLetter(nextMailId: string): RenameResult {
    if (port === null || activeMailId === null || nextMailId === activeMailId) {
      return 'unchanged'
    }
    if (nextMailId in lettersById) {
      return 'duplicate'
    }
    port.renameEntry(MAIL_TARGET, activeMailId, nextMailId)
    stageTriggers(
      Object.fromEntries(
        triggersForLetter(activeMailId).map((row) => [row.entryKey, triggerDraftToEntry({ ...row.draft, mailId: nextMailId })]),
      ),
    )
    setSelectedMailId(nextMailId)
    return 'ok'
  }

  function deleteLetter(mailId: string) {
    stageTriggers(Object.fromEntries(triggersForLetter(mailId).map((row) => [row.entryKey, null])))
    stageLetter(mailId, null)
    setSelectedMailId((current) => (current === mailId ? null : current))
  }

  function addTriggerForActiveLetter() {
    if (activeMailId === null) {
      return
    }
    const id = generateUniqueId(`${activeMailId}_Trigger`, new Set([...allTriggerIds, ...Object.keys(triggerEntries)]))
    const draft: MailTriggerDraft = {
      id,
      trigger: 'DayStarted',
      mailId: activeMailId,
      target: 'Current',
      deliveryType: 'tomorrow',
      condition: '',
      markActionApplied: true,
      hostOnly: false,
      extraActions: [],
      extraFields: {},
    }
    stageTrigger(id, triggerDraftToEntry(draft))
  }

  function updateTrigger(entryKey: string, nextDraft: MailTriggerDraft): RenameResult {
    const idChanged = nextDraft.id !== entryKey
    if (idChanged && nextDraft.id in triggerEntries) {
      return 'duplicate'
    }
    // A renamed trigger is dropped and re-added rather than moved in place:
    // Data/TriggerActions is an unordered map, so the entry's position carries
    // no meaning and one write keeps the two halves from overwriting each other.
    stageTriggers({
      ...(idChanged ? { [entryKey]: null } : {}),
      [nextDraft.id]: triggerDraftToEntry(nextDraft),
    })
    return idChanged ? 'ok' : 'unchanged'
  }

  function removeTrigger(entryKey: string) {
    stageTrigger(entryKey, null)
  }

  return {
    hasProject: port !== null,
    deliveryGroups,
    letterCount: allMailIds.length,
    activeMailId,
    activeDraft,
    activeRawValue,
    activeTriggers,
    activeIssues,
    isDirty: port?.isDirty() ?? false,
    saveState: saveState as WorkbenchDraftSaveState,
    vanillaMail,
    letterBg,
    itemTextures,
    allTriggersByLetter: allTriggersByLetter(),
    selectLetter,
    closeLetter,
    createLetter,
    createLetterFromVanilla,
    updateActiveDraft,
    updateActiveRawValue,
    renameActiveLetter,
    deleteLetter,
    addTriggerForActiveLetter,
    updateTrigger,
    removeTrigger,
    save: () => port?.commit(),
    revert: () => port?.revert(),
    undo: () => void port?.undo(),
    redo: () => void port?.redo(),
    gameRootPath: rootPath,
    locale,
  }
}

/** Public contract of the mail workspace state hook consumed by the mail views. */
export type UseMailWorkspaceReturn = ReturnType<typeof useMailWorkspace>
