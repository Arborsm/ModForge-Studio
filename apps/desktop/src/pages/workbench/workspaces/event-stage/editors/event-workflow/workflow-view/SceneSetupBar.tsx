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
import { cx } from '@shared/lib/helper'
import type { EventSceneActor, EventSceneSetup } from '@entities/event'
import { ResourcePicker } from '@features/resource-browser'
import { buildDefaultEventResourceRegistry, type EventResourceRegistry } from './eventResourceRegistry'
import type { EventWorkflowCopy } from '@locales/api'
import { useEventStageCopy } from '@locales/provider'

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

type SceneSetupLabels = EventWorkflowCopy['sceneSetup']

const DIRECTION_OPTIONS = [
  { value: 0, label: 'Up', icon: ArrowUp },
  { value: 1, label: 'Right', icon: ArrowRight },
  { value: 2, label: 'Down', icon: ArrowDown },
  { value: 3, label: 'Left', icon: ArrowLeft },
] as const

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
          'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-surface-app text-text-secondary hover:text-text-primary',
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
          className="border-border-subtle bg-surface-elevated shadow-float fixed z-130 grid min-w-32 gap-1 rounded-md border p-1"
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
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-text-secondary transition-colors',
        active
          ? 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_78%,transparent)] text-accent'
          : 'border-border-subtle bg-surface-app hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] hover:text-text-primary',
        danger && 'hover:border-[color-mix(in_srgb,var(--danger)_45%,var(--border-color))] hover:text-danger',
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
        'inline-flex h-7 items-center overflow-hidden rounded-md border border-border-subtle bg-surface-app',
        disabled && 'opacity-55',
      )}
    >
      {(['x', 'y'] as const).map((axis) => (
        <label
          key={axis}
          className="text-text-tertiary text-caption-px inline-flex h-full items-center gap-1 px-1.5 font-semibold uppercase"
        >
          {labels[axis]}
          <input
            type="number"
            className="text-text-primary text-meta-px h-full w-10 bg-transparent font-mono font-semibold outline-none"
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
    <span className="border-border-subtle bg-surface-app inline-flex h-7 overflow-hidden rounded-md border">
      {DIRECTION_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          className={cx(
            'inline-flex h-full w-6 items-center justify-center border-r border-border-subtle text-text-tertiary last:border-r-0 hover:text-text-primary',
            value === optionValue && 'bg-[color-mix(in_srgb,var(--accent-soft)_82%,transparent)] text-accent',
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
  const workflowCopy = useEventStageCopy().workflow
  const labels = workflowCopy.sceneSetup
  const registry = resourceRegistry ?? buildDefaultEventResourceRegistry(workflowCopy.resourceSources)
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
    <div className={cx('flex min-h-10 items-center gap-2 border-b border-border-subtle bg-surface-panel px-2 py-1.5', className)}>
      <div className="border-border-subtle bg-surface-app inline-flex h-8 items-center gap-1.5 rounded-md border px-1.5">
        <Music className="text-text-tertiary h-3.5 w-3.5 shrink-0" />
        <ResourcePicker
          value={scene.musicCue ?? ''}
          label={labels.music}
          placeholder={labels.music}
          options={musicResourceOptions}
          onSelect={(value) => onSceneChange?.({ ...scene, musicCue: value || null })}
          triggerClassName="h-6 border-0 bg-transparent px-1"
        />
      </div>

      <div className="border-border-subtle bg-surface-panel-muted inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-1.5">
        <Camera className="text-text-tertiary h-3.5 w-3.5 shrink-0" />
        <div className="border-border-subtle bg-surface-app inline-flex h-7 overflow-hidden rounded-md border">
          {(['follow', 'continue', 'target'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cx(
                'px-2 text-caption-px font-semibold transition-colors',
                cameraMode === mode
                  ? 'bg-[color-mix(in_srgb,var(--accent-soft)_85%,transparent)] text-accent'
                  : 'text-text-secondary hover:text-text-primary',
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
        <Users className="text-text-tertiary h-3.5 w-3.5 shrink-0" />
        <span className="text-text-secondary text-meta-px shrink-0">{labels.actors}:</span>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-visible pb-0.5">
          {scene.actors.map((actor, idx) => {
            const isPicking = pickingActorIndex === idx
            return (
              <div
                key={actor.id}
                className={cx(
                  'group flex h-8 shrink-0 items-center gap-1 rounded-md border px-1.5 text-meta-px transition-all',
                  isPicking
                    ? 'border-accent bg-[color-mix(in_srgb,var(--accent-soft)_62%,transparent)] shadow-sm'
                    : 'border-border-subtle bg-surface-app hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
                )}
              >
                <ResourcePicker
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
                        className="text-text-secondary hover:bg-surface-panel-muted hover:text-text-primary text-meta-px inline-flex h-7 items-center gap-2 rounded px-2 text-left"
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
                        className="text-text-secondary hover:bg-surface-panel-muted hover:text-text-primary text-meta-px inline-flex h-7 items-center gap-2 rounded px-2 text-left"
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
                        className="text-danger text-meta-px inline-flex h-7 items-center gap-2 rounded px-2 text-left hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
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
            triggerClassName="w-auto gap-1 border-dashed px-2 text-meta-px font-medium hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] hover:text-accent"
          >
            {(close) => (
              <button
                type="button"
                className="text-text-secondary hover:bg-surface-panel-muted hover:text-text-primary text-meta-px inline-flex h-7 items-center gap-2 rounded px-2 text-left"
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
            'shrink-0 rounded-md border px-2 py-1 text-caption-px font-semibold transition-colors',
            pickMode
              ? 'border-[color-mix(in_srgb,var(--accent)_48%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_78%,transparent)] text-accent'
              : 'border-border-subtle bg-surface-app text-text-secondary hover:text-text-primary',
          )}
          onClick={onPickModeToggle}
        >
          {labels.pick}
        </button>
      )}
    </div>
  )
}
