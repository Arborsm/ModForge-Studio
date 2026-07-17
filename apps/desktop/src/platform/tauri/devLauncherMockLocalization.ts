import type {
  AiGlossaryEntry,
  AiLocalizationScope,
  AiLocalizationScopeSnapshot,
  AiOfficialCorpusStatus,
  AiOfficialUnit,
  AiReviewRun,
  AiStyleGuide,
  AiTranslationMemoryEntry,
  ListLocalizationScopesRequest,
  ListReviewRunsRequest,
  LocalizationScopeSettings,
  RebuildOfficialLocalizationIndexRequest,
  ResolveLocalizationScopeRequest,
  SearchLocalizationKnowledgeRequest,
  SearchOfficialLocalizationRequest,
  UpdateReviewIssuesRequest,
  InitializeLocalizationPlanRequest,
  InspectLocalizationContextRequest,
} from '@shared/contracts'

type MockCommandResult = { handled: true; result: unknown } | { handled: false }

const MOCK_GAME_DIRECTORY = 'E:\\ModForge Dev\\Stardew Valley'

function getMockRequest<TRequest>(payload: unknown): TRequest | null {
  if (!payload || typeof payload !== 'object' || !('request' in payload)) {
    return null
  }

  return (payload as { request: TRequest }).request
}

function createMockScopeSettings(scopeId: string): LocalizationScopeSettings {
  return {
    scopeId,
    defaultEngineKind: 'generative-ai',
    defaultEngineProfileId: 'openai-workbench',
    reviewProfileId: 'openai-workbench',
    knowledgePolicy: { enabled: true, useOfficialCorpus: true, useGlobalKnowledge: true, useProfileKnowledge: true },
    autoReview: true,
    qaConfig: { checkEmpty: true, checkLanguageMix: true, checkWhitespace: true, checkLineBreaks: true, checkLength: true },
  }
}

function createInitialLocalizationScopes(): AiLocalizationScope[] {
  const now = Date.now()
  return [
    {
      id: 'global',
      kind: 'global',
      name: 'Global knowledge',
      revision: 4,
      createdAtMs: now - 120 * 86_400_000,
      updatedAtMs: now - 2 * 86_400_000,
      lastUsedAtMs: now - 3_600_000,
      bindings: [],
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      kind: 'profile',
      name: '示例项目',
      revision: 0,
      createdAtMs: now,
      updatedAtMs: now,
      lastUsedAtMs: now,
      bindings: [{ kind: 'project-unique-id', value: 'modforge.example.localization' }],
    },
    {
      id: 'profile-expanded',
      kind: 'profile',
      name: 'Stardew Expanded 汉化',
      revision: 7,
      createdAtMs: now - 60 * 86_400_000,
      updatedAtMs: now - 86_400_000,
      lastUsedAtMs: now - 1_800_000,
      bindings: [
        { kind: 'installed-mod', value: 'FlashShifter.StardewValleyExpanded' },
        { kind: 'project-unique-id', value: 'expanded-zh-translation' },
      ],
    },
    {
      id: 'profile-ppja',
      kind: 'profile',
      name: 'PPJA 合集术语',
      revision: 2,
      createdAtMs: now - 30 * 86_400_000,
      updatedAtMs: now - 3 * 86_400_000,
      lastUsedAtMs: now - 5 * 86_400_000,
      bindings: [],
    },
  ]
}

