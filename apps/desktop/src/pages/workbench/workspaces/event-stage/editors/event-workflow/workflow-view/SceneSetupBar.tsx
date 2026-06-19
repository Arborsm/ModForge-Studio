// 顶部场景设置条

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Copy,
  MapPin,
  MoreHorizontal,
  Music,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { EventSceneActor, EventSceneSetup } from '@entities/event'
import { EventResourcePicker } from './EventResourcePicker'
import { buildDefaultEventResourceRegistry, type EventResourceRegistry } from './eventResourceRegistry'

export type SceneSetupBarProps = {
  scene: EventSceneSetup
  locale?: 'zh-CN' | 'en-US'
  pickMode?: boolean
  cameraPickMode?: boolean
  pickingActorIndex?: number | null
  onPickModeToggle?: () => void
  onPickCamera?: () => void
  onPickActor?: (index: number | null) => void
  onSceneChange?: (scene: EventSceneSetup) => void
  resourceRegistry?: EventResourceRegistry
  className?: string
}

type SceneSetupLabels = {
  music: string
  camera: string
  actors: string
  addActor: string
  pick: string
  follow: string
  current: string
  target: string
  duplicate: string
  remove: string
  reset: string
  more: string
  x: string
  y: string
}

const DIRECTION_OPTIONS = [
  { value: 0, label: 'Up', icon: ArrowUp },
  { value: 1, label: 'Right', icon: ArrowRight },
  { value: 2, label: 'Down', icon: ArrowDown },
  { value: 3, label: 'Left', icon: ArrowLeft },
] as const

function buildLabels(locale: 'zh-CN' | 'en-US'): SceneSetupLabels {
  return locale === 'zh-CN'
    ? {
        music: '音乐',
        camera: '镜头',
        actors: '角色',
        addActor: '添加角色',
        pick: '拾取',
        follow: '跟随',
        current: '当前位置',
        target: '坐标',
        duplicate: '复制',
        remove: '删除',
        reset: '重置',
        more: '更多',
        x: 'X',
        y: 'Y',
      }
    : {
        music: 'Music',
        camera: 'Camera',
        actors: 'Actors',
        addActor: 'Add Actor',
        pick: 'Pick',
        follow: 'Follow',
        current: 'Current',
        target: 'Target',
        duplicate: 'Duplicate',
        remove: 'Remove',
        reset: 'Reset',
        more: 'More',
        x: 'X',
        y: 'Y',
      }
}

function actorToken(actor: EventSceneActor) {
  return `${actor.actorName} ${actor.tileX} ${actor.tileY} ${actor.facingDirection}`
}

function parseCameraTarget(instruction: string | null) {
  if (!instruction || instruction === 'follow' || instruction === 'continue') {
    return null
  }
  const [rawX, rawY] = instruction.trim().split(/\s+/u)
  const x = Number.parseInt(rawX ?? '', 10)
  const y = Number.parseInt(rawY ?? '', 10)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function FloatingSceneMenu({
  label,
  children,
  triggerClassName,
}: {
  label: string
  children: (close: () => void) => ReactNode
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggle() {
    const nextOpen = !open
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(nextOpen)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-(--border-color) bg-(--bg-app) text-(--text-secondary) hover:text-(--text-primary)',
          triggerClassName,
        )}
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && rect ? (
        <div
          ref={menuRef}
          className="fixed z-130 grid min-w-32 gap-1 rounded-md border border-(--border-color) bg-(--bg-elevated) p-1 shadow-(--shadow-float)"
          style={{ top: `${rect.bottom + 4}px`, left: `${Math.max(8, rect.right - 128)}px` }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </>
  )
}

function CompactIconButton({
  label,
  active,
  danger,
  children,
  className,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  active?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-(--text-secondary) transition-colors',
        active
          ? 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_78%,transparent)] text-(--accent)'
          : 'border-(--border-color) bg-(--bg-app) hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] hover:text-(--text-primary)',
        danger && 'hover:border-[color-mix(in_srgb,var(--danger)_45%,var(--border-color))] hover:text-(--danger)',
        className,
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...buttonProps}
    >
      {children}
    </button>
  )
}

