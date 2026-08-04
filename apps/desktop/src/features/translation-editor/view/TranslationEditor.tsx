import { ArrowRight, Check, ChevronDown, ChevronUp, Languages, Plus, RefreshCw, Save, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react'
import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { useAi } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import type { LocaleCode } from '@locales/api'
import type { TranslationEditorCopy } from '@locales'
import { useLocale, useTranslationEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { AiLocalizationScope, AiLocalizationScopeSnapshot, LocalizationEngineRef } from '@shared/contracts'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { useModulePersistentState } from '@shared/lib/app-state'
import {
  buildTranslationEntries,
  createI18nFile,
  type TranslationEntry,
  type TranslationStatusFilter,
  updateI18nFileEntry,
  updateI18nFileEntries,
} from '../model/translationEditor'
import { useTranslationReview, type TranslationReviewMode } from '../model/useTranslationReview'
import { TRANSLATION_TARGET_LOCALES } from '../model/targetLocales'
import {
  partitionTranslationAiResults,
  useLocalizationTranslation,
  type TranslationAiBaseline,
  type TranslationAiMode,
} from '../model/useLocalizationTranslation'
import { TranslationReviewInspector } from './TranslationReviewInspector'
import { SplitActionButton } from './SplitActionButton'
import { CorpusReadinessBanner } from './CorpusReadinessBanner'
import { TranslationContextPanel } from './TranslationContextPanel'
import { useCorpusReadiness } from '../model/useCorpusReadiness'
import {
  AI_TRANSLATE_BEHAVIOR_STORAGE_KEY,
  isTranslationAiBehavior,
  isTranslationReviewBehavior,
  REVIEW_BEHAVIOR_STORAGE_KEY,
} from '../model/translationBehavior'

export type TranslationEditorProps = {
  project: TranslationEditorProject | null
  i18nFiles: ContentPatcherI18nFile[]
  sourceLocale: string
  targetLocale: string
  query: string
  statusFilter: TranslationStatusFilter
  canPersist: boolean
  onSourceLocaleChange: (locale: string) => void
  onTargetLocaleChange: (locale: string) => void
  onQueryChange: (value: string) => void
  onStatusFilterChange: (status: TranslationStatusFilter) => void
  onI18nFilesChange: (files: ContentPatcherI18nFile[]) => void
  localizationContext: TranslationLocalizationContext | null
  gameDirectory?: string | null
  onSave: () => Promise<void>
  onReload?: () => void
  onOpenLocalizationCenter?: (scopeId: string | null) => void
  onOpenAiSettings?: () => void
  showSaveAction?: boolean
  onOpenReviewCountChange?: (count: number) => void
}

export type TranslationLocalizationContext = {
  projectIdentity: { kind: 'cp-maker' | 'installed-mod'; stableId: string | null; fallbackPath: string | null }
  displayName: string
  sourceNamespace: string
}

function localizationBinding(context: TranslationLocalizationContext) {
  const { kind, stableId, fallbackPath } = context.projectIdentity
  if (stableId) {
    return { bindingKind: kind === 'cp-maker' ? 'project-unique-id' : 'installed-mod', bindingValue: stableId }
  }
  if (fallbackPath) {
    return { bindingKind: kind === 'cp-maker' ? 'draft-key' : 'canonical-path-hash', bindingValue: fallbackPath }
  }
  return null
}

const AI_TRANSLATE_BEHAVIORS: TranslationAiMode[] = ['current', 'missing', 'all']
const REVIEW_BEHAVIORS: TranslationReviewMode[] = ['current', 'translated', 'all']

function aiBehaviorLabel(copy: TranslationEditorCopy, mode: TranslationAiMode) {
  if (mode === 'current') return copy.aiTranslateCurrent
  if (mode === 'all') return copy.aiTranslateAll
  return copy.aiTranslateMissing
}

function reviewBehaviorLabel(copy: TranslationEditorCopy, mode: TranslationReviewMode) {
  if (mode === 'current') return copy.reviewCurrent
  if (mode === 'all') return copy.reviewAll
  return copy.reviewTranslated
}

export type TranslationEditorProject = {
  name: string
  rootPath: string
}

const statusFilters: TranslationStatusFilter[] = ['all', 'translated', 'missing', 'error']

function statusLabel(copy: TranslationEditorCopy, status: TranslationStatusFilter) {
  if (status === 'translated') return copy.translatedStatus
  if (status === 'missing') return copy.missingStatus
  if (status === 'error') return copy.errorStatus
  return copy.allStatus
}

function statusClass(status: TranslationEntry['status']) {
  if (status === 'translated') return 'status-pill-ready'
  if (status === 'error') return 'status-pill-error'
  return 'status-pill-idle'
}

function statusFilterBackgroundClass(status: TranslationStatusFilter) {
  if (status === 'translated') return 'bg-(--success-soft) text-(--success)'
  if (status === 'missing') return 'bg-(--warning-soft) text-(--warning)'
  if (status === 'error') return 'bg-(--danger-soft) text-(--danger)'
  return 'text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-secondary)'
}

function isStatusHighlighted(status: TranslationStatusFilter, statusCounts: ReturnType<typeof getStatusCounts>, totalEntries: number) {
  if (status === 'all' || totalEntries === 0) {
    return false
  }
  if (status === 'translated') {
    return statusCounts.translated === totalEntries
  }
  return statusCounts[status] > 0
}

function statusFilterClass(status: TranslationStatusFilter, isActive: boolean, highlighted: boolean) {
  return cx(
    'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition-colors',
    isActive
      ? 'bg-(--accent-soft) text-(--accent)'
      : highlighted
        ? statusFilterBackgroundClass(status)
        : 'text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-secondary)',
  )
}

function findFile(files: ContentPatcherI18nFile[], locale: string) {
  return files.find((file) => file.locale === locale) ?? null
}

function getProgress(entries: TranslationEntry[]) {
  if (!entries.length) {
    return 0
  }

  return Math.round((entries.filter((entry) => entry.status === 'translated').length / entries.length) * 100)
}

function getStatusCounts(entries: TranslationEntry[]) {
  return {
    translated: entries.filter((entry) => entry.status === 'translated').length,
    missing: entries.filter((entry) => entry.status === 'missing').length,
    error: entries.filter((entry) => entry.status === 'error').length,
  }
}

function useTranslationEditorState({
  project,
  i18nFiles,
  sourceLocale,
  targetLocale,
  query,
  statusFilter,
  onI18nFilesChange,
}: Pick<
  TranslationEditorProps,
  'project' | 'i18nFiles' | 'sourceLocale' | 'targetLocale' | 'query' | 'statusFilter' | 'onI18nFilesChange'
>) {
  const sourceFile = findFile(i18nFiles, sourceLocale)
  const targetFile = findFile(i18nFiles, targetLocale)
  const allEntries = useMemo(
    () =>
      buildTranslationEntries({
        sourceFile,
        targetFile,
        query: '',
        status: 'all',
      }),
    [sourceFile, targetFile],
  )
  const filteredEntries = useMemo(
    () =>
      buildTranslationEntries({
        sourceFile,
        targetFile,
        query,
        status: statusFilter,
      }),
    [sourceFile, targetFile, query, statusFilter],
  )
  const progress = getProgress(allEntries)
  const statusCounts = useMemo(() => getStatusCounts(allEntries), [allEntries])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (selectedKey && filteredEntries.some((entry) => entry.key === selectedKey)) {
      return
    }
    setSelectedKey(filteredEntries[0]?.key ?? null)
  }, [filteredEntries, selectedKey])

  const activeEntry = useMemo(
    () => filteredEntries.find((entry) => entry.key === selectedKey) ?? filteredEntries[0] ?? null,
    [filteredEntries, selectedKey],
  )

  const updateEntry = useCallback(
    (key: string, value: string) => {
      const projectPath = project?.rootPath ?? ''
      const currentTarget = targetFile ?? createI18nFile(projectPath, targetLocale)
      const nextTarget = updateI18nFileEntry(currentTarget, key, value)
      const exists = i18nFiles.some((file) => file.locale === nextTarget.locale)
      onI18nFilesChange(
        exists ? i18nFiles.map((file) => (file.locale === nextTarget.locale ? nextTarget : file)) : [...i18nFiles, nextTarget],
      )
    },
    [i18nFiles, onI18nFilesChange, project?.rootPath, targetFile, targetLocale],
  )

  const updateEntries = useCallback(
    (values: ReadonlyMap<string, string>) => {
      const projectPath = project?.rootPath ?? ''
      const currentTarget = targetFile ?? createI18nFile(projectPath, targetLocale)
      const nextTarget = updateI18nFileEntries(currentTarget, values)
      const exists = i18nFiles.some((file) => file.locale === nextTarget.locale)
      onI18nFilesChange(
        exists ? i18nFiles.map((file) => (file.locale === nextTarget.locale ? nextTarget : file)) : [...i18nFiles, nextTarget],
      )
    },
    [i18nFiles, onI18nFilesChange, project?.rootPath, targetFile, targetLocale],
  )

  const selectRelative = useCallback(
    (delta: number) => {
      if (!activeEntry) {
        return
      }
      const index = filteredEntries.findIndex((entry) => entry.key === activeEntry.key)
      const nextIndex = Math.max(0, Math.min(filteredEntries.length - 1, index + delta))
      const nextEntry = filteredEntries[nextIndex]
      if (nextEntry && nextEntry.key !== activeEntry.key) {
        setSelectedKey(nextEntry.key)
      }
    },
    [activeEntry, filteredEntries],
  )

  return {
    sourceFile,
    targetFile,
    allEntries,
    filteredEntries,
    progress,
    statusCounts,
    activeEntry,
    selectedKey,
    setSelectedKey,
    updateEntry,
    updateEntries,
    selectRelative,
  }
}