function createInitialLocalizationGlossary(): AiGlossaryEntry[] {
  const now = Date.now()
  const rows: Array<[scopeId: string, sourceTerm: string, targetTerm: string, doNotTranslate?: boolean]> = [
    ['00000000-0000-0000-0000-000000000002', 'Pelican Town', '鹈鹕镇'],
    ['00000000-0000-0000-0000-000000000002', 'Stardew Valley', '星露谷物语', true],
    ['global', 'Greenhouse', '温室'],
    ['global', 'Junimo', '祝尼魔'],
    ['global', 'Stardew Valley', '星露谷物语', true],
    ['profile-expanded', 'Grampleton', '格兰普顿'],
    ['profile-expanded', 'Gunther', '冈瑟'],
    ['profile-ppja', 'Artisan Valley', '工匠山谷'],
  ]
  return rows.map(([scopeId, sourceTerm, targetTerm, doNotTranslate], index) => ({
    id: `glossary-${index}`,
    scopeId,
    sourceLocale: 'en-US',
    targetLocale: 'zh-CN',
    sourceTerm,
    targetTerm,
    matchMode: 'exact',
    doNotTranslate: Boolean(doNotTranslate),
    notes: '',
    updatedAtMs: now - index * 3_600_000,
  }))
}

function createInitialLocalizationMemory(): AiTranslationMemoryEntry[] {
  const now = Date.now()
  const rows: Array<
    [
      scopeId: string,
      sourceText: string,
      targetText: string,
      sourceKind: AiTranslationMemoryEntry['sourceKind'],
      fileNamespace: string,
      unitKey: string,
      useCount: number,
    ]
  > = [
    [
      '00000000-0000-0000-0000-000000000002',
      'Welcome to Pelican Town!',
      '欢迎来到鹈鹕镇！',
      'manual',
      'i18n/zh-CN.json',
      'welcome.town',
      3,
    ],
    ['global', 'Spring {0}', '春季 {0}', 'official-reference', 'Strings/StringsFromCSFiles', 'spring', 42],
    ['profile-expanded', 'Welcome to Grampleton!', '欢迎来到格兰普顿！', 'manual', 'i18n', 'town.welcome', 12],
    ['profile-expanded', 'The summit awaits.', '山顶在等着你。', 'automatic', 'i18n', 'summit.intro', 5],
  ]
  return rows.map(([scopeId, sourceText, targetText, sourceKind, fileNamespace, unitKey, useCount], index) => ({
    id: `memory-${index}`,
    scopeId,
    sourceLocale: 'en-US',
    targetLocale: 'zh-CN',
    sourceText,
    targetText,
    sourceKind,
    fileNamespace,
    unitKey,
    confirmedAtMs: now - index * 86_400_000,
    useCount,
    similarity: 1,
    score: 1,
    semanticSimilarity: null,
    lexicalSimilarity: 1,
    matchKind: 'exact',
    retrievalMode: 'lexical',
  }))
}

function createInitialLocalizationReviewRuns(): AiReviewRun[] {
  const now = Date.now()
  return [
    {
      id: 'review-run-1',
      scopeId: 'profile-expanded',
      sourceLocale: 'en-US',
      targetLocale: 'zh-CN',
      engine: 'generative-ai:openai-workbench',
      status: 'completed',
      summary: {
        checked: 128,
        passed: 121,
        warnings: 7,
        total: 128,
        minor: 3,
        major: 2,
        critical: 2,
        open: 5,
        ignored: 1,
        accepted: 1,
        stale: 0,
      },
      createdAtMs: now - 7_200_000,
    },
    {
      id: 'review-run-2',
      scopeId: 'profile-expanded',
      sourceLocale: 'en-US',
      targetLocale: 'zh-CN',
      engine: 'generative-ai:openai-workbench',
      status: 'completed',
      summary: {
        checked: 64,
        passed: 64,
        warnings: 0,
        total: 64,
        minor: 0,
        major: 0,
        critical: 0,
        open: 0,
        ignored: 0,
        accepted: 0,
        stale: 0,
      },
      createdAtMs: now - 86_400_000,
    },
  ]
}

function createMockOfficialCorpusStatus(gameDirectory: string, indexed: boolean): AiOfficialCorpusStatus {
  return {
    indexed,
    stale: false,
    gameDirectory,
    gameVersion: '1.6.15',
    fingerprint: indexed ? 'dev-official-fingerprint' : '',
    revision: indexed ? 'official-dev-1' : null,
    updatedAtMs: indexed ? Date.now() : null,
    languageCount: indexed ? 12 : 0,
    unitCount: indexed ? 48_213 : 0,
    semanticEligibleCount: indexed ? 16_788 : 0,
    errorCount: 0,
  }
}

