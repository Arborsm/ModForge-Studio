import { BookText, Bot, Database, Download, ScanSearch, Settings2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useAi } from '@entities/ai'
import { useAiLocalizationCopy } from '@locales/provider'
import type { AiLocalizationScope, LocalizationScopeSettings } from '@shared/contracts'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { KnowledgeCenterView, type KnowledgeTab } from './KnowledgeCenterView'
import { OfficialCorpusView } from './OfficialCorpusView'
import { QualityHistoryView } from './QualityHistoryView'
import { isString, useAiLocalizationPersistentState } from '../model/localizationPageState'

type Tab = 'overview' | 'knowledge' | 'official' | 'quality'
type MobileRegion = 'scope' | 'content'

const supportedLocales = [
  'en-US',
  'de-DE',
  'es-ES',
  'fr-FR',
  'hu-HU',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'pt-BR',
  'ru-RU',
  'tr-TR',
  'zh-CN',
  'zh-TW',
]
const localeOptions = supportedLocales.map((locale) => ({ value: locale, label: locale }))

export type AiLocalizationViewProps = {
  gameDirectory?: string | null
  onOpenAiSettings?: () => void
}

export function AiLocalizationView({ gameDirectory = null, onOpenAiSettings }: AiLocalizationViewProps) {
  const copy = useAiLocalizationCopy()
  const localization = useLocalization()
  const publish = useNotificationPublisher()
  const [storedTab, setTab] = useAiLocalizationPersistentState('tab', 'overview', isString)
  const tab: Tab = ['overview', 'knowledge', 'official', 'quality'].includes(storedTab) ? (storedTab as Tab) : 'overview'
  const [storedKnowledgeTab, setKnowledgeTab] = useAiLocalizationPersistentState('knowledge-tab', 'glossary', isString)
  const knowledgeTab: KnowledgeTab = ['glossary', 'memory', 'style'].includes(storedKnowledgeTab)
    ? (storedKnowledgeTab as KnowledgeTab)
    : 'glossary'
  const [storedRegion, setRegion] = useAiLocalizationPersistentState('region', 'content', isString)
  const region: MobileRegion = storedRegion === 'scope' ? 'scope' : 'content'
  const [scopeId, setScopeId] = useAiLocalizationPersistentState('scope', '', isString)
  const [sourceLocale, setSourceLocale] = useAiLocalizationPersistentState('source-locale', 'en-US', isString)
  const [targetLocale, setTargetLocale] = useAiLocalizationPersistentState('target-locale', 'zh-CN', isString)
  const [scopeQuery, setScopeQuery] = useState('')
  const [scopes, setScopes] = useState<AiLocalizationScope[]>([])
  const [loadingScopes, setLoadingScopes] = useState(true)
  const [scopeError, setScopeError] = useState(false)
  const [scopeRetryToken, setScopeRetryToken] = useState(0)
  const [contentRevision, setContentRevision] = useState(0)
  const runScopeLoad = useLatestTask('ai-localization-shell-scopes')
  const activeSourceLocale = supportedLocales.includes(sourceLocale) ? sourceLocale : 'en-US'
  const activeTargetLocale = supportedLocales.includes(targetLocale) ? targetLocale : 'zh-CN'
  const activeLocalePair = `${activeSourceLocale}:${activeTargetLocale}`
  const selectedScope = scopes.find((scope) => scope.id === scopeId) ?? null

  useEffect(() => {
    void runScopeLoad(async (task) => {
      setLoadingScopes(true)
      try {
        const page = await localization.listScopes({ query: null, offset: 0, limit: 200 })
        if (!task.isCurrent()) return
        setScopes(page.records)
        setScopeError(false)
        setScopeId((current) => (page.records.some((scope) => scope.id === current) ? current : (page.records[0]?.id ?? '')))
      } finally {
        if (task.isCurrent()) setLoadingScopes(false)
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) {
        setLoadingScopes(false)
        setScopeError(true)
      }
    })
  }, [localization, runScopeLoad, scopeRetryToken, setScopeId])

  const tabs = [
    ['overview', copy.overviewTab],
    ['knowledge', copy.knowledgeTab],
    ['official', copy.officialTab],
    ['quality', copy.qualityTab],
  ] as const
  const normalizedScopeQuery = scopeQuery.trim().toLocaleLowerCase()
  const visibleScopes = normalizedScopeQuery
    ? scopes.filter((scope) => `${scope.name} ${scope.bindingValue ?? ''}`.toLocaleLowerCase().includes(normalizedScopeQuery))
    : scopes

  const transferKnowledgePack = async (direction: 'import' | 'export') => {
    if (!scopeId) return
    try {
      const path =
        direction === 'import'
          ? await localization.chooseKnowledgeImport('knowledge-pack-json')
          : await localization.chooseKnowledgeExport('knowledge-pack-json')
      if (!path) return
      if (direction === 'import') {
        await localization.importKnowledge({ jobId: crypto.randomUUID(), scopeId, sourcePath: path, format: 'knowledge-pack-json' })
        setScopeRetryToken((value) => value + 1)
        setContentRevision((value) => value + 1)
      } else {
        await localization.exportKnowledge({
          scopeId,
          destinationPath: path,
          format: 'knowledge-pack-json',
          sourceLocale: activeSourceLocale,
          targetLocale: activeTargetLocale,
          query: null,
        })
      }
    } catch {
      publish({ id: 'ai-localization-transfer-error', level: 'error', title: copy.knowledgeError, description: copy.knowledgeError })
    }
  }

  return (
    <div className="ai-localization-center" data-mobile-region={region}>
      <header className="ai-localization-session">
        <div className="ai-localization-session-title">
          <strong>{copy.title}</strong>
          <span>{selectedScope?.kind === 'global' ? copy.globalScope : selectedScope?.name}</span>
        </div>
        <div className="ai-localization-session-actions">
          <div className="ai-localization-locale-pair">
            <CompactSelect
              value={activeSourceLocale}
              options={localeOptions}
              onChange={setSourceLocale}
              ariaLabel={copy.sourceLocale}
              triggerClassName="ai-localization-locale-trigger"
              menuClassName="ai-localization-locale-menu"
            />
            <span aria-hidden>→</span>
            <CompactSelect
              value={activeTargetLocale}
              options={localeOptions}
              onChange={setTargetLocale}
              ariaLabel={copy.targetLocale}
              triggerClassName="ai-localization-locale-trigger"
              menuClassName="ai-localization-locale-menu"
            />
          </div>
          <button
            type="button"
            className="control-button control-button-quiet"
            disabled={!scopeId}
            onClick={() => void transferKnowledgePack('import')}
          >
            <Upload className="h-4 w-4" />
            {copy.importKnowledgePack}
          </button>
          <button
            type="button"
            className="control-button control-button-quiet"
            disabled={!scopeId}
            onClick={() => void transferKnowledgePack('export')}
          >
            <Download className="h-4 w-4" />
            {copy.exportKnowledgePack}
          </button>
          {onOpenAiSettings ? (
            <button type="button" className="control-button" onClick={onOpenAiSettings}>
              <Settings2 className="h-4 w-4" />
              {copy.aiSettings}
            </button>
          ) : null}
        </div>
      </header>

      <div className="ai-localization-region-tabs" role="tablist" aria-label={copy.title}>
        {(
          [
            ['scope', copy.scopeRegion],
            ['content', copy.contentRegion],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={region === id} onClick={() => setRegion(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ai-localization-shell">
        <aside className="ai-localization-scope ai-localization-scope-rail">
          <label className="ai-localization-scope-search">
            <span>{copy.scopeRegion}</span>
            <input
              className="control-input"
              value={scopeQuery}
              placeholder={copy.searchScopes}
              onChange={(event) => setScopeQuery(event.target.value)}
            />
          </label>
          <div className="ai-localization-scope-list">
            {visibleScopes.map((scope) => (
              <button
                key={scope.id}
                type="button"
                className={scope.id === scopeId ? 'is-active' : ''}
                onClick={() => {
                  setScopeId(scope.id)
                  setRegion('content')
                }}
              >
                <Database className="h-4 w-4" />
                <span>
                  <strong>{scope.kind === 'global' ? copy.globalScope : scope.name}</strong>
                  <small>{scope.kind === 'global' ? `${activeSourceLocale} → ${activeTargetLocale}` : scope.bindingValue}</small>
                </span>
              </button>
            ))}
            {scopeError ? (
              <div className="ai-localization-scope-error">
                <p>{copy.knowledgeError}</p>
                <button type="button" className="control-button" onClick={() => setScopeRetryToken((value) => value + 1)}>
                  {copy.retry}
                </button>
              </div>
            ) : !loadingScopes && !visibleScopes.length ? (
              <p className="ai-localization-empty">{copy.noScopes}</p>
            ) : null}
          </div>
        </aside>

        <section className="ai-localization-workarea">
          <nav className="ai-localization-tabs" role="tablist">
            {tabs.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'is-active' : ''}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault()
                  const direction = event.key === 'ArrowRight' ? 1 : -1
                  const nextIndex = (index + direction + tabs.length) % tabs.length
                  setTab(tabs[nextIndex][0])
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ai-localization-tab-content">
            {tab === 'overview' ? (
              <AiLocalizationOverview
                key={`overview:${scopeId}:${activeLocalePair}:${contentRevision}`}
                scope={selectedScope}
                sourceLocale={activeSourceLocale}
                targetLocale={activeTargetLocale}
                gameDirectory={gameDirectory}
                onOpenKnowledge={(subTab) => {
                  setKnowledgeTab(subTab)
                  setTab('knowledge')
                }}
                onOpenTab={setTab}
                onScopeChange={(nextScope) => setScopes((current) => current.map((item) => (item.id === nextScope.id ? nextScope : item)))}
              />
            ) : tab === 'official' ? (
              <OfficialCorpusView
                key={`${activeLocalePair}:${contentRevision}`}
                scopes={scopes}
                activeScopeId={scopeId}
                sourceLocale={activeSourceLocale}
                targetLocale={activeTargetLocale}
              />
            ) : tab === 'quality' ? (
              <QualityHistoryView scopeId={scopeId} />
            ) : (
              <div className="ai-localization-knowledge" data-knowledge-tab={knowledgeTab}>
                <nav className="ai-localization-subtabs" role="tablist" aria-label={copy.knowledgeTab}>
                  {(
                    [
                      ['glossary', copy.glossaryTab],
                      ['memory', copy.memoryTab],
                      ['style', copy.styleTab],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={knowledgeTab === id}
                      className={knowledgeTab === id ? 'is-active' : ''}
                      onClick={() => setKnowledgeTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <KnowledgeCenterView
                  key={`${knowledgeTab}:${scopeId}:${activeLocalePair}:${contentRevision}`}
                  tab={knowledgeTab}
                  scopes={scopes}
                  scopeId={scopeId}
                  sourceLocale={activeSourceLocale}
                  targetLocale={activeTargetLocale}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function AiLocalizationOverview({
  scope,
  sourceLocale,
  targetLocale,
  gameDirectory,
  onOpenKnowledge,
  onOpenTab,
  onScopeChange,
}: {
  scope: AiLocalizationScope | null
  sourceLocale: string
  targetLocale: string
  gameDirectory: string | null
  onOpenKnowledge: (subTab: KnowledgeTab) => void
  onOpenTab: (tab: Tab) => void
  onScopeChange: (scope: AiLocalizationScope) => void
}) {
  const copy = useAiLocalizationCopy()
  const localization = useLocalization()
  const ai = useAi()
  const [stats, setStats] = useState({ glossary: 0, memory: 0, reviews: 0, critical: 0, corpusReady: false })
  const [settings, setSettings] = useState<LocalizationScopeSettings | null>(null)
  const [engineOptions, setEngineOptions] = useState<Array<{ value: string; label: string }>>([])
  const [reviewOptions, setReviewOptions] = useState<Array<{ value: string; label: string }>>([])
  const [bindingKind, setBindingKind] = useState('project-unique-id')
  const [bindingValue, setBindingValue] = useState('')
  const [statsError, setStatsError] = useState(false)
  const [settingsError, setSettingsError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const runLoad = useLatestTask('ai-localization-overview')
  const runSettingsLoad = useLatestTask('ai-localization-overview-settings')

  useEffect(() => {
    if (!scope) return
    void runLoad(async (task) => {
      const [glossary, memory, reviews, corpus] = await Promise.all([
        localization.listGlossary({ scopeId: scope.id, sourceLocale, targetLocale, query: null, offset: 0, limit: 1 }),
        localization.searchMemory({ scopeId: scope.id, sourceLocale, targetLocale, query: null, offset: 0, limit: 1 }),
        localization.listReviewRuns({ scopeId: scope.id, offset: 0, limit: 20 }),
        gameDirectory ? localization.inspectOfficialIndex(gameDirectory) : Promise.resolve(null),
      ])
      if (!task.isCurrent()) return
      setStatsError(false)
      setStats({
        glossary: glossary.total,
        memory: memory.total,
        reviews: reviews.records.filter((review) => review.summary.critical > 0).length,
        critical: reviews.records.reduce((total, review) => total + review.summary.critical, 0),
        corpusReady: Boolean(corpus?.indexed && !corpus.stale),
      })
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) setStatsError(true)
    })
  }, [gameDirectory, localization, retryToken, runLoad, scope, sourceLocale, targetLocale])

  useEffect(() => {
    if (!scope) return
    setBindingKind(scope.bindingKind ?? 'project-unique-id')
    setBindingValue(scope.bindingValue ?? '')
    void runSettingsLoad(async (task) => {
      const [snapshot, generative, machine] = await Promise.all([
        localization.loadScope(scope.id),
        ai.loadSettings(),
        localization.loadMachineTranslationSettings(),
      ])
      if (!task.isCurrent()) return
      setSettings(snapshot.settings)
      setEngineOptions([
        { value: '', label: copy.noDefault },
        ...generative.profiles.map((profile) => ({ value: `generative-ai:${profile.id}`, label: profile.name })),
        ...machine.profiles.map((profile) => ({ value: `machine-translation:${profile.id}`, label: profile.name })),
      ])
      setReviewOptions([
        { value: '', label: copy.noDefault },
        ...generative.profiles.map((profile) => ({ value: profile.id, label: profile.name })),
      ])
      setSettingsError(false)
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) setSettingsError(true)
    })
  }, [ai, copy.noDefault, localization, retryToken, runSettingsLoad, scope])

  const saveDefaults = async () => {
    if (!settings) return
    try {
      const snapshot = await localization.saveScopeSettings(settings)
      setSettings(snapshot.settings)
      setSettingsError(false)
    } catch {
      setSettingsError(true)
    }
  }
  const rebind = async () => {
    if (!scope || scope.kind !== 'project' || !bindingValue.trim()) return
    try {
      const snapshot = await localization.rebindScope(scope.id, bindingKind, bindingValue.trim())
      onScopeChange(snapshot.scope)
      setSettingsError(false)
    } catch {
      setSettingsError(true)
    }
  }

  if (!scope) return <p className="ai-localization-empty">{copy.noScopes}</p>
  return (
    <div className="ai-localization-overview">
      {statsError || settingsError ? (
        <div className="settings-ai-error" role="alert">
          <span>{copy.knowledgeError}</span>
          <button type="button" className="control-button" onClick={() => setRetryToken((value) => value + 1)}>
            {copy.retry}
          </button>
        </div>
      ) : null}
      <header>
        <h1>{scope.kind === 'global' ? copy.globalScope : scope.name}</h1>
        <p>
          {sourceLocale} → {targetLocale}
        </p>
      </header>
      <div className="ai-localization-overview-stats">
        <button type="button" onClick={() => onOpenKnowledge('glossary')}>
          <span className="ai-localization-stat-icon">
            <BookText className="h-5 w-5" />
          </span>
          <span className="ai-localization-stat-body">
            <span>{copy.glossaryTab}</span>
            <strong>{stats.glossary}</strong>
          </span>
        </button>
        <button type="button" onClick={() => onOpenKnowledge('memory')}>
          <span className="ai-localization-stat-icon">
            <Bot className="h-5 w-5" />
          </span>
          <span className="ai-localization-stat-body">
            <span>{copy.memoryTab}</span>
            <strong>{stats.memory}</strong>
          </span>
        </button>
        <button type="button" data-tone={stats.reviews > 0 ? 'warn' : undefined} onClick={() => onOpenTab('quality')}>
          <span className="ai-localization-stat-icon">
            <ScanSearch className="h-5 w-5" />
          </span>
          <span className="ai-localization-stat-body">
            <span>{copy.reviewOpen}</span>
            <strong>{stats.reviews}</strong>
          </span>
        </button>
        <button type="button" data-tone={stats.corpusReady ? 'ready' : undefined} onClick={() => onOpenTab('official')}>
          <span className="ai-localization-stat-icon">
            <Database className="h-5 w-5" />
          </span>
          <span className="ai-localization-stat-body">
            <span>{copy.officialTab}</span>
            <strong>{stats.corpusReady ? copy.indexReadyShort : copy.indexMissingShort}</strong>
          </span>
        </button>
      </div>
      <section className="ai-localization-health-panel">
        <header>
          <strong>{copy.needsAttention}</strong>
          <span>{stats.reviews}</span>
        </header>
        {stats.reviews ? (
          <button type="button" onClick={() => onOpenTab('quality')}>
            <span>
              <strong>{copy.openReviewRuns(stats.reviews)}</strong>
              <small>{copy.criticalIssues(stats.critical)}</small>
            </span>
            <span aria-hidden>→</span>
          </button>
        ) : (
          <p>{copy.noAttentionItems}</p>
        )}
      </section>
      {settings ? (
        <section className="ai-localization-defaults-panel">
          <header>
            <strong>{copy.saveDefaults}</strong>
          </header>
          <div>
            <label>
              <span>{copy.defaultEngine}</span>
              <CompactSelect
                value={
                  settings.defaultEngineKind && settings.defaultEngineProfileId
                    ? `${settings.defaultEngineKind}:${settings.defaultEngineProfileId}`
                    : ''
                }
                options={engineOptions}
                onChange={(value) => {
                  const [kind, profileId] = value.split(':')
                  setSettings({ ...settings, defaultEngineKind: kind || null, defaultEngineProfileId: profileId || null })
                }}
                ariaLabel={copy.defaultEngine}
                placement="bottom-start"
              />
            </label>
            <label>
              <span>{copy.defaultReviewProfile}</span>
              <CompactSelect
                value={settings.reviewProfileId ?? ''}
                options={reviewOptions}
                onChange={(reviewProfileId) => setSettings({ ...settings, reviewProfileId: reviewProfileId || null })}
                ariaLabel={copy.defaultReviewProfile}
                placement="bottom-start"
              />
            </label>
            <label className="ai-localization-check">
              <input
                type="checkbox"
                checked={settings.autoReview}
                onChange={(event) => setSettings({ ...settings, autoReview: event.target.checked })}
              />
              <span>{copy.automaticReview}</span>
            </label>
            <button type="button" className="control-button" onClick={() => void saveDefaults()}>
              {copy.save}
            </button>
          </div>
        </section>
      ) : null}
      {scope.kind === 'project' ? (
        <section className="ai-localization-defaults-panel">
          <header>
            <strong>{copy.rebindProject}</strong>
          </header>
          <div>
            <label>
              <span>{copy.bindingKind}</span>
              <CompactSelect
                value={bindingKind}
                options={Object.entries(copy.bindingKinds).map(([value, label]) => ({ value, label }))}
                onChange={setBindingKind}
                ariaLabel={copy.bindingKind}
                placement="bottom-start"
              />
            </label>
            <label>
              <span>{copy.bindingValue}</span>
              <input className="control-input" value={bindingValue} onChange={(event) => setBindingValue(event.target.value)} />
            </label>
            <button type="button" className="control-button" disabled={!bindingValue.trim()} onClick={() => void rebind()}>
              {copy.rebindProject}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
