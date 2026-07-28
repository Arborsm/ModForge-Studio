import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { emit } from '@tauri-apps/api/event'
import type {
  LauncherDownloadQueueState,
  LauncherGmcmProbeDiagnosticsResult,
  LauncherLibraryCoversState,
  LauncherLibraryModSummary,
  LauncherLibraryScanResult,
  LauncherLibraryState,
  LauncherNexusDiagnosticsResult,
  LauncherRuntimeInfo,
  LauncherSettings,
  LauncherSuppressedUpdateModIdsResult,
  LauncherUpdatesResult,
} from '@features/launcher/model/launcherContracts'
import type {
  AiProfileTestResult,
  AiSemanticIndexStatus,
  AiSemanticModelStatus,
  AiSemanticSettingsSnapshot,
  AiSettingsSnapshot,
  AiTranslateBatchRequest,
  AiTranslationCacheEntry,
  AiUsageQuery,
  AiUsageRecord,
  AiUsageSummary,
  AppUiState,
  LocalizationEngineRef,
  MachineTranslationSettingsSnapshot,
  PatchAppUiStateRequest,
  SaveAiSettingsRequest,
  SaveMachineTranslationSettingsRequest,
} from '@shared/contracts'
import { createCpMakerMockHandler } from './devLauncherMockCpMaker'
import { createLocalizationKnowledgeMockHandler } from './devLauncherMockLocalization'
import { createModTranslationMockHandler } from './devLauncherMockModTranslation'
import { DEFAULT_LOADING_MOTION_PREFERENCE } from '@shared/lib/loading-motion'

declare global {
  interface Window {
    __modforgeLauncherCustomSortState?: Pick<LauncherLibraryState, 'customOrders' | 'childModGroups'>
  }
}

const DEV_LAUNCHER_MOCK_QUERY_PARAM = 'mfLauncherMock'
const DEV_SETTINGS_MOCK_QUERY_PARAM = 'mfSettingsMock'
const DEV_MOCK_GAME_DIRECTORY = 'E:\\ModForge Dev\\Stardew Valley'
const DEV_LAUNCHER_MOCK_MODS_PATH = 'E:\\ModForge Dev\\Stardew Valley\\Mods'

const DEV_AI_PRESETS: AiSettingsSnapshot['presets'] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    credentialEnvironment: 'OPENAI_API_KEY',
    requiresApiKey: true,
    authentication: 'bearer',
    supportsModelListing: true,
    structuredOutput: 'json-schema',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    protocol: 'openai-chat-completions',
    baseUrl: 'http://127.0.0.1:11434/v1',
    credentialEnvironment: null,
    requiresApiKey: false,
    authentication: 'none',
    supportsModelListing: true,
    structuredOutput: 'json-object',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    credentialEnvironment: 'GEMINI_API_KEY',
    requiresApiKey: true,
    authentication: 'bearer',
    supportsModelListing: true,
    structuredOutput: 'json-schema',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    credentialEnvironment: 'ANTHROPIC_API_KEY',
    requiresApiKey: true,
    authentication: 'anthropic-api-key',
    supportsModelListing: true,
    structuredOutput: 'anthropic-tool',
  },
]

function createInitialAiSettings(): AiSettingsSnapshot {
  return {
    version: 1,
    defaultProfileId: 'openai-workbench',
    profiles: [
      {
        id: 'openai-workbench',
        name: 'OpenAI · 工作台默认',
        presetId: 'openai',
        protocol: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        credentialEnvironment: 'OPENAI_API_KEY',
        keyConfigured: true,
        resolvedCredentialSource: 'keychain',
      },
      {
        id: 'local-ollama',
        name: '本地 Ollama',
        presetId: 'ollama',
        protocol: 'openai-chat-completions',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:14b',
        credentialEnvironment: null,
        keyConfigured: false,
        resolvedCredentialSource: null,
      },
    ],
    presets: DEV_AI_PRESETS,
  }
}

