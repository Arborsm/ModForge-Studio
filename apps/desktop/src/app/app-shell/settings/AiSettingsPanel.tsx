import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { usePlatformPorts } from '@app/providers/usePlatformPorts'
import { parseAiFailure, useAi } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import type {
  AiModelInfo,
  AiSettingsTab,
  AiProfileImportConflictPolicy,
  AiProfileImportPreview,
  AiProfileTestResult,
  AiProviderPreset,
  AiSemanticIndexStatus,
  AiSemanticModelStatus,
  AiSemanticProgress,
  AiSemanticSettingsSnapshot,
  AiSettingsSnapshot,
  SaveAiProviderProfile,
} from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { AiUsageSection } from './AiUsageSection'
import { DefaultTranslationEngineSection } from './DefaultTranslationEngineSection'
import { MachineTranslationProfilesSection } from './MachineTranslationProfilesSection'
import { SemanticSearchSection } from './SemanticSearchSection'

const AI_SETTINGS_SAVE_NOTIFICATION_ID = 'ai-settings-save-error'
const AI_SETTINGS_CACHE_NOTIFICATION_ID = 'ai-settings-cache-error'
const AI_SETTINGS_TEST_NOTIFICATION_ID = 'ai-settings-connection-test'
const AI_SETTINGS_MODELS_NOTIFICATION_ID = 'ai-settings-load-models'
const AI_TABS = ['engine', 'generative', 'machine-translation', 'semantic', 'usage'] as const satisfies readonly AiSettingsTab[]

function profileNotificationId(profileId: string) {
  return `ai-settings-profile-${profileId}`
}

type ProfileDraft = SaveAiProviderProfile & { keyStatus: 'keychain' | 'environment' | null }

type AiSettingsActions = {
  save: () => Promise<void>
  loadModels: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<void>
  clearCache: () => Promise<void>
}

function SemanticStatusStrip({ active, onConfigure }: { active: boolean; onConfigure: () => void }) {
  const localization = useLocalization()
  const copy = useSettingsMenuCopy().ai.semantic
  const [settings, setSettings] = useState<AiSemanticSettingsSnapshot | null>(null)
  const [model, setModel] = useState<AiSemanticModelStatus | null>(null)
  const [index, setIndex] = useState<AiSemanticIndexStatus | null>(null)
  const [progress, setProgress] = useState<AiSemanticProgress | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    let dispose: (() => void) | undefined
    const refreshStatus = async () => {
      try {
        const [nextSettings, nextModel, nextIndex] = await Promise.all([
          localization.loadSemanticSettings(),
          localization.inspectSemanticModel(),
          localization.inspectSemanticIndex([]),
        ])
        if (!mounted) return
        setSettings(nextSettings)
        setModel(nextModel)
        setIndex(nextIndex)
        setFailed(false)
      } catch {
        if (mounted) setFailed(true)
      }
    }
    void refreshStatus()
    void localization
      .listenSemanticProgress((value) => {
        if (!mounted) return
        setProgress(value)
        if (value.phase === 'complete') void refreshStatus()
      })
      .then((value) => {
        if (mounted) dispose = value
        else value()
      })
    return () => {
      mounted = false
      dispose?.()
    }
  }, [active, localization])

  const mode = settings?.mode ?? 'lexical'
  const stripText = (() => {
    if (failed) return copy.loadError
    if (!settings) return copy.loading
    const parts: string[] = [copy.modes[mode]]
    if (mode === 'lexical') {
      parts.push(copy.lexicalIndexNotRequired)
      return parts.join(' · ')
    }
    if (model) parts.push(model.available ? copy.available : copy.unavailable)
    if (index) {
      parts.push(`${index.coveragePercentage.toFixed(1)}%`)
      if (index.pendingRecords > 0) parts.push(copy.pending(index.pendingRecords))
    }
    if (progress && progress.phase !== 'complete') {
      parts.push(`${progress.currentFile} · ${progress.percentage.toFixed(1)}%`)
    }
    return parts.join(' · ')
  })()

  return (
    <aside className="settings-ai-semantic-strip" aria-label={copy.title}>
      <div>
        <strong>{copy.title}</strong>
        <span> · {stripText}</span>
      </div>
      {!active ? (
        <button type="button" className="settings-window-btn settings-ai-link-btn" onClick={onConfigure}>
          {copy.configure}
        </button>
      ) : null}
    </aside>
  )
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function toDrafts(snapshot: AiSettingsSnapshot): ProfileDraft[] {
  return snapshot.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    presetId: profile.presetId,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    credentialEnvironment: profile.credentialEnvironment,
    keyStatus: profile.resolvedCredentialSource,
  }))
}

