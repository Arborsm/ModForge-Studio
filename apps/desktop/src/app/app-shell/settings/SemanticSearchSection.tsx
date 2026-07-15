import { useEffect, useId, useRef, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import type {
  AiSemanticIndexStatus,
  AiSemanticModelStatus,
  AiSemanticModelVerification,
  AiSemanticProbeResult,
  AiSemanticProgress,
  AiSemanticSearchMode,
  AiSemanticSettingsSnapshot,
  SaveAiSemanticRemoteProfile,
} from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'

const SEMANTIC_VERIFY_NOTIFICATION = 'semantic-model-verify'
const SEMANTIC_TEST_NOTIFICATION = 'semantic-remote-test'

const BUILTIN_MODEL_ID = 'intfloat/multilingual-e5-small'
const SEMANTIC_MODES: AiSemanticSearchMode[] = ['lexical', 'builtin', 'local-onnx', 'remote-openai']

function bytes(value: number | null | undefined) {
  const amount = value ?? 0
  if (amount >= 1024 * 1024 * 1024) return `${(amount / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (amount >= 1024 * 1024) return `${(amount / 1024 / 1024).toFixed(1)} MB`
  if (amount >= 1024) return `${(amount / 1024).toFixed(1)} KB`
  return `${amount} B`
}

export function SemanticSearchSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const localization = useLocalization()
  const rootCopy = useSettingsMenuCopy().ai
  const copy = rootCopy.semantic
  const notificationCopy = useNotificationCopy().ai
  const publish = useNotificationPublisher()
  const mounted = useRef(true)
  const refreshGeneration = useRef(0)
  const pausedJob = useRef<string | null>(null)
  const [settings, setSettings] = useState<AiSemanticSettingsSnapshot | null>(null)
  const [savedSettings, setSavedSettings] = useState<AiSemanticSettingsSnapshot | null>(null)
  const [model, setModel] = useState<AiSemanticModelStatus | null>(null)
  const [index, setIndex] = useState<AiSemanticIndexStatus | null>(null)
  const [progress, setProgress] = useState<AiSemanticProgress | null>(null)
  const [downloadPaused, setDownloadPaused] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remoteDraft, setRemoteDraft] = useState<SaveAiSemanticRemoteProfile>({
    id: crypto.randomUUID(),
    name: '',
    baseUrl: '',
    model: '',
    dimensions: null,
    credentialEnvironment: null,
  })
  const [remoteCredentialSource, setRemoteCredentialSource] = useState<string | null>(null)
  const [confirmRemote, setConfirmRemote] = useState(false)
  const [verification, setVerification] = useState<AiSemanticModelVerification | null>(null)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [probeQuery, setProbeQuery] = useState('')
  const [probeResult, setProbeResult] = useState<AiSemanticProbeResult | null>(null)
  const verificationTitleId = useId()
  const remoteSaved = savedSettings?.remoteProfiles.find((item) => item.id === savedSettings.activeRemoteProfileId)
  const dirty = Boolean(
    settings &&
    savedSettings &&
    (settings.mode !== savedSettings.mode ||
      settings.localModelDirectory !== savedSettings.localModelDirectory ||
      (settings.mode === 'remote-openai' &&
        (!remoteSaved ||
          remoteSaved.name !== remoteDraft.name ||
          remoteSaved.baseUrl !== remoteDraft.baseUrl ||
          remoteSaved.model !== remoteDraft.model ||
          remoteSaved.dimensions !== remoteDraft.dimensions ||
          remoteSaved.credentialEnvironment !== remoteDraft.credentialEnvironment ||
          Boolean(remoteDraft.apiKey) ||
          Boolean(remoteDraft.clearApiKey)))),
  )

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const refresh = async () => {
    const generation = ++refreshGeneration.current
    try {
      const [nextSettings, nextModel, nextIndex] = await Promise.all([
        localization.loadSemanticSettings(),
        localization.inspectSemanticModel(),
        localization.inspectSemanticIndex([]),
      ])
      if (!mounted.current || generation !== refreshGeneration.current) return
      setSettings(nextSettings)
      setSavedSettings(nextSettings)
      setModel(nextModel)
      setIndex(nextIndex)
      setError(null)
      const active = nextSettings.remoteProfiles.find((item) => item.id === nextSettings.activeRemoteProfileId)
      if (active)
        setRemoteDraft({
          id: active.id,
          name: active.name,
          baseUrl: active.baseUrl,
          model: active.model,
          dimensions: active.dimensions,
          credentialEnvironment: active.credentialEnvironment,
        })
      setRemoteCredentialSource(active?.resolvedCredentialSource ?? null)
    } catch (cause) {
      if (mounted.current && generation === refreshGeneration.current) setError(copy.loadError)
      throw cause
    }
  }

  useEffect(() => {
    mounted.current = true
    void refresh().catch(() => undefined)
    let dispose: (() => void) | undefined
    void localization
      .listenSemanticProgress((value) => {
        if (!mounted.current) return
        setProgress(value)
        if (value.kind === 'download' && value.phase === 'complete') setDownloadPaused(false)
      })
      .then((value) => {
        dispose = value
      })
    return () => {
      mounted.current = false
      dispose?.()
    }
  }, [localization, copy.loadError])

  const run = async (
    name: string,
    action: () => Promise<unknown>,
    options?: { runningTitle?: string; successTitle?: string; refreshAfter?: boolean },
  ) => {
    const noticeId = `semantic-${name}`
    setBusy(name)
    setError(null)
    dismissNotification(noticeId)
    if (options?.runningTitle) {
      publish({ id: noticeId, level: 'info', title: options.runningTitle, autoDismissMs: null })
    }
    try {
      await action()
      if (options?.refreshAfter !== false) await refresh()
      if (!mounted.current) return
      if (options?.runningTitle || options?.successTitle) {
        dismissNotification(noticeId)
        publish({
          id: noticeId,
          level: 'success',
          title: options.successTitle ?? copy.actionSuccess,
        })
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : copy.actionError
      if (mounted.current) setError(detail)
      dismissNotification(noticeId)
      publish({
        id: noticeId,
        level: 'error',
        title: copy.actionError,
        description: detail || notificationCopy.failureDescriptions.unknown,
      })
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  if (!settings || !model || !index)
    return (
      <section className="settings-semantic" aria-busy="true" aria-live="polite">
        <div className="settings-ai-tab-body">
          <div className="settings-semantic-loading" role="status">
            <div className="settings-semantic-loading-head">
              <span className="settings-semantic-loading-spinner" aria-hidden="true" />
              <div>
                <strong>{error ?? copy.loading}</strong>
                <p>{copy.loadingHint}</p>
              </div>
            </div>
            <p className="settings-window-group-label">{copy.mode}</p>
            <div className="settings-semantic-mode-grid settings-semantic-loading-modes" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="settings-semantic-loading-tile">
                  <i />
                  <i />
                </div>
              ))}
            </div>
            <div className="settings-semantic-loading-health" aria-hidden="true">
              <div className="settings-semantic-loading-health-top">
                <i className="settings-semantic-loading-health-state" />
                <div className="settings-semantic-loading-health-actions">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="settings-semantic-loading-health-metrics">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="settings-semantic-loading-stat">
                    <i />
                    <i />
                  </div>
                ))}
              </div>
              <i className="settings-semantic-loading-health-hint" />
            </div>
          </div>
        </div>
      </section>
    )
  const mode = settings.mode
  const save = (nextMode = mode) =>
    run(
      'save',
      () =>
        localization.saveSemanticSettings({
          mode: nextMode,
          localModelDirectory: settings.localModelDirectory,
          activeRemoteProfileId: nextMode === 'remote-openai' ? remoteDraft.id : settings.activeRemoteProfileId,
          remoteProfiles:
            nextMode === 'remote-openai'
              ? [remoteDraft]
              : settings.remoteProfiles.map((item) => ({ ...item, apiKey: null, clearApiKey: false })),
        }),
      { runningTitle: copy.saving, successTitle: copy.savedToast },
    )
  const chooseDirectory = async () => {
    const directory = await localization.chooseSemanticModelDirectory()
    if (directory) setSettings({ ...settings, localModelDirectory: directory })
  }
  const verify = async () => {
    if (mode !== 'builtin' && mode !== 'local-onnx') {
      setError(copy.verificationError)
      publish({
        id: SEMANTIC_VERIFY_NOTIFICATION,
        level: 'error',
        title: copy.actionError,
        description: copy.verificationError,
      })
      return
    }
    setBusy('verify')
    setError(null)
    dismissNotification(SEMANTIC_VERIFY_NOTIFICATION)
    publish({
      id: SEMANTIC_VERIFY_NOTIFICATION,
      level: 'info',
      title: copy.verificationRunning,
      description: copy.verificationRunningDescription,
      autoDismissMs: null,
    })
    try {
      const result = await localization.verifySemanticModel({
        mode,
        modelId: mode === 'builtin' ? BUILTIN_MODEL_ID : null,
        localModelDirectory: mode === 'local-onnx' ? settings.localModelDirectory : null,
      })
      if (!mounted.current) return
      setVerification(result)
      setVerificationOpen(true)
      dismissNotification(SEMANTIC_VERIFY_NOTIFICATION)
      publish({
        id: SEMANTIC_VERIFY_NOTIFICATION,
        level: 'success',
        title: copy.verificationTitle,
        description: copy.verificationPassed,
      })
      await refresh()
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : copy.verificationError
      if (mounted.current) setError(detail)
      dismissNotification(SEMANTIC_VERIFY_NOTIFICATION)
      publish({
        id: SEMANTIC_VERIFY_NOTIFICATION,
        level: 'error',
        title: copy.verificationError,
        description: detail || notificationCopy.failureDescriptions.unknown,
      })
    } finally {
      if (mounted.current) setBusy(null)
    }
  }
  const download = async () => {
    const jobId = crypto.randomUUID()
    pausedJob.current = null
    setDownloadPaused(false)
    setBusy('download')
    setError(null)
    dismissNotification('semantic-download')
    publish({ id: 'semantic-download', level: 'info', title: copy.downloading, autoDismissMs: null })
    try {
      await localization.downloadSemanticModel({ jobId, modelId: BUILTIN_MODEL_ID })
      if (!mounted.current) return
      setProgress(null)
      await refresh()
      dismissNotification('semantic-download')
      publish({ id: 'semantic-download', level: 'success', title: copy.downloadComplete })
    } catch (cause) {
      if (pausedJob.current === jobId) {
        if (mounted.current) setDownloadPaused(true)
        dismissNotification('semantic-download')
        publish({ id: 'semantic-download', level: 'warning', title: copy.paused, description: copy.partRetained })
        return
      }
      const detail = cause instanceof Error ? cause.message : copy.actionError
      if (mounted.current) setError(detail)
      dismissNotification('semantic-download')
      publish({
        id: 'semantic-download',
        level: 'error',
        title: copy.actionError,
        description: detail || notificationCopy.failureDescriptions.unknown,
      })
    } finally {
      if (mounted.current) setBusy(null)
    }
  }
  const pauseDownload = async () => {
    if (!progress || progress.kind !== 'download') return
    pausedJob.current = progress.jobId
    setDownloadPaused(true)
    await localization.cancelJob(progress.jobId)
  }
  const runProbe = async () => {
    const query = probeQuery.trim()
    if (!query) return
    setBusy('probe')
    setError(null)
    dismissNotification('semantic-probe')
    publish({ id: 'semantic-probe', level: 'info', title: copy.probeRunning, autoDismissMs: null })
    try {
      const result = await localization.probeSemanticSearch({
        query,
        sourceLocale: 'en-US',
        targetLocale: 'zh-CN',
        limit: 10,
      })
      if (!mounted.current) return
      setProbeResult(result)
      dismissNotification('semantic-probe')
      publish({
        id: 'semantic-probe',
        level: 'success',
        title: copy.probeMeta(copy.retrievalModes[result.retrievalMode], result.totalCandidates, result.elapsedMs),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : copy.actionError
      if (mounted.current) setError(detail)
      dismissNotification('semantic-probe')
      publish({
        id: 'semantic-probe',
        level: 'error',
        title: copy.actionError,
        description: detail,
      })
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const testRemote = async () => {
    if (dirty || mode !== 'remote-openai') return
    setBusy('test')
    setError(null)
    dismissNotification(SEMANTIC_TEST_NOTIFICATION)
    publish({
      id: SEMANTIC_TEST_NOTIFICATION,
      level: 'info',
      title: rootCopy.testingConnection,
      autoDismissMs: null,
    })
    try {
      const result = await localization.testSemanticRemoteProfile(remoteDraft.id)
      if (!mounted.current) return
      dismissNotification(SEMANTIC_TEST_NOTIFICATION)
      publish({
        id: SEMANTIC_TEST_NOTIFICATION,
        level: 'success',
        title: copy.testSuccess(result.latencyMs, result.dimensions),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : copy.actionError
      if (mounted.current) setError(detail)
      dismissNotification(SEMANTIC_TEST_NOTIFICATION)
      publish({
        id: SEMANTIC_TEST_NOTIFICATION,
        level: 'error',
        title: copy.actionError,
        description: detail,
      })
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const stateLabel = downloadPaused
    ? copy.paused
    : busy === 'download'
      ? (copy.phaseLabels[progress?.phase ?? 'downloading'] ?? copy.downloading)
      : model.available || mode === 'lexical'
        ? copy.availableReady
        : copy.unavailable
  const stateTone = downloadPaused ? 'warn' : busy === 'download' ? 'info' : model.available || mode === 'lexical' ? 'ok' : 'danger'
  const fingerprint = verification?.fingerprint ?? model.revision ?? model.modelId ?? copy.notAvailable
  const fingerprintShort = fingerprint.length > 14 ? `${fingerprint.slice(0, 10)}` : fingerprint
  const backendReady =
    mode === 'lexical' ||
    (mode === 'builtin' && model.downloaded && (model.available || Boolean(verification))) ||
    (mode === 'local-onnx' && Boolean(settings.localModelDirectory) && (model.available || Boolean(verification))) ||
    (mode === 'remote-openai' && !dirty && Boolean(remoteDraft.name && remoteDraft.baseUrl && remoteDraft.model) && confirmRemote)
  const step2NextKey =
    mode === 'lexical'
      ? 'lexical'
      : mode === 'builtin'
        ? model.downloaded
          ? 'builtin-ready'
          : 'builtin-need-download'
        : mode === 'local-onnx'
          ? settings.localModelDirectory
            ? 'local-ready'
            : 'local-need-path'
          : dirty
            ? 'remote-need-save'
            : !confirmRemote
              ? 'remote-need-confirm'
              : 'remote-ready'
  const indexBlockedReason = dirty
    ? copy.step3BlockedDirty
    : mode === 'remote-openai' && !confirmRemote
      ? copy.step3BlockedRemote
      : !backendReady
        ? copy.step3BlockedBackend
        : null
  const indexActionsDisabled = Boolean(dirty || busy || indexBlockedReason)

  return (
    <section className="settings-semantic">
      <div className="settings-ai-tab-body">
        <div className="settings-semantic-stack">
          <div className="settings-semantic-block">
            <div className="settings-semantic-mode-grid" role="radiogroup" aria-label={copy.mode}>
              {SEMANTIC_MODES.map((value) => {
                const checked = mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className={checked ? 'settings-semantic-mode is-active' : 'settings-semantic-mode'}
                    onClick={() => setSettings({ ...settings, mode: value })}
                  >
                    <strong>{copy.modes[value]}</strong>
                    <small>{copy.modeDescriptions[value]}</small>
                  </button>
                )
              })}
            </div>
            <div className="settings-semantic-health" aria-label={copy.healthTitle}>
              <div className="settings-semantic-health-main">
                <div className="settings-semantic-health-top">
                  <div className="settings-semantic-health-head">
                    <span className={cx('settings-semantic-status-dot', `is-${stateTone}`)} aria-hidden="true" />
                    <strong className="settings-semantic-health-state">{stateLabel}</strong>
                    <span className="settings-semantic-health-mode">{copy.retrievalModes[index.retrievalMode]}</span>
                    {index.stale ? <span className="settings-semantic-health-stale">{copy.stale}</span> : null}
                  </div>
                  {mode === 'builtin' ? (
                    <div className="settings-semantic-actions">
                      <button
                        className={cx('settings-window-btn', !model.downloaded && 'settings-window-btn-primary')}
                        type="button"
                        disabled={busy === 'download' || busy === 'verify' || downloadPaused}
                        onClick={() => void download()}
                      >
                        {model.downloaded ? copy.refetch : copy.download}
                      </button>
                      {model.downloaded ? (
                        <button
                          className="settings-window-btn"
                          type="button"
                          onClick={() =>
                            void run('open-directory', () => localization.openSemanticModelDirectory(BUILTIN_MODEL_ID), {
                              runningTitle: copy.openDirectory,
                              successTitle: copy.openDirectorySuccess,
                              refreshAfter: false,
                            })
                          }
                        >
                          {copy.openDirectory}
                        </button>
                      ) : null}
                      <button
                        className={cx('settings-window-btn', model.downloaded && 'settings-window-btn-primary')}
                        type="button"
                        disabled={busy === 'download' || busy === 'verify' || !model.downloaded}
                        onClick={() => void verify()}
                      >
                        {busy === 'verify' ? copy.verifying : copy.verify}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="settings-semantic-health-metrics" role="group" aria-label={copy.indexCoverage}>
                  <div className="settings-semantic-health-metric">
                    <strong>{index.coveragePercentage.toFixed(1)}%</strong>
                    <span>{copy.indexCoverage}</span>
                  </div>
                  <div className="settings-semantic-health-metric">
                    <strong>{copy.coverageShort(index.indexedRecords, index.sourceRecords)}</strong>
                    <span>{copy.indexedMetric}</span>
                  </div>
                  <div className={cx('settings-semantic-health-metric', index.pendingRecords > 0 && 'is-attention')}>
                    <strong>{index.pendingRecords.toLocaleString()}</strong>
                    <span>{copy.pendingMetric}</span>
                  </div>
                </div>
                <p className="settings-semantic-health-meta">
                  <span>{copy.step2Next[step2NextKey]}</span>
                  <span className="settings-semantic-health-fingerprint" title={fingerprint}>
                    {fingerprintShort}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="settings-semantic-block">
            {mode === 'lexical' ? <p className="settings-semantic-inline-note">{copy.lexicalReady}</p> : null}

            {mode === 'builtin' && progress && progress.kind === 'download' ? (
              <div className={downloadPaused ? 'settings-semantic-dl is-paused' : 'settings-semantic-dl'}>
                <div className="settings-semantic-dl-head">
                  <div>
                    <p className="settings-semantic-dl-title">
                      {downloadPaused ? copy.paused : (copy.phaseLabels[progress.phase] ?? progress.phase)}
                    </p>
                    <p className="settings-semantic-dl-sub">
                      {progress.currentFile} · {bytes(progress.downloadedBytes)} / {bytes(progress.totalBytes)}
                    </p>
                  </div>
                  <div className="settings-semantic-actions">
                    {downloadPaused ? (
                      <button className="settings-window-btn" type="button" onClick={() => void download()}>
                        {copy.resume}
                      </button>
                    ) : (
                      <button className="settings-window-btn" type="button" onClick={() => void pauseDownload()}>
                        {copy.pause}
                      </button>
                    )}
                  </div>
                </div>
                <progress value={progress.percentage} max={100} aria-label={copy.downloadProgress} />
                <p className="settings-semantic-dl-sub">
                  {copy.progress(
                    bytes(progress.downloadedBytes),
                    bytes(progress.totalBytes),
                    progress.percentage,
                    bytes(progress.bytesPerSecond),
                  )}
                  {downloadPaused ? ` · ${copy.partRetained}` : ''}
                </p>
              </div>
            ) : null}

            {mode === 'local-onnx' ? (
              <label className="settings-semantic-field">
                <span>{copy.localDirectory}</span>
                <div className="settings-semantic-path">
                  <input className="control-input" readOnly value={settings.localModelDirectory ?? ''} />
                  <button className="settings-window-btn" type="button" onClick={() => void chooseDirectory()}>
                    {copy.chooseDirectory}
                  </button>
                  <button
                    className="settings-window-btn settings-window-btn-primary"
                    type="button"
                    disabled={!settings.localModelDirectory || busy === 'verify'}
                    onClick={() => void verify()}
                  >
                    {busy === 'verify' ? copy.verifying : copy.verify}
                  </button>
                  {settings.localModelDirectory ? (
                    <button
                      className="settings-window-btn"
                      type="button"
                      onClick={() =>
                        void run('open-directory', () => localization.openSemanticModelDirectory(settings.localModelDirectory!), {
                          runningTitle: copy.openDirectory,
                          successTitle: copy.openDirectorySuccess,
                          refreshAfter: false,
                        })
                      }
                    >
                      {copy.openDirectory}
                    </button>
                  ) : null}
                </div>
              </label>
            ) : null}

            {mode === 'remote-openai' ? (
              <>
                <div className="settings-semantic-remote-grid">
                  <label>
                    <span>{copy.remoteName}</span>
                    <input
                      className="control-input"
                      value={remoteDraft.name}
                      onChange={(event) => setRemoteDraft({ ...remoteDraft, name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{copy.remoteModel}</span>
                    <input
                      className="control-input mono"
                      value={remoteDraft.model}
                      onChange={(event) => setRemoteDraft({ ...remoteDraft, model: event.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label className="settings-semantic-remote-wide">
                    <span>{copy.remoteUrl}</span>
                    <input
                      className="control-input mono"
                      value={remoteDraft.baseUrl}
                      onChange={(event) => setRemoteDraft({ ...remoteDraft, baseUrl: event.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>{copy.remoteApiKey}</span>
                    <div className="settings-ai-secret-field">
                      <input
                        className="control-input"
                        type="password"
                        value={remoteDraft.apiKey ?? ''}
                        placeholder={rootCopy.apiKeyPlaceholder}
                        onChange={(event) => setRemoteDraft({ ...remoteDraft, apiKey: event.target.value, clearApiKey: false })}
                        autoComplete="off"
                      />
                      <div className="settings-ai-secret-meta">
                        <span
                          className={cx(
                            'settings-ai-tag',
                            remoteCredentialSource === 'keychain' && 'is-ok',
                            !remoteCredentialSource && !remoteDraft.apiKey && 'is-danger',
                          )}
                        >
                          {remoteCredentialSource === 'keychain'
                            ? rootCopy.credentialKeychain
                            : remoteCredentialSource === 'environment'
                              ? rootCopy.credentialEnvironment
                              : remoteDraft.apiKey
                                ? rootCopy.unsavedChanges
                                : rootCopy.credentialMissing}
                        </span>
                        <button
                          type="button"
                          className="settings-window-btn settings-window-btn-ghost"
                          disabled={!remoteCredentialSource && !remoteDraft.apiKey}
                          onClick={() => {
                            setRemoteDraft({ ...remoteDraft, apiKey: '', clearApiKey: true })
                            setRemoteCredentialSource(null)
                          }}
                        >
                          {rootCopy.clearApiKey}
                        </button>
                      </div>
                    </div>
                  </label>
                  <label>
                    <span>{copy.remoteEnvironment}</span>
                    <div className="settings-ai-secret-field">
                      <input
                        className="control-input mono"
                        value={remoteDraft.credentialEnvironment ?? ''}
                        onChange={(event) => setRemoteDraft({ ...remoteDraft, credentialEnvironment: event.target.value || null })}
                        placeholder="OPENAI_API_KEY"
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <div className="settings-ai-secret-meta">
                        <span className="settings-ai-tag">{copy.remoteEnvironmentFallback}</span>
                        <span>{copy.remoteEnvironmentHint}</span>
                      </div>
                    </div>
                  </label>
                </div>
                <div className="settings-semantic-disclose-row">
                  <div>
                    <p id="semantic-remote-upload-title">{copy.remoteUploadTitle}</p>
                    <small id="semantic-remote-upload-desc">
                      {copy.remoteDisclosure(index.sourceRecords, Math.max(1, Math.ceil(index.sourceRecords / 32)))}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={cx('settings-switch', confirmRemote && 'is-on')}
                    role="switch"
                    aria-checked={confirmRemote}
                    aria-labelledby="semantic-remote-upload-title"
                    aria-describedby="semantic-remote-upload-desc"
                    title={copy.confirmRemote}
                    onClick={() => setConfirmRemote((current) => !current)}
                  >
                    <span className="settings-switch-copy">{confirmRemote ? copy.confirmRemoteOn : copy.confirmRemoteOff}</span>
                    <span className="settings-switch-track" aria-hidden="true">
                      <span className="settings-switch-thumb" />
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {progress && progress.kind === 'index' ? (
            <div className="settings-semantic-dl">
              <div className="settings-semantic-dl-head">
                <div>
                  <p className="settings-semantic-dl-title">{copy.phaseLabels[progress.phase] ?? copy.indexing}</p>
                  <p className="settings-semantic-dl-sub">
                    {copy.indexProgress(progress.downloadedBytes, progress.totalBytes, progress.percentage)}
                  </p>
                </div>
              </div>
              <progress value={progress.percentage} max={100} aria-label={copy.indexing} />
            </div>
          ) : null}

          <div className="settings-semantic-divider" aria-hidden="true" />

          <div className="settings-semantic-block">
            <div className="settings-semantic-block-bar">
              <div>
                <p className="settings-semantic-section-label">{copy.step3Title}</p>
                <p className="settings-semantic-inline-note">
                  {copy.indexDesc(
                    index.indexedRecords,
                    index.sourceRecords,
                    index.pendingRecords,
                    verification?.fingerprint ?? model.revision ?? '',
                  )}
                </p>
                {indexBlockedReason ? <p className="settings-semantic-inline-warn">{indexBlockedReason}</p> : null}
              </div>
              <div className="settings-semantic-actions">
                <button
                  type="button"
                  className="settings-window-btn"
                  disabled={indexActionsDisabled}
                  title={indexBlockedReason ?? undefined}
                  onClick={() =>
                    void run(
                      'sync',
                      () =>
                        localization.syncSemanticIndex({
                          jobId: crypto.randomUUID(),
                          scopeIds: [],
                          confirmRemoteUpload: confirmRemote,
                        }),
                      { runningTitle: copy.indexing, successTitle: copy.actionSuccess },
                    )
                  }
                >
                  {copy.sync}
                </button>
                <button
                  type="button"
                  className="settings-window-btn"
                  disabled={indexActionsDisabled}
                  title={indexBlockedReason ?? undefined}
                  onClick={() =>
                    void run(
                      'rebuild',
                      () =>
                        localization.rebuildSemanticIndex({
                          jobId: crypto.randomUUID(),
                          scopeIds: [],
                          confirmRemoteUpload: confirmRemote,
                        }),
                      { runningTitle: copy.indexing, successTitle: copy.actionSuccess },
                    )
                  }
                >
                  {copy.rebuild}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-semantic-divider" aria-hidden="true" />

          <div className="settings-semantic-block">
            <p className="settings-semantic-section-label">{copy.step4Title}</p>
            <form
              className="settings-semantic-probe-row"
              onSubmit={(event) => {
                event.preventDefault()
                void runProbe()
              }}
            >
              <label htmlFor="semantic-probe-query">
                <span className="sr-only">{copy.probeQuery}</span>
                <input
                  id="semantic-probe-query"
                  className="control-input"
                  value={probeQuery}
                  placeholder={copy.probePlaceholder}
                  onChange={(event) => setProbeQuery(event.target.value)}
                  maxLength={2000}
                />
              </label>
              <button
                type="submit"
                className="settings-window-btn settings-window-btn-primary"
                disabled={!probeQuery.trim() || busy === 'probe'}
              >
                {busy === 'probe' ? copy.probeRunning : copy.probeRun}
              </button>
            </form>
            {probeResult ? (
              <div className="settings-semantic-probe-box">
                <div className="settings-semantic-probe-meta">
                  {copy.probeMeta(copy.retrievalModes[probeResult.retrievalMode], probeResult.totalCandidates, probeResult.elapsedMs)}
                </div>
                {probeResult.warnings.map((warning) => (
                  <p role="status" className="settings-semantic-probe-meta" key={warning}>
                    {warning}
                  </p>
                ))}
                <div className="settings-semantic-table-scroll">
                  <table className="settings-semantic-data">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{copy.probeContext}</th>
                        <th>{copy.probeQuery}</th>
                        <th>{copy.probeMatchKind}</th>
                        <th>{copy.probeScore}</th>
                        <th>{copy.probeSemantic}</th>
                        <th>{copy.probeLexical}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {probeResult.records.map((record, rowIndex) => (
                        <tr key={`${record.sourceKind}:${record.sourceId}`}>
                          <td>{rowIndex + 1}</td>
                          <td>
                            <strong>{record.sourceKind === 'official' ? copy.probeOfficial : copy.probeMemory}</strong>
                            <span className="settings-semantic-data-sub">{record.context}</span>
                          </td>
                          <td>
                            <strong>{record.sourceText}</strong>
                            <span className="settings-semantic-data-sub">{record.targetText}</span>
                          </td>
                          <td>{record.matchKind}</td>
                          <td>{record.score.toFixed(3)}</td>
                          <td>{record.semanticSimilarity?.toFixed(3) ?? '—'}</td>
                          <td>{record.lexicalSimilarity.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!probeResult.records.length ? <p className="settings-ai-empty">{copy.probeEmpty}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <footer className="settings-ai-dock">
        <div className="settings-ai-dock-meta">
          <strong>{dirty ? copy.dockUnsaved : copy.dockSaved}</strong>
          {dirty ? <span className="settings-ai-tag is-dirty">{rootCopy.dirtyTag}</span> : null}
          {busy === 'index' ? <span>{copy.indexing}</span> : null}
          {busy === 'verify' ? <span>{copy.verifying}</span> : null}
        </div>
        <div className="settings-window-actions">
          {mode === 'remote-openai' ? (
            <button
              type="button"
              className="settings-window-btn"
              disabled={dirty || Boolean(busy)}
              title={dirty ? rootCopy.saveBeforeRemoteActions : undefined}
              onClick={() => void testRemote()}
            >
              {busy === 'test' ? rootCopy.testing : copy.testConnection}
            </button>
          ) : null}
          <button
            type="button"
            className="settings-window-btn settings-window-btn-primary"
            disabled={!dirty || Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === 'save' ? copy.saving : copy.save}
          </button>
        </div>
      </footer>
      <Dialog
        open={verificationOpen && Boolean(verification)}
        onClose={() => setVerificationOpen(false)}
        labelledBy={verificationTitleId}
        stack
        size="lg"
      >
        <DialogHeader
          id={verificationTitleId}
          title={copy.verificationTitle}
          subtitle={verification ? copy.verificationPassed : undefined}
          onClose={() => setVerificationOpen(false)}
          closeLabel={copy.verificationClose}
        />
        <DialogBody>
          {verification ? (
            <>
              <dl className="settings-ai-result-grid">
                <div>
                  <dt>{copy.currentState}</dt>
                  <dd className="is-ok">{copy.verificationPassed}</dd>
                </div>
                <div>
                  <dt>{copy.verificationDimensions}</dt>
                  <dd>{verification.dimensions}</dd>
                </div>
                <div>
                  <dt>{copy.verificationPooling}</dt>
                  <dd>{verification.pooling}</dd>
                </div>
                <div>
                  <dt>{copy.verificationNormalization}</dt>
                  <dd>{verification.normalized ? 'L2' : copy.unavailable}</dd>
                </div>
                <div>
                  <dt>{copy.verificationFingerprint}</dt>
                  <dd className="mono">{verification.fingerprint}</dd>
                </div>
                <div>
                  <dt>{copy.verificationTime}</dt>
                  <dd>
                    <time dateTime={new Date(verification.verifiedAtMs).toISOString()}>
                      {new Date(verification.verifiedAtMs).toLocaleString()}
                    </time>
                  </dd>
                </div>
              </dl>
              <p className="settings-window-group-label" style={{ marginTop: '1rem' }}>
                {copy.verificationFiles}
              </p>
              <div className="settings-ai-result-files">
                {verification.files.map((file) => (
                  <div key={file.relativePath}>
                    <strong className="mono" title={file.relativePath}>
                      {file.relativePath}
                    </strong>
                    <span>{bytes(file.sizeBytes)}</span>
                    <span className="mono" title={`${copy.verificationSha256}: ${file.sha256}`}>
                      {file.sha256.slice(0, 12)}…
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogAction tone="primary" onClick={() => setVerificationOpen(false)}>
            {copy.verificationClose}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </section>
  )
}
