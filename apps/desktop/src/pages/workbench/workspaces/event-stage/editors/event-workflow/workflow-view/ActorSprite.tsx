// 地图角色精灵 — 根据事件命令序列渲染 actor 状态（位置、朝向、动画帧、表情）

import { useMemo } from 'react'
import type { EventScript } from '@entities/event'

export type ActorSpriteProps = {
  actorKey: string
  actorName: string
  spriteUrl: string | null
  initialTileX: number
  initialTileY: number
  initialDirection: number
  tileWidth: number
  tileHeight: number
  eventScript: EventScript | null
  /** 当前选中的命令索引，用于高亮 actor 状态变化点 */
  selectedCommandIndex?: number | null | undefined
  /** 是否被显式选中（例如点击了 actor） */
  selected?: boolean
  /** 是否显示名称标签 */
  showLabel?: boolean
}

// SDV 精灵帧布局：4 列（方向：下右左上），每行 4 帧
// frame = direction * 4 + animationFrame
// 但 getDefaultFrame 使用：下=0, 右=4, 上=8, 左=12（即 direction * 4）

function getFrameForDirection(direction: number, animationFrame = 0): number {
  const dir = ((direction % 4) + 4) % 4
  return dir * 4 + (animationFrame % 4)
}

// 解析命令，计算 actor 在命令序列执行后的状态
type ActorRuntimeState = {
  tileX: number
  tileY: number
  direction: number
  frame: number
  animationFrames: number[] | null
  animationFrameIndex: number
  animationFlip: boolean
  animationLoop: boolean
  animationDuration: number
  emoteId: number | null
  isVisible: boolean
  speed: number
}

