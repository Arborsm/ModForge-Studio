// components/event-workflow/SceneSetupBar.tsx
// 顶部场景设置条

import { Music, Camera, Users, Plus, Trash2 } from 'lucide-react'
import { cx } from '../../lib/cx'
import type { EventSceneSetup } from '../../lib/events/types'

export type SceneSetupBarProps = {
  scene: EventSceneSetup
  locale?: 'zh-CN' | 'en-US'
  pickMode?: boolean
  pickingActorIndex?: number | null
  onPickModeToggle?: () => void
  onPickActor?: (index: number | null) => void
  onSceneChange?: (scene: EventSceneSetup) => void
  className?: string
}

export function SceneSetupBar({
  scene,
  locale = 'zh-CN',
  pickMode,
  pickingActorIndex,
  onPickModeToggle,
  onPickActor,
  onSceneChange,
  className,
}: SceneSetupBarProps) {
  const labels = locale === 'zh-CN'
    ? { music: '音乐', camera: '镜头', actors: '角色', addActor: '添加角色', pick: '拾取' }
    : { music: 'Music', camera: 'Camera', actors: 'Actors', addActor: 'Add Actor', pick: 'Pick' }

  return (
    <div className={cx('flex items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5', className)}
    >
      {/* Music */}
      <div className="flex items-center gap-1.5"
      >
        <Music className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder={labels.music}
          className="w-24 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          value={scene.musicCue ?? ''}
          onChange={(e) => onSceneChange?.({ ...scene, musicCue: e.target.value || null })}
        />
      </div>

      {/* Camera */}
      <div className="flex items-center gap-1.5"
      >
        <Camera className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder={labels.camera}
          className="w-24 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          value={scene.cameraInstruction ?? ''}
          onChange={(e) => onSceneChange?.({ ...scene, cameraInstruction: e.target.value || null })}
        />
      </div>

      {/* Actors */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0"
      >
        <Users className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        <span className="text-[11px] text-[var(--text-secondary)] shrink-0">{labels.actors}:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {scene.actors.map((actor, idx) => {
            const isPicking = pickingActorIndex === idx
            return (
              <div
                key={actor.id}
                className={cx(
                  'group flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] cursor-pointer transition-all',
                  isPicking
                    ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent-soft)_60%,transparent)] shadow-sm'
                    : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
                )}
                onClick={() => onPickActor?.(isPicking ? null : idx)}
                title={isPicking ? '点击取消拾取' : '点击拾取位置'}
              >
                <span className="font-medium text-[var(--text-primary)]">{actor.actorName}</span>
                <span className="text-[var(--text-tertiary)]">{actor.tileX},{actor.tileY}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                  onClick={(e) => {
                    e.stopPropagation()
                    const next = scene.actors.filter((_, i) => i !== idx)
                    onSceneChange?.({ ...scene, actors: next })
                  }}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            className="inline-flex h-5 items-center gap-0.5 rounded-full border border-dashed border-[var(--border-color)] px-1.5 text-[10px] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            onClick={() => {
              const name = `actor${scene.actors.length + 1}`
              onSceneChange?.({
                ...scene,
                actors: [...scene.actors, { id: `actor-${Date.now()}`, actorName: name, tileX: 0, tileY: 0, facingDirection: 2 }],
              })
            }}
          >
            <Plus className="h-2.5 w-2.5" /> {labels.addActor}
          </button>
        </div>
      </div>

      {/* Pick mode toggle */}
      {onPickModeToggle && (
        <button
          type="button"
          className={cx(
            'shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
            pickMode
              ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
              : 'border border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
          onClick={onPickModeToggle}
        >
          {labels.pick}
        </button>
      )}
    </div>
  )
}
