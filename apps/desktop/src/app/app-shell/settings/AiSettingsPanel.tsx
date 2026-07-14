import { Check, Database, KeyRound, Plus, RefreshCw, Save, Trash2, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parseAiFailure, useAi } from '@entities/ai'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import type { AiModelInfo, AiProviderPreset, AiSettingsSnapshot, SaveAiProviderProfile } from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'

const AI_SETTINGS_SAVE_NOTIFICATION_ID = 'ai-settings-save-error'
const AI_SETTINGS_CACHE_NOTIFICATION_ID = 'ai-settings-cache-error'

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

export function AiSettingsPanel() {
  const ai = useAi()
  const copy = useSettingsMenuCopy().ai
  const notificationCopy = useNotificationCopy().ai
  const publishNotification = useNotificationPublisher()
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot | null>(null)
  const [profiles, setProfiles] = useState<ProfileDraft[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null)
  const [models, setModels] = useState<Record<string, AiModelInfo[]>>({})
  const [status, setStatus] = useState<Record<string, string>>({})
  const [cacheStats, setCacheStats] = useState({ entryCount: 0, sizeBytes: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheError, setCacheError] = useState<string | null>(null)
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
  const updateProfile = (id: string, patch: Partial<ProfileDraft>) => {
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
    setStatus((current) => ({ ...current, [id]: copy.loadModels }))
    try {
      const result = await ai.listModels(id)
      if (!mountedRef.current) return
      setModels((current) => ({ ...current, [id]: result }))
      setStatus((current) => ({ ...current, [id]: '' }))
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      setStatus((current) => ({ ...current, [id]: failure.detail || copy.loadError }))
      publishNotification({
        id: notificationId,
        level: 'error',
        title: notificationCopy.modelListFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.loadModels(id), tone: 'primary' },
      })
    }
  }

  const testProfile = async (id: string) => {
    const notificationId = profileNotificationId(id)
    profileNotificationIds.current.add(notificationId)
    dismissNotification(notificationId)
    setStatus((current) => ({ ...current, [id]: copy.testing }))
    try {
      const result = await ai.testProfile(id)
      if (!mountedRef.current) return
      setStatus((current) => ({ ...current, [id]: copy.testSuccess(result.latencyMs) }))
    } catch (cause) {
      if (!mountedRef.current) return
      const failure = parseAiFailure(cause)
      setStatus((current) => ({ ...current, [id]: failure.detail || copy.loadError }))
      publishNotification({
        id: notificationId,
        level: 'error',
        title: notificationCopy.connectionTestFailedTitle,
        description: notificationCopy.failureDescriptions[failure.code],
        action: { label: notificationCopy.retryAction, callback: () => actionsRef.current.testProfile(id), tone: 'primary' },
      })
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

  return (
    <section className="settings-window-section settings-ai-section">
      <div className="settings-ai-heading">
        <div>
          <p className="settings-window-section-title">{copy.title}</p>
          <p className="settings-window-section-copy mt-1">{copy.description}</p>
        </div>
        <button type="button" className="control-button" onClick={addProfile} disabled={!presets.length}>
          <Plus className="h-4 w-4" />
          <span>{copy.addProfile}</span>
        </button>
      </div>

      {error ? <p className="settings-ai-error">{error}</p> : null}
      {!profiles.length ? <p className="settings-ai-empty">{copy.noProfiles}</p> : null}

      <div className="settings-ai-profiles">
        {profiles.map((profile) => {
          const defaultProfile = profile.id === defaultProfileId
          const preset = presets.find((item) => item.id === profile.presetId)
          const persisted = snapshot?.profiles.find((item) => item.id === profile.id)
          const remoteActionsReady = Boolean(
            persisted &&
            !profile.apiKey &&
            !profile.clearApiKey &&
            persisted.name === profile.name &&
            persisted.presetId === profile.presetId &&
            persisted.protocol === profile.protocol &&
            persisted.baseUrl === profile.baseUrl &&
            persisted.model === profile.model &&
            persisted.credentialEnvironment === profile.credentialEnvironment,
          )
          const keyLabel =
            profile.keyStatus === 'keychain'
              ? copy.credentialKeychain
              : profile.keyStatus === 'environment'
                ? copy.credentialEnvironment
                : copy.credentialMissing
          return (
            <article key={profile.id} className={cx('settings-ai-profile', defaultProfile && 'is-default')}>
              <header className="settings-ai-profile-head">
                <button
                  type="button"
                  className={cx('settings-ai-default', defaultProfile && 'is-active')}
                  onClick={() => setDefaultProfileId(profile.id)}
                >
                  {defaultProfile ? <Check className="h-3.5 w-3.5" /> : null}
                  <span>{defaultProfile ? copy.defaultProfile : copy.setDefault}</span>
                </button>
                <button
                  type="button"
                  className="icon-button h-8 w-8"
                  title={copy.delete}
                  aria-label={copy.delete}
                  onClick={() => {
                    dismissNotification(profileNotificationId(profile.id))
                    profileNotificationIds.current.delete(profileNotificationId(profile.id))
                    setModels((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== profile.id)))
                    setStatus((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== profile.id)))
                    setProfiles((current) => current.filter((item) => item.id !== profile.id))
                    if (defaultProfile) setDefaultProfileId(null)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
                      const preset = presets.find((item) => item.id === event.target.value)
                      if (preset) selectPreset(profile, preset)
                    }}
                  >
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
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
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="openai-chat-completions">OpenAI Chat Completions</option>
                    <option value="anthropic-messages">Anthropic Messages</option>
                  </select>
                </label>
                <label className="settings-ai-wide">
                  <span>{copy.baseUrl}</span>
                  <input
                    className="control-input"
                    value={profile.baseUrl}
                    onChange={(event) => updateProfile(profile.id, { baseUrl: event.target.value })}
                  />
                </label>
                <label>
                  <span>{copy.model}</span>
                  <input
                    className="control-input"
                    list={`ai-models-${profile.id}`}
                    value={profile.model}
                    onChange={(event) => updateProfile(profile.id, { model: event.target.value })}
                  />
                  <datalist id={`ai-models-${profile.id}`}>
                    {(models[profile.id] ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName ?? model.id}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>{copy.environment}</span>
                  <input
                    className="control-input"
                    value={profile.credentialEnvironment ?? ''}
                    onChange={(event) => updateProfile(profile.id, { credentialEnvironment: event.target.value || null })}
                  />
                </label>
                <label className="settings-ai-wide">
                  <span>
                    {copy.apiKey} · {keyLabel}
                  </span>
                  <div className="settings-ai-secret">
                    <KeyRound className="h-4 w-4" />
                    <input
                      className="control-input"
                      type="password"
                      value={profile.apiKey ?? ''}
                      placeholder={copy.apiKeyPlaceholder}
                      onChange={(event) => updateProfile(profile.id, { apiKey: event.target.value, clearApiKey: false })}
                    />
                    <button
                      type="button"
                      className="control-button"
                      disabled={!profile.keyStatus && !profile.apiKey}
                      onClick={() => updateProfile(profile.id, { apiKey: '', clearApiKey: true, keyStatus: null })}
                    >
                      {copy.clearApiKey}
                    </button>
                  </div>
                </label>
              </div>

              <footer className="settings-ai-profile-actions">
                <span>{status[profile.id] ?? ''}</span>
                <button
                  type="button"
                  className="control-button"
                  title={!remoteActionsReady ? copy.saveBeforeRemoteActions : undefined}
                  disabled={!remoteActionsReady || preset?.supportsModelListing === false}
                  onClick={() => void loadModels(profile.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {copy.loadModels}
                </button>
                <button
                  type="button"
                  className="control-button"
                  title={!remoteActionsReady ? copy.saveBeforeRemoteActions : undefined}
                  disabled={!remoteActionsReady}
                  onClick={() => void testProfile(profile.id)}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {copy.testConnection}
                </button>
              </footer>
            </article>
          )
        })}
      </div>

      <div className="settings-ai-footer">
        <div className="settings-ai-cache">
          <Database className="h-4 w-4" />
          <div>
            <strong>{copy.cacheTitle}</strong>
            <span>{copy.cacheStats(cacheStats.entryCount, formatBytes(cacheStats.sizeBytes))}</span>
            {cacheError ? <span className="settings-ai-error">{cacheError}</span> : null}
          </div>
        </div>
        <button type="button" className="control-button" onClick={() => void clearCache()}>
          {copy.clearCache}
        </button>
        <button
          type="button"
          className="control-button control-button-primary"
          disabled={saving || !profiles.length}
          onClick={() => void save()}
        >
          <Save className="h-4 w-4" />
          {saving ? copy.saving : copy.save}
        </button>
      </div>
    </section>
  )
}