function computeActorState(
  actorKey: string,
  initialTileX: number,
  initialTileY: number,
  initialDirection: number,
  eventScript: EventScript | null,
  upToCommandIndex: number | null | undefined,
): ActorRuntimeState {
  const state: ActorRuntimeState = {
    tileX: initialTileX,
    tileY: initialTileY,
    direction: initialDirection,
    frame: getFrameForDirection(initialDirection, 0),
    animationFrames: null,
    animationFrameIndex: 0,
    animationFlip: false,
    animationLoop: false,
    animationDuration: 100,
    emoteId: null,
    isVisible: true,
    speed: 4,
  }

  if (!eventScript) return state

  const endIndex = upToCommandIndex ?? eventScript.commands.length - 1

  for (let i = 0; i <= endIndex && i < eventScript.commands.length; i++) {
    const cmd = eventScript.commands[i]
    if (!cmd) continue

    const cmdActorKey = cmd.args[1]?.toLowerCase().trim().replace(/\?$/u, '') ?? ''
    const isTargetActor = cmdActorKey === actorKey
    const isFarmerTarget = /^farmer\d*$/iu.test(actorKey) && /^farmer\d*$/iu.test(cmdActorKey)
    const affectsThisActor = isTargetActor || isFarmerTarget

    switch (cmd.command) {
      case 'move': {
        if (!affectsThisActor) break
        // move actor x y dir [x2 y2 dir2 ...]
        for (let j = 2; j + 2 < cmd.args.length; j += 3) {
          const tx = Number.parseInt(cmd.args[j] ?? '', 10)
          const ty = Number.parseInt(cmd.args[j + 1] ?? '', 10)
          const tdir = Number.parseInt(cmd.args[j + 2] ?? '', 10)
          if (Number.isFinite(tx)) state.tileX = tx
          if (Number.isFinite(ty)) state.tileY = ty
          if (Number.isFinite(tdir)) {
            state.direction = tdir
            state.frame = getFrameForDirection(tdir, 0)
          }
        }
        state.emoteId = null
        break
      }

      case 'warp': {
        if (!affectsThisActor) break
        const tx = Number.parseInt(cmd.args[2] ?? '', 10)
        const ty = Number.parseInt(cmd.args[3] ?? '', 10)
        const tdir = Number.parseInt(cmd.args[4] ?? '', 10)
        if (Number.isFinite(tx)) state.tileX = tx
        if (Number.isFinite(ty)) state.tileY = ty
        if (Number.isFinite(tdir)) {
          state.direction = tdir
          state.frame = getFrameForDirection(tdir, 0)
        }
        state.emoteId = null
        break
      }

      case 'faceDirection': {
        if (!affectsThisActor) break
        const dir = Number.parseInt(cmd.args[2] ?? '', 10)
        if (Number.isFinite(dir)) {
          state.direction = dir
          state.frame = getFrameForDirection(dir, 0)
        }
        break
      }

      case 'positionOffset': {
        if (!affectsThisActor) break
        const ox = Number.parseInt(cmd.args[2] ?? '', 10)
        const oy = Number.parseInt(cmd.args[3] ?? '', 10)
        if (Number.isFinite(ox)) state.tileX += ox
        if (Number.isFinite(oy)) state.tileY += oy
        break
      }

      case 'advancedMove': {
        if (!affectsThisActor) break
        for (let j = 3; j + 1 < cmd.args.length; j += 2) {
          const tx = Number.parseInt(cmd.args[j] ?? '', 10)
          const ty = Number.parseInt(cmd.args[j + 1] ?? '', 10)
          if (Number.isFinite(tx)) state.tileX = tx
          if (Number.isFinite(ty)) state.tileY = ty
        }
        state.emoteId = null
        break
      }

      case 'warpFarmers': {
        if (!/^farmer\d*$/iu.test(actorKey)) break
        const tx = Number.parseInt(cmd.args[1] ?? '', 10)
        const ty = Number.parseInt(cmd.args[2] ?? '', 10)
        if (Number.isFinite(tx)) state.tileX = tx
        if (Number.isFinite(ty)) state.tileY = ty
        state.emoteId = null
        break
      }

      case 'animate': {
        if (!affectsThisActor) break
        state.animationFlip = cmd.args[2] === 'true'
        state.animationLoop = cmd.args[3] === 'true'
        state.animationDuration = Number.parseInt(cmd.args[4] ?? '', 10) || 100
        state.animationFrames = cmd.args
          .slice(5)
          .map((v) => Number.parseInt(v, 10))
          .filter(Number.isFinite)
        state.animationFrameIndex = 0
        if (state.animationFrames.length > 0) {
          state.frame = state.animationFrames[0]!
        }
        break
      }

      case 'stopAnimation': {
        if (!affectsThisActor) break
        const stopFrame = Number.parseInt(cmd.args[2] ?? '', 10)
        state.animationFrames = null
        state.animationFrameIndex = 0
        if (Number.isFinite(stopFrame)) {
          state.frame = stopFrame
        } else {
          state.frame = getFrameForDirection(state.direction, 0)
        }
        break
      }

      case 'showFrame': {
        if (!affectsThisActor) break
        const frame = Number.parseInt(cmd.args[2] ?? '', 10)
        if (Number.isFinite(frame)) {
          state.frame = frame
          state.animationFrames = null
        }
        break
      }

      case 'emote': {
        if (!affectsThisActor) break
        const emoteId = Number.parseInt(cmd.args[2] ?? '', 10)
        if (Number.isFinite(emoteId)) state.emoteId = emoteId
        break
      }

      case 'speed': {
        if (!affectsThisActor) break
        const speed = Number.parseInt(cmd.args[2] ?? '', 10)
        if (Number.isFinite(speed)) state.speed = speed
        break
      }

      case 'makeInvisible':
      case 'hideShadow': {
        if (!affectsThisActor) break
        // 不完全隐藏，只是标记状态
        break
      }

      case 'addTemporaryActor': {
        const tempName = cmd.args[1]?.toLowerCase().trim().replace(/\?$/u, '') ?? ''
        if (tempName !== actorKey) break
        const tx = Number.parseInt(cmd.args[4] ?? '', 10)
        const ty = Number.parseInt(cmd.args[5] ?? '', 10)
        const tdir = Number.parseInt(cmd.args[6] ?? '', 10)
        if (Number.isFinite(tx)) state.tileX = tx
        if (Number.isFinite(ty)) state.tileY = ty
        if (Number.isFinite(tdir)) {
          state.direction = tdir
          state.frame = getFrameForDirection(tdir, 0)
        }
        state.isVisible = true
        break
      }
    }
  }

  return state
}

