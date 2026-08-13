import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { usePlatformPorts } from '@app/providers/usePlatformPorts'
import { Eraser } from 'lucide-react'
import { parseAiFailure, useAi, validateAiGenerationParams } from '@entities/ai'
import type { AiGenerationParamField } from '@entities/ai'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import type {
  AiModelInfo,
  AiProfileImportConflictPolicy,
  AiProfileImportPreview,
  AiProfileTestResult,
  AiSettingsSnapshot,
  AiSettingsTab,
  ModelsDevCatalog,
  ModelsDevModelEntry,
} from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { AiProfileEditor } from './AiProfileEditor'
import { ModelsDevImportDialog } from './ModelsDevImportDialog'
import { ReasoningChainView } from './ReasoningChainView'
import { SemanticStatusStrip } from './SemanticStatusStrip'
import {
  AI_GENERATION_PARAM_FIELDS,
  paramErrorMessage,
  paramStringsFromProfile,
  paramValueFromString,
  profilesAreSaved,
  toDrafts,
  type GenerationParamSource,
  type ParamDraftStrings,
  type ProfileDraft,
} from './profileDraftModel'

const AiUsageSection = lazy(() => import('./AiUsageSection').then((module) => ({ default: module.AiUsageSection })))
const DefaultTranslationEngineSection = lazy(() =>
  import('./DefaultTranslationEngineSection').then((module) => ({ default: module.DefaultTranslationEngineSection })),
)
const MachineTranslationProfilesSection = lazy(() =>
  import('./MachineTranslationProfilesSection').then((module) => ({ default: module.MachineTranslationProfilesSection })),
)
const SemanticSearchSection = lazy(() => import('./SemanticSearchSection').then((module) => ({ default: module.SemanticSearchSection })))

const AI_SETTINGS_SAVE_NOTIFICATION_ID = 'ai-settings-save-error'
const AI_SETTINGS_CACHE_NOTIFICATION_ID = 'ai-settings-cache-error'
const AI_SETTINGS_TEST_NOTIFICATION_ID = 'ai-settings-connection-test'
const AI_SETTINGS_MODELS_NOTIFICATION_ID = 'ai-settings-load-models'
const AI_TABS = ['engine', 'generative', 'machine-translation', 'semantic', 'usage'] as const satisfies readonly AiSettingsTab[]

function profileNotificationId(profileId: string) {
  return `ai-settings-profile-${profileId}`
}

