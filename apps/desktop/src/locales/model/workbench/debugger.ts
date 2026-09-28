/** Copy for the game debugger module (game-debugger). Owned by the debugger workspace slice. */
export type GameDebuggerCopy = {
  title: string
  subtitle: string
  sections: {
    events: string
    dialogue: string
    player: string
    warp: string
    time: string
    weather: string
    relationship: string
    advanced: string
  }
  disconnectedOverlayTitle: string
  disconnectedOverlayHint: string
  bridgeMod: {
    title: string
    installedLabel: string
    notInstalledLabel: string
    installedVersionTemplate: (version: string) => string
    payloadVersionTemplate: (version: string) => string
    payloadMissing: string
    payloadMissingHint: string
    installAction: string
    updateAction: string
    reinstallAction: string
    installing: string
    installFailedTemplate: (error: string) => string
    installedStatus: string
    modsPathLabel: string
    noGameDirectory: string
    restartHint: string
  }
  gameState: {
    title: string
    connectionLabel: string
    connectedLabel: string
    disconnectedLabel: string
    saveLabel: string
    saveLoaded: string
    saveWaiting: string
    playerLabel: string
    locationLabel: string
    dateLabel: string
    dateTemplate: (season: string, day: number, year: number) => string
    timeLabel: string
    weatherLabel: string
    eventLabel: string
    eventRunningTemplate: (eventId: string) => string
    eventNone: string
    moneyLabel: string
    emptyValue: string
    refreshAction: string
    seasonNames: Record<'spring' | 'summer' | 'fall' | 'winter', string>
    weatherNames: Record<'Sun' | 'Rain' | 'GreenRain' | 'Wind' | 'Storm' | 'Snow' | 'Festival', string>
  }
  connectionLog: {
    title: string
    clearAction: string
    empty: string
    connected: string
    disconnectedTemplate: (error: string) => string
    reconnecting: string
    commandSentTemplate: (command: string) => string
    commandFailedTemplate: (command: string, error: string) => string
    installStarted: string
    installFinishedTemplate: (version: string) => string
  }
  events: {
    tempPatchTitle: string
    tempPatchHint: string
    targetLabel: string
    targetPlaceholder: string
    entryKeyLabel: string
    entryKeyPlaceholder: string
    entryValueLabel: string
    entryValuePlaceholder: string
    applyAction: string
    applyAndPlayAction: string
    appliedStatus: string
    playRequiresEventTarget: string
    entryKeyRequired: string
    targetRequired: string
    valueRequired: string
    clearTempAction: string
    clearedStatus: string
    projectPreviewTitle: string
    projectPreviewHint: string
    projectPreviewEmpty: string
    projectPreviewNoProject: string
    projectEntryUnnamed: string
    debugEntryAction: string
    scriptRunTitle: string
    scriptRunHint: string
    scriptLabel: string
    scriptPlaceholder: string
    runScriptAction: string
    scriptRequired: string
    scriptStartedStatus: string
  }
  dialogue: {
    title: string
    hint: string
    npcLabel: string
    npcPlaceholder: string
    textLabel: string
    textPlaceholder: string
    showAction: string
    npcRequired: string
    textRequired: string
    shownStatus: string
  }
  player: {
    title: string
    moneyLabel: string
    moneyAmountPlaceholder: string
    moneyAddAction: string
    moneyDeductAction: string
    moneyUpdatedTemplate: (money: number) => string
    staminaLabel: string
    staminaFillAction: string
    staminaSetAction: string
    healthLabel: string
    healthFillAction: string
    healthSetAction: string
    valuePlaceholder: string
    updatedStatus: string
    amountRequired: string
  }
  warp: {
    title: string
    hint: string
    locationLabel: string
    locationPlaceholder: string
    coordinateXLabel: string
    coordinateYLabel: string
    warpAction: string
    locationRequired: string
    warpedStatus: string
    presetsLabel: string
  }
  time: {
    title: string
    hint: string
    hourLabel: string
    minuteLabel: string
    setAction: string
    setStatusTemplate: (time: string) => string
    presetsLabel: string
    presetMorning: string
    presetNoon: string
    presetEvening: string
    presetNight: string
  }
  weather: {
    title: string
    hint: string
    tomorrowLabel: string
    setAction: string
    setStatusTemplate: (weather: string) => string
  }
  relationship: {
    title: string
    hint: string
    npcLabel: string
    npcPlaceholder: string
    heartsLabel: string
    heartsValueTemplate: (hearts: number) => string
    setAction: string
    npcRequired: string
    setStatusTemplate: (npc: string, hearts: number) => string
  }
  advanced: {
    title: string
    hint: string
    commandLabel: string
    commandPlaceholder: string
    runAction: string
    commandRequired: string
    notHandled: string
    outputTitle: string
    outputEmpty: string
    presetsTitle: string
    presets: {
      dayUpdate: string
      levelUpFarming: string
      growCrops: string
      hurryNpc: string
      whereIsNpc: string
      seenEventReset: string
    }
    dangerHint: string
  }
}