function createInitialMachineTranslationSettings(): MachineTranslationSettingsSnapshot {
  return {
    version: 1,
    defaultProfileId: 'deepl-main',
    profiles: [
      {
        id: 'deepl-main',
        name: 'DeepL · 批量直译',
        presetId: 'deepl',
        protocol: 'deepl',
        baseUrl: 'https://api-free.deepl.com',
        region: null,
        enabled: true,
        defaultSourceLocale: 'en',
        defaultTargetLocale: 'zh',
        credentialEnvironments: { authKey: 'DEEPL_AUTH_KEY' },
        credentialSources: { authKey: 'keychain' },
      },
      {
        id: 'tencent-tmt',
        name: '腾讯 TMT',
        presetId: 'tencent-tmt',
        protocol: 'tencent-tmt',
        baseUrl: 'https://tmt.tencentcloudapi.com',
        region: 'ap-guangzhou',
        enabled: true,
        defaultSourceLocale: 'en',
        defaultTargetLocale: 'zh',
        credentialEnvironments: { secretId: 'TENCENT_SECRET_ID', secretKey: 'TENCENT_SECRET_KEY' },
        credentialSources: { secretId: 'environment', secretKey: 'environment' },
      },
    ],
    presets: [
      {
        id: 'deepl',
        name: 'DeepL',
        protocol: 'deepl',
        baseUrl: 'https://api-free.deepl.com',
        credentialFields: ['authKey'],
        capability: {
          languagesDynamic: true,
          maxItemCharacters: 5000,
          maxBatchCharacters: 50000,
          supportsHtml: true,
          supportsGlossary: true,
          usageCapability: 'character',
          authentication: 'auth-key',
        },
      },
      {
        id: 'tencent-tmt',
        name: 'Tencent TMT',
        protocol: 'tencent-tmt',
        baseUrl: 'https://tmt.tencentcloudapi.com',
        credentialFields: ['secretId', 'secretKey'],
        capability: {
          languagesDynamic: true,
          maxItemCharacters: 2000,
          maxBatchCharacters: 20000,
          supportsHtml: false,
          supportsGlossary: false,
          usageCapability: 'character',
          authentication: 'tc3',
        },
      },
    ],
  }
}

function createInitialSemanticSettings(): AiSemanticSettingsSnapshot {
  return {
    mode: 'builtin',
    executionPreference: 'auto',
    activeExecutionProvider: 'directml',
    executionFallbackReason: null,
    localModelDirectory: null,
    activeRemoteProfileId: null,
    remoteProfiles: [],
  }
}

function createInitialSemanticModelStatus(): AiSemanticModelStatus {
  return {
    mode: 'builtin',
    available: true,
    downloaded: false,
    modelId: 'multilingual-e5-small',
    revision: null,
    dimensions: 384,
    modelPath: null,
    cacheBytes: 0,
    unavailableReason: null,
  }
}

function createInitialSemanticIndexStatus(): AiSemanticIndexStatus {
  return {
    available: true,
    retrievalMode: 'semantic',
    generationId: 'gen-mock-1',
    modelId: 'multilingual-e5-small',
    dimensions: 384,
    officialRevision: 'official-1',
    knowledgeRevision: 'knowledge-1',
    indexedRecords: 1832,
    sourceRecords: 2000,
    pendingRecords: 18,
    coveragePercentage: 91.6,
    stale: false,
  }
}

function emptyUsageTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    billedCharacters: 0,
    requestCharacters: 0,
    responseCharacters: 0,
    requests: 0,
    failures: 0,
    unavailableUsageRequests: 0,
  }
}

function createMockUsageSummary(): AiUsageSummary {
  const totals = {
    ...emptyUsageTotals(),
    inputTokens: 128_400,
    outputTokens: 86_200,
    cachedTokens: 12_400,
    reasoningTokens: 0,
    billedCharacters: 42_000,
    requestCharacters: 210_000,
    responseCharacters: 168_000,
    requests: 286,
    failures: 9,
    unavailableUsageRequests: 4,
  }
  return {
    totals,
    daily: [
      {
        date: new Date().toISOString().slice(0, 10),
        engineKind: 'generative-ai',
        profileId: 'openai-workbench',
        operation: 'translate-batch',
        scopeId: null,
        totals: { ...totals, requests: 48, failures: 1 },
      },
      {
        date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        engineKind: 'machine-translation',
        profileId: 'deepl-main',
        operation: 'translate-batch',
        scopeId: null,
        totals: { ...emptyUsageTotals(), requests: 36, billedCharacters: 18_000, failures: 0 },
      },
    ],
    diagnostics: {
      averageLatencyMs: 412,
      p95LatencyMs: 980,
      attemptSuccessRate: 0.968,
      jobs: 120,
      successfulJobs: 114,
      jobSuccessRate: 0.95,
      cacheEligibleRequests: 80,
      cacheHitRequests: 28,
      cacheHitRate: 0.35,
      tokenUnavailableRequests: 4,
      detailFromMs: Date.now() - 7 * 86_400_000,
      detailComplete: true,
      providerModels: [
        { provider: 'openai', model: 'gpt-4.1-mini', attempts: 180, failures: 4, averageLatencyMs: 360 },
        { provider: 'deepl', model: null, attempts: 70, failures: 2, averageLatencyMs: 520 },
        { provider: 'ollama', model: 'qwen2.5:14b', attempts: 36, failures: 3, averageLatencyMs: 780 },
      ],
      failureCategories: [
        { category: 'rate-limit', attempts: 4 },
        { category: 'network', attempts: 3 },
        { category: 'timeout', attempts: 2 },
      ],
    },
  }
}