function profilesAreSaved(snapshot: AiSettingsSnapshot | null, profiles: ProfileDraft[], defaultProfileId: string | null) {
  if (!snapshot || snapshot.defaultProfileId !== defaultProfileId || snapshot.profiles.length !== profiles.length) return false
  return profiles.every((profile, index) => {
    const saved = snapshot.profiles[index]
    return (
      saved?.id === profile.id &&
      saved.name === profile.name &&
      saved.presetId === profile.presetId &&
      saved.protocol === profile.protocol &&
      saved.baseUrl === profile.baseUrl &&
      saved.model === profile.model &&
      saved.credentialEnvironment === profile.credentialEnvironment &&
      !profile.apiKey &&
      !profile.clearApiKey
    )
  })
}

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
  const locale = usePreferencesStore((state) => state.locale)
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot | null>(null)
  const [profiles, setProfiles] = useState<ProfileDraft[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null)
  const [models, setModels] = useState<Record<string, AiModelInfo[]>>({})
  const [testResult, setTestResult] = useState<AiProfileTestResult | null>(null)
  const [testedProfileIds, setTestedProfileIds] = useState<Record<string, boolean>>({})
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
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
  const mountedRef = useRef(false)
  const profileNotificationIds = useRef(new Set<string>())
  const actionsRef = useRef<AiSettingsActions>({
    save: async () => {},
    loadModels: async (_id: string) => {},
    testProfile: async (_id: string) => {},
    clearCache: async () => {},
  })

  useEffect(() => {
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
  }, [ai, copy.loadError, notificationCopy.failureDescriptions])

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
    selectedPersisted.credentialEnvironment === selectedProfile.credentialEnvironment,
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

  const selectPreset = (profile: ProfileDraft, preset: AiProviderPreset) => {
    updateProfile(profile.id, {
      presetId: preset.id,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      credentialEnvironment: preset.credentialEnvironment,
      keyStatus: null,
      apiKey: '',
      clearApiKey: true,
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
        keyStatus: null,
      },
    ])
    setDefaultProfileId((current) => current ?? id)
    setSelectedProfileId(id)
  }

  const save = async () => {
    dismissNotification(AI_SETTINGS_SAVE_NOTIFICATION_ID)
    setSaving(true)
    setError(null)
    try {
      const settings = await ai.saveSettings({
        defaultProfileId,
        profiles: profiles.map(({ keyStatus: _keyStatus, ...profile }) => profile),
      })
      if (!mountedRef.current) return
      setSnapshot(settings)
      setProfiles(toDrafts(settings))
      setDefaultProfileId(settings.defaultProfileId)
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
            <DefaultTranslationEngineSection onDirtyChange={setDefaultEngineDirty} onNavigateTab={(tab) => focusTab(tab)} />
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
                      <select
                        className="control-input"
                        value={importPolicy}
                        onChange={(event) => setImportPolicy(event.target.value as AiProfileImportConflictPolicy)}
                      >
                        <option value="overwrite">{copy.importOverwrite}</option>
                        <option value="copy">{copy.importCopy}</option>
                        <option value="skip">{copy.importSkip}</option>
                      </select>
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
                        ? locale.startsWith('zh')
                          ? '无需 Key'
                          : 'No key'
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
                  (() => {
                    const profile = selectedProfile
                    const defaultProfile = profile.id === defaultProfileId
                    const preset = presets.find((item) => item.id === profile.presetId)
                    const keyConfigured = Boolean(profile.keyStatus)
                    return (
                      <article className={cx('settings-ai-profile-detail', defaultProfile && 'is-default', generativeDirty && 'is-dirty')}>
                        <header className="settings-ai-profile-detail-head">
                          <div>
                            <h3>{profile.name || copy.untitledProfile}</h3>
                            <span className="saved-at">{generativeDirty ? copy.unsavedChanges : copy.savedState}</span>
                          </div>
                          <div className="settings-window-actions">
                            <button
                              type="button"
                              className="settings-window-btn"
                              onClick={() => setDefaultProfileId(profile.id)}
                              disabled={defaultProfile}
                            >
                              {defaultProfile ? copy.defaultProfile : copy.setDefault}
                            </button>
                            <button
                              type="button"
                              className="settings-window-btn settings-window-btn-danger"
                              onClick={() => {
                                dismissNotification(profileNotificationId(profile.id))
                                profileNotificationIds.current.delete(profileNotificationId(profile.id))
                                setModels((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== profile.id)))
                                setTestedProfileIds((current) => {
                                  const next = { ...current }
                                  delete next[profile.id]
                                  return next
                                })
                                const remaining = profiles.filter((item) => item.id !== profile.id)
                                setProfiles(remaining)
                                setSelectedProfileId(remaining[0]?.id ?? null)
                                if (defaultProfile) setDefaultProfileId(null)
                              }}
                            >
                              {copy.delete}
                            </button>
                          </div>
                        </header>

                        <div className="settings-ai-grid">
                          <label>
                            <span>{copy.profileName}</span>
                            <input
                              className="control-input"
                              value={profile.name}
                              onChange={(event) => updateProfile(profile.id, { name: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>{copy.provider}</span>
                            <select
                              className="control-input"
                              value={profile.presetId}
                              onChange={(event) => {
                                const next = presets.find((item) => item.id === event.target.value)
                                if (next) selectPreset(profile, next)
                              }}
                            >
                              {presets.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>{copy.protocol}</span>
                            <select
                              className="control-input"
                              value={profile.protocol}
                              onChange={(event) => updateProfile(profile.id, { protocol: event.target.value as ProfileDraft['protocol'] })}
                            >
                              <option value="openai-responses">openai-responses</option>
                              <option value="openai-chat-completions">openai-chat-completions</option>
                              <option value="anthropic-messages">anthropic-messages</option>
                            </select>
                          </label>
                          <label>
                            <span>{copy.model}</span>
                            <div className="settings-ai-inline-field">
                              <input
                                className="control-input mono"
                                list={`ai-models-${profile.id}`}
                                value={profile.model}
                                onChange={(event) => updateProfile(profile.id, { model: event.target.value })}
                              />
                              <button
                                type="button"
                                className="settings-window-btn"
                                title={!remoteActionsReady ? copy.saveBeforeRemoteActions : undefined}
                                disabled={!remoteActionsReady || preset?.supportsModelListing === false || loadingModelsId === profile.id}
                                onClick={() => void loadModels(profile.id)}
                              >
                                {loadingModelsId === profile.id ? copy.loadModelsRunning : copy.loadModels}
                              </button>
                            </div>
                            <datalist id={`ai-models-${profile.id}`}>
                              {(models[profile.id] ?? []).map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.displayName ?? model.id}
                                </option>
                              ))}
                            </datalist>
                          </label>
                          <label className="settings-ai-wide">
                            <span>{copy.baseUrl}</span>
                            <input
                              className="control-input mono"
                              value={profile.baseUrl}
                              onChange={(event) => updateProfile(profile.id, { baseUrl: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>{copy.apiKey}</span>
                            <div className="settings-ai-secret-field">
                              <input
                                className="control-input"
                                type="password"
                                value={profile.apiKey ?? ''}
                                placeholder={copy.apiKeyPlaceholder}
                                onChange={(event) => updateProfile(profile.id, { apiKey: event.target.value, clearApiKey: false })}
                              />
                              <div className="settings-ai-secret-meta">
                                <span className={cx('settings-ai-tag', keyConfigured && 'is-ok')}>
                                  {keyConfigured ? copy.credentialKeychain : copy.credentialMissing}
                                </span>
                                <button
                                  type="button"
                                  className="settings-window-btn settings-window-btn-ghost"
                                  disabled={!profile.keyStatus && !profile.apiKey}
                                  onClick={() => updateProfile(profile.id, { apiKey: '', clearApiKey: true, keyStatus: null })}
                                >
                                  {copy.clearApiKey}
                                </button>
                              </div>
                            </div>
                          </label>
                          <label>
                            <span>{copy.environment}</span>
                            <div className="settings-ai-secret-field">
                              <input
                                className="control-input mono"
                                value={profile.credentialEnvironment ?? ''}
                                onChange={(event) => updateProfile(profile.id, { credentialEnvironment: event.target.value || null })}
                              />
                              <div className="settings-ai-secret-meta">
                                <span className="settings-ai-tag">{copy.credentialEnvironment}</span>
                              </div>
                            </div>
                          </label>
                        </div>
                      </article>
                    )
                  })()
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
                    className="settings-window-btn"
                    disabled={!selectedProfile.keyStatus && !selectedProfile.apiKey}
                    onClick={() => updateProfile(selectedProfile.id, { apiKey: '', clearApiKey: true, keyStatus: null })}
                  >
                    {copy.clearApiKey}
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
              <MachineTranslationProfilesSection onDirtyChange={setMachineTranslationDirty} requestLeave={requestLeave} />
            ) : null}
          </section>
          <section
            role="tabpanel"
            id="ai-settings-panel-semantic"
            aria-labelledby="ai-settings-tab-semantic"
            hidden={activeTab !== 'semantic'}
          >
            {activeTab === 'semantic' ? <SemanticSearchSection onDirtyChange={setSemanticDirty} /> : null}
          </section>
          <section role="tabpanel" id="ai-settings-panel-usage" aria-labelledby="ai-settings-tab-usage" hidden={activeTab !== 'usage'}>
            {activeTab === 'usage' ? <AiUsageSection /> : null}
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
          </DialogBody>
          <DialogFooter>
            <DialogAction tone="primary" onClick={() => setTestResult(null)}>
              {copy.connectionTestClose}
            </DialogAction>
          </DialogFooter>
        </Dialog>
      </div>
    </div>
  )
}