function getLocaleDisplayName(locale: string, appLocale: LocaleCode, defaultLabel: string): string {
  if (locale === 'default') {
    return defaultLabel
  }
  try {
    return new Intl.DisplayNames(appLocale, { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

type LocaleStatus = 'translated' | 'partial' | 'missing' | 'source'

type LocaleOption = {
  value: string
  label: string
  codeLabel: string
  progress: number
  status: LocaleStatus
  disabled?: boolean
}

const DROPDOWN_OFFSET = 6
const DROPDOWN_VIEWPORT_PADDING = 10

function localeStatusDotClass(status: LocaleStatus) {
  switch (status) {
    case 'translated':
      return 'bg-(--success)'
    case 'partial':
      return 'bg-(--warning)'
    case 'missing':
      return 'bg-(--text-tertiary)'
    case 'source':
      return 'bg-(--accent)'
  }
}

function targetTriggerClass(status: LocaleStatus) {
  switch (status) {
    case 'translated':
      return 'border-(--success)/30 bg-(--success-soft) text-(--success)'
    case 'partial':
      return 'border-(--warning)/30 bg-(--warning-soft) text-(--warning)'
    case 'missing':
      return 'border-(--border-color) bg-(--bg-hover) text-(--text-secondary)'
    case 'source':
      return 'border-(--border-color) bg-(--bg-panel-muted) text-(--text-primary)'
  }
}

function LocaleDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  mode,
  disabled = false,
}: {
  value: string
  options: readonly LocaleOption[]
  onChange: (value: string) => void
  ariaLabel: string
  mode: 'source' | 'target'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null
  const enabled = !disabled && options.length > 0
  const listboxId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: enabled ? open : false,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(DROPDOWN_OFFSET), flip({ padding: DROPDOWN_VIEWPORT_PADDING }), shift({ padding: DROPDOWN_VIEWPORT_PADDING })],
  })

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: globalThis.MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function setTriggerNode(node: HTMLButtonElement | null) {
    triggerRef.current = node
    refs.setReference(node)
  }

  function setMenuNode(node: HTMLDivElement | null) {
    menuRef.current = node
    refs.setFloating(node)
  }

  function selectOption(option: LocaleOption) {
    if (option.disabled) {
      return
    }
    onChange(option.value)
    setOpen(false)
  }

  function stopPropagation(event: { stopPropagation: () => void }) {
    event.stopPropagation()
  }

  const triggerBaseClass = cx(
    'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-(--accent)/30',
    mode === 'target' ? targetTriggerClass(selectedOption?.status ?? 'missing') : targetTriggerClass('source'),
    !enabled && 'opacity-60',
  )

  return (
    <span className="locale-dropdown inline-block">
      <button
        ref={setTriggerNode}
        type="button"
        className={triggerBaseClass}
        disabled={!enabled}
        aria-label={selectedOption ? `${ariaLabel}: ${selectedOption.label}` : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={enabled ? open : undefined}
        aria-controls={open ? listboxId : undefined}
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        onClick={() => setOpen((current) => (enabled ? !current : false))}
      >
        {selectedOption ? (
          mode === 'source' ? (
            <>
              <Languages className="h-3.5 w-3.5" />
              <span>{selectedOption.label}</span>
            </>
          ) : (
            <>
              <span className={cx('h-2 w-2 rounded-full', localeStatusDotClass(selectedOption.status))} />
              <span>{selectedOption.label}</span>
              {selectedOption.status === 'partial' ? (
                <>
                  <span className="text-[10px] opacity-80">{selectedOption.progress}%</span>
                  <span className="inline-flex h-1 w-10 overflow-hidden rounded-full bg-(--warning)/20">
                    <span className="h-full rounded-full bg-(--warning)" style={{ width: `${selectedOption.progress}%` }} />
                  </span>
                </>
              ) : null}
              {selectedOption.status === 'missing' ? <Plus className="h-3.5 w-3.5" /> : null}
              {selectedOption.status === 'translated' ? <Check className="h-3.5 w-3.5" /> : null}
            </>
          )
        ) : (
          <span className="text-(--text-tertiary)">—</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {enabled && open ? (
        <FloatingPortal>
          <div
            ref={setMenuNode}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="custom-scrollbar max-h-64 min-w-52 overflow-auto rounded-xl border border-(--border-color) bg-(--bg-panel) p-1 shadow-lg"
            style={{
              ...floatingStyles,
              opacity: isPositioned ? 1 : 0,
              pointerEvents: isPositioned ? undefined : 'none',
            }}
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
          >
            {options.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cx(
                    'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                    selected ? 'bg-(--accent-soft)' : 'hover:bg-(--bg-hover)',
                  )}
                  disabled={option.disabled}
                  onPointerDown={stopPropagation}
                  onMouseDown={stopPropagation}
                  onClick={() => selectOption(option)}
                >
                  <span className={cx('mt-0.5 h-2 w-2 shrink-0 rounded-full', localeStatusDotClass(option.status))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-(--text-primary)">{option.label}</span>
                      <span className="text-[10px] text-(--text-tertiary)">{option.codeLabel}</span>
                    </div>
                    {option.status === 'partial' ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-(--border-color)/60">
                          <div className="h-full rounded-full bg-(--warning)" style={{ width: `${option.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-(--warning)">{option.progress}%</span>
                      </div>
                    ) : null}
                  </div>
                  {option.status === 'missing' ? (
                    <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" />
                  ) : option.status === 'translated' ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--success)" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </FloatingPortal>
      ) : null}
    </span>
  )
}

export function TranslationEditor({
  project,
  i18nFiles,
  sourceLocale,
  targetLocale,
  query,
  statusFilter,
  canPersist,
  onSourceLocaleChange,
  onTargetLocaleChange,
  onQueryChange,
  onStatusFilterChange,
  onI18nFilesChange,
  localizationContext,
  gameDirectory = null,
  onSave,
  onReload,
  onOpenLocalizationCenter,
  onOpenAiSettings,
  showSaveAction = true,
  onOpenReviewCountChange,
}: TranslationEditorProps) {
  const copy = useTranslationEditorCopy()
  const localization = useLocalization()
  const ai = useAi()
  const publishNotification = useNotificationPublisher()
  const learnRef = useRef<() => Promise<void>>(async () => undefined)
  const {
    sourceFile,
    allEntries,
    filteredEntries,
    progress,
    statusCounts,
    activeEntry,
    selectedKey,
    setSelectedKey,
    updateEntry,
    updateEntries,
    selectRelative,
  } = useTranslationEditorState({
    project,
    i18nFiles,
    sourceLocale,
    targetLocale,
    query,
    statusFilter,
    onI18nFilesChange,
  })

  const appLocale = useLocale()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const applyAiResults = useCallback(
    (values: ReadonlyMap<string, string>, baselines: ReadonlyMap<string, TranslationAiBaseline>) => {
      const { applicable, conflicts } = partitionTranslationAiResults(values, baselines, allEntries)
      if (applicable.size) updateEntries(applicable)
      return conflicts
    },
    [allEntries, updateEntries],
  )
  const [knowledgePolicy, setKnowledgePolicy] = useState({
    enabled: false,
    useOfficialCorpus: true,
    useGlobalKnowledge: true,
    useProfileKnowledge: true,
  })
  const [localizationScopeId, setLocalizationScopeId] = useState<string | null>(null)
  const [engineRef, setEngineRef] = useState<LocalizationEngineRef | null>(null)
  const [engineOptions, setEngineOptions] = useState<Array<{ ref: LocalizationEngineRef; label: string }>>([])
  const [reviewProfileId, setReviewProfileId] = useState<string | null>(null)
  const [reviewAfterTranslation, setReviewAfterTranslation] = useState(false)
  const [profileOptions, setProfileOptions] = useState<AiLocalizationScope[]>([])
  const [profileCreateOpen, setProfileCreateOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileCreating, setProfileCreating] = useState(false)
  const [aiTranslateBehavior, setAiTranslateBehavior] = useModulePersistentState<TranslationAiMode>(
    AI_TRANSLATE_BEHAVIOR_STORAGE_KEY,
    'missing',
    isTranslationAiBehavior,
  )
  const [reviewBehavior, setReviewBehavior] = useModulePersistentState<TranslationReviewMode>(
    REVIEW_BEHAVIOR_STORAGE_KEY,
    'translated',
    isTranslationReviewBehavior,
  )
  const runEngineSettingsLoad = useLatestTask('translation-editor-engine-settings')
  const runLocalizationScopeLoad = useLatestTask('translation-editor-localization-scope')
  const runProfileListLoad = useLatestTask('translation-editor-profile-list')
  const applyScopeSnapshot = useCallback((snapshot: AiLocalizationScopeSnapshot) => {
    setLocalizationScopeId(snapshot.scope.id)
    setKnowledgePolicy(snapshot.settings.knowledgePolicy)
    if (snapshot.settings.reviewProfileId) setReviewProfileId(snapshot.settings.reviewProfileId)
    setReviewAfterTranslation(snapshot.settings.autoReview)
    if (
      (snapshot.settings.defaultEngineKind === 'generative-ai' || snapshot.settings.defaultEngineKind === 'machine-translation') &&
      snapshot.settings.defaultEngineProfileId
    )
      setEngineRef({ kind: snapshot.settings.defaultEngineKind, profileId: snapshot.settings.defaultEngineProfileId })
  }, [])
  const persistScopeSettings = async (patch: Partial<AiLocalizationScopeSnapshot['settings']>) => {
    if (!localizationScopeId) return
    try {
      const current = await localization.loadScope(localizationScopeId)
      applyScopeSnapshot(await localization.saveScopeSettings({ ...current.settings, ...patch, scopeId: localizationScopeId }))
    } catch {
      publishNotification({
        id: 'translation-plan-settings-error',
        level: 'error',
        title: copy.workflowInitializeFailed,
        description: copy.workflowInitializeFailed,
      })
    }
  }
  useEffect(() => {
    void runEngineSettingsLoad(async (task) => {
      const [aiSettings, mtSettings] = await Promise.all([ai.loadSettings(), localization.loadMachineTranslationSettings()])
      if (task.isCurrent()) {
        const options = [
          ...aiSettings.profiles.map((profile) => ({
            ref: { kind: 'generative-ai' as const, profileId: profile.id },
            label: `${copy.generativeEngine}: ${profile.name}`,
          })),
          ...mtSettings.profiles
            .filter((profile) => profile.enabled)
            .map((profile) => ({
              ref: { kind: 'machine-translation' as const, profileId: profile.id },
              label: `${copy.machineTranslationEngine}: ${profile.name}`,
            })),
        ]
        setEngineOptions(options)
        setReviewProfileId((current) => current ?? aiSettings.defaultProfileId)
        setEngineRef(
          (current) =>
            current ??
            (aiSettings.defaultProfileId
              ? { kind: 'generative-ai', profileId: aiSettings.defaultProfileId }
              : mtSettings.defaultProfileId &&
                  mtSettings.profiles.some((profile) => profile.id === mtSettings.defaultProfileId && profile.enabled)
                ? { kind: 'machine-translation', profileId: mtSettings.defaultProfileId }
                : null),
        )
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        setEngineOptions([])
        setEngineRef(null)
      }
    })
  }, [ai, copy.generativeEngine, copy.machineTranslationEngine, localization, runEngineSettingsLoad])
  useEffect(() => {
    const binding = localizationContext ? localizationBinding(localizationContext) : null
    if (!localizationContext || !binding) {
      setLocalizationScopeId(null)
      return
    }
    void runLocalizationScopeLoad(async (task) => {
      const snapshot = await localization.resolveScope({ ...binding, name: localizationContext.displayName })
      if (task.isCurrent()) applyScopeSnapshot(snapshot)
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) setLocalizationScopeId(null)
    })
  }, [localization, localizationContext, runLocalizationScopeLoad, applyScopeSnapshot])
  const binding = localizationContext ? localizationBinding(localizationContext) : null
  const refreshProfiles = async () => {
    await runProfileListLoad(async (task) => {
      const page = await localization.listScopes({ query: null, offset: 0, limit: 200 })
      if (task.isCurrent()) setProfileOptions(page.records.filter((scope) => scope.kind === 'profile'))
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) setProfileOptions([])
    })
  }
  const switchProfile = async (scopeId: string) => {
    if (!binding || scopeId === localizationScopeId) return
    try {
      applyScopeSnapshot(await localization.setProfileBinding(scopeId, binding.bindingKind, binding.bindingValue))
    } catch {
      // Keep the previous profile selected when the host rejects the rebinding.
    }
  }
  const createProfile = async () => {
    const name = profileName.trim()
    if (!binding || !name || profileCreating) return
    setProfileCreating(true)
    try {
      const created = await localization.createProfile(name)
      applyScopeSnapshot(await localization.setProfileBinding(created.scope.id, binding.bindingKind, binding.bindingValue))
      setProfileName('')
      setProfileCreateOpen(false)
      await refreshProfiles()
    } catch {
      // Keep the inline form open so the entered name is not lost.
    } finally {
      setProfileCreating(false)
    }
  }
  const learnConfirmedTranslations = async () => {
    const binding = localizationContext ? localizationBinding(localizationContext) : null
    if (!localizationContext || !binding) return
    const snapshot = await localization.resolveScope({
      ...binding,
      name: localizationContext.displayName,
    })
    const fileNamespace =
      i18nFiles.find((file) => file.locale === targetLocale)?.relativePath ?? `${localizationContext.sourceNamespace}/${targetLocale}`
    await localization.recordConfirmed({
      jobId: crypto.randomUUID(),
      scopeId: snapshot.scope.id,
      fileNamespace,
      entries: allEntries
        .filter((entry) => entry.targetText.trim())
        .map((entry) => ({
          sourceLocale,
          targetLocale,
          sourceText: entry.sourceText,
          targetText: entry.targetText,
          fileNamespace,
          unitKey: entry.key,
        })),
    })
  }
  learnRef.current = learnConfirmedTranslations
  useEffect(() => () => dismissNotification('translation-memory-learning-error'), [])
  const handleSave = async () => {
    await onSave()
    try {
      await learnConfirmedTranslations()
    } catch {
      publishNotification({
        id: 'translation-memory-learning-error',
        level: 'warning',
        title: copy.memoryLearningFailed,
        description: copy.memoryLearningFailed,
        action: { label: copy.retry, callback: () => void learnRef.current(), tone: 'primary' },
      })
    }
  }
  const {
    progress: aiProgress,
    run: runAiTranslation,
    cancel: cancelAiTranslation,
    streamingValues,
  } = useLocalizationTranslation({
    activeEntry,
    allEntries,
    sourceLocale,
    targetLocale,
    contextKey: `${project?.rootPath ?? ''}\u0000${sourceLocale}\u0000${targetLocale}`,
    knowledgePolicy,
    scopeId: localizationScopeId,
    engineRef,
    applyResults: applyAiResults,
  })
  // 流式预览只作用于正在生成的条目：文本区展示流式值并锁定编辑，正式结果
  // 落地后（streamingValues 归 null）自动恢复可编辑与文件内容。
  const streamingEntryValue = activeEntry ? (streamingValues?.get(activeEntry.key) ?? null) : null
  const [reviewOpen, setReviewOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'entries' | 'translation' | 'review'>('translation')
  const reviewTriggerRef = useRef<HTMLButtonElement | null>(null)
  const closeReview = useCallback(() => {
    setReviewOpen(false)
    setMobilePanel('translation')
    window.requestAnimationFrame(() => reviewTriggerRef.current?.focus())
  }, [])
  useEffect(() => {
    if (!reviewOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReview()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [closeReview, reviewOpen])
  const [reviewWithAi, setReviewWithAi] = useState(false)
  const review = useTranslationReview({
    activeEntry,
    allEntries,
    sourceLocale,
    targetLocale,
    scopeId: localizationScopeId,
    profileId: reviewProfileId,
    applySuggestions: updateEntries,
  })
  useEffect(
    () => onOpenReviewCountChange?.(review.result?.run.summary.open ?? 0),
    [onOpenReviewCountChange, review.result?.run.summary.open],
  )
  const corpusReadiness = useCorpusReadiness(gameDirectory)
  const translationWasRunning = useRef(false)
  useEffect(() => {
    if (aiProgress.running) {
      translationWasRunning.current = true
      return
    }
    if (translationWasRunning.current) {
      translationWasRunning.current = false
      if (reviewAfterTranslation && !aiProgress.error) {
        setReviewOpen(true)
        setMobilePanel('review')
        void review.run('translated', Boolean(reviewProfileId))
      }
    }
  }, [aiProgress.error, aiProgress.running, review, reviewAfterTranslation, reviewProfileId])

  const localeLabels = useMemo(() => {
    const map = new Map<string, string>()
    const allLocales = new Set(i18nFiles.map((file) => file.locale))
    for (const locale of TRANSLATION_TARGET_LOCALES) {
      allLocales.add(locale)
    }
    allLocales.add(sourceLocale)
    allLocales.add(targetLocale)
    for (const locale of allLocales) {
      map.set(locale, getLocaleDisplayName(locale, appLocale, copy.defaultLocaleLabel))
    }
    return map
  }, [appLocale, copy.defaultLocaleLabel, i18nFiles, sourceLocale, targetLocale])

  const sourceOptions: LocaleOption[] = useMemo(
    () =>
      i18nFiles
        .filter((file) => file.locale !== targetLocale)
        .map((file) => ({
          value: file.locale,
          label: localeLabels.get(file.locale) ?? file.locale,
          codeLabel: file.locale,
          progress: 100,
          status: 'source' as const,
        })),
    [i18nFiles, localeLabels, targetLocale],
  )

  const targetOptions: LocaleOption[] = useMemo(() => {
    const candidateLocales = new Set<string>()
    for (const file of i18nFiles) {
      if (file.locale !== 'default' && file.locale !== sourceLocale) {
        candidateLocales.add(file.locale)
      }
    }
    for (const locale of TRANSLATION_TARGET_LOCALES) {
      if (locale !== 'default' && locale !== sourceLocale) {
        candidateLocales.add(locale)
      }
    }
    if (targetLocale !== 'default' && targetLocale !== sourceLocale) {
      candidateLocales.add(targetLocale)
    }

    const options: LocaleOption[] = []
    for (const locale of candidateLocales) {
      const file = findFile(i18nFiles, locale)
      if (file) {
        const entries = buildTranslationEntries({ sourceFile, targetFile: file, query: '', status: 'all' })
        const optionProgress = getProgress(entries)
        const status: LocaleStatus = optionProgress === 100 ? 'translated' : 'partial'
        options.push({
          value: file.locale,
          label: localeLabels.get(file.locale) ?? file.locale,
          codeLabel: file.locale,
          progress: optionProgress,
          status,
        })
      } else {
        options.push({
          value: locale,
          label: localeLabels.get(locale) ?? locale,
          codeLabel: locale,
          progress: 0,
          status: 'missing',
        })
      }
    }

    options.sort((left, right) => {
      if (left.value === targetLocale) return -1
      if (right.value === targetLocale) return 1
      return left.label.localeCompare(right.label, appLocale)
    })

    return options
  }, [appLocale, copy.defaultLocaleLabel, i18nFiles, localeLabels, sourceFile, targetLocale])

  const handleTargetLocaleChange = useCallback(
    (nextLocale: string) => {
      if (nextLocale === targetLocale) {
        return
      }
      if (!project) {
        return
      }
      if (!i18nFiles.some((file) => file.locale === nextLocale)) {
        const nextFile = createI18nFile(project.rootPath, nextLocale)
        onI18nFilesChange([...i18nFiles, nextFile])
      }
      onTargetLocaleChange(nextLocale)
    },
    [i18nFiles, onI18nFilesChange, onTargetLocaleChange, project, targetLocale],
  )

  const handleKeyboard = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter') {
        return
      }
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      event.preventDefault()
      const delta = event.shiftKey ? -1 : 1
      selectRelative(delta)
    },
    [selectRelative],
  )

  if (!project) {
    return (
      <div className="translation-editor-workspace flex h-full min-h-0 flex-col overflow-hidden bg-(--bg-app)">
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 xl:px-5 xl:py-5">
          <div className="mx-auto grid max-w-6xl">
            <section className="item-workspace-pane h-full">
              <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
                <p className="max-w-md text-sm text-(--text-secondary)">{copy.noProject}</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="translation-editor-workspace flex h-full min-h-0 flex-col overflow-hidden bg-(--bg-app)">
      <section className="item-workspace-pane h-full">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-(--border-color)/60 px-5 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0">
              <p className="text-[0.625rem] font-bold tracking-[0.16em] text-(--text-tertiary) uppercase">{project.name}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-(--text-secondary)">
                <span>{copy.progressLabel}</span>
                <span className="font-mono font-semibold text-(--text-primary)">{progress}%</span>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-(--border-color) sm:block" />
            <div className="hidden min-w-40 sm:block">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--border-color)/60">
                <div
                  className={cx('h-full rounded-full transition-all', progress === 100 ? 'bg-(--success)' : 'bg-(--warning)')}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-(--text-secondary)">{copy.sourceLocaleLabel}</span>
            <LocaleDropdown
              mode="source"
              value={sourceLocale}
              options={sourceOptions}
              onChange={onSourceLocaleChange}
              ariaLabel={copy.sourceLocaleLabel}
            />
            <ArrowRight className="h-3 w-3 text-(--text-tertiary)" aria-hidden="true" />
            <span className="text-[11px] text-(--text-secondary)">{copy.targetLocaleLabel}</span>
            <LocaleDropdown
              mode="target"
              value={targetLocale}
              options={targetOptions}
              onChange={handleTargetLocaleChange}
              ariaLabel={copy.targetLocaleLabel}
            />
            <div className="hidden h-5 w-px bg-(--border-color) sm:block" />
            <SplitActionButton
              mainClassName="control-button-primary"
              mainDisabled={aiProgress.running}
              title={aiBehaviorLabel(copy, aiTranslateBehavior)}
              onMainClick={() => void runAiTranslation(aiTranslateBehavior)}
              menuAriaLabel={copy.aiTranslateMoreActions}
              onMenuToggle={(open) => {
                if (open) void refreshProfiles()
              }}
              menu={
                <>
                  <label className="translation-ai-engine-select">
                    <span>{copy.translationEngine}</span>
                    <select
                      className="control-input"
                      value={engineRef ? `${engineRef.kind}:${engineRef.profileId}` : ''}
                      onChange={(event) => {
                        const option = engineOptions.find((value) => `${value.ref.kind}:${value.ref.profileId}` === event.target.value)
                        const next = option?.ref ?? null
                        setEngineRef(next)
                        if (next) {
                          void persistScopeSettings({ defaultEngineKind: next.kind, defaultEngineProfileId: next.profileId })
                        }
                      }}
                    >
                      {!engineOptions.length ? <option value="">{copy.noTranslationEngine}</option> : null}
                      {engineOptions.map((option) => (
                        <option key={`${option.ref.kind}:${option.ref.profileId}`} value={`${option.ref.kind}:${option.ref.profileId}`}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {engineRef?.kind === 'machine-translation' ? (
                    <p className="translation-ai-capability-note">{copy.machineTranslationKnowledgeNotice}</p>
                  ) : null}
                  {binding ? (
                    <>
                      <label className="translation-ai-engine-select">
                        <span>{copy.profileLabel}</span>
                        <select
                          className="control-input"
                          value={localizationScopeId ?? ''}
                          onChange={(event) => void switchProfile(event.target.value)}
                        >
                          {!localizationScopeId ? (
                            <option value="" disabled>
                              —
                            </option>
                          ) : null}
                          {localizationScopeId && !profileOptions.some((profile) => profile.id === localizationScopeId) ? (
                            <option value={localizationScopeId}>{localizationScopeId}</option>
                          ) : null}
                          {profileOptions.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {profileCreateOpen ? (
                        <div className="translation-ai-profile-create">
                          <input
                            className="control-input"
                            value={profileName}
                            placeholder={copy.profileNamePlaceholder}
                            onChange={(event) => setProfileName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void createProfile()
                              }
                            }}
                          />
                          <button type="button" disabled={!profileName.trim() || profileCreating} onClick={() => void createProfile()}>
                            {copy.profileCreateAction}
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setProfileCreateOpen(true)}>
                          {copy.profileCreate}
                        </button>
                      )}
                    </>
                  ) : null}
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      checked={knowledgePolicy.enabled}
                      onChange={(event) => {
                        const next = { ...knowledgePolicy, enabled: event.target.checked }
                        setKnowledgePolicy(next)
                        void persistScopeSettings({ knowledgePolicy: next })
                      }}
                    />
                    <span>{knowledgePolicy.enabled ? copy.aiKnowledgeEnabled : copy.aiKnowledgeDisabled}</span>
                  </label>
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      disabled={!knowledgePolicy.enabled}
                      checked={knowledgePolicy.useOfficialCorpus}
                      onChange={(event) => {
                        const next = { ...knowledgePolicy, useOfficialCorpus: event.target.checked }
                        setKnowledgePolicy(next)
                        void persistScopeSettings({ knowledgePolicy: next })
                      }}
                    />
                    <span>{copy.aiOfficialCorpus}</span>
                  </label>
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      disabled={!knowledgePolicy.enabled}
                      checked={knowledgePolicy.useGlobalKnowledge}
                      onChange={(event) => {
                        const next = { ...knowledgePolicy, useGlobalKnowledge: event.target.checked }
                        setKnowledgePolicy(next)
                        void persistScopeSettings({ knowledgePolicy: next })
                      }}
                    />
                    <span>{copy.aiGlobalKnowledge}</span>
                  </label>
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      disabled={!knowledgePolicy.enabled || !localizationScopeId}
                      checked={knowledgePolicy.useProfileKnowledge}
                      onChange={(event) => {
                        const next = { ...knowledgePolicy, useProfileKnowledge: event.target.checked }
                        setKnowledgePolicy(next)
                        void persistScopeSettings({ knowledgePolicy: next })
                      }}
                    />
                    <span>{copy.aiProfileKnowledge}</span>
                  </label>
                  <div className="translation-ai-menu-separator" />
                  {AI_TRANSLATE_BEHAVIORS.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="translation-ai-behavior-item"
                      disabled={aiProgress.running}
                      onClick={() => {
                        setAiTranslateBehavior(mode)
                        void runAiTranslation(mode)
                      }}
                    >
                      <span>{aiBehaviorLabel(copy, mode)}</span>
                      {aiTranslateBehavior === mode ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </button>
                  ))}
                  <div className="translation-ai-menu-separator" />
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      checked={reviewAfterTranslation}
                      onChange={(event) => {
                        setReviewAfterTranslation(event.target.checked)
                        void persistScopeSettings({ autoReview: event.target.checked })
                      }}
                    />
                    <span>{copy.reviewAfterTranslation}</span>
                  </label>
                  {onOpenLocalizationCenter ? (
                    <button type="button" onClick={() => onOpenLocalizationCenter(localizationScopeId)}>
                      {copy.manageLocalizationKnowledge}
                    </button>
                  ) : null}
                </>
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{copy.aiTranslate}</span>
            </SplitActionButton>
            <SplitActionButton
              running={review.running}
              runningChildren={
                <>
                  <X className="h-3.5 w-3.5" />
                  <span>{copy.reviewCancel}</span>
                </>
              }
              mainClassName="translation-review-trigger"
              mainAriaLabel={review.running ? copy.reviewCancel : copy.review}
              mainRef={reviewTriggerRef}
              mainDisabled={!review.running && !localizationScopeId}
              title={reviewBehaviorLabel(copy, reviewBehavior)}
              onMainClick={() => {
                if (review.running) {
                  review.cancel()
                  return
                }
                setReviewOpen(true)
                setMobilePanel('review')
                void review.run(reviewBehavior, reviewWithAi)
              }}
              menuAriaLabel={copy.reviewMoreActions}
              menuDisabled={review.running}
              menuVisible={!review.running}
              menu={
                <>
                  <label className="translation-ai-knowledge-toggle">
                    <input
                      type="checkbox"
                      checked={reviewWithAi}
                      disabled={!reviewProfileId}
                      onChange={(event) => setReviewWithAi(event.target.checked)}
                    />
                    <span>{copy.reviewWithAi}</span>
                  </label>
                  <div className="translation-ai-menu-separator" />
                  {REVIEW_BEHAVIORS.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="translation-ai-behavior-item"
                      disabled={!localizationScopeId}
                      onClick={() => {
                        setReviewBehavior(mode)
                        setReviewOpen(true)
                        setMobilePanel('review')
                        void review.run(mode, reviewWithAi)
                      }}
                    >
                      <span>{reviewBehaviorLabel(copy, mode)}</span>
                      {reviewBehavior === mode ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </>
              }
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{copy.review}</span>
              {review.result?.run.summary.open ? <span className="translation-review-badge">{review.result.run.summary.open}</span> : null}
            </SplitActionButton>
            {onReload ? (
              <button
                type="button"
                className="icon-button h-8 w-8"
                aria-label={copy.reloadTranslations}
                title={copy.reloadTranslations}
                onClick={onReload}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {showSaveAction ? (
              <button
                type="button"
                className="control-button control-button-primary h-8 px-3 text-xs"
                disabled={!canPersist}
                onClick={() => void handleSave()}
              >
                <Save className="h-3.5 w-3.5" />
                <span>{copy.saveTranslations}</span>
              </button>
            ) : null}
          </div>
        </header>

        {corpusReadiness.visible ? <CorpusReadinessBanner readiness={corpusReadiness} onOpenSettings={onOpenAiSettings} /> : null}

        {aiProgress.running ? (
          <div className="translation-ai-progress" role="status">
            <span>{aiProgress.error ?? copy.aiTranslating(aiProgress.completed, aiProgress.total)}</span>
            <button
              type="button"
              className="icon-button h-10 w-10"
              onClick={cancelAiTranslation}
              title={copy.aiCancel}
              aria-label={copy.aiCancel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {review.running || review.error ? (
          <div className="translation-ai-progress" role="status">
            <span>{review.error ?? copy.reviewing(0, review.result?.run.summary.total ?? allEntries.length)}</span>
            {review.running ? (
              <button
                type="button"
                className="icon-button h-10 w-10"
                onClick={review.cancel}
                title={copy.reviewCancel}
                aria-label={copy.reviewCancel}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Body */}
        <nav className="translation-mobile-segments" aria-label={copy.reviewInspector}>
          <button type="button" className={mobilePanel === 'entries' ? 'is-active' : ''} onClick={() => setMobilePanel('entries')}>
            {copy.mobileEntries}
          </button>
          <button type="button" className={mobilePanel === 'translation' ? 'is-active' : ''} onClick={() => setMobilePanel('translation')}>
            {copy.mobileTranslation}
          </button>
          <button
            type="button"
            className={mobilePanel === 'review' ? 'is-active' : ''}
            onClick={() => {
              setMobilePanel('review')
              setReviewOpen(true)
            }}
          >
            {copy.review}
          </button>
        </nav>
        <div
          data-mobile-panel={mobilePanel}
          className={cx(
            'translation-editor-grid grid min-h-0 flex-1',
            reviewOpen ? 'has-review' : localizationScopeId ? 'has-context' : '',
          )}
        >
          {/* Key catalog */}
          <aside className="translation-editor-catalog flex min-h-0 flex-col border-r border-(--border-color)/60 bg-(--bg-panel-muted)/30 p-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {statusFilters.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={statusFilterClass(
                    status,
                    statusFilter === status,
                    isStatusHighlighted(status, statusCounts, allEntries.length),
                  )}
                  onClick={() => onStatusFilterChange(status)}
                >
                  {statusLabel(copy, status)}
                </button>
              ))}
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" />
              <input
                className="control-input h-7 pl-8 text-[11px]"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={copy.searchPlaceholder}
                spellCheck={false}
              />
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-auto">
              {filteredEntries.length ? (
                filteredEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={cx(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                      selectedKey === entry.key ? 'bg-(--accent-soft)' : 'hover:bg-(--bg-hover)',
                      streamingValues?.has(entry.key) && 'is-ai-streaming',
                    )}
                    onClick={() => setSelectedKey(entry.key)}
                  >
                    <span
                      className={cx('h-2 w-2 shrink-0 rounded-full', entry.status === 'translated' ? 'bg-(--success)' : 'bg-(--danger)')}
                    />
                    <div className="min-w-0 flex-1">
                      <code className="block truncate text-[11px] text-(--text-primary)" style={{ fontFamily: 'var(--font-mono)' }}>
                        {entry.key}
                      </code>
                      <p className="truncate text-[10px] text-(--text-tertiary)">{entry.sourceText || entry.targetText}</p>
                    </div>
                    {streamingValues?.has(entry.key) ? <span className="translation-entry-stream-dot" aria-hidden="true" /> : null}
                  </button>
                ))
              ) : (
                <div className="flex h-32 items-center justify-center text-center text-xs text-(--text-secondary)">
                  {allEntries.length > 0 ? copy.noMatchingEntries : copy.noI18n}
                </div>
              )}
            </div>
          </aside>

          {/* Editor */}
          <main className="translation-editor-main min-h-0 flex-1 overflow-auto p-6">
            {activeEntry ? (
              <div className="mx-auto max-w-3xl">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <code className="text-sm font-semibold text-(--text-secondary)" style={{ fontFamily: 'var(--font-mono)' }}>
                      {activeEntry.key}
                    </code>
                    <span className={cx('status-pill', statusClass(activeEntry.status))}>{statusLabel(copy, activeEntry.status)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="control-button h-8 w-8 px-0"
                      onClick={() => selectRelative(-1)}
                      title={copy.shortcutSaveAndPrevious}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="control-button h-8 w-8 px-0"
                      onClick={() => selectRelative(1)}
                      title={copy.shortcutSaveAndNext}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.14em] text-(--text-tertiary) uppercase">
                    <span className="inline-flex items-center rounded bg-(--bg-panel-muted) px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-(--text-secondary) uppercase">
                      {sourceLocale}
                    </span>
                    {copy.sourceLabel}
                  </div>
                  <textarea
                    className="translation-source-text control-input min-h-28 resize-y rounded-xl p-4 text-base leading-relaxed"
                    value={activeEntry.sourceText}
                    readOnly
                    aria-readonly="true"
                    aria-label={copy.sourceLabel}
                    spellCheck={false}
                  />
                </div>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.14em] text-(--text-tertiary) uppercase">
                    <span className="inline-flex items-center rounded bg-(--accent-soft) px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-(--accent) uppercase">
                      {targetLocale}
                    </span>
                    {copy.targetLabel}
                    {streamingEntryValue !== null ? (
                      <span className="translation-ai-streaming-badge" role="status">
                        {copy.aiStreaming}
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    ref={textareaRef}
                    className={cx(
                      'control-input min-h-40 resize-y rounded-xl p-4 text-base leading-relaxed',
                      streamingEntryValue !== null && 'is-ai-streaming',
                    )}
                    value={streamingEntryValue ?? activeEntry.targetText}
                    onChange={(event) => updateEntry(activeEntry.key, event.target.value)}
                    onKeyDown={handleKeyboard}
                    readOnly={streamingEntryValue !== null}
                    aria-readonly={streamingEntryValue !== null ? true : undefined}
                  />
                  <p className="mt-2 text-[11px] text-(--text-tertiary)">{copy.shortcutHint}</p>
                </div>

                {activeEntry.missingTokens.length ? (
                  <div className="rounded-xl border-l-4 border-(--danger) bg-(--danger-soft) px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-(--danger)">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {copy.missingTokens(activeEntry.missingTokens.join(', '))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-(--text-secondary)">
                {allEntries.length > 0 ? copy.noMatchingEntries : copy.noI18n}
              </div>
            )}
          </main>
          {activeEntry && localizationScopeId && !reviewOpen ? (
            <TranslationContextPanel
              entry={activeEntry}
              scopeId={localizationScopeId}
              sourceLocale={sourceLocale}
              targetLocale={targetLocale}
              gameDirectory={gameDirectory}
              knowledgePolicy={knowledgePolicy}
              onApply={(value) => updateEntry(activeEntry.key, value)}
            />
          ) : null}
          {reviewOpen ? (
            <TranslationReviewInspector
              result={review.result}
              selectedId={review.selectedIssue?.id ?? null}
              checked={review.checked}
              onSelect={review.setSelectedId}
              onChecked={review.setChecked}
              onUpdate={review.update}
              running={review.running}
              error={review.error}
              onReviewCurrent={() => void review.run('current', Boolean(reviewProfileId))}
              onClose={closeReview}
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default TranslationEditor
