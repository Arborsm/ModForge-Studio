import { useEffect, useId, useRef, useState } from 'react'
import { parseAiFailure } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import type {
  MachineTranslationLanguage,
  MachineTranslationPreset,
  MachineTranslationProfileTestResult,
  MachineTranslationSettingsSnapshot,
  SaveMachineTranslationProfile,
} from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'

const MT_TEST_NOTIFICATION = 'machine-translation-connection-test'
const MT_LANG_NOTIFICATION = 'machine-translation-load-languages'

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

function profilesAreSaved(snapshot: MachineTranslationSettingsSnapshot | null, profiles: Draft[], defaultId: string | null) {
  if (!snapshot || snapshot.defaultProfileId !== defaultId || snapshot.profiles.length !== profiles.length) return false
  return profiles.every((profile, index) => {
    const saved = snapshot.profiles[index]
    return (
      saved?.id === profile.id &&
      saved.name === profile.name &&
      saved.presetId === profile.presetId &&
      saved.protocol === profile.protocol &&
      saved.baseUrl === profile.baseUrl &&
      saved.region === profile.region &&
      saved.enabled === profile.enabled &&
      saved.defaultSourceLocale === profile.defaultSourceLocale &&
      saved.defaultTargetLocale === profile.defaultTargetLocale &&
      JSON.stringify(saved.credentialEnvironments) === JSON.stringify(profile.credentialEnvironments) &&
      Object.keys(profile.credentials).length === 0 &&
      profile.clearCredentials.length === 0
    )
  })
}