function createMockUsageRecords(limit: number): AiUsageRecord[] {
  const now = Date.now()
  return Array.from({ length: Math.min(limit, 24) }, (_, index) => {
    const failed = index % 11 === 0
    const generative = index % 3 !== 0
    return {
      occurredAtMs: now - index * 3_600_000,
      jobId: `job-mock-${index + 1}`,
      attempt: 1,
      pageSource: generative ? 'workbench-translation' : 'launcher',
      operation: 'translate-batch',
      engineKind: generative ? 'generative-ai' : 'machine-translation',
      profileId: generative ? 'openai-workbench' : 'deepl-main',
      provider: generative ? 'openai' : 'deepl',
      model: generative ? 'gpt-4.1-mini' : null,
      scopeId: null,
      succeeded: !failed,
      latencyMs: 220 + index * 17,
      failureCategory: failed ? 'rate-limit' : null,
      requestItems: 8 + (index % 5),
      requestCharacters: 1200 + index * 40,
      responseCharacters: 980 + index * 35,
      inputTokens: generative ? 800 + index * 20 : null,
      outputTokens: generative ? 520 + index * 12 : null,
      cachedTokens: generative && index % 4 === 0 ? 120 : null,
      reasoningTokens: null,
      billedCharacters: generative ? null : 900 + index * 30,
      usageSource: generative ? 'provider-reported' : 'local-measured',
      jobSucceeded: !failed,
    }
  })
}

const DEV_LAUNCHER_NEXUS_DIAGNOSTICS: LauncherNexusDiagnosticsResult = {
  routes: [
    {
      routeId: 'publicGraphql',
      label: 'Nexus Public GraphQL',
      endpoint: 'https://api.nexusmods.com/v2/graphql',
      status: 'success',
      attempts: 1,
      maxAttempts: 3,
      available: true,
      latencyMs: 183,
      message: 'Connected after 1 attempt.',
    },
    {
      routeId: 'nexusImages',
      label: 'Nexus Image CDN',
      endpoint: 'https://staticdelivery.nexusmods.com/',
      status: 'success',
      attempts: 1,
      maxAttempts: 3,
      available: true,
      latencyMs: 1250,
      message: 'Connected after 1 attempt.',
    },
    {
      routeId: 'smapi',
      label: 'SMAPI',
      endpoint: 'https://smapi.io/api/v3.0/mods',
      status: 'warning',
      attempts: 3,
      maxAttempts: 3,
      available: false,
      message: 'Failed after 3 attempts: timeout',
    },
  ],
}

function shouldEnableDevLauncherMock() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  const params = new URLSearchParams(window.location.search)
  return params.get(DEV_LAUNCHER_MOCK_QUERY_PARAM) === '1' || params.get(DEV_SETTINGS_MOCK_QUERY_PARAM) === '1'
}

function getDevLauncherMockModCount() {
  if (typeof window === 'undefined') {
    return 48
  }

  const rawValue = new URLSearchParams(window.location.search).get('mfLauncherMockMods')
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 48
  if (!Number.isFinite(parsed)) {
    return 48
  }

  return Math.max(8, Math.min(800, parsed))
}

function createMockMod(index: number): LauncherLibraryModSummary {
  const padded = String(index).padStart(2, '0')
  const name = `Mock Mod ${padded}`

  return {
    id: `mock-mod-${padded}`,
    labelKey: `Path:${DEV_LAUNCHER_MOCK_MODS_PATH}\\${name}`,
    name,
    author: index % 3 === 0 ? 'ModForge Dev' : 'Test Author',
    version: `1.${index % 7}.0`,
    description: `Development launcher mock item ${padded}.`,
    uniqueId: `ModForge.Dev.Mock${padded}`,
    folderName: name,
    absolutePath: `${DEV_LAUNCHER_MOCK_MODS_PATH}\\${name}`,
    enabled: index % 5 !== 0,
    hasConfig: index % 4 === 0,
    nexusModId: index <= 12 ? 20_000 + index : null,
    updateKeys: index <= 12 ? [`Nexus:${20_000 + index}`] : [],
    modUrl: index <= 12 ? `https://www.nexusmods.com/stardewvalley/mods/${20_000 + index}` : null,
    imageUrl: null,
    dependencies: [],
    requiredDependencies: [],
    missingRequiredDependencies: [],
  }
}

function createMockMods(count = getDevLauncherMockModCount()): LauncherLibraryModSummary[] {
  return Array.from({ length: count }, (_, index) => createMockMod(index + 1))
}

function getMockModKey(mod: LauncherLibraryModSummary) {
  return mod.uniqueId || mod.labelKey || mod.id
}

