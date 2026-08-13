import { useEffect, useState } from 'react'
import type { GameDirectoryInfo } from '@entities/game/api'
import { loadImageDataUrl, loadTextAsset } from '@entities/game/api'
import { parseAssetEditorState } from '@entities/asset-schema'
import type { LocaleCode } from '@locales'
import { nextDraftEditMergeKey, tagNextDraftEdit, type UseCpMakerReturn } from '@features/cp-maker'
import type { DraftPatch } from '@shared/contracts/types/cpMaker'
import { useWorkbenchAssetDraftPort } from '@pages/workbench/model/useWorkbenchAssetDraftPort'
import { buildGameContentPath, CHARACTER_DATA_ASSET_PATH } from '@shared/infra/stardew-assets/contentPaths'
import {
  addQuestionResponse,
  attachQuestion,
  buildDialogueKey,
  buildDialoguePatchLogName,
  buildDialoguePriorityTree,
  buildDialogueTarget,
  findShadowedKeys,
  insertPageAfter,
  isMarriageDialogueAsset,
  mergeDialogueEntries,
  parseDialogueKey,
  parseDialogueScript,
  parseDialogueTargetNpc,
  readDialoguePatchEditorState,
  removePage,
  removeQuestion,
  removeQuestionResponse,
  setPagePortrait,
  setPageSeparator,
  setPageText,
  setSegmentPortrait,
  setSegmentText,
  updateCommandSegment,
  updateQuestionFields,
  updateQuestionResponse,
  type DialogueEntrySummary,
  type DialogueKeyBuild,
  type DialoguePageSeparator,
  type DialoguePortrait,
} from '@entities/dialogue'

const NPC_NAMES_ASSET_PATH = 'Content\\Strings\\NPCNames.xnb'
const LOCALIZED_NPC_NAME_PATTERN = /^\[LocalizedText\s+Strings[\\/]NPCNames:(.+?)\]$/u

export type DialogueNpcOption = {
  id: string
  displayName: string
  source: 'vanilla' | 'project'
}

export type DialoguePortraitState = {
  url: string | null
  sheetWidth: number
  sheetHeight: number
  loading: boolean
  missing: boolean
}

export type DialogueEditorDraft = {
  /** NPC the entry was loaded from; null for entries that are not saved yet. */
  originNpcId: string | null
  /** Key the entry is stored under in the project patch; null before first save. */
  originalKey: string | null
  npcId: string
  keyBuild: DialogueKeyBuild
  title: string
  script: string
  readOnly: boolean
  /** 'start' selects the start node; otherwise a page id from the parsed script. */
  selectedNodeId: string
}

type SavedSnapshot = {
  npcId: string
  key: string
  title: string
  script: string
}

type VanillaNpcState = {
  loading: boolean
  error: string | null
  npcs: Array<{ id: string; displayName: string }>
}

type VanillaEntriesState = {
  loading: boolean
  error: string | null
  entries: Record<string, string>
}

type UseDialogueWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  project: UseCpMakerReturn
}

const vanillaNpcCache = new Map<string, Promise<Array<{ id: string; displayName: string }>>>()
const vanillaDialogueCache = new Map<string, Promise<Record<string, string>>>()
const portraitCache = new Map<string, Promise<{ url: string; sheetWidth: number; sheetHeight: number } | null>>()

async function readCachedPromise<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>) {
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

function parseStringRecord(content: string): Record<string, string> {
  const parsed = JSON.parse(content) as Record<string, unknown>
  return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => (typeof value === 'string' ? ([[key, value]] as const) : [])))
}

async function loadVanillaNpcs(rootPath: string, locale: LocaleCode) {
  const cacheKey = `${rootPath}::${locale}`
  return readCachedPromise(vanillaNpcCache, cacheKey, async () => {
    const [charactersAsset, namesAsset] = await Promise.all([
      loadTextAsset(rootPath, CHARACTER_DATA_ASSET_PATH, locale),
      loadTextAsset(rootPath, NPC_NAMES_ASSET_PATH, locale).catch(() => null),
    ])
    const characters = JSON.parse(charactersAsset.content) as Record<string, { DisplayName?: string | null } | null>
    const names = namesAsset ? parseStringRecord(namesAsset.content) : {}

    return Object.entries(characters).map(([id, entry]) => {
      const rawDisplayName = entry?.DisplayName?.trim() ?? ''
      const localizedKey = LOCALIZED_NPC_NAME_PATTERN.exec(rawDisplayName)?.[1]?.trim()
      const displayName =
        (localizedKey ? names[localizedKey] : rawDisplayName && !rawDisplayName.startsWith('[') ? rawDisplayName : null) ?? id
      return { id, displayName }
    })
  })
}

