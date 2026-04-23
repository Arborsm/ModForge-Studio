// components/event-workflow/StagePathOverlay.tsx
// 地图路径/轨迹渲染 — 在 EventStagePreview 上叠加 SVG 路径层

import { useMemo } from 'react'
import type { EventScript } from '../../lib/events/types'
import { getSchema } from '../../lib/events/commandSchemaRegistry'
import type { MapDocument } from '../../lib/maps/types'

export type StagePathOverlayProps = {
  eventScript: EventScript | null
  mapDocument: MapDocument | null
  selectedCommandIndex?: number | null
  hoveredCommandIndex?: number | null
}

// ─── Actor 轨迹点 ────────────────────────────────────────────────────────

type PathPoint = {
  x: number
  y: number
  commandIndex: number
  command: string
  kind: 'move' | 'warp' | 'offset' | 'spawn' | 'face'
}

type ActorPath = {
  actorKey: string
  actorName: string
  color: string
  points: PathPoint[]
  segments: { from: PathPoint; to: PathPoint; kind: PathPoint['kind']; commandIndex: number }[]
}

// 为每个 actor 分配一个稳定颜色
const ACTOR_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f97316', // orange
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ef4444', // red
]

function getActorColor(index: number): string {
  return ACTOR_COLORS[index % ACTOR_COLORS.length]!
}

function normalizeActorName(value: string): string {
  return value.trim().replace(/\?$/u, '')
}

function toActorKey(actorName: string): string {
  return normalizeActorName(actorName).toLowerCase()
}

// ─── 路径计算 ────────────────────────────────────────────────────────────

