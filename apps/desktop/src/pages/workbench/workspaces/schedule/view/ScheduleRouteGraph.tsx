import { Braces, Clock3, GitBranch, Mail, Users } from 'lucide-react'
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { useScheduleEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { ScheduleSegment } from '../entities/schedule'

type ScheduleRouteNodeData = {
  segmentIndex: number
  kind: ScheduleSegment['kind']
  title: string
  subtitle: string
}

type ScheduleRouteNode = Node<ScheduleRouteNodeData, 'scheduleRoute'>

function ScheduleRouteNodeView({ data, selected }: NodeProps<ScheduleRouteNode>) {
  const Icon =
    data.kind === 'point'
      ? Clock3
      : data.kind === 'goto'
        ? GitBranch
        : data.kind === 'notFriendship'
          ? Users
          : data.kind === 'mail'
            ? Mail
            : Braces

  return (
    <div className={cx('schedule-route-node', selected && 'is-selected', data.kind !== 'point' && 'is-command')}>
      <Handle type="target" position={Position.Left} className="schedule-route-node-handle" />
      <span className="schedule-route-node-icon" aria-hidden="true">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="schedule-route-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </span>
      <Handle type="source" position={Position.Right} className="schedule-route-node-handle" />
    </div>
  )
}

const NODE_TYPES = { scheduleRoute: ScheduleRouteNodeView }

function formatTime(time: number) {
  const hour = Math.floor(time / 100)
  return `${hour}:${String(time % 100).padStart(2, '0')}`
}

/** Read-only topology canvas; selecting a node drives the shared segment inspector and map. */
export function ScheduleRouteGraph({
  segments,
  selectedIndex,
  onSelect,
}: {
  segments: ScheduleSegment[]
  selectedIndex: number | null
  onSelect: (segmentIndex: number) => void
}) {
  const copy = useScheduleEditorCopy()
  const nodes: ScheduleRouteNode[] = segments.map((segment, segmentIndex) => {
    let title: string
    let subtitle: string
    switch (segment.kind) {
      case 'point':
        title = formatTime(segment.time)
        subtitle = [segment.location || copy.locationPlaceholder, segment.x === null ? null : `${segment.x}, ${segment.y}`]
          .filter(Boolean)
          .join(' · ')
        break
      case 'goto':
        title = copy.segmentGotoLabel
        subtitle = segment.target || copy.gotoTargetPlaceholder
        break
      case 'notFriendship':
        title = copy.segmentFriendshipLabel
        subtitle = segment.requirements.map((item) => `${item.npc || copy.friendshipNpcPlaceholder} ${item.hearts}`).join(' · ')
        break
      case 'mail':
        title = copy.segmentMailLabel
        subtitle = segment.mailId || copy.mailIdPlaceholder
        break
      case 'raw':
        title = copy.segmentRawLabel
        subtitle = segment.text || copy.rawSegmentPlaceholder
        break
    }

    return {
      id: `segment-${segmentIndex}`,
      type: 'scheduleRoute',
      position: { x: segmentIndex * 220, y: 36 },
      selected: segmentIndex === selectedIndex,
      data: { segmentIndex, kind: segment.kind, title, subtitle },
    }
  })
  const edges: Edge[] = segments.slice(1).map((_, index) => ({
    id: `route-${index}-${index + 1}`,
    source: `segment-${index}`,
    target: `segment-${index + 1}`,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  }))

  return (
    <div className="schedule-route-graph" aria-label={copy.routePreviewTitle}>
      {segments.length === 0 ? (
        <p className="schedule-route-graph-empty">{copy.noSegmentsHint}</p>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          minZoom={0.45}
          maxZoom={1.75}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onNodeClick={(_, node) => onSelect(node.data.segmentIndex)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border-color)" gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  )
}
