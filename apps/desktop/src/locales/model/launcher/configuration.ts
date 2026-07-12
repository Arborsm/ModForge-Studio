export type LauncherConfigurationCopy = {
  diagnostics: {
    title: string
    sectionTitle: string
    sectionSubtitle: string
    apiKeyTitle: string
    apiKeySubtitle: string
    apiKeyBadge: string
    apiKeyMissing: string
    apiKeyUnchecked: string
    premiumActive: string
    premiumFree: string
    premiumExpiresAt: (date: string) => string
    premiumLifetime: string
    quotaRemaining: (remaining: string) => string
    hourlyQuotaRemaining: (remaining: string) => string
    quotaResetAt: (time: string) => string
    lastRefresh: (time: string) => string
    staleWarning: string
    loading: string
    empty: string
    justNow: string
    secondsAgo: (seconds: string) => string
    minutesAgo: (minutes: string) => string
    hoursAgo: (hours: string) => string
    retryRouteAction: (routeLabel: string) => string
    validateApiKeyAction: string
    startSsoAction: string
    cancelSsoAction: string
    ssoWaiting: string
    ssoAuthorized: string
    errorCardLabel: string
    errors: Record<
      | 'invalidApiKey'
      | 'premiumRequired'
      | 'rateLimited'
      | 'serviceUnavailable'
      | 'network'
      | 'ssoCancelled'
      | 'ssoTimeout'
      | 'ssoDenied'
      | 'unknown',
      {
        title: string
        detail: string
        action: string
      }
    >
  }
  downloads: {
    title: string
    subtitle: string
    empty: string
    /** Header meta: total only, e.g. "28 项" / "28 items". */
    queueCount: (count: number) => string
    /** Header meta when something is downloading: "28 项 · 3 进行中". */
    queueActiveMeta: (total: number, active: number) => string
    /** Bulk install CTA: "安装 3 项" / "Install 3". */
    installReady: (count: number) => string
    /** Bulk clear finished/failed removable items. */
    clearFinished: string
    /** Bulk retry failed items. */
    retryFailed: string
    backgroundQueuedTitle: string
    backgroundQueuedSummary: (count: number) => string
    backgroundQueuedDetail: string
    manualDownloadOpenedTitle: string
    manualDownloadOpenedDetail: string
  }
  settings: {
    title: string
    subtitle: string
    pathsTitle: string
    pathsHint: string
    gamePathHint: string
    modsPathHint: string
    downloadPathHint: string
    pathNotConfigured: string
    nexusAccessTitle: string
    nexusAccessHint: string
    nexusReauthorize: string
    nexusNormalStatus: string
    nexusApiSsoMethod: string
    nexusGuestTitle: string
    nexusGuestSubtitle: string
    nexusSignInAction: string
    nexusPasteApiKeyAction: string
    nexusClearApiKeyAction: string
    nexusQuotaDaily: string
    nexusQuotaHourly: string
    nexusQuotaDailyLimit: string
    nexusQuotaHourlyLimit: string
    nexusQuotaPercent: (percent: number) => string
    nexusQuotaResetIn: (duration: string) => string
    nexusQuotaDurationHoursMinutes: (hours: number, minutes: number) => string
    nexusQuotaDurationMinutes: (minutes: number) => string
    nexusQuotaDailyResetHint: string
    nexusQuotaHourlyResetHint: string
    nexusApiRest: string
    nexusApiGraphql: string
    nexusApiImageCdn: string
    nexusApiAvailable: string
    nexusApiSlow: string
    nexusApiUnavailable: string
    downloadBehaviorTitle: string
    downloadDefaultsTitle: string
    downloadBehaviorHint: string
    autoCheckUpdatesHint: string
    autoInstallHint: string
    keepArchivesHint: string
    loadFailed: string
    saved: string
    saveFailed: string
    configurationScoreLabel: string
    configurationReady: string
    configurationNeedsReview: string
    configurationBreadcrumb: string
    configurationGameTitle: string
    configurationStatusLine: (status: string, modCount: string, diagnosticsAge: string) => string
    configurationInstalledMods: (count: number) => string
    configurationInstalledModsUnknown: string
    configurationDiagnosticsJustNow: string
    configurationDiagnosticsMinutesAgo: (minutes: number) => string
    configurationRunDiagnostics: string
    configurationViewLogs: string
    configurationGameVersionTag: (version: string) => string
    configurationSmapiVersionTag: (version: string) => string
    configurationVersionUnknown: string
    configurationIssueSummary: (pending: number) => string
    configuredPathsSummary: (configured: number, total: number) => string
    completionTitle: string
    completionReady: (ready: number, total: number) => string
    completionPending: (pending: number) => string
    stepPaths: string
    stepNexus: string
    stepDownloads: string
    stepDiagnostics: string
    stepGmcmProbe: string
    nexusReady: string
    nexusMissing: string
    downloadsReady: string
    downloadsLimited: string
    diagnosticsHealthy: string
    diagnosticsReview: string
    gmcmProbeReady: string
    gmcmProbeReview: string
  }
  configuration: {
    title: string
    subtitle: string
    moreToolsTitle: string
    moreToolsSubtitle: string
    moreToolsAction: string
    lessToolsAction: string
    debugToolsStateGroupTitle: string
    debugToolsFeedbackGroupTitle: string
    debugToolsModulesGroupTitle: string
    debugOnlyTitle: string
    debugOnlyDescription: string
    notificationsOverviewTitle: string
    logsOverviewTitle: string
    notificationsTitle: string
    notificationsSubtitle: string
    logsTitle: string
    logsSubtitle: string
    nexusDiagnosticsTitle: string
    nexusDiagnosticsSubtitle: string
    nexusDiagnosticsLoading: string
    nexusDiagnosticsEmpty: string
    nexusDiagnosticsEndpointLabel: string
    nexusDiagnosticsAttemptsLabel: string
    nexusDiagnosticsRouteLabel: string
    nexusDiagnosticsObservedLabel: string
    nexusDiagnosticsAvailabilityLabel: string
    nexusDiagnosticsAvailableState: string
    nexusDiagnosticsUnavailableState: string
    nexusDiagnosticsLoadingState: string
    nexusDiagnosticsRouteResponsibilities: Record<
      'publicGraphql' | 'privateGraphql' | 'nexusApi' | 'nexusImages' | 'smapi' | 'fallback',
      string
    >
    gmcmProbeTitle: string
    gmcmParsingDisabled: string
    gmcmParsingDisabledDescription: string
    gmcmProbeSubtitle: string
    gmcmProbeReady: string
    gmcmProbeWarning: string
    gmcmProbeUnavailable: string
    gmcmProbeNotificationImpact: string
    gmcmProbeNotificationNote: string
    gmcmProbeAssemblyLabel: string
    gmcmProbeDotnetLabel: string
    gmcmProbeRuntimeLabel: string
    gmcmProbePathMissing: string
    gmcmProbePathReady: string
    gmcmProbeDotnetReady: string
    gmcmProbeDotnetMissing: string
    gmcmProbeRuntimeReady: string
    gmcmProbeRuntimeMissing: string
    gmcmProbeInstalledRuntimes: (count: number) => string
    gmcmProbeNoRuntimes: string
    gmcmProbeResolveAction: string
    gmcmProbeDetailsTitle: string
    gmcmProbeDetailsSubtitle: string
    gmcmProbeTechnicalDetails: string
    gmcmProbeTechnicalDetailsHint: string
    gmcmProbeDownloadDotnet: string
    gmcmProbeRepairsTitle: string
    gmcmProbeRepairActions: Record<
      'install-dotnet-6-runtime' | 'set-modforge-dotnet-path' | 'rebuild-or-reinstall-probe' | 'run-desktop-host',
      string
    >
    gmcmProbeWarningsTitle: string
    gmcmProbeWarningMessages: Record<
      'probe-assembly-missing' | 'dotnet-host-missing' | 'dotnet-runtime-list-failed' | 'net6-runtime-missing' | 'browser-dev-mock',
      string
    >
    nexusDiagnosticsNotificationTitle: string
    nexusDiagnosticsNotificationImpact: (targets: string) => string
    nexusDiagnosticsNotificationLimitedImpact: string
    nexusDiagnosticsNotificationBody: (count: number) => string
    nexusDiagnosticsNotificationNote: string
    nexusMessagePreviewTitle: string
    nexusMessagePreviewSubtitle: string
    nexusMessagePreviewHealthyDetail: string
    nexusMessagePreviewUnavailableDetail: (targets: string) => string
    nexusMessagePreviewLimitedDetail: string
    nexusMessagePreviewNote: string
    nexusMessagePreviewDiscoverTarget: string
    nexusMessagePreviewUpdatesTarget: string
    forceOfflineEnableButton: string
    forceOfflineDisableButton: string
    forceOfflineEnabledLabel: string
    forceOfflineDisabledLabel: string
    forceNonPremiumEnableButton: string
    forceNonPremiumDisableButton: string
    forceNonPremiumEnabledLabel: string
    forceNonPremiumDisabledLabel: string
    clearImageCacheTitle: string
    clearImageCacheSubtitle: string
    clearImageCacheButton: string
    bbcodePreviewTitle: string
    bbcodePreviewSubtitle: string
    bbcodePreviewExpandAction: string
    bbcodePreviewCollapseAction: string
    simulationTitle: string
    simulationSubtitle: string
    simulationParametersLabel: string
    simulationButtonIdle: string
    simulationButtonRunning: string
    notificationButtons: Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
    logButtons: Record<'debug' | 'info' | 'warning' | 'error', string>
  }
}