function buildActorPaths(
  eventScript: EventScript | null,
  mapDocument: MapDocument | null,
): ActorPath[] {
  if (!eventScript || !mapDocument) return []

  const { tileWidth, tileHeight } = mapDocument

  // 初始化 actor 状态（从场景设置开始）
  const actorStates = new Map<string, { tileX: number; tileY: number; dir: number; name: string }>()
  const actorOrder: string[] = []

  for (const actor of eventScript.scene.actors) {
    const key = toActorKey(actor.actorName)
    if (!actorStates.has(key)) {
      actorOrder.push(key)
    }
    actorStates.set(key, {
      tileX: actor.tileX,
      tileY: actor.tileY,
      dir: actor.facingDirection,
      name: actor.actorName,
    })
  }

  const paths = new Map<string, ActorPath>()

  function ensurePath(actorKey: string): ActorPath {
    if (paths.has(actorKey)) return paths.get(actorKey)!
    const state = actorStates.get(actorKey)
    const color = getActorColor(actorOrder.indexOf(actorKey))
    const path: ActorPath = {
      actorKey,
      actorName: state?.name ?? actorKey,
      color,
      points: state
        ? [{
            x: state.tileX * tileWidth + tileWidth / 2,
            y: (state.tileY - 1) * tileHeight + tileHeight / 2,
            commandIndex: -1,
            command: 'start',
            kind: 'spawn',
          }]
        : [],
      segments: [],
    }
    paths.set(actorKey, path)
    return path
  }

  // 遍历命令，追踪位置变化
  for (let i = 0; i < eventScript.commands.length; i++) {
    const cmd = eventScript.commands[i]
    if (!cmd) continue

    const schema = getSchema(cmd.command)
    const hasPositionEffect = schema?.stageMeta?.affectsActorPosition ?? false

    if (!hasPositionEffect) continue

    switch (cmd.command) {
      case 'move': {
        // move <actor> <x> <y> <dir> [x2 y2 dir2 ...]
        const actorName = cmd.args[1]
        if (!actorName) continue
        const actorKey = toActorKey(actorName)
        const path = ensurePath(actorKey)

        for (let j = 2; j + 2 < cmd.args.length; j += 3) {
          const tx = Number.parseInt(cmd.args[j] ?? '', 10)
          const ty = Number.parseInt(cmd.args[j + 1] ?? '', 10)
          const tdir = Number.parseInt(cmd.args[j + 2] ?? '', 10)
          if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue

          const point: PathPoint = {
            x: tx * tileWidth + tileWidth / 2,
            y: (ty - 1) * tileHeight + tileHeight / 2,
            commandIndex: i,
            command: cmd.command,
            kind: 'move',
          }

          const prevPoint = path.points[path.points.length - 1]
          if (prevPoint) {
            path.segments.push({
              from: prevPoint,
              to: point,
              kind: 'move',
              commandIndex: i,
            })
          }
          path.points.push(point)

          // 更新 actor 状态
          const state = actorStates.get(actorKey)
          if (state) {
            state.tileX = tx
            state.tileY = ty
            if (Number.isFinite(tdir)) state.dir = tdir
          }
        }
        break
      }

      case 'warp': {
        const actorName = cmd.args[1]
        const tx = Number.parseInt(cmd.args[2] ?? '', 10)
        const ty = Number.parseInt(cmd.args[3] ?? '', 10)
        if (!actorName || !Number.isFinite(tx) || !Number.isFinite(ty)) continue
        const actorKey = toActorKey(actorName)
        const path = ensurePath(actorKey)

        const point: PathPoint = {
          x: tx * tileWidth + tileWidth / 2,
          y: (ty - 1) * tileHeight + tileHeight / 2,
          commandIndex: i,
          command: cmd.command,
          kind: 'warp',
        }

        const prevPoint = path.points[path.points.length - 1]
        if (prevPoint) {
          path.segments.push({
            from: prevPoint,
            to: point,
            kind: 'warp',
            commandIndex: i,
          })
        }
        path.points.push(point)

        const state = actorStates.get(actorKey)
        if (state) {
          state.tileX = tx
          state.tileY = ty
        }
        break
      }

      case 'faceDirection': {
        const actorName = cmd.args[1]
        const dir = Number.parseInt(cmd.args[2] ?? '', 10)
        if (!actorName || !Number.isFinite(dir)) continue
        const actorKey = toActorKey(actorName)
        const state = actorStates.get(actorKey)
        if (state) state.dir = dir
        break
      }

      case 'positionOffset': {
        const actorName = cmd.args[1]
        const ox = Number.parseInt(cmd.args[2] ?? '', 10)
        const oy = Number.parseInt(cmd.args[3] ?? '', 10)
        if (!actorName || !Number.isFinite(ox) || !Number.isFinite(oy)) continue
        const actorKey = toActorKey(actorName)
        const path = ensurePath(actorKey)
        const state = actorStates.get(actorKey)
        if (!state) continue

        const point: PathPoint = {
          x: (state.tileX + ox) * tileWidth + tileWidth / 2,
          y: ((state.tileY + oy) - 1) * tileHeight + tileHeight / 2,
          commandIndex: i,
          command: cmd.command,
          kind: 'offset',
        }

        const prevPoint = path.points[path.points.length - 1]
        if (prevPoint) {
          path.segments.push({
            from: prevPoint,
            to: point,
            kind: 'offset',
            commandIndex: i,
          })
        }
        path.points.push(point)
        state.tileX += ox
        state.tileY += oy
        break
      }

      case 'warpFarmers': {
        const tx = Number.parseInt(cmd.args[1] ?? '', 10)
        const ty = Number.parseInt(cmd.args[2] ?? '', 10)
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue
        // 影响所有 farmer
        for (const [actorKey, state] of actorStates) {
          if (!/^farmer\d*$/iu.test(actorKey)) continue
          const path = ensurePath(actorKey)
          const point: PathPoint = {
            x: tx * tileWidth + tileWidth / 2,
            y: (ty - 1) * tileHeight + tileHeight / 2,
            commandIndex: i,
            command: cmd.command,
            kind: 'warp',
          }
          const prevPoint = path.points[path.points.length - 1]
          if (prevPoint) {
            path.segments.push({ from: prevPoint, to: point, kind: 'warp', commandIndex: i })
          }
          path.points.push(point)
          state.tileX = tx
          state.tileY = ty
        }
        break
      }

      case 'addTemporaryActor': {
        const actorName = cmd.args[1]
        const tx = Number.parseInt(cmd.args[4] ?? '', 10)
        const ty = Number.parseInt(cmd.args[5] ?? '', 10)
        const tdir = Number.parseInt(cmd.args[6] ?? '', 10)
        if (!actorName || !Number.isFinite(tx) || !Number.isFinite(ty)) continue
        const actorKey = toActorKey(actorName)
        if (!actorStates.has(actorKey)) {
          actorOrder.push(actorKey)
        }
        actorStates.set(actorKey, {
          tileX: tx,
          tileY: ty,
          dir: Number.isFinite(tdir) ? tdir : 2,
          name: actorName,
        })
        const path = ensurePath(actorKey)
        const point: PathPoint = {
          x: tx * tileWidth + tileWidth / 2,
          y: (ty - 1) * tileHeight + tileHeight / 2,
          commandIndex: i,
          command: cmd.command,
          kind: 'spawn',
        }
        // 如果路径已有起点，添加一个 spawn segment
        if (path.points.length > 0) {
          const prevPoint = path.points[path.points.length - 1]
          path.segments.push({ from: prevPoint, to: point, kind: 'spawn', commandIndex: i })
        }
        path.points.push(point)
        break
      }

      case 'advancedMove': {
        // advancedMove <actor> <continue> <x> <y> [<x> <y> ...]
        const actorName = cmd.args[1]
        if (!actorName) continue
        const actorKey = toActorKey(actorName)
        const path = ensurePath(actorKey)

        for (let j = 3; j + 1 < cmd.args.length; j += 2) {
          const tx = Number.parseInt(cmd.args[j] ?? '', 10)
          const ty = Number.parseInt(cmd.args[j + 1] ?? '', 10)
          if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue

          const point: PathPoint = {
            x: tx * tileWidth + tileWidth / 2,
            y: (ty - 1) * tileHeight + tileHeight / 2,
            commandIndex: i,
            command: cmd.command,
            kind: 'move',
          }

          const prevPoint = path.points[path.points.length - 1]
          if (prevPoint) {
            path.segments.push({
              from: prevPoint,
              to: point,
              kind: 'move',
              commandIndex: i,
            })
          }
          path.points.push(point)

          const state = actorStates.get(actorKey)
          if (state) {
            state.tileX = tx
            state.tileY = ty
          }
        }
        break
      }
    }
  }

  return Array.from(paths.values()).filter((p) => p.points.length > 1 || p.segments.length > 0)
}

