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
  unsavedChangesTitle: string
  unsavedChangesDescription: string
  unsavedChangesDetail: string
  continueEditing: string
  leaveWithoutSaving: string
  themeLabel: string
  resetThemeLabel: string
  themeDescription: string
  themeLabels: Record<string, string>
  languageLabel: string
  languageDescription: string
  interfaceLanguageLabel: string
  interfaceLanguageDescription: string
  localeLabels: Record<LocaleCode, string>
  groups: {
    preview: string
    parameters: string
    window: string
    close: string
    notification: string
    developer: string
  }
  currentSelectionLabel: (value: string) => string
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
  enabledStateLabel: string
  disabledStateLabel: string
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
  loadingMotionPreviewLabel: string
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
    semantic: {
      title: string
      description: string
      workflowHint: string
      step1Title: string
      step1Description: string
      step2Title: string
      step2Descriptions: Record<'lexical' | 'builtin' | 'local-onnx' | 'remote-openai', string>
      step2Next: Record<
        | 'lexical'
        | 'builtin-need-download'
        | 'builtin-ready'
        | 'local-need-path'
        | 'local-ready'
        | 'remote-need-save'
        | 'remote-need-confirm'
        | 'remote-ready',
        string
      >
      step3Title: string
      step3Description: string
      step3BlockedDirty: string
      step3BlockedRemote: string
      step3BlockedBackend: string
      step4Title: string
      step4Description: string
      healthTitle: string
      mode: string
      modes: Record<'lexical' | 'builtin' | 'local-onnx' | 'remote-openai', string>
      modeDescriptions: Record<'lexical' | 'builtin' | 'local-onnx' | 'remote-openai', string>
      modelStatus: string
      currentState: string
      indexCoverage: string
      indexedMetric: string
      pendingMetric: string
      modelDetails: string
      notAvailable: string
      downloading: string
      paused: string
      partRetained: string
      downloadProgress: string
      phaseLabels: Record<string, string>
      available: string
      availableReady: string
      unavailable: string
      downloaded: string
      notDownloaded: string
      model: string
      cache: string
      coverage: (indexed: number, total: number, percentage: number) => string
      coverageShort: (indexed: number, total: number) => string
      pending: (count: number) => string
      download: string
      pause: string
      resume: string
      retry: string
      refetch: string
      verify: string
      verifying: string
      verificationRunning: string
      verificationRunningDescription: string
      verificationTitle: string
      verificationPassed: string
      verificationDimensions: string
      verificationPooling: string
      verificationNormalization: string
      verificationFingerprint: string
      verificationTime: string
      verificationFiles: string
      verificationSha256: string
      verificationError: string
      verificationClose: string
      fingerprintKeeps: string
      verifiedAt: (when: string) => string
      dockSaved: string
      dockUnsaved: string
      probeTitle: string
      probeDescription: string
      probeQuery: string
      probePlaceholder: string
      probeRun: string
      probeRunning: string
      probeEmpty: string
      probeMeta: (mode: string, total: number, elapsed: number) => string
      probeOfficial: string
      probeMemory: string
      probeContext: string
      probeScore: string
      probeSemantic: string
      probeLexical: string
      probeMatchKind: string
      delete: string
      deleteRunning: string
      deleteSuccess: string
      chooseDirectory: string
      openDirectory: string
      openDirectorySuccess: string
      configure: string
      retrievalModes: Record<'lexical' | 'semantic' | 'partial', string>
      rebuild: string
      sync: string
      save: string
      saving: string
      savedToast: string
      indexing: string
      indexCorpus: string
      indexDesc: (indexed: number, total: number, pending: number, fingerprint: string) => string
      currentFile: string
      progress: (downloaded: string, total: string, percentage: number, speed: string) => string
      indexProgress: (completed: number, total: number, percentage: number) => string
      downloadComplete: string
      localDirectory: string
      remoteSectionTitle: string
      remoteName: string
      remoteUrl: string
      remoteModel: string
      remoteApiKey: string
      remoteEnvironment: string
      remoteEnvironmentFallback: string
      remoteEnvironmentHint: string
      remoteUploadTitle: string
      remoteDisclosure: (count: number, batches: number) => string
      confirmRemote: string
      confirmRemoteOn: string
      confirmRemoteOff: string
      testConnection: string
      testSuccess: (latency: number, dimensions: number) => string
      loading: string
      loadingHint: string
      loadError: string
      actionError: string
      actionSuccess: string
      lexicalReady: string
      stale: string
    }
    tabs: { engine: string; generative: string; machineTranslation: string; semantic: string; usage: string }
    defaultEngine: {
      title: string
      description: string
      current: string
      generative: string
      generativeDescription: string
      machineTranslation: string
      machineTranslationDescription: string
      engineTypeLabel: string
      defaultProfileLabel: string
      available: string
      unavailable: string
      noProfiles: string
      emptyTitle: string
      emptyDescription: string
      goCreateGenerative: string
      goCreateMachineTranslation: string
      emptyKindTitle: string
      emptyKindDescription: string
      explicitFailure: string
      select: string
      loading: string
      save: string
      saving: string
      saved: string
      loadError: string
      saveError: string
      noneSelected: string
    }
    title: string
    description: string
    addProfile: string
    profileList: string
    untitledProfile: string
    modelNotSet: string
    savedState: string
    unsavedChanges: string
    dirtyTag: string
    dockReadyRemoteActions: string
    dockUnsavedRemoteActions: string
    loadModelsRunning: string
    loadModelsSuccess: (count: number) => string
    connectionTestTitle: string
    connectionTestClose: string
    importProfiles: string
    exportProfiles: string
    exportProfilesSafe: string
    exportSuccess: (count: number) => string
    importTitle: string
    importCredentialsExcluded: string
    importConflictPolicy: string
    importOverwrite: string
    importCopy: string
    importSkip: string
    importConflict: string
    importNew: string
    importApply: string
    importCancel: string
    importSuccess: (imported: number, overwritten: number, copied: number, skipped: number) => string
    importError: string
    connectionDetails: string
    endpoint: string
    credentialSource: string
    latency: string
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
    testingConnection: string
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
      profileList: string
      noProfiles: string
      credentialsConfigured: (count: number) => string
      region: string
      credentials: string
      enabled: string
      enabledStatus: string
      disabledStatus: string
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
      loadLanguagesRunning: string
      loadLanguagesSuccess: (count: number) => string
      dockReadyRemoteActions: string
      dockUnsavedRemoteActions: string
      saveError: string
      loadError: string
      requiredField: string
      invalidEndpoint: string
      localePairConflict: string
    }
    usage: {
      title: string
      description: string
      diagnosticTitle: string
      diagnosticDescription: string
      dockMeta: string
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
      failuresAttempt: string
      averageP95Latency: string
      attemptSuccessRate: string
      jobSuccessRate: string
      cacheHitRate: string
      tokenUnavailableRequests: string
      tokenIoFull: string
      providerModelBreakdown: string
      failureBreakdown: string
      detailCoveragePartial: (date: string) => string
      attemptsFactSource: string
      detailMeta: (filter: string) => string
      detailFilterAll: string
      clearFilter: string
      job: string
      attempt: string
      attemptResult: string
      jobResult: string
      failureCategory: string
      tokenIo: string
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
      purgeUsage: string
      clearDetailsConfirm: string
      clearAllConfirm: string
      empty: string
      loading: string
      loadingHint: string
      refresh: string
      refreshing: string
      exportRunning: string
      exportSuccess: string
      purgeRunning: string
      purgeSuccess: string
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