function getVanillaDialogueCacheKey(rootPath: string, npcId: string, locale: LocaleCode) {
  return `${rootPath}::${npcId}::${locale}`
}

async function loadVanillaDialogue(rootPath: string, npcId: string, locale: LocaleCode) {
  return readCachedPromise(vanillaDialogueCache, getVanillaDialogueCacheKey(rootPath, npcId, locale), async () => {
    const asset = await loadTextAsset(rootPath, `Content\\Characters\\Dialogue\\${npcId}.xnb`, locale).catch(() => null)
    if (!asset) {
      // Missing dialogue assets are normal (many NPCs have none); treat as empty.
      return {}
    }
    return parseStringRecord(asset.content)
  })
}

async function loadPortraitSheet(rootPath: string, npcId: string, locale: LocaleCode) {
  const cacheKey = `${rootPath}::${npcId}::${locale}`
  return readCachedPromise(portraitCache, cacheKey, async () => {
    const path = buildGameContentPath(rootPath, `Portraits/${npcId}`)
    if (!path) {
      return null
    }
    const url = await loadImageDataUrl(path, locale).catch(() => null)
    if (!url) {
      return null
    }
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error(`Unreadable portrait sheet: ${npcId}`))
      image.src = url
    })
    return { url, sheetWidth: dimensions.width, sheetHeight: dimensions.height }
  })
}

function findDialoguePatch(project: UseCpMakerReturn, npcId: string): DraftPatch | null {
  const normalizedTarget = buildDialogueTarget(npcId).toLowerCase()
  return (
    project
      .getPatchesForWorkspace('dialogue')
      .find((patch) => patch.action === 'EditData' && patch.target.trim().replaceAll('\\', '/').toLowerCase() === normalizedTarget) ?? null
  )
}

function collectProjectNpcIds(project: UseCpMakerReturn): string[] {
  const ids = new Set<string>()
  for (const patch of project.activeDraft?.patches ?? []) {
    if (patch.action !== 'EditData') {
      continue
    }
    const normalizedTarget = patch.target.trim().replaceAll('\\', '/').toLowerCase()
    if (normalizedTarget === 'data/characters') {
      // Character entries are objects, so they have to be read with the generic
      // asset parser; the dialogue reader keeps string entries only and would
      // report the project as having no NPCs at all.
      for (const key of Object.keys(parseAssetEditorState(patch.editorState).entries)) {
        if (key.trim() !== '') {
          ids.add(key)
        }
      }
      continue
    }
    const dialogueNpc = parseDialogueTargetNpc(patch.target)
    if (dialogueNpc) {
      ids.add(dialogueNpc)
    }
  }
  return Array.from(ids)
}

/**
 * State for the dialogue authoring module: NPC catalog (vanilla + project),
 * merged entry lists per NPC, the page-flow editor draft, and patch
 * persistence (one EditData patch per NPC dialogue target).
 */