function CoordinateField({
  x,
  y,
  labels,
  disabled,
  onChange,
}: {
  x: number
  y: number
  labels: Pick<SceneSetupLabels, 'x' | 'y'>
  disabled?: boolean
  onChange: (next: { x: number; y: number }) => void
}) {
  function update(axis: 'x' | 'y', value: string) {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) {
      return
    }
    onChange(axis === 'x' ? { x: parsed, y } : { x, y: parsed })
  }

  return (
    <span
      className={cx(
        'inline-flex h-7 items-center overflow-hidden rounded-md border border-(--border-color) bg-(--bg-app)',
        disabled && 'opacity-55',
      )}
    >
      {(['x', 'y'] as const).map((axis) => (
        <label
          key={axis}
          className="inline-flex h-full items-center gap-1 px-1.5 text-[10px] font-semibold text-(--text-tertiary) uppercase"
        >
          {labels[axis]}
          <input
            type="number"
            className="h-full w-10 bg-transparent font-mono text-[11px] font-semibold text-(--text-primary) outline-none"
            value={axis === 'x' ? x : y}
            disabled={disabled}
            onChange={(event) => update(axis, event.target.value)}
          />
        </label>
      ))}
    </span>
  )
}

function DirectionSegmentedControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <span className="inline-flex h-7 overflow-hidden rounded-md border border-(--border-color) bg-(--bg-app)">
      {DIRECTION_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          className={cx(
            'inline-flex h-full w-6 items-center justify-center border-r border-(--border-color) text-(--text-tertiary) last:border-r-0 hover:text-(--text-primary)',
            value === optionValue && 'bg-[color-mix(in_srgb,var(--accent-soft)_82%,transparent)] text-(--accent)',
          )}
          title={label}
          aria-label={label}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          <Icon className="h-3 w-3" />
        </button>
      ))}
    </span>
  )
}