function createMockOfficialUnits(request: SearchOfficialLocalizationRequest): AiOfficialUnit[] {
  const rows: Array<[sourceText: string, targetText: string, assetPath: string, unitKey: string]> = [
    ['Spring {0}', '春季 {0}', 'Strings/StringsFromCSFiles', 'spring'],
    ['Greenhouse', '温室', 'Data/Bundles', 'greenhouse'],
    ['Mayor Lewis', '刘易斯镇长', 'Characters/Lewis', 'name'],
  ]
  const query = request.query.trim().toLocaleLowerCase()
  return rows
    .filter(([sourceText]) => !query || sourceText.toLocaleLowerCase().includes(query))
    .map(([sourceText, targetText, assetPath, unitKey], index) => ({
      id: index,
      sourceLocale: request.sourceLocale,
      targetLocale: request.targetLocale,
      sourceText,
      targetText,
      assetPath,
      unitKey,
      unitKind: 'text',
      searchable: true,
      semanticEligible: true,
      promptEligible: true,
      fingerprint: `dev-fingerprint-${index}`,
      similarity: 1,
      score: 1,
      semanticSimilarity: null,
      lexicalSimilarity: 1,
      matchKind: 'exact',
      retrievalMode: 'lexical',
    }))
}

/** Creates an in-memory localization knowledge backend for browser-only UI debugging. */
export function createLocalizationKnowledgeMockHandler() {
  let localizationScopes = createInitialLocalizationScopes()
  let localizationGlossary = createInitialLocalizationGlossary()
  let localizationMemory = createInitialLocalizationMemory()
  const localizationReviewRuns = createInitialLocalizationReviewRuns()
  const localizationSettings = new Map<string, LocalizationScopeSettings>()
  const localizationStyles = new Map<string, AiStyleGuide>([
    [
      '00000000-0000-0000-0000-000000000002:zh-CN',
      {
        scopeId: '00000000-0000-0000-0000-000000000002',
        targetLocale: 'zh-CN',
        tone: '自然、温暖、简洁',
        audience: '星露谷物语玩家',
        formality: '半正式',
        forbiddenPhrases: ['机翻腔', '过度书面化'],
        preferredPhrases: ['自然口语', '角色语气一致'],
        rules: ['保留所有占位符和控制标记', '地名与人物名优先使用官方译名', '对话避免逐字直译'],
        updatedAtMs: Date.now(),
      },
    ],
  ])
  const snapshotForScope = (scope: AiLocalizationScope): AiLocalizationScopeSnapshot => ({
    scope,
    settings: localizationSettings.get(scope.id) ?? createMockScopeSettings(scope.id),
  })
  const requireScope = (scopeId: string) => {
    const scope = localizationScopes.find((item) => item.id === scopeId)
    if (!scope) throw new Error(`Unknown localization scope: ${scopeId}`)
    return scope
  }
  const handled = (result: unknown): MockCommandResult => ({ handled: true, result })

  return function handleLocalizationKnowledgeMockCommand(command: string, payload: unknown): MockCommandResult {
    switch (command) {
      case 'list_localization_scopes': {
        const request = getMockRequest<ListLocalizationScopesRequest>(payload) ?? { query: null, offset: 0, limit: 200 }
        const query = request.query?.trim().toLocaleLowerCase()
        const records = query
          ? localizationScopes.filter((scope) =>
              [scope.name, ...scope.bindings.map((binding) => binding.value)].join(' ').toLocaleLowerCase().includes(query),
            )
          : localizationScopes
        return handled({ records: records.slice(request.offset, request.offset + request.limit), total: records.length })
      }
      case 'load_localization_scope': {
        const request = getMockRequest<{ scopeId: string }>(payload)
        return handled(snapshotForScope(requireScope(request?.scopeId ?? '')))
      }
      case 'save_localization_scope_settings': {
        const request = getMockRequest<{ settings: LocalizationScopeSettings }>(payload)
        if (!request) throw new Error('Missing mock localization scope settings')
        localizationSettings.set(request.settings.scopeId, request.settings)
        localizationScopes = localizationScopes.map((scope) =>
          scope.id === request.settings.scopeId ? { ...scope, revision: scope.revision + 1, updatedAtMs: Date.now() } : scope,
        )
        return handled(snapshotForScope(requireScope(request.settings.scopeId)))
      }
      case 'create_localization_profile': {
        const rawName = payload && typeof payload === 'object' && 'name' in payload ? (payload as { name: unknown }).name : null
        const name = typeof rawName === 'string' ? rawName.trim() : ''
        if (!name) throw new Error('Profile name is required.')
        const now = Date.now()
        const scope: AiLocalizationScope = {
          id: `profile-${now.toString(36)}`,
          kind: 'profile',
          name,
          revision: 1,
          createdAtMs: now,
          updatedAtMs: now,
          lastUsedAtMs: now,
          bindings: [],
        }
        localizationScopes = [...localizationScopes, scope]
        return handled(snapshotForScope(scope))
      }
      case 'rename_localization_profile': {
        const { scopeId = '', name = '' } = payload && typeof payload === 'object' ? (payload as { scopeId?: string; name?: string }) : {}
        const trimmed = name.trim()
        if (!trimmed) throw new Error('Profile name is required.')
        requireScope(scopeId)
        const now = Date.now()
        localizationScopes = localizationScopes.map((scope) =>
          scope.id === scopeId && scope.kind === 'profile'
            ? { ...scope, name: trimmed, revision: scope.revision + 1, updatedAtMs: now }
            : scope,
        )
        return handled(snapshotForScope(requireScope(scopeId)))
      }
      case 'delete_localization_profile': {
        const { scopeId = '' } = payload && typeof payload === 'object' ? (payload as { scopeId?: string }) : {}
        localizationScopes = localizationScopes.filter((scope) => scope.id !== scopeId || scope.kind !== 'profile')
        localizationSettings.delete(scopeId)
        return handled(null)
      }
      case 'set_localization_profile_binding': {
        const {
          scopeId = '',
          bindingKind = '',
          bindingValue = '',
        } = payload && typeof payload === 'object' ? (payload as { scopeId?: string; bindingKind?: string; bindingValue?: string }) : {}
        requireScope(scopeId)
        const now = Date.now()
        localizationScopes = localizationScopes.map((scope) => {
          if (scope.kind !== 'profile') return scope
          const remaining = scope.bindings.filter((binding) => binding.kind !== bindingKind || binding.value !== bindingValue)
          const detached = remaining.length !== scope.bindings.length
          if (scope.id === scopeId) {
            return {
              ...scope,
              bindings: [...remaining, { kind: bindingKind, value: bindingValue }],
              revision: scope.revision + 1,
              updatedAtMs: now,
              lastUsedAtMs: now,
            }
          }
          return detached ? { ...scope, bindings: remaining, revision: scope.revision + 1, updatedAtMs: now } : scope
        })
        return handled(snapshotForScope(requireScope(scopeId)))
      }
      case 'remove_localization_profile_binding': {
        const { bindingKind = '', bindingValue = '' } =
          payload && typeof payload === 'object' ? (payload as { bindingKind?: string; bindingValue?: string }) : {}
        const now = Date.now()
        localizationScopes = localizationScopes.map((scope) => {
          if (scope.kind !== 'profile') return scope
          const remaining = scope.bindings.filter((binding) => binding.kind !== bindingKind || binding.value !== bindingValue)
          return remaining.length === scope.bindings.length
            ? scope
            : { ...scope, bindings: remaining, revision: scope.revision + 1, updatedAtMs: now }
        })
        return handled(null)
      }
      case 'resolve_localization_scope': {
        const request = getMockRequest<ResolveLocalizationScopeRequest>(payload)
        if (!request) throw new Error('Missing mock localization scope resolve request')
        const existing = localizationScopes.find(
          (scope) =>
            scope.kind === 'profile' &&
            scope.bindings.some((binding) => binding.kind === request.bindingKind && binding.value === request.bindingValue),
        )
        if (existing) {
          const now = Date.now()
          localizationScopes = localizationScopes.map((scope) => (scope.id === existing.id ? { ...scope, lastUsedAtMs: now } : scope))
          return handled(snapshotForScope(requireScope(existing.id)))
        }
        const now = Date.now()
        const scope: AiLocalizationScope = {
          id: `profile-${now.toString(36)}`,
          kind: 'profile',
          name: request.name,
          revision: 1,
          createdAtMs: now,
          updatedAtMs: now,
          lastUsedAtMs: now,
          bindings: [{ kind: request.bindingKind, value: request.bindingValue }],
        }
        localizationScopes = [...localizationScopes, scope]
        return handled(snapshotForScope(scope))
      }
      case 'initialize_localization_plan': {
        const request = getMockRequest<InitializeLocalizationPlanRequest>(payload)
        if (!request) throw new Error('Missing mock translation plan request')
        const existing = localizationScopes.find(
          (scope) =>
            scope.kind === 'profile' &&
            scope.bindings.some((binding) => binding.kind === request.bindingKind && binding.value === request.bindingValue),
        )
        const now = Date.now()
        const scope =
          existing ??
          ({
            id: `profile-${now.toString(36)}`,
            kind: 'profile',
            name: request.planName,
            revision: 1,
            createdAtMs: now,
            updatedAtMs: now,
            lastUsedAtMs: now,
            bindings: [{ kind: request.bindingKind, value: request.bindingValue }],
          } satisfies AiLocalizationScope)
        if (!existing) localizationScopes = [...localizationScopes, scope]
        localizationSettings.set(scope.id, createMockScopeSettings(scope.id))
        if (request.importExisting) {
          localizationMemory = localizationMemory.filter(
            (entry) => !(entry.scopeId === scope.id && entry.sourceKind === 'automatic' && entry.fileNamespace === request.fileNamespace),
          )
          localizationMemory.push(
            ...request.entries.map((entry, index) => ({
              id: `memory-plan-${now.toString(36)}-${index}`,
              scopeId: scope.id,
              sourceLocale: entry.sourceLocale,
              targetLocale: entry.targetLocale,
              sourceText: entry.sourceText,
              targetText: entry.targetText,
              sourceKind: 'automatic' as const,
              fileNamespace: entry.fileNamespace,
              unitKey: entry.unitKey,
              confirmedAtMs: now,
              useCount: 0,
              similarity: 1,
              score: 1,
              semanticSimilarity: null,
              lexicalSimilarity: 1,
              matchKind: 'exact' as const,
              retrievalMode: 'lexical' as const,
            })),
          )
        }
        return handled({
          snapshot: snapshotForScope(scope),
          importedCount: request.importExisting ? request.entries.length : 0,
          knowledgeRevision: `${scope.id}:${scope.revision}`,
          semanticIndexState: 'skipped',
          semanticIndexError: null,
        })
      }
      case 'inspect_localization_context': {
        const request = getMockRequest<InspectLocalizationContextRequest>(payload)
        if (!request) throw new Error('Missing mock localization context request')
        const normalized = request.sourceText.toLocaleLowerCase()
        const scopeIds = new Set([request.scopeId, 'global'])
        const glossary = localizationGlossary.filter(
          (entry) => scopeIds.has(entry.scopeId) && normalized.includes(entry.sourceTerm.toLocaleLowerCase()),
        )
        const memory = localizationMemory
          .filter(
            (entry) =>
              scopeIds.has(entry.scopeId) &&
              entry.sourceLocale === request.sourceLocale &&
              entry.targetLocale === request.targetLocale &&
              entry.sourceText.toLocaleLowerCase().includes(normalized),
          )
          .slice(0, 5)
        const style =
          localizationStyles.get(`${request.scopeId}:${request.targetLocale}`) ??
          localizationStyles.get(`global:${request.targetLocale}`) ??
          null
        return handled({
          glossary,
          memory,
          official: [],
          style,
          knowledgeRevision: `${request.scopeId}:1`,
          trace: {
            officialIndexed: false,
            officialMatches: 0,
            globalGlossaryMatches: glossary.filter((entry) => entry.scopeId === 'global').length,
            profileGlossaryMatches: glossary.filter((entry) => entry.scopeId !== 'global').length,
            translationMemoryMatches: memory.length,
          },
        })
      }
      case 'acquire_localization_semantic_runtime':
      case 'release_localization_semantic_runtime':
      case 'unload_localization_semantic_runtime':
        return handled(null)
      case 'list_localization_glossary_entries': {
        const request = getMockRequest<SearchLocalizationKnowledgeRequest>(payload)
        if (!request) throw new Error('Missing mock glossary search request')
        const query = request.query?.trim().toLocaleLowerCase()
        const records = localizationGlossary.filter(
          (entry) =>
            entry.scopeId === request.scopeId &&
            (!request.sourceLocale || entry.sourceLocale === request.sourceLocale) &&
            (!request.targetLocale || entry.targetLocale === request.targetLocale) &&
            (!query || `${entry.sourceTerm} ${entry.targetTerm}`.toLocaleLowerCase().includes(query)),
        )
        return handled({ records: records.slice(request.offset, request.offset + request.limit), total: records.length })
      }
      case 'upsert_localization_glossary_entries': {
        const request = getMockRequest<{ scopeId: string; entries: AiGlossaryEntry[] }>(payload)
        if (!request) throw new Error('Missing mock glossary upsert request')
        const incoming = request.entries.map((entry, index) => ({
          ...entry,
          id: entry.id || `glossary-${Date.now().toString(36)}-${index}`,
          updatedAtMs: Date.now(),
        }))
        const incomingIds = new Set(incoming.map((entry) => entry.id))
        localizationGlossary = [...localizationGlossary.filter((entry) => !incomingIds.has(entry.id)), ...incoming]
        const records = localizationGlossary.filter((entry) => entry.scopeId === request.scopeId)
        return handled({ records: records.slice(0, 50), total: records.length })
      }
      case 'delete_localization_glossary_entries': {
        const request = getMockRequest<{ scopeId: string; ids: string[] }>(payload)
        if (!request) return handled(0)
        localizationGlossary = localizationGlossary.filter(
          (entry) => !(entry.scopeId === request.scopeId && request.ids.includes(entry.id)),
        )
        return handled(request.ids.length)
      }
      case 'load_localization_style_guide': {
        const request = getMockRequest<{ scopeId: string; targetLocale: string }>(payload)
        return handled(localizationStyles.get(`${request?.scopeId ?? ''}:${request?.targetLocale ?? ''}`) ?? null)
      }
      case 'save_localization_style_guide': {
        const guide = payload && typeof payload === 'object' && 'guide' in payload ? (payload as { guide: AiStyleGuide }).guide : null
        if (!guide) throw new Error('Missing mock style guide')
        const next = { ...guide, updatedAtMs: Date.now() }
        localizationStyles.set(`${guide.scopeId}:${guide.targetLocale}`, next)
        return handled(next)
      }
      case 'search_translation_memory': {
        const request = getMockRequest<SearchLocalizationKnowledgeRequest>(payload)
        if (!request) throw new Error('Missing mock translation memory search request')
        const query = request.query?.trim().toLocaleLowerCase()
        const records = localizationMemory.filter(
          (entry) =>
            entry.scopeId === request.scopeId &&
            (!request.sourceLocale || entry.sourceLocale === request.sourceLocale) &&
            (!request.targetLocale || entry.targetLocale === request.targetLocale) &&
            (!query || `${entry.sourceText} ${entry.targetText}`.toLocaleLowerCase().includes(query)),
        )
        return handled({ records: records.slice(request.offset, request.offset + request.limit), total: records.length })
      }
      case 'delete_translation_memory_entries': {
        const request = getMockRequest<{ scopeId: string; ids: string[] }>(payload)
        if (!request) return handled(0)
        localizationMemory = localizationMemory.filter((entry) => !(entry.scopeId === request.scopeId && request.ids.includes(entry.id)))
        return handled(request.ids.length)
      }
      case 'copy_translation_memory_entries': {
        const request = getMockRequest<{ sourceScopeId: string; targetScopeId: string; ids: string[] }>(payload)
        if (!request) return handled(0)
        const now = Date.now()
        const copies = localizationMemory
          .filter((entry) => entry.scopeId === request.sourceScopeId && request.ids.includes(entry.id))
          .map((entry, index) => ({
            ...entry,
            id: `memory-${now.toString(36)}-${index}`,
            scopeId: request.targetScopeId,
            confirmedAtMs: now,
          }))
        localizationMemory = [...localizationMemory, ...copies]
        return handled(copies.length)
      }
      case 'record_confirmed_translations':
        return handled(0)
      case 'list_localization_review_runs': {
        const request = getMockRequest<ListReviewRunsRequest>(payload) ?? { scopeId: 'global', offset: 0, limit: 20 }
        const records = localizationReviewRuns.filter((run) => run.scopeId === request.scopeId)
        return handled({ records: records.slice(request.offset, request.offset + request.limit), total: records.length })
      }
      case 'load_localization_review_run': {
        const request = getMockRequest<{ runId: string }>(payload)
        const run = localizationReviewRuns.find((item) => item.id === request?.runId)
        if (!run) throw new Error(`Unknown localization review run: ${request?.runId ?? ''}`)
        return handled({ run, issues: [], usageRecordState: 'unavailable' })
      }
      case 'update_localization_review_issues': {
        const request = getMockRequest<UpdateReviewIssuesRequest>(payload)
        const run = localizationReviewRuns.find((item) => item.id === request?.runId)
        if (!run) throw new Error(`Unknown localization review run: ${request?.runId ?? ''}`)
        return handled({ run, issues: [], usageRecordState: 'unavailable' })
      }
      case 'inspect_official_localization_index': {
        const request = getMockRequest<{ gameDirectory: string }>(payload)
        // The dev mock starts without a built corpus so the workbench shows the readiness banner.
        return handled(createMockOfficialCorpusStatus(request?.gameDirectory ?? MOCK_GAME_DIRECTORY, false))
      }
      case 'rebuild_official_localization_index': {
        const request = getMockRequest<RebuildOfficialLocalizationIndexRequest>(payload)
        return handled(createMockOfficialCorpusStatus(request?.gameDirectory ?? MOCK_GAME_DIRECTORY, true))
      }
      case 'search_official_localization': {
        const request = getMockRequest<SearchOfficialLocalizationRequest>(payload)
        if (!request) return handled({ records: [], total: 0 })
        const records = createMockOfficialUnits(request).slice(request.offset, request.offset + request.limit)
        return handled({ records, total: records.length })
      }
      case 'import_localization_knowledge':
      case 'export_localization_knowledge':
        return handled({ glossaryCount: 0, memoryCount: 0, styleCount: 0 })
      case 'detect_default_game_directory':
        return handled(MOCK_GAME_DIRECTORY)
      case 'list_known_game_directories':
        return handled([MOCK_GAME_DIRECTORY])
      default:
        return { handled: false }
    }
  }
}