export function useDialogueWorkspace({ directoryInfo, locale, project }: UseDialogueWorkspaceOptions) {
  const rootPath = directoryInfo?.rootPath ?? null

  const [npcState, setNpcState] = useState<VanillaNpcState>({ loading: false, error: null, npcs: [] })
  const [npcFilter, setNpcFilter] = useState('')
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null)
  const [vanillaState, setVanillaState] = useState<VanillaEntriesState>({ loading: false, error: null, entries: {} })
  const [vanillaRefreshToken, setVanillaRefreshToken] = useState(0)
  const [draft, setDraft] = useState<DialogueEditorDraft | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<SavedSnapshot | null>(null)
  const [portrait, setPortrait] = useState<DialoguePortraitState>({
    url: null,
    sheetWidth: 0,
    sheetHeight: 0,
    loading: false,
    missing: false,
  })
  /** Commit waiting for the patch it targets to reach the port; see the replay effect below. */
  const [pendingCommit, setPendingCommit] = useState<{ patchId: string; changes: Partial<DraftPatch> } | null>(null)

  // Entry commits go through the shared port, so they stage into the draft and
  // land on the workbench-wide undo history like every other page's edit; the
  // header's save button is what writes them to disk. The page-flow editor is an
  // uncommitted form over one entry, so while it is open the shortcut stays out
  // of the way — stepping a commit back underneath an open form would leave the
  // form claiming to be saved.
  const { port, saveState } = useWorkbenchAssetDraftPort('dialogue', { shortcutsEnabled: draft === null })

  // ── NPC catalog ──

  useEffect(() => {
    if (!rootPath) {
      setNpcState({ loading: false, error: null, npcs: [] })
      return
    }

    let cancelled = false
    setNpcState((current) => ({ ...current, loading: true, error: null }))

    void loadVanillaNpcs(rootPath, locale)
      .then((npcs) => {
        if (!cancelled) {
          setNpcState({ loading: false, error: null, npcs })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNpcState({ loading: false, error: error instanceof Error ? error.message : String(error), npcs: [] })
        }
      })

    return () => {
      cancelled = true
    }
  }, [locale, rootPath])

  const projectNpcIds = collectProjectNpcIds(project)
  const vanillaNpcIds = new Set(npcState.npcs.map((npc) => npc.id))
  const npcs: DialogueNpcOption[] = [
    ...npcState.npcs.map((npc) => ({ ...npc, source: 'vanilla' as const })),
    ...projectNpcIds.filter((id) => !vanillaNpcIds.has(id)).map((id) => ({ id, displayName: id, source: 'project' as const })),
  ].sort((left, right) => left.displayName.localeCompare(right.displayName))

  const normalizedFilter = npcFilter.trim().toLowerCase()
  const filteredNpcs = normalizedFilter
    ? npcs.filter((npc) => npc.displayName.toLowerCase().includes(normalizedFilter) || npc.id.toLowerCase().includes(normalizedFilter))
    : npcs

  const activeNpc = npcs.find((npc) => npc.id === selectedNpcId) ?? filteredNpcs[0] ?? npcs[0] ?? null
  const activeNpcId = activeNpc?.id ?? null

  // ── Vanilla entries for the active NPC ──

  useEffect(() => {
    if (!rootPath || !activeNpcId) {
      setVanillaState({ loading: false, error: null, entries: {} })
      return
    }

    let cancelled = false
    setVanillaState({ loading: true, error: null, entries: {} })

    void loadVanillaDialogue(rootPath, activeNpcId, locale)
      .then((entries) => {
        if (!cancelled) {
          setVanillaState({ loading: false, error: null, entries })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVanillaState({ loading: false, error: error instanceof Error ? error.message : String(error), entries: {} })
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeNpcId, locale, rootPath, vanillaRefreshToken])

  function refreshVanillaEntries() {
    if (rootPath && activeNpcId) {
      vanillaDialogueCache.delete(getVanillaDialogueCacheKey(rootPath, activeNpcId, locale))
    }
    setVanillaRefreshToken((token) => token + 1)
  }

  const activePatch = activeNpcId ? findDialoguePatch(project, activeNpcId) : null
  const activePatchState = readDialoguePatchEditorState(activePatch?.editorState)
  const entries: DialogueEntrySummary[] = activeNpcId
    ? mergeDialogueEntries(vanillaState.entries, activePatchState.entries, activePatchState.titles ?? {})
    : []
  const describeOptions = { marriageAsset: activeNpcId ? isMarriageDialogueAsset(activeNpcId) : false }
  const entryTree = buildDialoguePriorityTree(entries, describeOptions)

  // ── Editor draft ──

  const draftKey = draft ? buildDialogueKey(draft.keyBuild) : ''
  const draftAst = draft ? parseDialogueScript(draft.script) : null
  const isDraftDirty = Boolean(
    draft &&
    !draft.readOnly &&
    (!savedSnapshot ||
      savedSnapshot.npcId !== draft.npcId ||
      savedSnapshot.key !== draftKey ||
      savedSnapshot.title !== draft.title ||
      savedSnapshot.script !== draft.script),
  )
  const draftPatchState = draft ? readDialoguePatchEditorState(findDialoguePatch(project, draft.npcId)?.editorState) : { entries: {} }
  const isDraftKeyDuplicate = Boolean(
    draft && !draft.readOnly && draftKey && draftKey !== draft.originalKey && draftPatchState.entries[draftKey] != null,
  )

  // Precedence for the key being edited is judged against the sibling keys as
  // they would look after saving, so a pending rename reports its real conflict.
  const draftShadow = (() => {
    if (!draft || !draftKey) {
      return null
    }
    const siblingKeys = entries.map((entry) => entry.key).filter((key) => key !== draft.originalKey && key !== draftKey)
    return findShadowedKeys([...siblingKeys, draftKey], describeOptions).find((report) => report.key === draftKey) ?? null
  })()

  function openNewEntry() {
    if (!activeNpcId) {
      return
    }
    setDraft({
      originNpcId: null,
      originalKey: null,
      npcId: activeNpcId,
      keyBuild: { mode: 'daily', season: 'any', weekday: 'Mon', hearts: 0 },
      title: '',
      script: '',
      readOnly: false,
      selectedNodeId: 'start',
    })
    setSavedSnapshot(null)
  }

  function openEntry(entry: DialogueEntrySummary) {
    if (!activeNpcId) {
      return
    }
    const readOnly = entry.origin === 'vanilla'
    setDraft({
      originNpcId: readOnly ? null : activeNpcId,
      originalKey: readOnly ? null : entry.key,
      npcId: activeNpcId,
      keyBuild: parseDialogueKey(entry.key),
      title: entry.title ?? '',
      script: entry.script,
      readOnly,
      selectedNodeId: 'start',
    })
    setSavedSnapshot(readOnly ? null : { npcId: activeNpcId, key: entry.key, title: entry.title ?? '', script: entry.script })
  }

  /** Opens a sibling entry by key; used by the shadow report jump links. */
  function openEntryByKey(key: string) {
    const entry = entries.find((candidate) => candidate.key === key)
    if (entry) {
      openEntry(entry)
    }
  }

  function closeEditor() {
    setDraft(null)
    setSavedSnapshot(null)
  }

  function updateDraft(patch: Partial<DialogueEditorDraft>) {
    setDraft((current) => (current && !current.readOnly ? { ...current, ...patch } : current))
  }

  function selectNode(nodeId: string) {
    setDraft((current) => (current ? { ...current, selectedNodeId: nodeId } : current))
  }

  function copyDraftToProject() {
    setDraft((current) => (current?.readOnly ? { ...current, readOnly: false, originNpcId: null, originalKey: null } : current))
    setSavedSnapshot(null)
  }

  function applyScript(script: string, selectedNodeId?: string) {
    setDraft((current) =>
      current && !current.readOnly ? { ...current, script, selectedNodeId: selectedNodeId ?? current.selectedNodeId } : current,
    )
  }

  function editPageText(pageId: string, text: string) {
    if (draftAst) {
      applyScript(setPageText(draftAst, pageId, text))
    }
  }

  function editPagePortrait(pageId: string, portraitChoice: DialoguePortrait) {
    if (draftAst) {
      applyScript(setPagePortrait(draftAst, pageId, portraitChoice))
    }
  }

  function editCommandSegment(pageId: string, segmentId: string, args: readonly string[]) {
    if (draftAst) {
      applyScript(updateCommandSegment(draftAst, pageId, segmentId, args))
    }
  }

  function editSegmentText(pageId: string, segmentId: string, text: string) {
    if (draftAst) {
      applyScript(setSegmentText(draftAst, pageId, segmentId, text))
    }
  }

  function editSegmentPortrait(pageId: string, segmentId: string, portraitChoice: DialoguePortrait) {
    if (draftAst) {
      applyScript(setSegmentPortrait(draftAst, pageId, segmentId, portraitChoice))
    }
  }

  function editPageSeparator(pageId: string, separator: DialoguePageSeparator) {
    if (draftAst) {
      applyScript(setPageSeparator(draftAst, pageId, separator))
    }
  }

  function addPage(afterPageId: string | null, separator: DialoguePageSeparator) {
    if (!draftAst) {
      return
    }
    const script = insertPageAfter(draftAst, afterPageId, separator)
    const afterIndex = afterPageId === null ? -1 : (draftAst.pages.find((page) => page.id === afterPageId)?.index ?? -1)
    applyScript(script, `page:${afterIndex + 1}`)
  }

  function deletePage(pageId: string) {
    if (!draftAst) {
      return
    }
    applyScript(removePage(draftAst, pageId), 'start')
  }

  function editAttachQuestion(pageId: string) {
    if (draftAst) {
      applyScript(attachQuestion(draftAst, pageId))
    }
  }

  function editRemoveQuestion(pageId: string) {
    if (draftAst) {
      applyScript(removeQuestion(draftAst, pageId))
    }
  }

  function editQuestionFields(pageId: string, fields: { ids?: string; fallbackKey?: string; prompt?: string }) {
    if (draftAst) {
      applyScript(updateQuestionFields(draftAst, pageId, fields))
    }
  }

  function editAddResponse(pageId: string) {
    if (draftAst) {
      applyScript(addQuestionResponse(draftAst, pageId))
    }
  }

  function editRemoveResponse(pageId: string, responseId: string) {
    if (draftAst) {
      applyScript(removeQuestionResponse(draftAst, pageId, responseId))
    }
  }

  function editResponseFields(
    pageId: string,
    responseId: string,
    fields: { responseId?: string; score?: string; resultKey?: string; text?: string },
  ) {
    if (draftAst) {
      applyScript(updateQuestionResponse(draftAst, pageId, responseId, fields))
    }
  }

  // ── Persistence ──

  // Replays a commit whose freshly added patch has reached the port.
  useEffect(() => {
    if (!pendingCommit || !port || !port.draft.patches.some((patch) => patch.id === pendingCommit.patchId)) {
      return
    }
    tagNextDraftEdit(nextDraftEditMergeKey('dialogue:commit'))
    port.updatePatch(pendingCommit.patchId, pendingCommit.changes)
    setPendingCommit(null)
  }, [pendingCommit, port])

  /**
   * Stages one entry commit as a single undoable operation. Each call is its own
   * step: two saves of the same entry are two things the author did, not one.
   */
  function stagePatchCommit(patchId: string, changes: Partial<DraftPatch>) {
    if (!port) {
      return
    }
    tagNextDraftEdit(nextDraftEditMergeKey('dialogue:commit'))
    port.updatePatch(patchId, changes)
  }

  function removeEntryFromPatch(npcId: string, key: string) {
    const patch = findDialoguePatch(project, npcId)
    if (!patch) {
      return
    }
    const state = readDialoguePatchEditorState(patch.editorState)
    if (state.entries[key] == null) {
      return
    }
    const entriesNext = { ...state.entries }
    const titlesNext = { ...state.titles }
    delete entriesNext[key]
    delete titlesNext[key]
    // Emptying the patch leaves it in the draft rather than dropping it: a delete
    // is a staged change like any other, so it has to be undoable and revertable.
    // An EditData patch with no entries exports nothing, so the content pack is
    // the same as if the patch were gone.
    stagePatchCommit(patch.id, { editorState: { entries: entriesNext, titles: titlesNext } })
  }

  function saveEntry(): boolean {
    if (!draft || draft.readOnly || !draftKey) {
      return false
    }

    // The entry moved to another NPC: remove the stale copy from the old patch.
    if (draft.originNpcId && draft.originalKey && draft.originNpcId !== draft.npcId) {
      removeEntryFromPatch(draft.originNpcId, draft.originalKey)
    }

    const target = buildDialogueTarget(draft.npcId)
    const existingPatch = findDialoguePatch(project, draft.npcId)
    const patchId = existingPatch?.id ?? pendingCommit?.patchId ?? port?.addPatch('EditData', target)
    if (!patchId) {
      return false
    }
    const state = readDialoguePatchEditorState(existingPatch?.editorState)
    const entriesNext = { ...state.entries }
    const titlesNext = { ...state.titles }
    // A rename within the same NPC swaps keys inside one patch update, so the
    // patch can never transiently empty out or lose the new entry.
    if (draft.originNpcId === draft.npcId && draft.originalKey && draft.originalKey !== draftKey) {
      delete entriesNext[draft.originalKey]
      delete titlesNext[draft.originalKey]
    }
    entriesNext[draftKey] = draft.script
    const trimmedTitle = draft.title.trim()
    if (trimmedTitle) {
      titlesNext[draftKey] = trimmedTitle
    } else {
      delete titlesNext[draftKey]
    }

    const changes: Partial<DraftPatch> = {
      editorState: { entries: entriesNext, titles: titlesNext },
      logName: buildDialoguePatchLogName(draft.npcId),
    }
    if (existingPatch) {
      stagePatchCommit(patchId, changes)
    } else {
      // The patch was just added, so this render's port cannot see it yet and a
      // write now would land outside the undo history. Replay it once it lands.
      setPendingCommit({ patchId, changes })
    }

    setDraft((current) => (current ? { ...current, originNpcId: current.npcId, originalKey: draftKey } : current))
    setSavedSnapshot({ npcId: draft.npcId, key: draftKey, title: draft.title, script: draft.script })
    return true
  }

  function deleteEntry(key: string) {
    if (!activeNpcId) {
      return
    }
    removeEntryFromPatch(activeNpcId, key)
  }

  /**
   * Stages one entry's script straight from the bulk table: a vanilla row
   * becomes an override in place, a project row is rewritten. Same undo/save
   * semantics as `saveEntry`, without opening the page-flow editor.
   */
  function stageBulkEntry(key: string, script: string): boolean {
    if (!activeNpcId || key.trim() === '') {
      return false
    }
    const target = buildDialogueTarget(activeNpcId)
    const existingPatch = findDialoguePatch(project, activeNpcId)
    const patchId = existingPatch?.id ?? pendingCommit?.patchId ?? port?.addPatch('EditData', target)
    if (!patchId) {
      return false
    }
    const state = readDialoguePatchEditorState(existingPatch?.editorState)
    const entriesNext = { ...state.entries, [key]: script }
    const changes: Partial<DraftPatch> = {
      editorState: { entries: entriesNext, titles: state.titles },
      logName: buildDialoguePatchLogName(activeNpcId),
    }
    if (existingPatch) {
      stagePatchCommit(patchId, changes)
    } else {
      setPendingCommit({ patchId, changes })
    }
    return true
  }

  // ── Portrait sheet for the draft NPC ──

  const draftNpcId = draft?.npcId ?? null

  useEffect(() => {
    if (!rootPath || !draftNpcId) {
      setPortrait({ url: null, sheetWidth: 0, sheetHeight: 0, loading: false, missing: false })
      return
    }

    let cancelled = false
    setPortrait({ url: null, sheetWidth: 0, sheetHeight: 0, loading: true, missing: false })

    void loadPortraitSheet(rootPath, draftNpcId, locale)
      .then((sheet) => {
        if (cancelled) {
          return
        }
        if (!sheet) {
          setPortrait({ url: null, sheetWidth: 0, sheetHeight: 0, loading: false, missing: true })
          return
        }
        setPortrait({ url: sheet.url, sheetWidth: sheet.sheetWidth, sheetHeight: sheet.sheetHeight, loading: false, missing: false })
      })
      .catch(() => {
        if (!cancelled) {
          setPortrait({ url: null, sheetWidth: 0, sheetHeight: 0, loading: false, missing: true })
        }
      })

    return () => {
      cancelled = true
    }
  }, [draftNpcId, locale, rootPath])

  return {
    hasGameDirectory: Boolean(rootPath),
    npcLoading: npcState.loading,
    npcError: npcState.error,
    npcs,
    filteredNpcs,
    npcFilter,
    setNpcFilter,
    activeNpcId,
    activeNpc,
    selectNpc: setSelectedNpcId,
    vanillaLoading: vanillaState.loading,
    vanillaError: vanillaState.error,
    entries,
    entryTree,
    refreshVanillaEntries,
    draft,
    draftAst,
    draftKey,
    draftShadow,
    isDraftDirty,
    isDraftKeyDuplicate,
    openNewEntry,
    openEntry,
    openEntryByKey,
    closeEditor,
    updateDraft,
    selectNode,
    copyDraftToProject,
    editPageText,
    editPagePortrait,
    editPageSeparator,
    editCommandSegment,
    editSegmentText,
    editSegmentPortrait,
    addPage,
    deletePage,
    editAttachQuestion,
    editRemoveQuestion,
    editQuestionFields,
    editAddResponse,
    editRemoveResponse,
    editResponseFields,
    saveEntry,
    deleteEntry,
    stageBulkEntry,
    isDirty: port?.isDirty() ?? false,
    saveState,
    save: () => port?.commit(),
    revert: () => port?.revert(),
    undo: () => void port?.undo(),
    redo: () => void port?.redo(),
    portrait,
  }
}

export type UseDialogueWorkspaceReturn = ReturnType<typeof useDialogueWorkspace>