export function SceneSetupBar({
  scene,
  locale = 'zh-CN',
  pickMode,
  cameraPickMode,
  pickingActorIndex,
  onPickModeToggle,
  onPickCamera,
  onPickActor,
  onSceneChange,
  resourceRegistry,
  className,
}: SceneSetupBarProps) {
  const labels = buildLabels(locale)
  const registry = resourceRegistry ?? buildDefaultEventResourceRegistry(locale)
  const actorResourceOptions = registry.actor
  const musicResourceOptions = registry.music
  const cameraTarget = parseCameraTarget(scene.cameraInstruction)
  const cameraMode = cameraTarget ? 'target' : scene.cameraInstruction === 'continue' ? 'continue' : 'follow'

  function commitActors(nextActors: EventSceneActor[]) {
    onSceneChange?.({ ...scene, actors: nextActors, characterInstruction: nextActors.map(actorToken).join(' ') })
  }

  function updateActor(index: number, patch: Partial<EventSceneActor>) {
    commitActors(scene.actors.map((actor, actorIndex) => (actorIndex === index ? { ...actor, ...patch } : actor)))
  }

  function addActor() {
    const used = new Set(scene.actors.map((actor) => actor.actorName))
    const name = actorResourceOptions.find((option) => !used.has(option.value))?.value ?? 'Abigail'
    commitActors([
      ...scene.actors,
      { id: `actor-${scene.actors.length + 1}-${name}`, actorName: name, tileX: 0, tileY: 0, facingDirection: 2 },
    ])
  }

  return (
    <div className={cx('flex min-h-10 items-center gap-2 border-b border-(--border-color) bg-(--bg-panel) px-2 py-1.5', className)}>
      <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-(--border-color) bg-(--bg-app) px-1.5">
        <Music className="h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" />
        <EventResourcePicker
          value={scene.musicCue ?? ''}
          label={labels.music}
          placeholder={labels.music}
          options={musicResourceOptions}
          onSelect={(value) => onSceneChange?.({ ...scene, musicCue: value || null })}
          triggerClassName="h-6 border-0 bg-transparent px-1"
        />
      </div>

      <div className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-1.5">
        <Camera className="h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" />
        <div className="inline-flex h-7 overflow-hidden rounded-md border border-(--border-color) bg-(--bg-app)">
          {(['follow', 'continue', 'target'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cx(
                'px-2 text-[10px] font-semibold transition-colors',
                cameraMode === mode
                  ? 'bg-[color-mix(in_srgb,var(--accent-soft)_85%,transparent)] text-(--accent)'
                  : 'text-(--text-secondary) hover:text-(--text-primary)',
              )}
              onClick={() => {
                if (mode === 'target') {
                  onSceneChange?.({ ...scene, cameraInstruction: cameraTarget ? `${cameraTarget.x} ${cameraTarget.y}` : '0 0' })
                  return
                }
                onSceneChange?.({ ...scene, cameraInstruction: mode })
              }}
            >
              {mode === 'follow' ? labels.follow : mode === 'continue' ? labels.current : labels.target}
            </button>
          ))}
        </div>
        <CoordinateField
          x={cameraTarget?.x ?? 0}
          y={cameraTarget?.y ?? 0}
          labels={labels}
          disabled={cameraMode !== 'target'}
          onChange={({ x, y }) => onSceneChange?.({ ...scene, cameraInstruction: `${x} ${y}` })}
        />
        {onPickCamera ? (
          <CompactIconButton
            label={labels.pick}
            active={cameraPickMode}
            onClick={() => {
              onSceneChange?.({ ...scene, cameraInstruction: cameraTarget ? `${cameraTarget.x} ${cameraTarget.y}` : '0 0' })
              onPickCamera()
            }}
          >
            <MapPin className="h-3.5 w-3.5" />
          </CompactIconButton>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Users className="h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" />
        <span className="shrink-0 text-[11px] text-(--text-secondary)">{labels.actors}:</span>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-visible pb-0.5">
          {scene.actors.map((actor, idx) => {
            const isPicking = pickingActorIndex === idx
            return (
              <div
                key={actor.id}
                className={cx(
                  'group flex h-8 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] transition-all',
                  isPicking
                    ? 'border-(--accent) bg-[color-mix(in_srgb,var(--accent-soft)_62%,transparent)] shadow-sm'
                    : 'border-(--border-color) bg-(--bg-app) hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
                )}
              >
                <EventResourcePicker
                  value={actor.actorName}
                  label={labels.actors}
                  placeholder={labels.actors}
                  options={actorResourceOptions}
                  onSelect={(actorName) => updateActor(idx, { actorName })}
                  triggerClassName="h-6 w-24 border-0 bg-transparent px-1"
                />
                <CoordinateField
                  x={actor.tileX}
                  y={actor.tileY}
                  labels={labels}
                  onChange={({ x, y }) => updateActor(idx, { tileX: x, tileY: y })}
                />
                <DirectionSegmentedControl
                  value={actor.facingDirection}
                  onChange={(facingDirection) => updateActor(idx, { facingDirection })}
                />
                <CompactIconButton label={labels.pick} active={isPicking} onClick={() => onPickActor?.(isPicking ? null : idx)}>
                  <MapPin className="h-3.5 w-3.5" />
                </CompactIconButton>
                <FloatingSceneMenu label={labels.more}>
                  {(close) => (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-2 rounded px-2 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-panel-muted) hover:text-(--text-primary)"
                        onClick={() => {
                          commitActors([
                            ...scene.actors.slice(0, idx + 1),
                            { ...actor, id: `actor-${Date.now()}` },
                            ...scene.actors.slice(idx + 1),
                          ])
                          close()
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        {labels.duplicate}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-2 rounded px-2 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-panel-muted) hover:text-(--text-primary)"
                        onClick={() => {
                          updateActor(idx, { tileX: 0, tileY: 0, facingDirection: 2 })
                          close()
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        {labels.reset}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-2 rounded px-2 text-left text-[11px] text-(--danger) hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                        onClick={() => {
                          commitActors(scene.actors.filter((_, actorIndex) => actorIndex !== idx))
                          close()
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        {labels.remove}
                      </button>
                    </>
                  )}
                </FloatingSceneMenu>
              </div>
            )
          })}
          <FloatingSceneMenu
            label={labels.addActor}
            triggerClassName="w-auto gap-1 border-dashed px-2 text-[11px] font-medium hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] hover:text-(--accent)"
          >
            {(close) => (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-2 rounded px-2 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-panel-muted) hover:text-(--text-primary)"
                onClick={() => {
                  addActor()
                  close()
                }}
              >
                <Plus className="h-3 w-3" />
                {labels.addActor}
              </button>
            )}
          </FloatingSceneMenu>
        </div>
      </div>

      {onPickModeToggle && (
        <button
          type="button"
          className={cx(
            'shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
            pickMode
              ? 'border-[color-mix(in_srgb,var(--accent)_48%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_78%,transparent)] text-(--accent)'
              : 'border-(--border-color) bg-(--bg-app) text-(--text-secondary) hover:text-(--text-primary)',
          )}
          onClick={onPickModeToggle}
        >
          {labels.pick}
        </button>
      )}
    </div>
  )
}
