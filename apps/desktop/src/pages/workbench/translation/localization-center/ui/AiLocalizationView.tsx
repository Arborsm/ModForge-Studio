import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  LoaderCircle,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { detectDefaultGameDirectory, listKnownGameDirectories } from '@entities/game/api'
import { useLocalization } from '@entities/localization'
import { useAi } from '@entities/ai'
import { useAiLocalizationCopy } from '@locales/provider'
import type { AiLocalizationScope, AiSemanticSearchMode, LocalizationScopeSettings } from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { KnowledgeCenterView, type KnowledgeTab } from './KnowledgeCenterView'
import { OfficialCorpusView } from './OfficialCorpusView'
import { QualityHistoryView } from './QualityHistoryView'
import { isString, useAiLocalizationPersistentState } from '../model/localizationPageState'
import { errorDetail } from '../model/errorDetail'

type Tab = 'overview' | 'glossary' | 'memory' | 'style' | 'official' | 'quality'

const PROFILE_NOTICE = 'ai-localization-profile-error'
const TRANSFER_NOTICE = 'ai-localization-transfer-error'
const OVERVIEW_NOTICE = 'ai-localization-overview-error'

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
  const tab: Tab = ['overview', 'glossary', 'memory', 'style', 'official', 'quality'].includes(storedTab)
    ? (storedTab as Tab)
    : storedTab === 'knowledge'
      ? 'glossary'
      : 'overview'
  const [, setKnowledgeTab] = useAiLocalizationPersistentState('knowledge-tab', 'glossary', isString)
  const [scopeId, setScopeId] = useAiLocalizationPersistentState('scope', '', isString)
  const [sourceLocale, setSourceLocale] = useAiLocalizationPersistentState('source-locale', 'en-US', isString)
  const [targetLocale, setTargetLocale] = useAiLocalizationPersistentState('target-locale', 'zh-CN', isString)
  const [scopeQuery, setScopeQuery] = useState('')
  const [scopes, setScopes] = useState<AiLocalizationScope[]>([])
  const [loadingScopes, setLoadingScopes] = useState(true)
  const [scopeError, setScopeError] = useState(false)
  const [scopeRetryToken, setScopeRetryToken] = useState(0)
  const [contentRevision, setContentRevision] = useState(0)
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [renamingScopeId, setRenamingScopeId] = useState<string | null>(null)
  const [renamingProfileName, setRenamingProfileName] = useState('')
  const runScopeLoad = useLatestTask('ai-localization-shell-scopes')
  const activeSourceLocale = supportedLocales.includes(sourceLocale) ? sourceLocale : 'en-US'
  const activeTargetLocale = supportedLocales.includes(targetLocale) ? targetLocale : 'zh-CN'
  const activeLocalePair = `${activeSourceLocale}:${activeTargetLocale}`
  const selectedScope = scopes.find((scope) => scope.id === scopeId) ?? null

  useEffect(() => {
    if (selectedScope?.kind === 'profile' && tab === 'official') setTab('overview')
  }, [selectedScope?.kind, setTab, tab])

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

  const tabs: Array<readonly [Tab, string]> = [
    ['overview', copy.overviewTab],
    ['glossary', copy.glossaryTab],
    ['memory', copy.memoryTab],
    ['style', copy.styleTab],
    ['quality', copy.qualityTab],
    ...(selectedScope?.kind === 'global' ? ([['official', copy.officialTab]] as const) : []),
  ]
  const normalizedScopeQuery = scopeQuery.trim().toLocaleLowerCase()
  const visibleScopes = normalizedScopeQuery
    ? scopes.filter((scope) =>
        [scope.name, ...scope.bindings.map((binding) => binding.value)].join(' ').toLocaleLowerCase().includes(normalizedScopeQuery),
      )
    : scopes

  const refreshScopes = () => setScopeRetryToken((value) => value + 1)
  const failProfileAction = (error: unknown) => {
    publish({ id: PROFILE_NOTICE, level: 'error', title: copy.knowledgeError, description: errorDetail(error) })
  }
  const createProfile = async () => {
    const name = newProfileName.trim()
    if (!name) return
    try {
      const snapshot = await localization.createProfile(name)
      setCreatingProfile(false)
      setNewProfileName('')
      refreshScopes()
      setScopeId(snapshot.scope.id)
      dismissNotification(PROFILE_NOTICE)
    } catch (error) {
      failProfileAction(error)
    }
  }
  const startRenameProfile = (scope: AiLocalizationScope) => {
    setRenamingScopeId(scope.id)
    setRenamingProfileName(scope.name)
  }
  const renameProfile = async (scope: AiLocalizationScope) => {
    const name = renamingProfileName.trim()
    if (!name) return
    try {
      await localization.renameProfile(scope.id, name)
      setRenamingScopeId(null)
      refreshScopes()
      dismissNotification(PROFILE_NOTICE)
    } catch (error) {
      failProfileAction(error)
    }
  }
  const deleteProfile = async (scope: AiLocalizationScope) => {
    if (!window.confirm(copy.profileDeleteConfirm(scope.name))) return
    try {
      await localization.deleteProfile(scope.id)
      if (scope.id === scopeId) {
        setScopeId(scopes.find((item) => item.kind === 'global')?.id ?? '')
      }
      refreshScopes()
      dismissNotification(PROFILE_NOTICE)
    } catch (error) {
      failProfileAction(error)
    }
  }

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
      dismissNotification(TRANSFER_NOTICE)
    } catch (error) {
      publish({ id: TRANSFER_NOTICE, level: 'error', title: copy.knowledgeError, description: errorDetail(error) })
    }
  }

  return (
    <div className="ai-localization-center" data-guide-surface="workbench.translation">
      <div className="ai-localization-shell">
        <header className="ai-localization-workarea-head">
          <nav className="ai-localization-tabs" role="tablist" data-guide="translation-views">
            {tabs.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
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
              className="control-button h-8 px-3 text-xs"
              disabled={!scopeId}
              onClick={() => void transferKnowledgePack('import')}
            >
              <Upload className="h-4 w-4" />
              {copy.importAction}
            </button>
            <button
              type="button"
              className="control-button h-8 px-3 text-xs"
              disabled={!scopeId}
              onClick={() => void transferKnowledgePack('export')}
            >
              <Download className="h-4 w-4" />
              {copy.exportAction}
            </button>
            {onOpenAiSettings ? (
              <button type="button" className="control-button h-8 px-3 text-xs" onClick={onOpenAiSettings}>
                <Settings2 className="h-4 w-4" />
                {copy.aiSettings}
              </button>
            ) : null}
          </div>
        </header>
        <aside className="ai-localization-scope-rail">
          <div className="ai-localization-scope-search">
            <div className="ai-localization-scope-search-head">
              <span>{copy.scopeRegion}</span>
            </div>
            <input
              className="control-input"
              value={scopeQuery}
              placeholder={copy.searchScopes}
              onChange={(event) => setScopeQuery(event.target.value)}
            />
            {creatingProfile ? (
              <div className="ai-localization-scope-create">
                <input
                  className="control-input"
                  value={newProfileName}
                  placeholder={copy.profileNamePlaceholder}
                  aria-label={copy.profileNamePlaceholder}
                  onChange={(event) => setNewProfileName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createProfile()
                    if (event.key === 'Escape') setCreatingProfile(false)
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  disabled={!newProfileName.trim()}
                  title={copy.profileCreate}
                  aria-label={copy.profileCreate}
                  onClick={() => void createProfile()}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="ai-localization-scope-list">
            {visibleScopes.map((scope, index) => {
              const showSection = index === 0 || visibleScopes[index - 1]?.kind !== scope.kind
              return (
                <Fragment key={scope.id}>
                  {showSection ? (
                    <div className="ai-localization-scope-section-label">
                      {scope.kind === 'global' ? copy.scopeShared : copy.scopePlans}
                    </div>
                  ) : null}
                  {renamingScopeId === scope.id ? (
                    <div key={scope.id} className="ai-localization-scope-row is-editing">
                      <input
                        className="control-input"
                        value={renamingProfileName}
                        placeholder={copy.profileNamePlaceholder}
                        aria-label={copy.profileRename}
                        onChange={(event) => setRenamingProfileName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void renameProfile(scope)
                          if (event.key === 'Escape') setRenamingScopeId(null)
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        disabled={!renamingProfileName.trim()}
                        title={copy.profileRename}
                        aria-label={copy.profileRename}
                        onClick={() => void renameProfile(scope)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div key={scope.id} className={cx('ai-localization-scope-row', scope.id === scopeId && 'is-active')}>
                      <button
                        type="button"
                        className="ai-localization-scope-row-main"
                        onClick={() => {
                          setScopeId(scope.id)
                        }}
                      >
                        <div className="ai-localization-scope-text">
                          <span className="ai-localization-scope-name">{scope.kind === 'global' ? copy.globalScope : scope.name}</span>
                          <span className="ai-localization-scope-meta">
                            {scope.kind === 'global'
                              ? `${activeSourceLocale} → ${activeTargetLocale}`
                              : scope.bindings.length
                                ? copy.profileBindingCount(scope.bindings.length)
                                : copy.profileUnbound}
                          </span>
                        </div>
                      </button>
                      {scope.kind === 'profile' ? (
                        <span className="ai-localization-scope-row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            title={copy.profileRename}
                            aria-label={copy.profileRename}
                            onClick={() => startRenameProfile(scope)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            title={copy.profileDelete}
                            aria-label={copy.profileDelete}
                            onClick={() => void deleteProfile(scope)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : null}
                    </div>
                  )}
                </Fragment>
              )
            })}
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
          <div className="ai-localization-scope-foot">
            <button
              type="button"
              className="control-button"
              onClick={() => {
                setNewProfileName('')
                setCreatingProfile(true)
              }}
            >
              <Plus className="h-4 w-4" />
              {copy.profileCreate}
            </button>
          </div>
        </aside>

        <section className="ai-localization-workarea">
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
                  setTab(subTab)
                }}
                onOpenTab={setTab}
                onOpenOfficialCorpus={() => {
                  const globalScope = scopes.find((item) => item.kind === 'global')
                  if (globalScope) setScopeId(globalScope.id)
                  setTab('official')
                }}
                onOpenAiSettings={onOpenAiSettings}
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
              <KnowledgeCenterView
                key={`${tab}:${scopeId}:${activeLocalePair}:${contentRevision}`}
                tab={tab as KnowledgeTab}
                scopes={scopes}
                scopeId={scopeId}
                sourceLocale={activeSourceLocale}
                targetLocale={activeTargetLocale}
              />
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
  onOpenOfficialCorpus,
  onOpenAiSettings,
}: {
  scope: AiLocalizationScope | null
  sourceLocale: string
  targetLocale: string
  gameDirectory: string | null
  onOpenKnowledge: (subTab: KnowledgeTab) => void
  onOpenTab: (tab: Tab) => void
  onOpenOfficialCorpus: () => void
  onOpenAiSettings?: () => void
}) {
  const copy = useAiLocalizationCopy()
  const localization = useLocalization()
  const ai = useAi()
  const publish = useNotificationPublisher()
  const [stats, setStats] = useState({ glossary: 0, memory: 0, reviews: 0, critical: 0 })
  const [readiness, setReadiness] = useState<{
    corpusInspected: boolean
    semanticInspected: boolean
    corpusReady: boolean
    semanticMode: AiSemanticSearchMode | null
    semanticReady: boolean
  }>({ corpusInspected: false, semanticInspected: false, corpusReady: false, semanticMode: null, semanticReady: false })
  const [settings, setSettings] = useState<LocalizationScopeSettings | null>(null)
  const [engineOptions, setEngineOptions] = useState<Array<{ value: string; label: string }>>([])
  const [reviewOptions, setReviewOptions] = useState<Array<{ value: string; label: string }>>([])
  const [retryToken, setRetryToken] = useState(0)
  const runLoad = useLatestTask('ai-localization-overview')
  const runReadinessLoad = useLatestTask('ai-localization-overview-readiness')
  const runSemanticReadinessLoad = useLatestTask('ai-localization-overview-semantic-readiness')
  const runSettingsLoad = useLatestTask('ai-localization-overview-settings')
  const overviewFailures = useRef(new Set<'stats' | 'corpus' | 'semantic' | 'settings'>())
  const failOverview = (key: 'stats' | 'corpus' | 'semantic' | 'settings', error: unknown) => {
    overviewFailures.current.add(key)
    publish({
      id: OVERVIEW_NOTICE,
      level: 'error',
      eyebrow: copy.projectMessage,
      title: copy.knowledgeError,
      description: errorDetail(error),
      action: { label: copy.retry, callback: () => setRetryToken((value) => value + 1), tone: 'primary' },
    })
  }
  const clearOverviewFailure = (key: 'stats' | 'corpus' | 'semantic' | 'settings') => {
    overviewFailures.current.delete(key)
    if (overviewFailures.current.size === 0) dismissNotification(OVERVIEW_NOTICE)
  }

  useEffect(() => {
    if (!scope) return
    void runLoad(async (task) => {
      const [glossary, memory, reviews] = await Promise.all([
        localization.listGlossary({ scopeId: scope.id, sourceLocale, targetLocale, query: null, offset: 0, limit: 1 }),
        localization.searchMemory({ scopeId: scope.id, sourceLocale, targetLocale, query: null, offset: 0, limit: 1 }),
        localization.listReviewRuns({ scopeId: scope.id, offset: 0, limit: 20 }),
      ])
      if (!task.isCurrent()) return
      setStats({
        glossary: glossary.total,
        memory: memory.total,
        reviews: reviews.records.filter((review) => review.summary.critical > 0).length,
        critical: reviews.records.reduce((total, review) => total + review.summary.critical, 0),
      })
      clearOverviewFailure('stats')
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) failOverview('stats', taskError)
    })
  }, [localization, retryToken, runLoad, scope, sourceLocale, targetLocale])

  useEffect(() => {
    if (!scope) return
    void runReadinessLoad(async (task) => {
      const [knownResult, detectedResult] = await Promise.allSettled([listKnownGameDirectories(), detectDefaultGameDirectory()])
      const knownDirectories = knownResult.status === 'fulfilled' ? knownResult.value : []
      const detectedDirectory = detectedResult.status === 'fulfilled' ? detectedResult.value : null
      const directories = [
        ...new Set([...(gameDirectory ? [gameDirectory] : []), ...(detectedDirectory ? [detectedDirectory] : []), ...knownDirectories]),
      ]
      const corpusResults = await Promise.allSettled(directories.map((directory) => localization.inspectOfficialIndex(directory)))
      const corpusStatuses = corpusResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const corpus =
        corpusStatuses.find((status) => status.indexed && !status.stale) ?? corpusStatuses.find((status) => status.indexed) ?? null
      if (!task.isCurrent()) return
      setReadiness((current) => ({
        ...current,
        corpusInspected: true,
        corpusReady: Boolean(corpus?.indexed),
      }))
      clearOverviewFailure('corpus')
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) {
        setReadiness((current) => ({ ...current, corpusInspected: true }))
        failOverview('corpus', taskError)
      }
    })
  }, [gameDirectory, localization, retryToken, runReadinessLoad, scope])

  useEffect(() => {
    if (!scope) return
    void runSemanticReadinessLoad(async (task) => {
      const settings = await localization.loadSemanticSettings()
      const modelResult = settings.mode === 'lexical' ? null : await localization.inspectSemanticModel()
      if (!task.isCurrent()) return
      setReadiness((current) => ({
        ...current,
        semanticInspected: true,
        semanticMode: settings.mode,
        semanticReady: settings.mode === 'lexical' || Boolean(modelResult?.available),
      }))
      clearOverviewFailure('semantic')
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) {
        setReadiness((current) => ({ ...current, semanticInspected: true }))
        failOverview('semantic', taskError)
      }
    })
  }, [localization, retryToken, runSemanticReadinessLoad, scope])

  useEffect(() => {
    if (!scope) return
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
      clearOverviewFailure('settings')
    }).catch((taskError) => {
      if (!(taskError instanceof TaskCancelledError)) failOverview('settings', taskError)
    })
  }, [ai, copy.noDefault, localization, retryToken, runSettingsLoad, scope])

  const saveDefaults = async () => {
    if (!settings) return
    try {
      const snapshot = await localization.saveScopeSettings(settings)
      setSettings(snapshot.settings)
      clearOverviewFailure('settings')
    } catch (error) {
      failOverview('settings', error)
    }
  }

  if (!scope) return <p className="ai-localization-empty">{copy.noScopes}</p>

  const readinessList = [
    {
      key: 'corpus',
      icon: readiness.corpusInspected ? (readiness.corpusReady ? CheckCircle2 : AlertTriangle) : LoaderCircle,
      title: copy.officialCorpusResource,
      description: !readiness.corpusInspected
        ? copy.resourceStatusLoading
        : readiness.corpusReady
          ? copy.officialCorpusReady
          : gameDirectory
            ? copy.officialCorpusMissing
            : copy.noGameDirectory,
      state: !readiness.corpusInspected
        ? copy.resourceStatusLoading
        : readiness.corpusReady
          ? copy.indexReadyShort
          : copy.indexMissingShort,
      tone: !readiness.corpusInspected ? 'loading' : readiness.corpusReady ? 'ready' : 'warn',
      action: readiness.corpusInspected && !readiness.corpusReady ? onOpenOfficialCorpus : undefined,
      actionLabel: copy.manageOfficialCorpus,
      actionIcon: Database,
    },
    {
      key: 'semantic',
      icon: !readiness.semanticInspected ? LoaderCircle : readiness.semanticReady ? CheckCircle2 : AlertTriangle,
      title: readiness.semanticInspected && readiness.semanticMode === 'lexical' ? copy.keywordSearchResource : copy.semanticModelResource,
      description: !readiness.semanticInspected
        ? copy.resourceStatusLoading
        : readiness.semanticMode === 'lexical'
          ? copy.keywordSearchReady
          : readiness.semanticReady
            ? copy.semanticModelReady
            : copy.semanticModelMissing,
      state: !readiness.semanticInspected
        ? copy.resourceStatusLoading
        : readiness.semanticMode === 'lexical'
          ? copy.noSemanticIndexRequired
          : readiness.semanticReady
            ? copy.semanticSearchReady
            : copy.semanticSearchNotReady,
      tone: !readiness.semanticInspected ? 'loading' : readiness.semanticReady ? 'ready' : 'warn',
      action:
        readiness.semanticInspected && readiness.semanticMode !== 'lexical' && !readiness.semanticReady && onOpenAiSettings
          ? onOpenAiSettings
          : undefined,
      actionLabel: copy.configureModel,
      actionIcon: Cpu,
    },
  ]

  return (
    <div className="ai-localization-overview">
      <section className="ai-localization-overview-section">
        <div className="ai-localization-metric-row">
          <button type="button" className="ai-localization-metric" onClick={() => onOpenKnowledge('glossary')}>
            <span className="ai-localization-metric-value">{stats.glossary}</span>
            <span className="ai-localization-metric-label">{copy.glossaryCountLabel}</span>
          </button>
          <button type="button" className="ai-localization-metric" onClick={() => onOpenKnowledge('memory')}>
            <span className="ai-localization-metric-value">{stats.memory}</span>
            <span className="ai-localization-metric-label">{copy.memoryCountLabel}</span>
          </button>
          <button
            type="button"
            className="ai-localization-metric"
            data-tone={stats.reviews > 0 ? 'warn' : undefined}
            onClick={() => onOpenTab('quality')}
          >
            <span className="ai-localization-metric-value">{stats.reviews}</span>
            <span className="ai-localization-metric-label">{copy.pendingCountLabel}</span>
          </button>
          <button
            type="button"
            className="ai-localization-metric"
            data-tone={readiness.corpusInspected && readiness.corpusReady ? undefined : 'danger'}
            onClick={onOpenOfficialCorpus}
          >
            <span className="ai-localization-metric-value">
              {readiness.corpusInspected
                ? readiness.corpusReady
                  ? copy.indexReadyShort
                  : copy.indexMissingShort
                : copy.resourceStatusLoading}
            </span>
            <span className="ai-localization-metric-label">{copy.officialCorpusStatusLabel}</span>
          </button>
        </div>
      </section>
      <section className="ai-localization-overview-section">
        <div className="ai-localization-section-head">
          <h3>{copy.resourceReadiness}</h3>
          {readiness.corpusInspected && readiness.semanticInspected ? (
            <span>{readiness.corpusReady && readiness.semanticReady ? copy.allResourcesReady : copy.resourcesNeedAttention}</span>
          ) : (
            <span>{copy.resourceStatusLoading}</span>
          )}
        </div>
        <div className="ai-localization-readiness-list">
          {readinessList.map((item) => (
            <div key={item.key} className={cx('ai-localization-readiness-row', `is-${item.tone}`)}>
              <span className="ai-localization-readiness-dot" />
              <div className="ai-localization-readiness-main">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <span className={cx('ai-localization-readiness-chip', `is-${item.tone}`)}>{item.state}</span>
              {item.action ? (
                <button type="button" className="control-button" onClick={item.action}>
                  <item.actionIcon className="h-4 w-4" />
                  {item.actionLabel}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="ai-localization-overview-section">
        <div className="ai-localization-section-head">
          <h3>{copy.needsAttentionTitle}</h3>
          <span>{stats.reviews}</span>
        </div>
        {stats.reviews > 0 ? (
          <div className="ai-localization-readiness-list">
            <div className="ai-localization-readiness-row is-danger">
              <span className="ai-localization-readiness-dot" />
              <div className="ai-localization-readiness-main">
                <strong>{copy.criticalReviewIssues(stats.critical)}</strong>
                <p>{copy.criticalIssues(stats.critical)}</p>
              </div>
              <span className={cx('ai-localization-readiness-chip', 'is-danger')}>{copy.reviewCritical}</span>
              <button type="button" className="control-button" onClick={() => onOpenTab('quality')}>
                {copy.goToHandle}
              </button>
            </div>
          </div>
        ) : (
          <p className="ai-localization-plain-text">{copy.noAttentionItems}</p>
        )}
      </section>
      {settings ? (
        <section className="ai-localization-overview-section">
          <div className="ai-localization-section-head">
            <h3>{copy.saveDefaults}</h3>
          </div>
          <div className="ai-localization-defaults-row">
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
            <label className="ai-localization-switch-field">
              <span>{copy.automaticReview}</span>
              <span className="ai-localization-switch-wrapper">
                <input
                  type="checkbox"
                  className="ai-localization-switch"
                  checked={settings.autoReview}
                  onChange={(event) => setSettings({ ...settings, autoReview: event.target.checked })}
                />
              </span>
            </label>
            <button type="button" className="control-button control-button-primary" onClick={() => void saveDefaults()}>
              {copy.save}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