function createInitialLibraryState(mods: LauncherLibraryModSummary[]): LauncherLibraryState {
  return {
    storageFolders: [
      {
        id: 'unsorted',
        name: 'Unsorted',
        modKeys: [],
      },
    ],
    hiddenModKeys: [],
    packPresets: [
      {
        id: 'dev-pack',
        name: 'Dev Pack',
        modKeys: mods.slice(0, 8).map(getMockModKey),
        folderClassificationMode: 'global',
      },
    ],
    childModGroups: [
      {
        parentModKey: mods[0] ? getMockModKey(mods[0]) : '',
        childModKeys: mods.slice(1, 4).map(getMockModKey),
      },
    ],
    libraryFolders: [
      {
        id: 'visuals',
        name: 'Visuals',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: mods.slice(8, 12).map(getMockModKey),
        coverModKeys: mods.slice(8, 12).map(getMockModKey),
      },
      {
        id: 'gameplay',
        name: 'Gameplay',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: mods.slice(12, 16).map(getMockModKey),
        coverModKeys: mods.slice(12, 16).map(getMockModKey),
      },
      {
        id: 'interface',
        name: 'Interface',
        packId: null,
        hidden: false,
        parentFolderId: 'visuals',
        modKeys: mods.slice(16, 18).map(getMockModKey),
        coverModKeys: mods.slice(16, 18).map(getMockModKey),
      },
    ],
    customOrders: {},
    currentPackId: null,
    scopeMode: 'all',
  }
}

function getMockRequest<TRequest>(payload: unknown): TRequest | null {
  if (!payload || typeof payload !== 'object' || !('request' in payload)) {
    return null
  }

  return (payload as { request: TRequest }).request
}

function isSettingsMockPreferred() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(DEV_SETTINGS_MOCK_QUERY_PARAM) === '1'
}

function createInitialAppUiState(): AppUiState {
  const settingsMock = isSettingsMockPreferred()
  return {
    version: 1,
    shell: {
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
      notificationSoundEnabled: false,
      windowCloseBehavior: 'quit',
      rememberCloseChoice: false,
    },
    appearance: {
      // Settings visual mock targets the Chinese prototype screenshots.
      locale: settingsMock ? 'zh-CN' : 'en-US',
      themeId: 'neutral-tool',
      windowBorderTone: 'accent',
      windowBorderWeight: 'standard',
      recentGameDirectories: [],
      playerAppearance: {
        profiles: [],
        activeProfileId: null,
      },
      loadingMotion: { ...DEFAULT_LOADING_MOTION_PREFERENCE },
    },
    workspace: {
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      expertMode: false,
      modules: {},
    },
    launcher: {
      discoverToolbar: {
        sort: 'newest',
        ascending: false,
        timeRange: 'all',
        pageSize: 20,
        filtersHidden: false,
      },
      forceOffline: true,
      forceNonPremium: false,
    },
  }
}

function exposeLauncherCustomSortState(state: LauncherLibraryState) {
  window.__modforgeLauncherCustomSortState = {
    customOrders: state.customOrders,
    childModGroups: state.childModGroups,
  }
}

function applyMockAppUiStatePatch(current: AppUiState, patch: PatchAppUiStateRequest): AppUiState {
  const nextModules = { ...current.workspace.modules }
  for (const [key, moduleState] of Object.entries(patch.workspace?.modules ?? {})) {
    if (moduleState === null) {
      delete nextModules[key]
    } else {
      nextModules[key] = { ...nextModules[key], ...moduleState }
    }
  }

  return {
    ...current,
    ...(patch.shell ? { shell: patch.shell } : null),
    ...(patch.appearance
      ? {
          appearance: {
            ...current.appearance,
            ...patch.appearance,
          },
        }
      : null),
    ...(patch.workspace
      ? {
          workspace: {
            ...current.workspace,
            ...patch.workspace,
            navigation: { ...current.workspace.navigation, ...patch.workspace.navigation },
            modules: nextModules,
          },
        }
      : null),
    ...(patch.launcher
      ? {
          launcher: {
            ...current.launcher,
            ...patch.launcher,
            discoverToolbar: {
              ...current.launcher.discoverToolbar,
              ...patch.launcher.discoverToolbar,
            },
          },
        }
      : null),
  }
}