// 表情图标映射（简化版，用 Unicode 表情代替真实表情贴图）
const EMOTE_ICONS: Record<number, string> = {
  0: '💭',
  1: '❓',
  2: '❗',
  3: '💢',
  4: '💤',
  8: '💔',
  12: '✨',
  16: '🎵',
  20: '😠',
  24: '😊',
  28: '💰',
  32: '🎁',
}

function getEmoteIcon(emoteId: number): string {
  return EMOTE_ICONS[emoteId] ?? '✨'
}

export function ActorSprite({
  actorKey,
  actorName,
  spriteUrl,
  initialTileX,
  initialTileY,
  initialDirection,
  tileWidth,
  tileHeight,
  eventScript,
  selectedCommandIndex,
  selected,
  showLabel = true,
}: ActorSpriteProps) {
  const runtime = useMemo(
    () => computeActorState(actorKey, initialTileX, initialTileY, initialDirection, eventScript, selectedCommandIndex),
    [actorKey, initialTileX, initialTileY, initialDirection, eventScript, selectedCommandIndex],
  )

  const pixelX = runtime.tileX * tileWidth
  const pixelY = (runtime.tileY - 1) * tileHeight

  // 精灵图是基于 16x32 的，需要根据 tile 大小缩放
  const spriteFrameX = (runtime.frame % 4) * 16
  const spriteFrameY = Math.floor(runtime.frame / 4) * 32
  const actorHeight = tileHeight * 2
  const actorWidth = tileWidth
  const scale = Math.max(1, actorWidth / 16)

  const label = actorName.trim().replace(/\?$/u, '')

  return (
    <div
      className="absolute transition-[transform] duration-300 ease-out"
      style={{
        transform: `translate(${pixelX}px, ${pixelY}px)`,
        width: `${actorWidth}px`,
        height: `${actorHeight}px`,
        zIndex: runtime.tileY + (selected ? 1000 : 0),
      }}
    >
      {/* 选中高亮光环 */}
      {selected && (
        <div
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: `radial-gradient(circle, var(--accent) 0%, transparent 70%)`,
            transform: 'scale(1.4)',
          }}
        />
      )}

      {/* 精灵主体 */}
      {spriteUrl ? (
        <div
          className="relative overflow-hidden"
          style={{
            width: `${actorWidth}px`,
            height: `${actorHeight}px`,
          }}
        >
          <div
            style={{
              width: '16px',
              height: '32px',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundImage: `url(${spriteUrl})`,
              backgroundPosition: `-${spriteFrameX}px -${spriteFrameY}px`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      ) : (
        <div className="flex h-full w-full items-end justify-center">
          <div className="rounded-full border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-primary)] uppercase shadow-[var(--shadow-panel)]">
            {label}
          </div>
        </div>
      )}

      {/* 表情气泡 */}
      {runtime.emoteId != null && (
        <div
          className="pointer-events-none absolute -top-5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_90%,transparent)] text-xs shadow-[var(--shadow-panel)]"
          style={{ zIndex: runtime.tileY + 1 }}
        >
          {getEmoteIcon(runtime.emoteId)}
        </div>
      )}

      {/* 名称标签 */}
      {showLabel && (
        <div
          className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_86%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-panel)]"
          style={{ zIndex: runtime.tileY + 1 }}
        >
          {label}
        </div>
      )}

      {/* 选中指示器 */}
      {selected && (
        <div className="pointer-events-none absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--accent)]" />
      )}
    </div>
  )
}
