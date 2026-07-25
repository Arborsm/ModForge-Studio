/** Copy for one guide step: card title plus body text. */
export type GuideStepCopy = {
  title: string
  description: string
}

/** Copy owned by a single functional-area guide. */
export type GuideDefinitionCopy = {
  /** Guide name shown in the settings replay list. */
  title: string
  /** Step copy keyed by step id from the guide definition. */
  steps: Record<string, GuideStepCopy>
}

/** Functional-area guides shipped with the app; dictionaries must cover every id. */
export type GuideId =
  | 'launcher-library'
  | 'launcher-discover'
  | 'launcher-updates'
  | 'launcher-configuration'
  | 'workbench-home'
  | 'workbench-translation'

export type GuidesCopy = {
  controls: {
    previous: string
    next: string
    skip: string
    finish: string
    stepCounter: (current: number, total: number) => string
    /** Hint replacing the Next button on steps that advance by clicking the highlighted anchor. */
    anchorClickHint: string
  }
  /** Info notification shown when a replayed guide starts once its page is opened. */
  replayPendingTitle: string
  replayPendingDescription: (guideTitle: string) => string
  definitions: Record<GuideId, GuideDefinitionCopy>
}