/** Installs a query-param gated Tauri IPC mock for browser-only launcher UI debugging. */
export function installDevLauncherMock() {
  if (!shouldEnableDevLauncherMock()) {
    return
  }

  const mods = createMockMods()
  let appUiState = createInitialAppUiState()
  let settings: LauncherSettings = {
    gamePath: DEV_MOCK_GAME_DIRECTORY,
    modsPath: DEV_LAUNCHER_MOCK_MODS_PATH,
    downloadPath: 'E:\\ModForge Dev\\Downloads',
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: false,
  }
  let libraryState = createInitialLibraryState(mods)
  let queueState: LauncherDownloadQueueState = { items: [] }
  let aiSettings: AiSettingsSnapshot = createInitialAiSettings()
  let machineTranslationSettings = createInitialMachineTranslationSettings()
  let defaultEngine: LocalizationEngineRef | null = { kind: 'generative-ai', profileId: 'openai-workbench' }
  let semanticSettings = createInitialSemanticSettings()
  let semanticModel = createInitialSemanticModelStatus()
  let semanticIndex = createInitialSemanticIndexStatus()
  const aiCache = new Map<string, AiTranslationCacheEntry>()
  // Seed a few cache entries so usage/cache UI is non-empty.
  for (let index = 0; index < 326; index += 1) {
    aiCache.set(`scope-${index}:zh-CN`, {
      scopeKey: `scope-${index}`,
      targetLocale: 'zh-CN',
      sourceHash: `hash-${index}`,
      translatedText: `缓存译文 ${index + 1}`.padEnd(40, '·'),
      providerProfileId: 'openai-workbench',
      model: 'gpt-4.1-mini',
      updatedAtMs: Date.now() - index * 60_000,
    })
  }
  exposeLauncherCustomSortState(libraryState)
  const handleLocalizationKnowledgeMockCommand = createLocalizationKnowledgeMockHandler()
  const handleModTranslationMockCommand = createModTranslationMockHandler(DEV_MOCK_GAME_DIRECTORY)
  const handleCpMakerMockCommand = createCpMakerMockHandler(DEV_MOCK_GAME_DIRECTORY)

  mockWindows('main')
  mockConvertFileSrc('windows')
  mockIPC(
    async (command, payload) => {
      const localizationKnowledgeResult = handleLocalizationKnowledgeMockCommand(command, payload)
      if (localizationKnowledgeResult.handled) {
        return localizationKnowledgeResult.result
      }
      const modTranslationResult = handleModTranslationMockCommand(command, payload)
      if (modTranslationResult.handled) {
        return modTranslationResult.result
      }
      const cpMakerResult = handleCpMakerMockCommand(command, payload)
      if (cpMakerResult.handled) {
        return cpMakerResult.result
      }
      switch (command) {
        case 'load_app_ui_state':
          return appUiState
        case 'patch_app_ui_state':
          appUiState = applyMockAppUiStatePatch(appUiState, getMockRequest<PatchAppUiStateRequest>(payload) ?? {})
          return appUiState
        case 'load_ai_settings':
          return aiSettings
        case 'save_ai_settings': {
          const request = getMockRequest<SaveAiSettingsRequest>(payload) ?? { defaultProfileId: null, profiles: [] }
          aiSettings = {
            version: 1,
            defaultProfileId: request.defaultProfileId,
            presets: DEV_AI_PRESETS,
            profiles: request.profiles.map((profile) => {
              const previous = aiSettings.profiles.find((candidate) => candidate.id === profile.id)
              const preset = DEV_AI_PRESETS.find((item) => item.id === profile.presetId)
              const keyConfigured =
                preset?.requiresApiKey === false
                  ? false
                  : Boolean(profile.apiKey) || (!profile.clearApiKey && previous?.keyConfigured === true)
              return {
                id: profile.id,
                name: profile.name,
                presetId: profile.presetId,
                protocol: profile.protocol,
                baseUrl: profile.baseUrl,
                model: profile.model,
                credentialEnvironment: profile.credentialEnvironment,
                keyConfigured,
                resolvedCredentialSource: keyConfigured ? 'keychain' : preset?.requiresApiKey === false ? null : null,
              }
            }),
          }
          return aiSettings
        }
        case 'list_ai_models':
          return [
            { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini' },
            { id: 'gpt-4.1', displayName: 'GPT-4.1' },
            { id: 'qwen2.5:14b', displayName: 'Qwen2.5 14B' },
            { id: 'mock-translation-model', displayName: 'Mock translation model' },
          ]
        case 'test_ai_profile': {
          const profileId =
            getMockRequest<{ profileId?: string }>(payload)?.profileId ??
            (payload && typeof payload === 'object' && 'profileId' in payload
              ? String((payload as { profileId: string }).profileId)
              : aiSettings.defaultProfileId)
          const profile = aiSettings.profiles.find((item) => item.id === profileId) ?? aiSettings.profiles[0]
          const result: AiProfileTestResult = {
            provider: profile?.presetId ?? 'openai',
            protocol: profile?.protocol ?? 'openai-responses',
            baseUrl: profile?.baseUrl ?? 'https://api.openai.com/v1',
            model: profile?.model || 'gpt-4.1-mini',
            latencyMs: 142,
            credentialSource: profile?.resolvedCredentialSource ?? null,
          }
          return result
        }
        case 'export_ai_profiles':
          return aiSettings.profiles.length
        case 'preview_ai_profiles_import':
          return {
            formatVersion: 1,
            credentialsExcluded: true,
            entries: aiSettings.profiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
              provider: profile.presetId,
              model: profile.model,
              conflicts: true,
            })),
          }
        case 'apply_ai_profiles_import':
          return {
            settings: aiSettings,
            imported: 0,
            overwritten: aiSettings.profiles.length,
            copied: 0,
            skipped: 0,
          }
        case 'load_machine_translation_settings':
          return machineTranslationSettings
        case 'save_machine_translation_settings': {
          const request =
            getMockRequest<SaveMachineTranslationSettingsRequest>(payload) ??
            ({ defaultProfileId: null, profiles: [] } satisfies SaveMachineTranslationSettingsRequest)
          machineTranslationSettings = {
            version: 1,
            defaultProfileId: request.defaultProfileId,
            presets: machineTranslationSettings.presets,
            profiles: request.profiles.map((profile) => {
              const previous = machineTranslationSettings.profiles.find((item) => item.id === profile.id)
              const credentialSources: MachineTranslationSettingsSnapshot['profiles'][number]['credentialSources'] = {
                ...previous?.credentialSources,
              }
              for (const [field, value] of Object.entries(profile.credentials ?? {})) {
                if (value) credentialSources[field] = 'keychain'
              }
              for (const field of profile.clearCredentials ?? []) {
                delete credentialSources[field]
              }
              return {
                id: profile.id,
                name: profile.name,
                presetId: profile.presetId,
                protocol: profile.protocol,
                baseUrl: profile.baseUrl,
                region: profile.region,
                enabled: profile.enabled,
                defaultSourceLocale: profile.defaultSourceLocale,
                defaultTargetLocale: profile.defaultTargetLocale,
                credentialEnvironments: profile.credentialEnvironments,
                credentialSources,
              }
            }),
          }
          return machineTranslationSettings
        }
        case 'list_machine_translation_languages':
          return [
            { code: 'EN', name: 'English', supportsSource: true, supportsTarget: true },
            { code: 'ZH', name: 'Chinese', supportsSource: true, supportsTarget: true },
            { code: 'JA', name: 'Japanese', supportsSource: true, supportsTarget: true },
          ]
        case 'test_machine_translation_profile':
          return { latencyMs: 186, detectedLanguage: 'EN' }
        case 'load_localization_default_engine':
          return defaultEngine
        case 'save_localization_default_engine': {
          const engine =
            payload && typeof payload === 'object' && 'engine' in payload
              ? ((payload as { engine: LocalizationEngineRef }).engine ?? null)
              : getMockRequest<LocalizationEngineRef>(payload)
          if (engine) defaultEngine = engine
          return defaultEngine
        }
        case 'load_localization_semantic_settings':
          return semanticSettings
        case 'save_localization_semantic_settings': {
          const request = getMockRequest<AiSemanticSettingsSnapshot>(payload)
          if (request) {
            semanticSettings = {
              mode: request.mode,
              executionPreference: request.executionPreference,
              activeExecutionProvider: request.executionPreference === 'auto' ? 'directml' : 'cpu',
              executionFallbackReason: null,
              localModelDirectory: request.localModelDirectory,
              activeRemoteProfileId: request.activeRemoteProfileId,
              remoteProfiles: request.remoteProfiles ?? [],
            }
            semanticModel = {
              ...semanticModel,
              mode: request.mode,
              available: request.mode !== 'lexical',
              downloaded: request.mode === 'builtin',
              modelId: request.mode === 'builtin' ? 'multilingual-e5-small' : request.mode === 'lexical' ? null : semanticModel.modelId,
            }
          }
          return semanticSettings
        }
        case 'inspect_localization_semantic_model':
          return semanticModel
        case 'inspect_localization_semantic_index':
          return semanticIndex
        case 'verify_localization_semantic_model':
          return {
            mode: 'builtin' as const,
            modelId: 'multilingual-e5-small',
            dimensions: 384,
            pooling: 'mean' as const,
            normalized: true as const,
            fingerprint: 'mock-fingerprint',
            verifiedAtMs: Date.now(),
            files: [
              { relativePath: 'model.onnx', sizeBytes: 90_000_000, sha256: 'a'.repeat(64) },
              { relativePath: 'tokenizer.json', sizeBytes: 700_000, sha256: 'b'.repeat(64) },
            ],
          }
        case 'probe_localization_semantic_search': {
          const query =
            payload && typeof payload === 'object' && 'request' in payload
              ? String((payload as { request: { query?: string } }).request.query ?? 'spring')
              : 'spring'
          return {
            query,
            retrievalMode: 'semantic',
            elapsedMs: 38,
            totalCandidates: 12,
            records: [
              {
                sourceKind: 'official',
                sourceId: 'StringsFromCSFiles:1',
                sourceText: 'Welcome to the valley!',
                targetText: '欢迎来到山谷！',
                context: 'StringsFromCSFiles',
                score: 0.92,
                semanticSimilarity: 0.91,
                lexicalSimilarity: 0.4,
                matchKind: 'semantic',
                retrievalMode: 'semantic',
              },
              {
                sourceKind: 'translation-memory',
                sourceId: 'tm:42',
                sourceText: 'A soft spring rain.',
                targetText: '一场轻柔的春雨。',
                context: 'Event',
                score: 0.81,
                semanticSimilarity: 0.78,
                lexicalSimilarity: 0.55,
                matchKind: 'hybrid',
                retrievalMode: 'partial',
              },
            ],
            warnings: [],
          }
        }
        case 'download_localization_semantic_model':
          semanticModel = {
            ...semanticModel,
            downloaded: true,
            available: true,
            revision: 'mock-rev-1',
            modelPath: 'E:\\ModForge Dev\\Models\\multilingual-e5-small',
            cacheBytes: 128 * 1024 * 1024,
          }
          return semanticModel
        case 'delete_localization_semantic_model':
          semanticModel = { ...semanticModel, downloaded: false, revision: null, modelPath: null, cacheBytes: 0 }
          return semanticModel
        case 'open_localization_semantic_model_directory':
          return null
        case 'rebuild_localization_semantic_index':
        case 'sync_localization_semantic_index': {
          const request = getMockRequest<{ jobId: string }>(payload)
          const total = semanticIndex.sourceRecords
          for (const percentage of [20, 40, 60, 80, 100]) {
            const completed = Math.round((total * percentage) / 100)
            await emit('localization://semantic-progress', {
              jobId: request?.jobId ?? 'mock-semantic-index',
              modelId: semanticModel.modelId ?? 'multilingual-e5-small',
              kind: 'index',
              phase: command === 'rebuild_localization_semantic_index' ? 'embedding' : 'synchronizing',
              currentFile: `records ${completed}/${total}`,
              downloadedBytes: completed,
              totalBytes: total,
              percentage,
              bytesPerSecond: null,
              fileIndex: completed,
              fileCount: total,
            })
            await new Promise((resolve) => window.setTimeout(resolve, 250))
          }
          semanticIndex = {
            ...semanticIndex,
            indexedRecords: semanticIndex.sourceRecords,
            pendingRecords: 0,
            coveragePercentage: 100,
            stale: false,
          }
          return semanticIndex
        }
        case 'test_localization_semantic_remote_profile':
          return { model: 'text-embedding-3-small', dimensions: 1536, latencyMs: 96 }
        case 'query_ai_usage_summary':
          return createMockUsageSummary()
        case 'query_ai_usage_records': {
          const request = getMockRequest<AiUsageQuery>(payload)
          const limit = request?.limit ?? 100
          const offset = request?.offset ?? 0
          const records = createMockUsageRecords(offset + limit).slice(offset, offset + limit)
          return { records, total: 48 }
        }
        case 'export_ai_usage':
          return 48
        case 'clear_ai_usage':
          return { removedEvents: 48, removedDailyRows: 7 }
        case 'translate_ai_batch': {
          const request = getMockRequest<AiTranslateBatchRequest>(payload)
          if (!request) throw new Error('Missing mock AI translation request')
          return {
            jobId: request.jobId,
            profileId: request.profileId ?? aiSettings.defaultProfileId ?? 'mock-profile',
            model: 'mock-translation-model',
            items: request.items.map((item) => ({
              id: item.id,
              translatedText: `[AI ${request.targetLocale}] ${item.text}`,
              detectedLanguage: request.sourceLocale ?? null,
              skippedSameLanguage: false,
            })),
          }
        }
        case 'cancel_ai_job':
          return null
        case 'read_ai_translation_cache': {
          const request = getMockRequest<Pick<AiTranslationCacheEntry, 'scopeKey' | 'targetLocale' | 'sourceHash'>>(payload)
          if (!request) return null
          const cached = aiCache.get(`${request.scopeKey}:${request.targetLocale}`)
          return cached?.sourceHash === request.sourceHash ? cached : null
        }
        case 'write_ai_translation_cache': {
          const entry =
            payload && typeof payload === 'object' && 'entry' in payload ? (payload as { entry: AiTranslationCacheEntry }).entry : null
          if (!entry) throw new Error('Missing mock AI cache entry')
          aiCache.set(`${entry.scopeKey}:${entry.targetLocale}`, entry)
          return entry
        }
        case 'get_ai_translation_cache_stats':
          return {
            entryCount: aiCache.size,
            sizeBytes: [...aiCache.values()].reduce((total, entry) => total + entry.translatedText.length, 0),
          }
        case 'clear_ai_translation_cache':
          aiCache.clear()
          return { entryCount: 0, sizeBytes: 0 }
        case 'load_launcher_settings':
          return settings
        case 'save_launcher_settings':
          settings = { ...settings, ...getMockRequest<Partial<LauncherSettings>>(payload) }
          return settings
        case 'load_launcher_library_state':
          exposeLauncherCustomSortState(libraryState)
          return libraryState
        case 'save_launcher_library_state':
          libraryState = getMockRequest<LauncherLibraryState>(payload) ?? libraryState
          exposeLauncherCustomSortState(libraryState)
          return libraryState
        case 'load_launcher_library_covers':
          return { covers: [] } satisfies LauncherLibraryCoversState
        case 'load_launcher_download_queue':
          return queueState
        case 'save_launcher_download_queue':
          queueState = getMockRequest<LauncherDownloadQueueState>(payload) ?? queueState
          return queueState
        case 'scan_launcher_library':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, mods } satisfies LauncherLibraryScanResult
        case 'load_launcher_runtime_info':
          return { gameVersion: '1.6.15', smapiVersion: '4.3.0' } satisfies LauncherRuntimeInfo
        case 'load_launcher_gmcm_probe_diagnostics':
          // Quiet ready status for settings mock screenshots; keep warning for launcher-only mock.
          return {
            status: isSettingsMockPreferred() ? 'ready' : 'warning',
            probeAssemblyPath: isSettingsMockPreferred() ? 'E:\\ModForge Dev\\gmcm-reader.dll' : null,
            dotnetPath: 'dotnet',
            dotnetAvailable: isSettingsMockPreferred(),
            net6RuntimeAvailable: isSettingsMockPreferred(),
            installedRuntimes: isSettingsMockPreferred() ? ['.NET 6.0'] : [],
            warnings: isSettingsMockPreferred() ? [] : ['browser-dev-mock'],
            repairActions: isSettingsMockPreferred() ? [] : ['run-desktop-host'],
          } satisfies LauncherGmcmProbeDiagnosticsResult
        case 'load_launcher_nexus_diagnostics':
        case 'restart_launcher_nexus_diagnostics':
          // Settings visual mock: no warning toasts over the dialog screenshots.
          if (isSettingsMockPreferred()) {
            return {
              routes: DEV_LAUNCHER_NEXUS_DIAGNOSTICS.routes.map((route) => ({
                ...route,
                status: 'success' as const,
                available: true,
                attempts: 1,
                maxAttempts: 3,
                message: 'OK',
              })),
            } satisfies LauncherNexusDiagnosticsResult
          }
          return DEV_LAUNCHER_NEXUS_DIAGNOSTICS
        case 'set_launcher_nexus_force_offline':
          return { routes: [] } satisfies LauncherNexusDiagnosticsResult
        case 'load_suppressed_launcher_update_mod_ids':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, modIds: [] } satisfies LauncherSuppressedUpdateModIdsResult
        case 'load_cached_launcher_updates':
          return null
        case 'check_launcher_updates':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, checkedAtMs: Date.now(), updates: [] } satisfies LauncherUpdatesResult
        case 'set_launcher_mod_enabled': {
          const setEnabledRequest = getMockRequest<{ modPath?: string; enabled?: boolean }>(payload)
          return {
            absolutePath: String(setEnabledRequest?.modPath ?? ''),
            enabled: Boolean(setEnabledRequest?.enabled),
          }
        }
        case 'load_launcher_mod_config': {
          const request = getMockRequest<{ modPath?: string }>(payload)
          const modPath = request?.modPath ?? `${DEV_LAUNCHER_MOCK_MODS_PATH}\\Dev Mod`
          return {
            modPath,
            configPath: `${modPath}\\config.json`,
            configExists: true,
            schemaSources: ['content-patcher', 'config-json'],
            warnings: ['GMCM probe is unavailable in the browser dev mock.'],
            probeStatus: 'unavailable',
            fields: [
              {
                key: 'EnableFeature',
                label: 'Enable feature',
                description: 'Development mock boolean option.',
                section: 'General',
                fieldType: 'boolean',
                value: true,
                defaultValue: true,
                allowValues: [],
                allowBlank: false,
                allowMultiple: false,
                editable: true,
                source: 'content-patcher',
              },
              {
                key: 'Mode',
                label: 'Mode',
                description: null,
                section: 'General',
                fieldType: 'string',
                value: 'balanced',
                defaultValue: 'balanced',
                allowValues: ['balanced', 'fast', 'safe'],
                allowBlank: false,
                allowMultiple: false,
                editable: true,
                source: 'content-patcher',
              },
            ],
          }
        }
        case 'save_launcher_mod_config': {
          const request = getMockRequest<{ modPath?: string }>(payload)
          const modPath = request?.modPath ?? `${DEV_LAUNCHER_MOCK_MODS_PATH}\\Dev Mod`
          return {
            modPath,
            configPath: `${modPath}\\config.json`,
            configExists: true,
            schemaSources: ['config-json'],
            warnings: [],
            probeStatus: 'unavailable',
            fields: [],
          }
        }
        case 'open_launcher_path':
        case 'open_launcher_url':
        case 'record_launcher_image_failure':
        case 'write_frontend_log':
        case 'print_host_runtime_diagnostics':
          return null
        case 'get_launcher_backup_directory':
          return 'E:\\ModForge Dev\\Backups'
        case 'validate_nexus_api_key':
          return {
            userName: 'Dev User',
            avatarUrl: null,
            profileUrl: null,
            isPremium: true,
            dailyRemaining: null,
            hourlyRemaining: null,
            dailyResetAt: null,
            hourlyResetAt: null,
          }
        case 'start_nexus_sso':
          return { ssoId: 'dev-sso', status: 'idle' }
        case 'get_nexus_sso_status':
          return { status: 'idle', isPremium: false }
        case 'cancel_nexus_sso':
          return null
        default:
          throw new Error(`Unhandled dev launcher mock command: ${command}`)
      }
    },
    { shouldMockEvents: true },
  )
}
