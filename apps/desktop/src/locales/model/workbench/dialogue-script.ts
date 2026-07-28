/**
 * Copy for the shared dialogue script field (`entities/dialogue`), used by both
 * the dialogue workspace canvas and the event workflow `dialogue_script`
 * control. Kept separate from `DialogueEditorCopy` because it is consumed
 * outside the dialogue workspace slice.
 */
/**
 * Labels for the structured advanced-segment cards (`$c $p $d $y $t $k $1
 * $query $action`). Shared by the dialogue workspace and the script field so a
 * command is named the same wherever it is rendered.
 */
export type DialogueCommandCopy = {
  commandBadge: string
  commandLabels: {
    c: string
    p: string
    d: string
    y: string
    t: string
    k: string
    '1': string
    query: string
    action: string
  }
  commandArgLabels: {
    chance: string
    eventIds: string
    flag: string
    quickQuestion: string
    timeFrom: string
    timeTo: string
    eventId: string
    onceId: string
    gameStateQuery: string
    triggerAction: string
  }
  /** Title of one `$r` sub-branch under a question, e.g. "分支 1". */
  branchTitleTemplate: string
}

export type DialogueScriptFieldCopy = {
  fieldTitle: string
  emptyHint: string
  pageTitleTemplate: string
  separatorEndBadge: string
  separatorBreakBadge: string
  separatorEndTitle: string
  separatorBreakTitle: string
  addPageEndAction: string
  addPageBreakAction: string
  removePageAction: string
  textPlaceholder: string
  portraitLabel: string
  portraitNone: string
  portraitIndexLabel: string
  emotionNeutral: string
  emotionHappy: string
  emotionSad: string
  emotionUnique: string
  emotionLove: string
  emotionAngry: string
  questionBadge: string
  addQuestionAction: string
  removeQuestionAction: string
  questionIdsLabel: string
  questionFallbackLabel: string
  questionPromptLabel: string
  questionPromptPlaceholder: string
  responseTitleTemplate: string
  responseIdLabel: string
  responseScoreLabel: string
  responseResultKeyLabel: string
  responseTextPlaceholder: string
  addResponseAction: string
  removeResponseAction: string
  rawPageBadge: string
  rawPageNotice: string
  commands: DialogueCommandCopy
  /** Collapsed summary shown on an event command pill. */
  pageCountTemplate: string
  applyAction: string
  cancelAction: string
}