// ─── SVG 渲染 ────────────────────────────────────────────────────────────

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      markerWidth="10"
      markerHeight="10"
      refX="9"
      refY="3"
      orient="auto"
      markerUnits="strokeWidth"
    >
      <path d="M0,0 L0,6 L9,3 z" fill={color} />
    </marker>
  )
}

export function StagePathOverlay({
  eventScript,
  mapDocument,
  selectedCommandIndex,
  hoveredCommandIndex,
}: StagePathOverlayProps) {
  const actorPaths = useMemo(
    () => buildActorPaths(eventScript, mapDocument),
    [eventScript, mapDocument],
  )

  if (!mapDocument || actorPaths.length === 0) return null

  const { width, height, tileWidth, tileHeight } = mapDocument
  const svgWidth = width * tileWidth
  const svgHeight = height * tileHeight

  function isHighlighted(commandIndex: number): boolean {
    return selectedCommandIndex === commandIndex || hoveredCommandIndex === commandIndex
  }

  function segmentOpacity(commandIndex: number, defaultOpacity = 0.55): number {
    if (selectedCommandIndex == null && hoveredCommandIndex == null) return defaultOpacity
    return isHighlighted(commandIndex) ? 0.95 : 0.15
  }

  function segmentStrokeWidth(commandIndex: number, defaultWidth = 2): number {
    if (selectedCommandIndex == null && hoveredCommandIndex == null) return defaultWidth
    return isHighlighted(commandIndex) ? 3 : 1.5
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ zIndex: 5 }}
    >
      <defs>
        {actorPaths.map((path) => (
          <ArrowMarker key={`arrow-${path.actorKey}`} id={`arrow-${path.actorKey}`} color={path.color} />
        ))}
      </defs>

      {actorPaths.map((path) => (
        <g key={path.actorKey}>
          {/* 路径线段 */}
          {path.segments.map((seg, idx) => {
            const opacity = segmentOpacity(seg.commandIndex)
            const strokeWidth = segmentStrokeWidth(seg.commandIndex)

            const dashArray =
              seg.kind === 'warp'
                ? '4,4'
                : seg.kind === 'offset'
                  ? '6,3,2,3'
                  : undefined

            return (
              <line
                key={`seg-${idx}`}
                x1={seg.from.x}
                y1={seg.from.y}
                x2={seg.to.x}
                y2={seg.to.y}
                stroke={path.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeOpacity={opacity}
                markerEnd={seg.kind === 'move' ? `url(#arrow-${path.actorKey})` : undefined}
              />
            )
          })}

          {/* 路径点 */}
          {path.points.map((point, idx) => {
            const highlighted = isHighlighted(point.commandIndex)
            const opacity = point.commandIndex === -1 ? 0.4 : segmentOpacity(point.commandIndex, 0.7)
            const radius = highlighted ? 5 : point.kind === 'spawn' ? 4 : 3.5

            return (
              <g key={`pt-${idx}`}>
                {point.kind === 'spawn' && point.commandIndex !== -1 ? (
                  // 新增 actor 用菱形
                  <polygon
                    points={`${point.x},${point.y - radius} ${point.x + radius},${point.y} ${point.x},${point.y + radius} ${point.x - radius},${point.y}`}
                    fill={path.color}
                    fillOpacity={opacity}
                    stroke="white"
                    strokeWidth={1}
                  />
                ) : point.kind === 'warp' ? (
                  // 传送用空心圆
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill="white"
                    fillOpacity={opacity}
                    stroke={path.color}
                    strokeWidth={2}
                  />
                ) : (
                  // 普通移动点
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill={path.color}
                    fillOpacity={opacity}
                    stroke="white"
                    strokeWidth={1}
                  />
                )}

                {/* 命令序号标签 */}
                {point.commandIndex >= 0 && (
                  <text
                    x={point.x + 8}
                    y={point.y - 6}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                    fill={path.color}
                    fillOpacity={highlighted ? 1 : 0.6}
                  >
                    {point.commandIndex + 1}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      ))}
    </svg>
  )
}
