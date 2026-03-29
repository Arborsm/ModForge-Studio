import type { EventAssetSummary } from '../desktop'

export type EventCommandKind =
  | 'dialogue'
  | 'message'
  | 'choice'
  | 'branch'
  | 'timing'
  | 'flow'
  | 'action'

export type EventBranchChoice = {
  id: string
  label: string
  branchRawCommands: string[]
}

export type EventDialoguePage = {
  id: string
  text: string
  portraitIndex: number
}

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
  targetEventKey?: string
  targetConditionId?: string | null
  isTranslationKey?: boolean
  forkChoiceIndex?: number | null
  portraitSuffix?: string | null
  spriteSuffix?: string | null
}

export type EventSceneActor = {
  id: string
  actorName: string
  tileX: number
  tileY: number
  facingDirection: number
  breather?: boolean | null
}

export type EventSceneSetup = {
  musicCue: string | null
  cameraInstruction: string | null
  characterInstruction: string | null
  actors: EventSceneActor[]
}

export type EventScript = {
  key: string
  eventId: string
  preconditions: string[]
  rawScript: string
  rawSegments: string[]
  scene: EventSceneSetup
  commands: EventCommand[]
}

export type ParsedEventAsset = {
  asset: EventAssetSummary
  locale: string | null
  resolvedRelativePath: string
  events: EventScript[]
  eventIndex: Record<string, EventScript>
}

export type EventGraphNode = {
  id: string
  x: number
  y: number
  kind: EventCommandKind | 'event' | 'option'
  title: string
  detail: string
  eventKey: string
  raw?: string
  synthetic?: boolean
}

export type EventGraphEdge = {
  id: string
  source: string
  target: string
  label?: string
  style?: 'default' | 'choice' | 'branch' | 'switch'
}

export type EventGraph = {
  nodes: EventGraphNode[]
  edges: EventGraphEdge[]
}
