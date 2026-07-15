import { Check, KeyRound, Languages, Plus, Save, Trash2, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parseAiFailure } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import type {
  MachineTranslationLanguage,
  MachineTranslationPreset,
  MachineTranslationSettingsSnapshot,
  SaveMachineTranslationProfile,
} from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'

type Draft = SaveMachineTranslationProfile & { credentialSources: Record<string, 'keychain' | 'environment'> }
const SAVE_NOTIFICATION = 'machine-translation-settings-save-error'
const profileNotification = (id: string) => `machine-translation-profile-${id}`

function drafts(snapshot: MachineTranslationSettingsSnapshot): Draft[] {
  return snapshot.profiles.map((profile) => ({
    ...profile,
    credentials: {},
    clearCredentials: [],
    credentialSources: profile.credentialSources,
  }))
}

export function MachineTranslationProfilesSection() {
  const localization = useLocalization()
  const rootCopy = useSettingsMenuCopy().ai
  const copy = rootCopy.machineTranslation
  const notifications = useNotificationCopy().ai
  const publish = useNotificationPublisher()
  const [snapshot, setSnapshot] = useState<MachineTranslationSettingsSnapshot | null>(null)
  const [profiles, setProfiles] = useState<Draft[]>([])
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [languages, setLanguages] = useState<Record<string, MachineTranslationLanguage[]>>({})
  const [status, setStatus] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)
  const mounted = useRef(false)
  const reload = async () => {
    try {
      const value = await localization.loadMachineTranslationSettings()
      if (!mounted.current) return
      setSnapshot(value)
      setProfiles(drafts(value))
      setDefaultId(value.defaultProfileId)
      setSelectedId((current) =>
        current && value.profiles.some((profile) => profile.id === current) ? current : (value.profiles[0]?.id ?? null),
      )
      setError(null)
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      setError(failure.detail || copy.loadError)
    }
  }
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
      dismissNotification(SAVE_NOTIFICATION)
      for (const profile of profiles) dismissNotification(profileNotification(profile.id))
    }
  }, [localization])
  const presets = snapshot?.presets ?? []
  const update = (id: string, patch: Partial<Draft>) =>
    setProfiles((values) => values.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)))
  const selectPreset = (profile: Draft, preset: MachineTranslationPreset) =>
    update(profile.id, {
      presetId: preset.id,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      region: preset.protocol === 'tencent-tmt' ? (profile.region ?? 'ap-guangzhou') : null,
      credentials: {},
      credentialEnvironments: {},
      credentialSources: {},
      clearCredentials: Object.keys(profile.credentialSources),
    })
  const add = () => {
    const preset = presets[0]
    if (!preset) return
    const id = crypto.randomUUID()
    setProfiles((values) => [
      ...values,
      {
        id,
        name: preset.name,
        presetId: preset.id,
        protocol: preset.protocol,
        baseUrl: preset.baseUrl,
        region: null,
        enabled: true,
        defaultSourceLocale: null,
        defaultTargetLocale: null,
        credentialEnvironments: {},
        credentials: {},
        clearCredentials: [],
        credentialSources: {},
      },
    ])
    setDefaultId((value) => value ?? id)
    setSelectedId(id)
  }
  const save = async () => {
    dismissNotification(SAVE_NOTIFICATION)
    setSaving(true)
    setError(null)
    const nextFieldErrors: Record<string, Record<string, string>> = {}
    for (const profile of profiles) {
      const fields: Record<string, string> = {}
      if (!profile.name.trim()) fields.name = copy.requiredField
      try {
        const url = new URL(profile.baseUrl)
        const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1'
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) fields.baseUrl = copy.invalidEndpoint
      } catch {
        fields.baseUrl = copy.invalidEndpoint
      }
      if (profile.protocol === 'tencent-tmt' && !profile.region?.trim()) fields.region = copy.requiredField
      if (profile.defaultSourceLocale && profile.defaultTargetLocale && profile.defaultSourceLocale === profile.defaultTargetLocale) {
        fields.defaultSourceLocale = copy.localePairConflict
        fields.defaultTargetLocale = copy.localePairConflict
      }
      if (Object.keys(fields).length) nextFieldErrors[profile.id] = fields
    }
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length) {
      setSaving(false)
      setError(copy.saveError)
      return
    }
    try {
      const value = await localization.saveMachineTranslationSettings({
        defaultProfileId: defaultId,
        profiles: profiles.map(({ credentialSources: _sources, ...profile }) => profile),
      })
      if (!mounted.current) return
      setSnapshot(value)
      setProfiles(drafts(value))
      setDefaultId(value.defaultProfileId)
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      setError(failure.detail || copy.saveError)
      publish({
        id: SAVE_NOTIFICATION,
        level: 'error',
        title: notifications.settingsSaveFailedTitle,
        description: notifications.failureDescriptions[failure.code],
        action: { label: notifications.retryAction, callback: () => void save(), tone: 'primary' },
      })
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  const persisted = (profile: Draft) => snapshot?.profiles.find((value) => value.id === profile.id)
  const remoteReady = (profile: Draft) => {
    const value = persisted(profile)
    return Boolean(
      value &&
      Object.keys(profile.credentials).length === 0 &&
      profile.clearCredentials.length === 0 &&
      value.name === profile.name &&
      value.presetId === profile.presetId &&
      value.baseUrl === profile.baseUrl &&
      value.region === profile.region &&
      value.enabled === profile.enabled &&
      value.defaultSourceLocale === profile.defaultSourceLocale &&
      value.defaultTargetLocale === profile.defaultTargetLocale &&
      JSON.stringify(value.credentialEnvironments) === JSON.stringify(profile.credentialEnvironments),
    )
  }
  const loadLanguages = async (id: string) => {
    const notificationId = profileNotification(id)
    dismissNotification(notificationId)
    setStatus((value) => ({ ...value, [id]: rootCopy.loadModels }))
    try {
      const value = await localization.listMachineTranslationLanguages(id)
      if (!mounted.current) return
      setLanguages((current) => ({ ...current, [id]: value }))
      setStatus((current) => ({ ...current, [id]: copy.languageCount(value.length) }))
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      setStatus((current) => ({ ...current, [id]: failure.detail || copy.loadLanguagesError }))
      publish({
        id: notificationId,
        level: 'error',
        title: copy.loadLanguagesError,
        description: notifications.failureDescriptions[failure.code],
        action: { label: notifications.retryAction, callback: () => void loadLanguages(id), tone: 'primary' },
      })
    }
  }
  const test = async (id: string) => {
    const notificationId = profileNotification(id)
    dismissNotification(notificationId)
    setStatus((value) => ({ ...value, [id]: rootCopy.testing }))
    try {
      const value = await localization.testMachineTranslationProfile(id)
      if (!mounted.current) return
      setStatus((current) => ({ ...current, [id]: rootCopy.testSuccess(value.latencyMs) }))
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      setStatus((current) => ({ ...current, [id]: failure.detail || rootCopy.loadError }))
      publish({
        id: notificationId,
        level: 'error',
        title: notifications.connectionTestFailedTitle,
        description: notifications.failureDescriptions[failure.code],
        action: { label: notifications.retryAction, callback: () => void test(id), tone: 'primary' },
      })
    }
  }
  return (
    <section className="settings-mt-section">
      <div className="settings-ai-heading">
        <div>
          <p className="settings-window-section-title">{copy.title}</p>
          <p className="settings-window-section-copy mt-1">{copy.description}</p>
        </div>
        <button type="button" className="control-button" onClick={add} disabled={!presets.length}>
          <Plus className="h-4 w-4" />
          <span>{copy.addProfile}</span>
        </button>
      </div>
      {error ? <p className="settings-ai-error">{error}</p> : null}
      {!profiles.length ? <p className="settings-ai-empty">{copy.noProfiles}</p> : null}
      <div className="settings-mt-workspace">
        <aside className="settings-mt-profile-list">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={selectedId === profile.id ? 'is-active' : ''}
              onClick={() => setSelectedId(profile.id)}
            >
              <strong>{profile.name}</strong>
              <span>{presets.find((preset) => preset.id === profile.presetId)?.name}</span>
            </button>
          ))}
        </aside>
        <div className="settings-ai-profiles">
          {profiles
            .filter((profile) => profile.id === selectedId)
            .map((profile) => {
              const preset = presets.find((value) => value.id === profile.presetId)
              const isDefault = defaultId === profile.id
              const ready = remoteReady(profile)
              return (
                <article key={profile.id} className={cx('settings-ai-profile', isDefault && 'is-default')}>
                  <header className="settings-ai-profile-head">
                    <button
                      type="button"
                      className={cx('settings-ai-default', isDefault && 'is-active')}
                      onClick={() => setDefaultId(profile.id)}
                    >
                      {isDefault ? <Check className="h-3.5 w-3.5" /> : null}
                      <span>{isDefault ? rootCopy.defaultProfile : rootCopy.setDefault}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button h-8 w-8"
                      title={rootCopy.delete}
                      aria-label={rootCopy.delete}
                      onClick={() => {
                        setProfiles((values) => values.filter((value) => value.id !== profile.id))
                        setSelectedId(profiles.find((value) => value.id !== profile.id)?.id ?? null)
                        if (isDefault) setDefaultId(null)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </header>
                  <div className="settings-ai-grid">
                    <label>
                      <span>{rootCopy.profileName}</span>
                      <input
                        className="control-input"
                        value={profile.name}
                        onChange={(event) => update(profile.id, { name: event.target.value })}
                      />
                      {fieldErrors[profile.id]?.name ? (
                        <small role="alert" className="settings-ai-error">
                          {fieldErrors[profile.id].name}
                        </small>
                      ) : null}
                    </label>
                    <label>
                      <span>{rootCopy.provider}</span>
                      <select
                        className="control-input"
                        value={profile.presetId}
                        onChange={(event) => {
                          const value = presets.find((preset) => preset.id === event.target.value)
                          if (value) selectPreset(profile, value)
                        }}
                      >
                        {presets.map((value) => (
                          <option key={value.id} value={value.id}>
                            {value.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="settings-ai-wide">
                      <span>{rootCopy.baseUrl}</span>
                      <input
                        className="control-input"
                        value={profile.baseUrl}
                        onChange={(event) => update(profile.id, { baseUrl: event.target.value })}
                      />
                      {fieldErrors[profile.id]?.baseUrl ? (
                        <small role="alert" className="settings-ai-error">
                          {fieldErrors[profile.id].baseUrl}
                        </small>
                      ) : null}
                    </label>
                    {profile.protocol === 'tencent-tmt' || profile.protocol === 'microsoft-v3' ? (
                      <label>
                        <span>{copy.region}</span>
                        <input
                          className="control-input"
                          value={profile.region ?? ''}
                          onChange={(event) => update(profile.id, { region: event.target.value || null })}
                        />
                        {fieldErrors[profile.id]?.region ? (
                          <small role="alert" className="settings-ai-error">
                            {fieldErrors[profile.id].region}
                          </small>
                        ) : null}
                      </label>
                    ) : null}
                    <label className="settings-ai-wide">
                      <span>{copy.enabled}</span>
                      <input
                        type="checkbox"
                        checked={profile.enabled}
                        onChange={(event) => update(profile.id, { enabled: event.target.checked })}
                      />
                    </label>
                    <label>
                      <span>{copy.defaultSource}</span>
                      <input
                        className="control-input"
                        list={`mt-languages-${profile.id}`}
                        value={profile.defaultSourceLocale ?? ''}
                        onChange={(event) => update(profile.id, { defaultSourceLocale: event.target.value || null })}
                      />
                      {fieldErrors[profile.id]?.defaultSourceLocale ? (
                        <small role="alert" className="settings-ai-error">
                          {fieldErrors[profile.id].defaultSourceLocale}
                        </small>
                      ) : null}
                    </label>
                    <label>
                      <span>{copy.defaultTarget}</span>
                      <input
                        className="control-input"
                        list={`mt-languages-${profile.id}`}
                        value={profile.defaultTargetLocale ?? ''}
                        onChange={(event) => update(profile.id, { defaultTargetLocale: event.target.value || null })}
                      />
                      {fieldErrors[profile.id]?.defaultTargetLocale ? (
                        <small role="alert" className="settings-ai-error">
                          {fieldErrors[profile.id].defaultTargetLocale}
                        </small>
                      ) : null}
                      <datalist id={`mt-languages-${profile.id}`}>
                        {(languages[profile.id] ?? []).map((language) => (
                          <option key={language.code} value={language.code}>
                            {language.name}
                          </option>
                        ))}
                      </datalist>
                    </label>
                  </div>
                  <div className="settings-mt-credentials">
                    <strong>{copy.credentials}</strong>
                    {preset?.credentialFields.map((field) => {
                      const source = profile.credentialSources[field]
                      const label = copy.credentialLabels[field as keyof typeof copy.credentialLabels] ?? field
                      return (
                        <div key={field} className="settings-mt-credential">
                          <label>
                            <span>
                              {label} ·{' '}
                              {source === 'keychain'
                                ? rootCopy.credentialKeychain
                                : source === 'environment'
                                  ? rootCopy.credentialEnvironment
                                  : rootCopy.credentialMissing}
                            </span>
                            <div className="settings-ai-secret">
                              <KeyRound className="h-4 w-4" />
                              <input
                                type="password"
                                className="control-input"
                                value={profile.credentials[field] ?? ''}
                                placeholder={rootCopy.apiKeyPlaceholder}
                                onChange={(event) =>
                                  update(profile.id, {
                                    credentials: { ...profile.credentials, [field]: event.target.value },
                                    clearCredentials: profile.clearCredentials.filter((value) => value !== field),
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="control-button"
                                disabled={!source && !profile.credentials[field]}
                                onClick={() =>
                                  update(profile.id, {
                                    credentials: Object.fromEntries(Object.entries(profile.credentials).filter(([key]) => key !== field)),
                                    clearCredentials: [...new Set([...profile.clearCredentials, field])],
                                    credentialSources: Object.fromEntries(
                                      Object.entries(profile.credentialSources).filter(([key]) => key !== field),
                                    ),
                                  })
                                }
                              >
                                {rootCopy.clearApiKey}
                              </button>
                            </div>
                          </label>
                          <label>
                            <span>{rootCopy.environment}</span>
                            <input
                              className="control-input"
                              value={profile.credentialEnvironments[field] ?? ''}
                              onChange={(event) =>
                                update(profile.id, {
                                  credentialEnvironments: { ...profile.credentialEnvironments, [field]: event.target.value },
                                })
                              }
                            />
                          </label>
                        </div>
                      )
                    })}
                  </div>
                  {preset ? (
                    <div className="settings-mt-capabilities">
                      <strong>{copy.capability}</strong>
                      <span>{preset.capability.languagesDynamic ? copy.dynamicLanguages : copy.staticLanguages}</span>
                      <span>{copy.itemLimit(preset.capability.maxItemCharacters)}</span>
                      <span>{copy.batchLimit(preset.capability.maxBatchCharacters)}</span>
                      {preset.capability.supportsHtml ? <span>{copy.htmlSupported}</span> : null}
                      {preset.capability.supportsGlossary ? <span>{copy.glossarySupported}</span> : null}
                      <p>{copy.exactKnowledgeOnly}</p>
                    </div>
                  ) : null}
                  {languages[profile.id]?.length ? (
                    <div className="settings-mt-languages" aria-label={copy.languageCount(languages[profile.id].length)}>
                      {languages[profile.id].map((language) => (
                        <span key={language.code} title={language.name}>
                          {language.code}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <footer className="settings-ai-profile-actions">
                    <span>{status[profile.id] ?? ''}</span>
                    <button
                      type="button"
                      className="control-button"
                      disabled={!ready}
                      title={!ready ? rootCopy.saveBeforeRemoteActions : undefined}
                      onClick={() => void loadLanguages(profile.id)}
                    >
                      <Languages className="h-3.5 w-3.5" />
                      {copy.loadLanguages}
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      disabled={!ready}
                      title={!ready ? rootCopy.saveBeforeRemoteActions : undefined}
                      onClick={() => void test(profile.id)}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {rootCopy.testConnection}
                    </button>
                  </footer>
                </article>
              )
            })}
        </div>
      </div>
      <div className="settings-ai-footer">
        <button
          type="button"
          className="control-button control-button-primary"
          disabled={saving || !profiles.length}
          onClick={() => void save()}
        >
          <Save className="h-4 w-4" />
          {saving ? rootCopy.saving : rootCopy.save}
        </button>
      </div>
    </section>
  )
}
