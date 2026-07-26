/** Stable event command categories shared by the Rust parser and event-stage consumers. */
export type EventCommandKind = 'dialogue' | 'message' | 'choice' | 'branch' | 'timing' | 'flow' | 'action'

/** One selectable event branch and its raw nested commands. */
export type EventBranchChoice = {
  id: string
  label: string
  branchRawCommands: string[]
}

/** One visible page after Stardew dialogue markup has been resolved. */
export type EventDialoguePage = {
  id: string
  text: string
  portraitIndex: number
}

/** Canonical structured event command returned by the Rust event parser. */
export type EventCommand = {
  id: string
  index: number
  raw: string
  command: string
  args: string[]
  kind: EventCommandKind
  title: string
  detail: string
  actorName?: string
  text?: string
  dialoguePages?: EventDialoguePage[]
  frame?: number
  animationFrames?: number[]
  animationFlip?: boolean
  animationLoop?: boolean
  animationFrameDurationMs?: number
  delayMs?: number
  questionKey?: string
  prompt?: string
  choices?: EventBranchChoice[]
  embeddedQuestion?: {
    prompt: string
    choices: EventBranchChoice[]
  }
  targetEventKey?: string
  targetConditionId?: string | null
  isTranslationKey?: boolean
  forkChoiceIndex?: number | null
  portraitSuffix?: string | null
  spriteSuffix?: string | null
}

/** Actor placement from the first three event setup segments. */
export type EventSceneActor = {
  id: string
  actorName: string
  tileX: number
  tileY: number
  facingDirection: number
  breather?: boolean | null
}

/** Parsed music, viewport, and actor setup for an event. */
export type EventSceneSetup = {
  musicCue: string | null
  cameraInstruction: string | null
  characterInstruction: string | null
  actors: EventSceneActor[]
}

/** One canonical event script parsed from a Stardew event asset record. */
export type EventScript = {
  key: string
  eventId: string
  preconditions: string[]
  rawScript: string
  rawSegments: string[]
  scene: EventSceneSetup
  commands: EventCommand[]
}
