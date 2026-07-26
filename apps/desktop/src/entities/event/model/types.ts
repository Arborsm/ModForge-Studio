import type { EventAssetSummary } from '@entities/game/api'
import type { EventCommandKind, EventScript } from '@shared/contracts/event-script'

export type {
  EventBranchChoice,
  EventCommand,
  EventCommandKind,
  EventDialoguePage,
  EventSceneActor,
  EventSceneSetup,
  EventScript,
} from '@shared/contracts/event-script'

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
