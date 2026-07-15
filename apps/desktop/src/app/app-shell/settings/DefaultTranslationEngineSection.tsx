import { AlertTriangle, ArrowRight, Check, Sparkles, Languages } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAi } from '@entities/ai'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { LocalizationEngineRef } from '@shared/contracts'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { cx } from '@shared/lib/helper'
import { useNotificationPublisher } from '@shared/ui/notifications'

type EngineChoice = LocalizationEngineRef & {
  name: string
  detail: string
  available: boolean
  credentialLabel: string | null
}

type EngineSettingsTab = 'generative' | 'machine-translation'

function sameEngine(left: LocalizationEngineRef | null, right: LocalizationEngineRef | null) {
  return left?.kind === right?.kind && left?.profileId === right?.profileId
}

export function DefaultTranslationEngineSection({
  onDirtyChange,
  onNavigateTab,
}: {
  onDirtyChange?: (dirty: boolean) => void
  onNavigateTab?: (tab: EngineSettingsTab) => void
}) {
  const ai = useAi()
  const localization = useLocalization()
  const settingsCopy = useSettingsMenuCopy()
  const locale = usePreferencesStore((state) => state.locale)
  const copy = settingsCopy.ai.defaultEngine
  const aiCopy = settingsCopy.ai
  const noKeyLabel = locale.startsWith('zh') ? '无需 Key' : 'No key'
  const publishNotification = useNotificationPublisher()
  const [choices, setChoices] = useState<EngineChoice[]>([])
  const [saved, setSaved] = useState<LocalizationEngineRef | null>(null)
  const [selected, setSelected] = useState<LocalizationEngineRef | null>(null)
  const [engineKind, setEngineKind] = useState<'generative-ai' | 'machine-translation'>('generative-ai')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const dirty = !sameEngine(selected, saved)

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  useEffect(() => {
    let active = true
    void Promise.all([ai.loadSettings(), localization.loadMachineTranslationSettings(), localization.loadDefaultEngine()])
      .then(([aiSettings, mtSettings, defaultEngine]) => {
        if (!active) return
        const generative = aiSettings.profiles.map<EngineChoice>((profile) => {
          const preset = aiSettings.presets.find((item) => item.id === profile.presetId)
          const credentialLabel =
            preset?.requiresApiKey === false
              ? noKeyLabel
              : profile.resolvedCredentialSource === 'keychain'
                ? aiCopy.credentialKeychain
                : profile.resolvedCredentialSource === 'environment'
                  ? aiCopy.credentialEnvironment
                  : aiCopy.credentialMissing
          return {
            kind: 'generative-ai',
            profileId: profile.id,
            name: profile.name,
            detail: `${profile.protocol} · ${profile.model || aiCopy.modelNotSet} · ${credentialLabel}`,
            available: preset?.requiresApiKey === false || profile.resolvedCredentialSource !== null,
            credentialLabel,
          }
        })
        const machine = mtSettings.profiles.map<EngineChoice>((profile) => {
          const preset = mtSettings.presets.find((item) => item.id === profile.presetId)
          const hasCredentials = (preset?.credentialFields ?? []).every((field) => Boolean(profile.credentialSources[field]))
          const credentialLabel = hasCredentials ? copy.available : aiCopy.credentialMissing
          return {
            kind: 'machine-translation',
            profileId: profile.id,
            name: profile.name,
            detail: `${profile.protocol}${profile.region ? ` · ${profile.region}` : ''}`,
            available: profile.enabled && hasCredentials,
            credentialLabel,
          }
        })
        setChoices([...generative, ...machine])
        setSaved(defaultEngine)
        setSelected(defaultEngine)
        if (defaultEngine?.kind === 'machine-translation' || defaultEngine?.kind === 'generative-ai') {
          setEngineKind(defaultEngine.kind)
        } else if (generative.length === 0 && machine.length > 0) {
          setEngineKind('machine-translation')
        }
      })
      .catch(() => active && setMessage(copy.loadError))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [ai, localization, copy.loadError, copy.available, aiCopy, noKeyLabel])

  const save = async () => {
    if (!selected) return
    setSaving(true)
    setMessage(null)
    try {
      const value = await localization.saveDefaultEngine(selected)
      setSaved(value)
      setSelected(value)
      setMessage(copy.saved)
    } catch {
      setMessage(copy.saveError)
      publishNotification({
        id: 'localization-default-engine-save',
        level: 'error',
        title: copy.saveError,
        description: copy.explicitFailure,
        action: { label: copy.save, callback: () => void save(), tone: 'primary' },
      })
    } finally {
      setSaving(false)
    }
  }

  const selectedChoice = choices.find((choice) => sameEngine(choice, selected))
  const kindProfiles = choices.filter((choice) => choice.kind === engineKind)
  const hasGenerative = choices.some((choice) => choice.kind === 'generative-ai')
  const hasMachine = choices.some((choice) => choice.kind === 'machine-translation')
  const hasAnyProfile = choices.length > 0

  const selectKind = (kind: 'generative-ai' | 'machine-translation') => {
    setEngineKind(kind)
    setMessage(null)
    const first = choices.find((choice) => choice.kind === kind)
    if (first) {
      setSelected({ kind: first.kind, profileId: first.profileId })
    }
  }

  const statusLabel = selectedChoice
    ? selectedChoice.available
      ? [copy.available, selectedChoice.credentialLabel].filter(Boolean).join(' · ')
      : copy.unavailable
    : null

  const dockMeta = message
    ? message
    : !hasAnyProfile && !loading
      ? copy.emptyTitle
      : dirty
        ? aiCopy.unsavedChanges
        : selected
          ? copy.saved
          : copy.noneSelected

  return (
    <div className="settings-ai-engine-shell">
      <div className="settings-ai-scroll settings-ai-engine-scroll">
        <section className="settings-ai-engine" aria-labelledby="ai-default-engine-title">
          <h3 id="ai-default-engine-title" className="sr-only">
            {copy.title}
          </h3>

          {loading ? (
            <div className="settings-ai-engine-loading" role="status" aria-live="polite">
              <div className="settings-ai-engine-loading-banner">
                <span className="settings-ai-engine-loading-spinner" aria-hidden="true" />
                <span>{copy.loading}</span>
              </div>
              <div className="settings-ai-engine-card" aria-hidden="true">
                <div className="settings-ai-engine-opt is-skeleton">
                  <i />
                  <i />
                </div>
                <div className="settings-ai-engine-opt is-skeleton">
                  <i />
                  <i />
                </div>
              </div>
              <div className="settings-ai-profile-pick-list" aria-hidden="true">
                <div className="settings-ai-profile-pick is-skeleton">
                  <div>
                    <i />
                    <i />
                  </div>
                </div>
                <div className="settings-ai-profile-pick is-skeleton">
                  <div>
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !hasAnyProfile ? (
            <div className="settings-ai-engine-empty">
              <div className="settings-ai-engine-empty-copy">
                <strong>{copy.emptyTitle}</strong>
                <p>{copy.emptyDescription}</p>
              </div>
              <div className="settings-ai-engine-empty-grid">
                <button type="button" className="settings-ai-engine-empty-card" onClick={() => onNavigateTab?.('generative')}>
                  <span className="settings-ai-engine-empty-ico is-ai" aria-hidden="true">
                    <Sparkles className="settings-ai-engine-empty-icon" strokeWidth={2} />
                  </span>
                  <span className="settings-ai-engine-empty-card-copy">
                    <strong>{copy.generative}</strong>
                    <span>{copy.goCreateGenerative}</span>
                  </span>
                  <ArrowRight className="settings-ai-engine-empty-arrow" aria-hidden="true" strokeWidth={2} />
                </button>
                <button type="button" className="settings-ai-engine-empty-card" onClick={() => onNavigateTab?.('machine-translation')}>
                  <span className="settings-ai-engine-empty-ico is-mt" aria-hidden="true">
                    <Languages className="settings-ai-engine-empty-icon" strokeWidth={2} />
                  </span>
                  <span className="settings-ai-engine-empty-card-copy">
                    <strong>{copy.machineTranslation}</strong>
                    <span>{copy.goCreateMachineTranslation}</span>
                  </span>
                  <ArrowRight className="settings-ai-engine-empty-arrow" aria-hidden="true" strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}

          {!loading && hasAnyProfile && selectedChoice ? (
            <div className={cx('settings-ai-engine-summary', !selectedChoice.available && 'is-unavailable')}>
              <span className="settings-ai-engine-mark">{selectedChoice.kind === 'generative-ai' ? 'AI' : 'MT'}</span>
              <div>
                <h3>
                  {selectedChoice.kind === 'generative-ai' ? copy.generative : copy.machineTranslation} · {selectedChoice.name}
                </h3>
                <p>{selectedChoice.detail}</p>
              </div>
              <span className={cx('settings-ai-tag', selectedChoice.available ? 'is-ok' : 'is-danger')}>
                {selectedChoice.available ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {statusLabel}
              </span>
            </div>
          ) : null}

          {!loading && hasAnyProfile && !selectedChoice ? (
            <div className="settings-ai-engine-summary is-empty-selection">
              <span className="settings-ai-engine-mark is-muted">?</span>
              <div>
                <h3>{copy.noneSelected}</h3>
                <p>{copy.description}</p>
              </div>
            </div>
          ) : null}

          {selectedChoice && !selectedChoice.available ? (
            <p className="settings-ai-engine-alert is-on" role="alert">
              {copy.explicitFailure}
            </p>
          ) : null}

          {!loading && hasAnyProfile ? (
            <>
              <p className="settings-window-group-label">{copy.engineTypeLabel}</p>
              <div className="settings-ai-engine-card" role="radiogroup" aria-label={copy.engineTypeLabel}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={engineKind === 'generative-ai'}
                  aria-disabled={!hasGenerative}
                  disabled={!hasGenerative}
                  className={cx('settings-ai-engine-opt', engineKind === 'generative-ai' && 'is-active', !hasGenerative && 'is-empty')}
                  onClick={() => selectKind('generative-ai')}
                >
                  <div className="settings-ai-engine-opt-top">
                    <strong>{copy.generative}</strong>
                    <span className="settings-ai-engine-radio" aria-hidden="true" />
                  </div>
                  <span className="settings-ai-engine-opt-desc">{hasGenerative ? copy.generativeDescription : copy.emptyKindTitle}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={engineKind === 'machine-translation'}
                  aria-disabled={!hasMachine}
                  disabled={!hasMachine}
                  className={cx('settings-ai-engine-opt', engineKind === 'machine-translation' && 'is-active', !hasMachine && 'is-empty')}
                  onClick={() => selectKind('machine-translation')}
                >
                  <div className="settings-ai-engine-opt-top">
                    <strong>{copy.machineTranslation}</strong>
                    <span className="settings-ai-engine-radio" aria-hidden="true" />
                  </div>
                  <span className="settings-ai-engine-opt-desc">
                    {hasMachine ? copy.machineTranslationDescription : copy.emptyKindTitle}
                  </span>
                </button>
              </div>

              <div className="settings-window-group">
                <p className="settings-window-group-label">{copy.defaultProfileLabel}</p>
                {kindProfiles.length ? (
                  <div className="settings-ai-profile-pick-list" role="radiogroup" aria-label={copy.current}>
                    {kindProfiles.map((choice) => {
                      const checked = sameEngine(choice, selected)
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          className={cx('settings-ai-profile-pick', checked && 'is-active', !choice.available && 'is-disabled')}
                          key={`${choice.kind}:${choice.profileId}`}
                          onClick={() => {
                            setSelected({ kind: choice.kind, profileId: choice.profileId })
                            setMessage(null)
                          }}
                        >
                          <div>
                            <strong>{choice.name}</strong>
                            <span>{choice.detail}</span>
                          </div>
                          <span className={cx('settings-ai-tag', choice.available ? 'is-ok' : 'is-danger')}>
                            {choice.available ? copy.available : copy.unavailable}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="settings-ai-engine-kind-empty">
                    <p>
                      <strong>{copy.emptyKindTitle}</strong>
                      <span>{copy.emptyKindDescription}</span>
                    </p>
                    <button
                      type="button"
                      className="settings-window-btn settings-window-btn-primary"
                      onClick={() => onNavigateTab?.(engineKind === 'generative-ai' ? 'generative' : 'machine-translation')}
                    >
                      {engineKind === 'generative-ai' ? copy.goCreateGenerative : copy.goCreateMachineTranslation}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <footer className="settings-ai-dock">
        <div className="settings-ai-dock-meta">
          <strong>{dockMeta}</strong>
          {dirty ? <span className="settings-ai-tag is-dirty">{aiCopy.dirtyTag}</span> : null}
          <span>{hasAnyProfile ? copy.description : copy.noProfiles}</span>
        </div>
        <div className="settings-window-actions">
          <button
            type="button"
            className="settings-window-btn settings-window-btn-primary"
            disabled={!selected || !dirty || saving || loading}
            onClick={() => void save()}
          >
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </footer>
    </div>
  )
}