type AiSettingsActions = {
  save: () => Promise<void>
  loadModels: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<void>
  clearCache: () => Promise<void>
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

/**
 * AI settings shell: owns tab orchestration and shared generative-profile state
 * (drafts, dirty comparison, remote-action gating), delegating the profile
 * editor, models.dev import dialog, chain-of-thought viewer and semantic strip
 * to dedicated components.
 */
export function AiSettingsPanel({
  initialTab = 'engine',
  onDirtyChange,
  requestLeave,
}: {
  initialTab?: AiSettingsTab
  onDirtyChange?: (dirty: boolean) => void
  requestLeave: (action: () => void) => void
}) {
  const ai = useAi()
  const { dialog } = usePlatformPorts()
  const settingsMenuCopy = useSettingsMenuCopy()
  const copy = settingsMenuCopy.ai
  const settingsCategories = settingsMenuCopy.categories
  const categoryDescriptions = settingsMenuCopy.categoryDescriptions
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot | null>(null)
  const [profiles, setProfiles] = useState<ProfileDraft[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null)
  const [models, setModels] = useState<Record<string, AiModelInfo[]>>({})
  const [testResult, setTestResult] = useState<AiProfileTestResult | null>(null)
  const [testedProfileIds, setTestedProfileIds] = useState<Record<string, boolean>>({})
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
  const [testReasoningExpanded, setTestReasoningExpanded] = useState(false)
  const [loadingModelsId, setLoadingModelsId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<{ sourcePath: string; preview: AiProfileImportPreview } | null>(null)
  const testDialogTitleId = useId()
  const [importPolicy, setImportPolicy] = useState<AiProfileImportConflictPolicy>('overwrite')
  const [exchangeStatus, setExchangeStatus] = useState('')
  const [cacheStats, setCacheStats] = useState({ entryCount: 0, sizeBytes: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AiSettingsTab>(initialTab)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [defaultEngineDirty, setDefaultEngineDirty] = useState(false)
  const [machineTranslationDirty, setMachineTranslationDirty] = useState(false)
  const [semanticDirty, setSemanticDirty] = useState(false)
  const [paramStrings, setParamStrings] = useState<Record<string, ParamDraftStrings>>({})
  const [paramErrors, setParamErrors] = useState<Record<string, Partial<Record<AiGenerationParamField, string>>>>({})
  const [advancedExpanded, setAdvancedExpanded] = useState<Record<string, boolean>>({})
  const [modelsDevOpen, setModelsDevOpen] = useState(false)
  const [modelsDevCatalog, setModelsDevCatalog] = useState<ModelsDevCatalog | null>(null)
  const [modelsDevLoading, setModelsDevLoading] = useState(false)
  const [modelsDevLoadFailed, setModelsDevLoadFailed] = useState(false)
  const [modelsDevQuery, setModelsDevQuery] = useState('')
  const [modelsDevSelected, setModelsDevSelected] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const profileNotificationIds = useRef(new Set<string>())
  const actionsRef = useRef<AiSettingsActions>({
    save: async () => {},
    loadModels: async (_id: string) => {},
    testProfile: async (_id: string) => {},
    clearCache: async () => {},
  })

  useEffect(() => {
    if (activeTab !== 'generative') return
    let active = true
    void ai
      .loadSettings()
      .then((settings) => {
        if (!active) return
        setSnapshot(settings)
        setProfiles(toDrafts(settings))
        setDefaultProfileId(settings.defaultProfileId)
        setSelectedProfileId((current) =>
          current && settings.profiles.some((profile) => profile.id === current) ? current : (settings.profiles[0]?.id ?? null),
        )
      })
      .catch(() => active && setError(copy.loadError))
    void ai
      .getCacheStats()
      .then((stats) => {
        if (!active) return
        setCacheStats(stats)
        setCacheError(null)
      })
      .catch((cause) => {
        if (!active) return
        const failure = parseAiFailure(cause)
        setCacheError(notificationCopy.failureDescriptions[failure.code])
      })
    return () => {
      active = false
    }
  }, [activeTab, ai, copy.loadError, notificationCopy.failureDescriptions])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      dismissNotification(AI_SETTINGS_SAVE_NOTIFICATION_ID)
      dismissNotification(AI_SETTINGS_CACHE_NOTIFICATION_ID)
      for (const id of profileNotificationIds.current) dismissNotification(id)
    }
  }, [])

  const presets = snapshot?.presets ?? []
  const generativeDirty = snapshot ? !profilesAreSaved(snapshot, profiles, defaultProfileId) : false
  const dirty = generativeDirty || defaultEngineDirty || machineTranslationDirty || semanticDirty
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null
  const selectedPersisted = selectedProfile ? (snapshot?.profiles.find((item) => item.id === selectedProfile.id) ?? null) : null
  const remoteActionsReady = Boolean(
    selectedProfile &&
    selectedPersisted &&
    !selectedProfile.apiKey &&
    !selectedProfile.clearApiKey &&
    selectedPersisted.name === selectedProfile.name &&
    selectedPersisted.presetId === selectedProfile.presetId &&
    selectedPersisted.protocol === selectedProfile.protocol &&
    selectedPersisted.baseUrl === selectedProfile.baseUrl &&
    selectedPersisted.model === selectedProfile.model &&
    selectedPersisted.credentialEnvironment === selectedProfile.credentialEnvironment &&
    selectedPersisted.allowInsecureHttp === selectedProfile.allowInsecureHttp &&
    selectedPersisted.contextWindowTokens === selectedProfile.contextWindowTokens &&
    selectedPersisted.maxOutputTokens === selectedProfile.maxOutputTokens &&
    selectedPersisted.maxBatchBytes === selectedProfile.maxBatchBytes &&
    selectedPersisted.temperature === selectedProfile.temperature &&
    selectedPersisted.topP === selectedProfile.topP &&
    selectedPersisted.frequencyPenalty === selectedProfile.frequencyPenalty &&
    selectedPersisted.presencePenalty === selectedProfile.presencePenalty &&
    selectedPersisted.enableReasoning === selectedProfile.enableReasoning &&
    selectedPersisted.reasoningEffort === selectedProfile.reasoningEffort &&
    selectedPersisted.streamTranslation === selectedProfile.streamTranslation,
  )

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const navigate = (action: () => void) => {
    if (dirty) requestLeave(action)
    else action()
  }
  const updateProfile = (id: string, patch: Partial<ProfileDraft>) => {
    setTestedProfileIds((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
    setProfiles((current) => current.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)))
  }

  const draftStringsFor = (profile: GenerationParamSource): ParamDraftStrings =>
    paramStrings[profile.id] ?? paramStringsFromProfile(profile)

  const updateParamString = (id: string, field: (typeof AI_GENERATION_PARAM_FIELDS)[number], value: string) => {
    const seed = paramStrings[id] ?? paramStringsFromProfile(profiles.find((profile) => profile.id === id) ?? profiles[0]!)
    setParamStrings((current) => ({ ...current, [id]: { ...seed, [field]: value } }))
    setParamErrors((current) => {
      if (!current[id]?.[field]) return current
      const next = { ...current, [id]: { ...current[id] } }
      delete next[id]?.[field]
      return next
    })
  }

  const addProfile = () => {
    const preset = presets[0]
    if (!preset) return
    const id = crypto.randomUUID()
    setProfiles((current) => [
      ...current,
      {
        id,
        name: preset.name,
        presetId: preset.id,
        protocol: preset.protocol,
        baseUrl: preset.baseUrl,
        model: '',
        credentialEnvironment: preset.credentialEnvironment,
        allowInsecureHttp: false,
        contextWindowTokens: null,
        maxOutputTokens: null,
        maxBatchBytes: null,
        temperature: null,
        topP: null,
        frequencyPenalty: null,
        presencePenalty: null,
        enableReasoning: false,
        reasoningEffort: null,
        streamTranslation: false,
        keyStatus: null,
      },
    ])
    setDefaultProfileId((current) => (current && profiles.some((profile) => profile.id === current) ? current : id))
    setSelectedProfileId(id)
  }

  const deleteProfile = (id: string) => {
    dismissNotification(profileNotificationId(id))
    profileNotificationIds.current.delete(profileNotificationId(id))
    setModels((current) => Object.fromEntries(Object.entries(current).filter(([profileId]) => profileId !== id)))
    setTestedProfileIds((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setParamStrings((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setParamErrors((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    const remaining = profiles.filter((item) => item.id !== id)
    setProfiles(remaining)
    setSelectedProfileId(remaining[0]?.id ?? null)
    if (defaultProfileId === id) setDefaultProfileId(null)
  }

  const save = async () => {
    dismissNotification(AI_SETTINGS_SAVE_NOTIFICATION_ID)
    // Field-level validation runs before any remote call: invalid generation
    // parameters block the save and are surfaced next to their inputs.
    const validationErrors: Record<string, Partial<Record<AiGenerationParamField, string>>> = {}
    for (const profile of profiles) {
      const draft = draftStringsFor(profile)
      const fieldErrors = validateAiGenerationParams(draft)
      if (fieldErrors.length) {
        validationErrors[profile.id] = Object.fromEntries(
          fieldErrors.map((fieldError) => [fieldError.field, paramErrorMessage(copy, fieldError)]),
        )
      }
    }
    const hasValidationErrors = Object.keys(validationErrors).length > 0
    setParamErrors(validationErrors)
    if (hasValidationErrors) {
      setError(copy.saveError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const settings = await ai.saveSettings({
        defaultProfileId,
        profiles: profiles.map(({ keyStatus: _keyStatus, ...profile }) => {
          const draft = draftStringsFor(profile)
          return {
            ...profile,
            contextWindowTokens: paramValueFromString('contextWindowTokens', draft.contextWindowTokens),
            maxOutputTokens: paramValueFromString('maxOutputTokens', draft.maxOutputTokens),
            maxBatchBytes: paramValueFromString('maxBatchBytes', draft.maxBatchBytes),
            temperature: paramValueFromString('temperature', draft.temperature),
            topP: paramValueFromString('topP', draft.topP),
            frequencyPenalty: paramValueFromString('frequencyPenalty', draft.frequencyPenalty),
            presencePenalty: paramValueFromString('presencePenalty', draft.presencePenalty),
          }
        }),
      })
      if (!mountedRef.current) return
      setSnapshot(settings)
      setProfiles(toDrafts(settings))
      setDefaultProfileId(settings.defaultProfileId)
      setParamStrings({})
      setParamErrors({})
      setSelectedProfileId((current) =>
        current && settings.profiles.some((profile) => profile.id === current) ? current : (settings.profiles[0]?.id ?? null),
      )
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      setError(failure.detail || copy.saveError)
      publishNotification({
        id: AI_SETTINGS_SAVE_NOTIFICATION_ID,
        level: 'error',
        title: notificationCopy.settingsSaveFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.save(), tone: 'primary' },
      })
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const loadModels = async (id: string) => {
    const notificationId = profileNotificationId(id)
    profileNotificationIds.current.add(notificationId)
    dismissNotification(notificationId)
    dismissNotification(AI_SETTINGS_MODELS_NOTIFICATION_ID)
    setLoadingModelsId(id)
    publishNotification({
      id: AI_SETTINGS_MODELS_NOTIFICATION_ID,
      level: 'info',
      title: copy.loadModelsRunning,
      autoDismissMs: null,
    })
    try {
      const result = await ai.listModels(id)
      if (!mountedRef.current) return
      setModels((current) => ({ ...current, [id]: result }))
      dismissNotification(AI_SETTINGS_MODELS_NOTIFICATION_ID)
      publishNotification({
        id: AI_SETTINGS_MODELS_NOTIFICATION_ID,
        level: 'success',
        title: copy.loadModelsSuccess(result.length),
      })
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      dismissNotification(AI_SETTINGS_MODELS_NOTIFICATION_ID)
      publishNotification({
        id: notificationId,
        level: 'error',
        title: notificationCopy.modelListFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.loadModels(id), tone: 'primary' },
      })
    } finally {
      if (mountedRef.current) setLoadingModelsId(null)
    }
  }

  const openModelsDevDialog = async () => {
    setModelsDevOpen(true)
    setModelsDevQuery('')
    setModelsDevSelected(null)
    if (modelsDevCatalog) return
    setModelsDevLoading(true)
    setModelsDevLoadFailed(false)
    try {
      const catalog = await ai.fetchModelsDevCatalog()
      if (!mountedRef.current) return
      setModelsDevCatalog(catalog)
      setModelsDevLoading(false)
    } catch {
      if (!mountedRef.current) return
      setModelsDevLoading(false)
      setModelsDevLoadFailed(true)
    }
  }

  const retryModelsDevDialog = async () => {
    setModelsDevLoading(true)
    setModelsDevLoadFailed(false)
    try {
      const catalog = await ai.fetchModelsDevCatalog()
      if (!mountedRef.current) return
      setModelsDevCatalog(catalog)
      setModelsDevLoading(false)
    } catch {
      if (!mountedRef.current) return
      setModelsDevLoading(false)
      setModelsDevLoadFailed(true)
    }
  }

  const applyModelsDevSelection = (model: ModelsDevModelEntry) => {
    if (!selectedProfile) return
    updateProfile(selectedProfile.id, {
      model: model.id,
      contextWindowTokens: model.contextWindowTokens ?? selectedProfile.contextWindowTokens,
      maxOutputTokens: model.maxOutputTokens ?? selectedProfile.maxOutputTokens,
    })
    setParamStrings((current) => {
      const seed = current[selectedProfile.id] ?? paramStringsFromProfile(selectedProfile)
      return {
        ...current,
        [selectedProfile.id]: {
          ...seed,
          contextWindowTokens: model.contextWindowTokens == null ? seed.contextWindowTokens : String(model.contextWindowTokens),
          maxOutputTokens: model.maxOutputTokens == null ? seed.maxOutputTokens : String(model.maxOutputTokens),
        },
      }
    })
    setParamErrors((current) => {
      const next = { ...current }
      delete next[selectedProfile.id]
      return next
    })
    setModelsDevOpen(false)
  }

  const testProfile = async (id: string) => {
    const notificationId = profileNotificationId(id)
    profileNotificationIds.current.add(notificationId)
    dismissNotification(notificationId)
    dismissNotification(AI_SETTINGS_TEST_NOTIFICATION_ID)
    setTestingProfileId(id)
    publishNotification({
      id: AI_SETTINGS_TEST_NOTIFICATION_ID,
      level: 'info',
      title: copy.testingConnection,
      autoDismissMs: null,
    })
    try {
      const result = await ai.testProfile(id)
      if (!mountedRef.current) return
      setTestResult(result)
      setTestReasoningExpanded(false)
      setTestedProfileIds((current) => ({ ...current, [id]: true }))
      dismissNotification(AI_SETTINGS_TEST_NOTIFICATION_ID)
      publishNotification({
        id: AI_SETTINGS_TEST_NOTIFICATION_ID,
        level: 'success',
        title: copy.testSuccess(result.latencyMs),
      })
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      setTestedProfileIds((current) => ({ ...current, [id]: false }))
      dismissNotification(AI_SETTINGS_TEST_NOTIFICATION_ID)
      publishNotification({
        id: notificationId,
        level: 'error',
        title: notificationCopy.connectionTestFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.testProfile(id), tone: 'primary' },
      })
    } finally {
      if (mountedRef.current) setTestingProfileId(null)
    }
  }

  const exportProfiles = async () => {
    const destinationPath = await dialog.saveFile({
      defaultPath: 'modforge-ai-profiles.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!destinationPath) return
    try {
      const count = await ai.exportProfiles({ destinationPath, profileIds: profiles.map((profile) => profile.id) })
      setExchangeStatus(copy.exportSuccess(count))
    } catch {
      setExchangeStatus(copy.saveError)
      publishNotification({ id: 'ai-profile-export', level: 'error', title: copy.saveError, description: copy.saveError })
    }
  }

  const chooseImport = async () => {
    const sourcePath = await dialog.chooseFile({ filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!sourcePath) return
    try {
      const preview = await ai.previewProfilesImport(sourcePath)
      setImportPreview({ sourcePath, preview })
      setExchangeStatus('')
    } catch {
      setExchangeStatus(copy.importError)
      publishNotification({ id: 'ai-profile-import', level: 'error', title: copy.importError, description: copy.importError })
    }
  }

  const applyImport = async () => {
    if (!importPreview) return
    try {
      const result = await ai.applyProfilesImport(importPreview.sourcePath, importPolicy)
      setSnapshot(result.settings)
      setProfiles(toDrafts(result.settings))
      setDefaultProfileId(result.settings.defaultProfileId)
      setImportPreview(null)
      setExchangeStatus(copy.importSuccess(result.imported, result.overwritten, result.copied, result.skipped))
    } catch {
      setExchangeStatus(copy.importError)
      publishNotification({ id: 'ai-profile-import', level: 'error', title: copy.importError, description: copy.importError })
    }
  }

  const clearCache = async () => {
    if (!window.confirm(copy.clearCacheConfirm)) return
    dismissNotification(AI_SETTINGS_CACHE_NOTIFICATION_ID)
    try {
      const stats = await ai.clearCache()
      if (!mountedRef.current) return
      setCacheStats(stats)
      setCacheError(null)
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      setCacheError(notificationCopy.failureDescriptions[failure.code])
      publishNotification({
        id: AI_SETTINGS_CACHE_NOTIFICATION_ID,
        level: 'error',
        title: notificationCopy.cacheClearFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.clearCache(), tone: 'primary' },
      })
    }
  }

  actionsRef.current = { save, loadModels, testProfile, clearCache }

  const focusTab = (tab: AiSettingsTab) => {
    if (tab === activeTab) return
    navigate(() => {
      if (snapshot && generativeDirty) {
        const restoredProfiles = toDrafts(snapshot)
        setProfiles(restoredProfiles)
        setDefaultProfileId(snapshot.defaultProfileId)
        setSelectedProfileId((current) =>
          restoredProfiles.some((profile) => profile.id === current)
            ? current
            : (snapshot.defaultProfileId ?? restoredProfiles[0]?.id ?? null),
        )
        setModels({})
        setTestResult(null)
        setTestedProfileIds({})
        setParamStrings({})
        setParamErrors({})
        setModelsDevOpen(false)
      }
      setActiveTab(tab)
      requestAnimationFrame(() => document.getElementById(`ai-settings-tab-${tab}`)?.focus())
    })
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: AiSettingsTab) => {
    const index = AI_TABS.indexOf(tab)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(AI_TABS[(index + 1) % AI_TABS.length])
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(AI_TABS[(index - 1 + AI_TABS.length) % AI_TABS.length])
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(AI_TABS[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(AI_TABS[AI_TABS.length - 1])
    }
  }

  return (
    <div className="settings-ai-section">
      <div className="settings-ai-shell">
        <div className="settings-ai-chrome">
          <header className="settings-window-page-head settings-ai-page-head">
            <div>
              <h2>{settingsCategories.ai}</h2>
              <p>{categoryDescriptions.ai}</p>
            </div>
          </header>
          <div className="settings-ai-tabs" role="tablist" aria-label={copy.title}>
            {AI_TABS.map((tab) => (
              <button
                type="button"
                role="tab"
                id={`ai-settings-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`ai-settings-panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => focusTab(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                key={tab}
              >
                {tab === 'machine-translation' ? copy.tabs.machineTranslation : copy.tabs[tab]}
              </button>
            ))}
          </div>
          <SemanticStatusStrip active={activeTab === 'semantic'} onConfigure={() => focusTab('semantic')} />
        </div>

        {activeTab === 'engine' ? (
          <section
            role="tabpanel"
            id="ai-settings-panel-engine"
            aria-labelledby="ai-settings-tab-engine"
            className="settings-ai-engine-panel"
          >
            <Suspense fallback={<LoadingMotionFallback />}>
              <DefaultTranslationEngineSection onDirtyChange={setDefaultEngineDirty} onNavigateTab={(tab) => focusTab(tab)} />
            </Suspense>
          </section>
        ) : null}

        <div className="settings-ai-scroll" hidden={activeTab === 'engine'}>
          <section
            role="tabpanel"
            id="ai-settings-panel-generative"
            aria-labelledby="ai-settings-tab-generative"
            hidden={activeTab !== 'generative'}
          >
            <div className="settings-ai-tab-body">
              {exchangeStatus ? (
                <p role="status" className="settings-ai-exchange-status">
                  {exchangeStatus}
                </p>
              ) : null}
              {importPreview ? (
                <section className="settings-ai-import-preview" aria-labelledby="ai-import-preview-title">
                  <header>
                    <div>
                      <strong id="ai-import-preview-title">{copy.importTitle}</strong>
                      <span>{copy.importCredentialsExcluded}</span>
                    </div>
                    <button type="button" className="control-button" onClick={() => setImportPreview(null)}>
                      {copy.importCancel}
                    </button>
                  </header>
                  <div className="settings-ai-import-entries">
                    {importPreview.preview.entries.map((entry) => (
                      <div key={entry.id}>
                        <strong>{entry.name}</strong>
                        <span>
                          {entry.provider} · {entry.model}
                        </span>
                        <em>{entry.conflicts ? copy.importConflict : copy.importNew}</em>
                      </div>
                    ))}
                  </div>
                  <footer>
                    <label>
                      <span>{copy.importConflictPolicy}</span>
                      <CompactSelect
                        value={importPolicy}
                        options={[
                          { value: 'overwrite', label: copy.importOverwrite },
                          { value: 'copy', label: copy.importCopy },
                          { value: 'skip', label: copy.importSkip },
                        ]}
                        onChange={(next) => setImportPolicy(next)}
                        ariaLabel={copy.importConflictPolicy}
                        placement="bottom-start"
                        className="settings-ai-import-policy-select"
                        triggerClassName="settings-ai-import-policy-select-trigger"
                        menuClassName="settings-ai-import-policy-select-menu"
                      />
                    </label>
                    <button type="button" className="control-button control-button-primary" onClick={() => void applyImport()}>
                      {copy.importApply}
                    </button>
                  </footer>
                </section>
              ) : null}

              {error ? <p className="settings-ai-error">{error}</p> : null}
              <div className="settings-ai-profile-workspace">
                <aside className="settings-ai-profile-list" aria-label={copy.profileList}>
                  <header>
                    <strong>{copy.profileList}</strong>
                    <div className="settings-window-actions">
                      <button type="button" className="settings-window-btn" onClick={() => void chooseImport()}>
                        {copy.importProfiles}
                      </button>
                      <button
                        type="button"
                        className="settings-window-btn settings-window-btn-primary"
                        onClick={addProfile}
                        disabled={!presets.length}
                      >
                        {copy.addProfile}
                      </button>
                    </div>
                  </header>
                  <div className="settings-ai-profile-list-body">
                    {profiles.map((profile) => {
                      const preset = presets.find((item) => item.id === profile.presetId)
                      const selected = profile.id === selectedProfile?.id
                      const tested = Boolean(testedProfileIds[profile.id])
                      const noKey = preset?.requiresApiKey === false
                      const credTag = noKey
                        ? copy.requiresNoKey
                        : profile.keyStatus === 'keychain'
                          ? copy.credentialKeychain
                          : profile.keyStatus === 'environment'
                            ? copy.credentialEnvironment
                            : copy.credentialMissing
                      return (
                        <button
                          type="button"
                          key={profile.id}
                          className={cx('settings-ai-profile-list-item', selected && 'is-active')}
                          aria-current={selected ? 'true' : undefined}
                          onClick={() => {
                            if (!selected) navigate(() => setSelectedProfileId(profile.id))
                          }}
                        >
                          <div className="settings-ai-pitem-name">
                            <strong>{profile.name || copy.untitledProfile}</strong>
                            {profile.id === defaultProfileId ? <span className="settings-ai-tag is-ok">{copy.defaultProfile}</span> : null}
                          </div>
                          <div className="settings-ai-pitem-meta">
                            <span className={cx('settings-ai-tag', (profile.keyStatus || noKey) && 'is-ok')}>{credTag}</span>
                            {tested ? <span className="settings-ai-tag is-ok">{copy.testConnection}</span> : null}
                          </div>
                          <div className="settings-ai-pitem-sub">
                            {profile.protocol} · {profile.model || copy.modelNotSet}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <footer>
                    <button
                      type="button"
                      className="settings-window-btn"
                      style={{ width: '100%' }}
                      onClick={() => void exportProfiles()}
                      disabled={!profiles.length}
                    >
                      {copy.exportProfilesSafe}
                    </button>
                  </footer>
                </aside>

                {selectedProfile ? (
                  <AiProfileEditor
                    profile={selectedProfile}
                    presets={presets}
                    isDefault={selectedProfile.id === defaultProfileId}
                    isDirty={generativeDirty}
                    models={models[selectedProfile.id] ?? []}
                    modelsDevCatalog={modelsDevCatalog}
                    remoteActionsReady={remoteActionsReady}
                    loadingModels={loadingModelsId === selectedProfile.id}
                    paramStrings={draftStringsFor(selectedProfile)}
                    paramErrors={paramErrors[selectedProfile.id] ?? {}}
                    advancedExpanded={Boolean(advancedExpanded[selectedProfile.id])}
                    onUpdate={(patch) => updateProfile(selectedProfile.id, patch)}
                    onSetDefault={() => setDefaultProfileId(selectedProfile.id)}
                    onDelete={() => deleteProfile(selectedProfile.id)}
                    onParamStringChange={(field, value) => updateParamString(selectedProfile.id, field, value)}
                    onToggleAdvanced={() =>
                      setAdvancedExpanded((current) => ({ ...current, [selectedProfile.id]: !current[selectedProfile.id] }))
                    }
                    onLoadModels={() => void loadModels(selectedProfile.id)}
                    onOpenModelsDev={() => void openModelsDevDialog()}
                  />
                ) : (
                  <div className="settings-ai-profile-empty">
                    <p>{copy.noProfiles}</p>
                  </div>
                )}
              </div>

              <div className="settings-window-group" style={{ marginTop: '1rem' }}>
                <p className="settings-window-group-label">{copy.cacheTitle}</p>
                <div className="settings-ai-cache-row">
                  <div>
                    <p className="row-title">{copy.cacheTitle}</p>
                    <p className="row-desc">
                      {copy.cacheStats(cacheStats.entryCount, formatBytes(Math.max(cacheStats.sizeBytes, 1)))}
                      {cacheError ? ` · ${cacheError}` : null}
                    </p>
                  </div>
                  <button type="button" className="settings-window-btn settings-window-btn-danger" onClick={() => void clearCache()}>
                    {copy.clearCache}
                  </button>
                </div>
              </div>
            </div>

            <footer className="settings-ai-dock">
              <div className="settings-ai-dock-meta">
                <span>{generativeDirty ? copy.dockUnsavedRemoteActions : copy.dockReadyRemoteActions}</span>
                {generativeDirty ? <span className="settings-ai-tag is-dirty">{copy.dirtyTag}</span> : null}
              </div>
              <div className="settings-window-actions">
                {selectedProfile ? (
                  <button
                    type="button"
                    className="settings-ai-icon-btn"
                    title={copy.clearApiKey}
                    aria-label={copy.clearApiKey}
                    disabled={!selectedProfile.keyStatus && !selectedProfile.apiKey}
                    onClick={() => updateProfile(selectedProfile.id, { apiKey: '', clearApiKey: true, keyStatus: null })}
                  >
                    <Eraser aria-hidden="true" />
                  </button>
                ) : null}
                {selectedProfile ? (
                  <button
                    type="button"
                    className="settings-window-btn"
                    title={!remoteActionsReady ? copy.saveBeforeRemoteActions : undefined}
                    disabled={!remoteActionsReady || testingProfileId === selectedProfile.id}
                    onClick={() => void testProfile(selectedProfile.id)}
                  >
                    {testingProfileId === selectedProfile.id ? copy.testing : copy.testConnection}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="settings-window-btn settings-window-btn-primary"
                  disabled={saving || !profiles.length}
                  onClick={() => void save()}
                >
                  {saving ? copy.saving : copy.save}
                </button>
              </div>
            </footer>
          </section>
          <section
            role="tabpanel"
            id="ai-settings-panel-machine-translation"
            aria-labelledby="ai-settings-tab-machine-translation"
            hidden={activeTab !== 'machine-translation'}
          >
            {activeTab === 'machine-translation' ? (
              <Suspense fallback={<LoadingMotionFallback />}>
                <MachineTranslationProfilesSection onDirtyChange={setMachineTranslationDirty} requestLeave={requestLeave} />
              </Suspense>
            ) : null}
          </section>
          <section
            role="tabpanel"
            id="ai-settings-panel-semantic"
            aria-labelledby="ai-settings-tab-semantic"
            hidden={activeTab !== 'semantic'}
          >
            {activeTab === 'semantic' ? (
              <Suspense fallback={<LoadingMotionFallback />}>
                <SemanticSearchSection onDirtyChange={setSemanticDirty} />
              </Suspense>
            ) : null}
          </section>
          <section role="tabpanel" id="ai-settings-panel-usage" aria-labelledby="ai-settings-tab-usage" hidden={activeTab !== 'usage'}>
            {activeTab === 'usage' ? (
              <Suspense fallback={<LoadingMotionFallback />}>
                <AiUsageSection />
              </Suspense>
            ) : null}
          </section>
        </div>

        <Dialog open={Boolean(testResult)} onClose={() => setTestResult(null)} labelledBy={testDialogTitleId} stack size="md">
          <DialogHeader
            id={testDialogTitleId}
            title={copy.connectionTestTitle}
            subtitle={testResult ? copy.testSuccess(testResult.latencyMs) : undefined}
            onClose={() => setTestResult(null)}
            closeLabel={copy.connectionTestClose}
          />
          <DialogBody>
            {testResult ? (
              <dl className="settings-ai-result-grid">
                <div>
                  <dt>{copy.provider}</dt>
                  <dd>{testResult.provider}</dd>
                </div>
                <div>
                  <dt>{copy.protocol}</dt>
                  <dd>{testResult.protocol}</dd>
                </div>
                <div>
                  <dt>{copy.endpoint}</dt>
                  <dd className="mono">{testResult.baseUrl}</dd>
                </div>
                <div>
                  <dt>{copy.model}</dt>
                  <dd className="mono">{testResult.model}</dd>
                </div>
                <div>
                  <dt>{copy.credentialSource}</dt>
                  <dd>{testResult.credentialSource ?? copy.credentialMissing}</dd>
                </div>
                <div>
                  <dt>{copy.latency}</dt>
                  <dd>{testResult.latencyMs} ms</dd>
                </div>
              </dl>
            ) : null}
            {testResult?.reasoning ? (
              <ReasoningChainView
                expanded={testReasoningExpanded}
                onToggle={() => setTestReasoningExpanded((current) => !current)}
                content={testResult.reasoning}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogAction tone="primary" onClick={() => setTestResult(null)}>
              {copy.connectionTestClose}
            </DialogAction>
          </DialogFooter>
        </Dialog>

        <ModelsDevImportDialog
          open={modelsDevOpen}
          catalog={modelsDevCatalog}
          loading={modelsDevLoading}
          loadFailed={modelsDevLoadFailed}
          query={modelsDevQuery}
          selectedKey={modelsDevSelected}
          providerPresetId={selectedProfile?.presetId ?? ''}
          onQueryChange={(query) => {
            setModelsDevQuery(query)
            setModelsDevSelected(null)
          }}
          onSelect={setModelsDevSelected}
          onRetry={() => void retryModelsDevDialog()}
          onClose={() => setModelsDevOpen(false)}
          onApply={(model) => applyModelsDevSelection(model)}
        />
      </div>
    </div>
  )
}
