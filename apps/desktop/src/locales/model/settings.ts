import type { LocaleCode } from './core'
import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionStyleId } from '@shared/lib/loading-motion'

export type SettingsMenuCopy = {
  title: string
  categories: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    ai: string
    debug: string
  }
  closeDialogLabel: string
  cancelActionLabel: string
  themeLabel: string
  resetThemeLabel: string
  themeDescription: string
  themeLabels: Record<string, string>
  languageLabel: string
  languageDescription: string
  localeLabels: Record<LocaleCode, string>
  windowModeLabel: string
  windowBorderToneLabel: string
  windowBorderToneDescription: string
  windowBorderToneOptions: Record<'accent' | 'neutral', string>
  windowBorderWeightLabel: string
  windowBorderWeightDescription: string
  windowBorderWeightOptions: Record<'standard' | 'thin' | 'none', string>
  closeBehaviorLabel: string
  closeBehaviorDescription: string
  closeBehaviorOptions: Record<'quit' | 'minimizeToTray', string>
  rememberCloseChoiceLabel: string
  borderlessFullscreenLabel: string
  borderlessFullscreenDescription: string
  enableBorderlessFullscreenLabel: string
  disableBorderlessFullscreenLabel: string
  debugModeLabel: string
  debugModeDescription: string
  enableDebugModeLabel: string
  disableDebugModeLabel: string
  notificationSoundLabel: string
  notificationSoundDescription: string
  enableNotificationSoundLabel: string
  disableNotificationSoundLabel: string
  loadingMotionStyleLabel: string
  loadingMotionStyleDescription: string
  loadingMotionIntensityLabel: string
  loadingMotionIntensityDescription: string
  loadingMotionSpeedLabel: string
  loadingMotionSpeedDescription: string
  loadingMotionStyleLabels: Record<LoadingMotionStyleId, string>
  loadingMotionIntensityLabels: Record<LoadingMotionIntensityId, string>
  loadingMotionSpeedLabels: Record<LoadingMotionSpeedId, string>
  loadingMotionCustomSpeedLabel: string
  loadingMotionCustomSpeedDescription: string
  loadingMotionCustomSpeedToggleLabel: string
  loadingMotionPresetSpeedToggleLabel: string
  loadingMotionSpeedValueLabel: (value: number) => string
  quitDialogTitle: string
  quitDialogMessage: string
  quitDialogDescription: string
  quitActionLabel: string
  minimizeToTrayActionLabel: string
  futureLabel: string
  futureDescription: string
  ai: {
    tabs: { generative: string; machineTranslation: string; usage: string }
    title: string
    description: string
    addProfile: string
    noProfiles: string
    defaultProfile: string
    setDefault: string
    profileName: string
    provider: string
    protocol: string
    baseUrl: string
    model: string
    apiKey: string
    apiKeyPlaceholder: string
    clearApiKey: string
    environment: string
    credentialKeychain: string
    credentialEnvironment: string
    credentialMissing: string
    save: string
    saving: string
    delete: string
    loadModels: string
    testConnection: string
    saveBeforeRemoteActions: string
    testing: string
    testSuccess: (latency: number) => string
    cacheTitle: string
    cacheStats: (entries: number, size: string) => string
    clearCache: string
    clearCacheConfirm: string
    loadError: string
    saveError: string
    machineTranslation: {
      title: string
      description: string
      addProfile: string
      noProfiles: string
      region: string
      credentials: string
      enabled: string
      defaultSource: string
      defaultTarget: string
      credentialLabels: Record<'api-key' | 'app-id' | 'secret' | 'secret-id' | 'secret-key', string>
      capability: string
      dynamicLanguages: string
      staticLanguages: string
      itemLimit: (value: number) => string
      batchLimit: (value: number) => string
      htmlSupported: string
      glossarySupported: string
      exactKnowledgeOnly: string
      languageCount: (value: number) => string
      loadLanguages: string
      loadLanguagesError: string
      saveError: string
      loadError: string
      requiredField: string
      invalidEndpoint: string
      localePairConflict: string
    }
    usage: {
      title: string
      description: string
      today: string
      sevenDays: string
      thirtyDays: string
      custom: string
      from: string
      to: string
      allEngines: string
      generativeAi: string
      machineTranslation: string
      allProfiles: string
      allModels: string
      allOperations: string
      allStatuses: string
      succeeded: string
      failed: string
      inputTokens: string
      outputTokens: string
      cachedTokens: string
      characters: string
      requests: string
      failures: string
      date: string
      engine: string
      profile: string
      model: string
      operation: string
      status: string
      latency: string
      unavailable: string
      exportCsv: string
      clearDetails: string
      clearAll: string
      clearDetailsConfirm: string
      clearAllConfirm: string
      empty: string
      loading: string
      loadError: string
      actionError: string
      retry: string
      previousPage: string
      nextPage: string
      pageSummary: (from: number, to: number, total: number) => string
    }
  }
  categoryDescriptions: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    ai: string
    debug: string
  }
}