export function MachineTranslationProfilesSection({
  onDirtyChange,
  requestLeave,
}: {
  onDirtyChange?: (dirty: boolean) => void
  requestLeave: (action: () => void) => void
}) {
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
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [loadingLanguagesId, setLoadingLanguagesId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<MachineTranslationProfileTestResult | null>(null)
  const testDialogTitleId = useId()
  const dirty = snapshot ? !profilesAreSaved(snapshot, profiles, defaultId) : false
  const mounted = useRef(false)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const selectProfile = (id: string) => {
    if (id === selectedId) return
    if (dirty) requestLeave(() => setSelectedId(id))
    else setSelectedId(id)
  }
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
    dismissNotification(MT_LANG_NOTIFICATION)
    setLoadingLanguagesId(id)
    publish({
      id: MT_LANG_NOTIFICATION,
      level: 'info',
      title: copy.loadLanguagesRunning,
      autoDismissMs: null,
    })
    try {
      const value = await localization.listMachineTranslationLanguages(id)
      if (!mounted.current) return
      setLanguages((current) => ({ ...current, [id]: value }))
      dismissNotification(MT_LANG_NOTIFICATION)
      publish({
        id: MT_LANG_NOTIFICATION,
        level: 'success',
        title: copy.loadLanguagesSuccess(value.length),
      })
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      dismissNotification(MT_LANG_NOTIFICATION)
      publish({
        id: notificationId,
        level: 'error',
        title: copy.loadLanguagesError,
        description: notifications.failureDescriptions[failure.code],
        action: { label: notifications.retryAction, callback: () => void loadLanguages(id), tone: 'primary' },
      })
    } finally {
      if (mounted.current) setLoadingLanguagesId(null)
    }
  }
  const test = async (id: string) => {
    const notificationId = profileNotification(id)
    dismissNotification(notificationId)
    dismissNotification(MT_TEST_NOTIFICATION)
    setTestingId(id)
    publish({
      id: MT_TEST_NOTIFICATION,
      level: 'info',
      title: rootCopy.testingConnection,
      autoDismissMs: null,
    })
    try {
      const value = await localization.testMachineTranslationProfile(id)
      if (!mounted.current) return
      setTestResult(value)
      dismissNotification(MT_TEST_NOTIFICATION)
      publish({
        id: MT_TEST_NOTIFICATION,
        level: 'success',
        title: rootCopy.testSuccess(value.latencyMs),
      })
    } catch (cause) {
      if (!mounted.current) return
      const failure = parseAiFailure(cause)
      dismissNotification(MT_TEST_NOTIFICATION)
      publish({
        id: notificationId,
        level: 'error',
        title: notifications.connectionTestFailedTitle,
        description: notifications.failureDescriptions[failure.code],
        action: { label: notifications.retryAction, callback: () => void test(id), tone: 'primary' },
      })
    } finally {
      if (mounted.current) setTestingId(null)
    }
  }
  return (
    <section className="settings-mt-section">
      <div className="settings-ai-tab-body">
        {error ? <p className="settings-ai-error">{error}</p> : null}
        <div className="settings-mt-workspace">
          <aside className="settings-ai-profile-list settings-mt-profile-list" aria-label={copy.profileList}>
            <header>
              <strong>{copy.profileList}</strong>
              <button type="button" className="settings-window-btn settings-window-btn-primary" onClick={add} disabled={!presets.length}>
                {copy.addProfile}
              </button>
            </header>
            <div className="settings-ai-profile-list-body">
              {profiles.map((profile) => {
                const preset = presets.find((value) => value.id === profile.presetId)
                const sources = Object.keys(profile.credentialSources).length
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={cx('settings-ai-profile-list-item', selectedId === profile.id && 'is-active')}
                    aria-current={selectedId === profile.id ? 'true' : undefined}
                    onClick={() => selectProfile(profile.id)}
                  >
                    <div className="settings-ai-pitem-name">
                      <strong>{profile.name || rootCopy.untitledProfile}</strong>
                      {defaultId === profile.id ? <span className="settings-ai-tag is-ok">{rootCopy.defaultProfile}</span> : null}
                    </div>
                    <div className="settings-ai-pitem-meta">
                      <span className={cx('settings-ai-tag', sources > 0 && 'is-ok')}>
                        {sources ? copy.credentialsConfigured(sources) : rootCopy.credentialMissing}
                      </span>
                    </div>
                    <div className="settings-ai-pitem-sub">
                      {preset?.name ?? profile.presetId}
                      {profile.region ? ` · ${profile.region}` : ''}
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>
          <div className="settings-ai-profiles">
            {profiles
              .filter((profile) => profile.id === selectedId)
              .map((profile) => {
                const preset = presets.find((value) => value.id === profile.presetId)
                const isDefault = defaultId === profile.id
                return (
                  <article key={profile.id} className={cx('settings-ai-profile-detail', isDefault && 'is-default')}>
                    <header className="settings-ai-profile-detail-head">
                      <div>
                        <h3>{profile.name || rootCopy.untitledProfile}</h3>
                        <span className="saved-at">{dirty ? rootCopy.unsavedChanges : rootCopy.savedState}</span>
                      </div>
                      <div className="settings-window-actions">
                        <button type="button" className="settings-window-btn" onClick={() => setDefaultId(profile.id)} disabled={isDefault}>
                          {isDefault ? rootCopy.defaultProfile : rootCopy.setDefault}
                        </button>
                        <button
                          type="button"
                          className="settings-window-btn settings-window-btn-danger"
                          title={rootCopy.delete}
                          aria-label={rootCopy.delete}
                          onClick={() => {
                            setProfiles((values) => values.filter((value) => value.id !== profile.id))
                            setSelectedId(profiles.find((value) => value.id !== profile.id)?.id ?? null)
                            if (isDefault) setDefaultId(null)
                          }}
                        >
                          {rootCopy.delete}
                        </button>
                      </div>
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
                        <CompactSelect
                          value={profile.presetId}
                          options={presets.map((value) => ({ value: value.id, label: value.name }))}
                          onChange={(next) => {
                            const preset = presets.find((item) => item.id === next)
                            if (preset) selectPreset(profile, preset)
                          }}
                          ariaLabel={rootCopy.provider}
                          placement="bottom-start"
                          className="settings-ai-grid-select"
                          triggerClassName="settings-ai-grid-select-trigger"
                          menuClassName="settings-ai-grid-select-menu"
                        />
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
                      <div className="settings-mt-enabled settings-ai-wide">
                        <span>{copy.enabled}</span>
                        <button
                          type="button"
                          className={cx('settings-switch', profile.enabled && 'settings-switch-active')}
                          role="switch"
                          aria-checked={profile.enabled}
                          onClick={() => update(profile.id, { enabled: !profile.enabled })}
                        >
                          <span className="settings-switch-copy">{profile.enabled ? copy.enabledStatus : copy.disabledStatus}</span>
                          <span className="settings-switch-track" aria-hidden="true">
                            <span className="settings-switch-thumb" />
                          </span>
                        </button>
                      </div>
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
                              <div className="settings-ai-secret-field">
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
                                <div className="settings-ai-secret-meta">
                                  <span className={cx('settings-ai-tag', source && 'is-ok')}>
                                    {source === 'keychain'
                                      ? rootCopy.credentialKeychain
                                      : source === 'environment'
                                        ? rootCopy.credentialEnvironment
                                        : rootCopy.credentialMissing}
                                  </span>
                                  <button
                                    type="button"
                                    className="settings-window-btn settings-window-btn-ghost"
                                    disabled={!source && !profile.credentials[field]}
                                    onClick={() =>
                                      update(profile.id, {
                                        credentials: Object.fromEntries(
                                          Object.entries(profile.credentials).filter(([key]) => key !== field),
                                        ),
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
                    {preset ? (
                      <div className="settings-ai-pitem-meta" style={{ marginTop: '0.75rem' }}>
                        {preset.capability.supportsHtml ? <span className="settings-ai-tag is-ok">{copy.htmlSupported}</span> : null}
                        {preset.capability.supportsGlossary ? (
                          <span className="settings-ai-tag is-ok">{copy.glossarySupported}</span>
                        ) : null}
                        <span className="settings-ai-tag">
                          {preset.capability.languagesDynamic ? copy.dynamicLanguages : copy.staticLanguages}
                        </span>
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
                  </article>
                )
              })}
            {!profiles.some((profile) => profile.id === selectedId) ? (
              <div className="settings-ai-profile-empty">
                <p>{copy.noProfiles}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <footer className="settings-ai-dock">
        <div className="settings-ai-dock-meta">
          <span>{dirty ? copy.dockUnsavedRemoteActions : copy.dockReadyRemoteActions}</span>
          {dirty ? <span className="settings-ai-tag is-dirty">{rootCopy.dirtyTag}</span> : null}
        </div>
        <div className="settings-window-actions">
          {selectedId ? (
            <button
              type="button"
              className="settings-window-btn"
              disabled={!remoteReady(profiles.find((p) => p.id === selectedId)!) || loadingLanguagesId === selectedId}
              title={!remoteReady(profiles.find((p) => p.id === selectedId)!) ? rootCopy.saveBeforeRemoteActions : undefined}
              onClick={() => void loadLanguages(selectedId)}
            >
              {loadingLanguagesId === selectedId ? copy.loadLanguagesRunning : copy.loadLanguages}
            </button>
          ) : null}
          {selectedId ? (
            <button
              type="button"
              className="settings-window-btn"
              disabled={!remoteReady(profiles.find((p) => p.id === selectedId)!) || testingId === selectedId}
              title={!remoteReady(profiles.find((p) => p.id === selectedId)!) ? rootCopy.saveBeforeRemoteActions : undefined}
              onClick={() => void test(selectedId)}
            >
              {testingId === selectedId ? rootCopy.testing : rootCopy.testConnection}
            </button>
          ) : null}
          <button
            type="button"
            className="settings-window-btn settings-window-btn-primary"
            disabled={saving || !profiles.length}
            onClick={() => void save()}
          >
            {saving ? rootCopy.saving : rootCopy.save}
          </button>
        </div>
      </footer>
      <Dialog open={Boolean(testResult)} onClose={() => setTestResult(null)} labelledBy={testDialogTitleId} stack size="sm">
        <DialogHeader
          id={testDialogTitleId}
          title={rootCopy.connectionTestTitle}
          subtitle={testResult ? rootCopy.testSuccess(testResult.latencyMs) : undefined}
          onClose={() => setTestResult(null)}
          closeLabel={rootCopy.connectionTestClose}
        />
        <DialogBody>
          {testResult ? (
            <dl className="settings-ai-result-grid">
              <div>
                <dt>{rootCopy.latency}</dt>
                <dd>{testResult.latencyMs} ms</dd>
              </div>
              <div>
                <dt>{copy.defaultSource}</dt>
                <dd>{testResult.detectedLanguage ?? '—'}</dd>
              </div>
            </dl>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogAction tone="primary" onClick={() => setTestResult(null)}>
            {rootCopy.connectionTestClose}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </section>
  )
}
