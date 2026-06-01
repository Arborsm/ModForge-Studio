// 右侧剧本编辑器容器

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ListOrdered, Maximize2, Minimize2, Plus } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { EventScript } from '@entities/event'
import { useEditorStore } from '../workflow-model/editorStore'
import { serializeRaw } from '../workflow-model/rawSerializer'
import { ScriptTimeline } from './ScriptTimeline'
import { CommandPalette } from './CommandPalette'
import { COMMAND_TEMPLATES } from '../workflow-model/commandTemplates'
import type { EventResourceRegistry } from './eventResourceRegistry'

export type ScriptEditorProps = {
  script: EventScript | null
  locale?: 'zh-CN' | 'en-US'
  resourceRegistry?: EventResourceRegistry
  currentPlaybackCommandId?: string | null
  onScriptChange?: (script: EventScript) => void
  className?: string
}

export function ScriptEditor({
  script,
  locale = 'zh-CN',
  resourceRegistry,
  currentPlaybackCommandId = null,
  onScriptChange,
  className,
}: ScriptEditorProps) {
  // Subscribe only to needed state slices to avoid re-renders on unrelated store changes
  const currentScript = useEditorStore((s) => s.currentScript)
  const showLineNumbers = useEditorStore((s) => s.showLineNumbers)
  const cardView = useEditorStore((s) => s.cardView)
  const isPickMode = useEditorStore((s) => s.isPickMode)
  const commandPaletteOpen = useEditorStore((s) => s.commandPaletteOpen)

  const prevKeyRef = useRef<string | null>(null)
  const lastSentRawRef = useRef<string | null>(null)

  // Keep store in sync with external script; reset when event changes.
  // Also sync when the same event is modified externally (e.g. scene edits
  // from the map) so that subsequent command edits don't overwrite them.
  useEffect(() => {
    const key = script?.key ?? null
    const raw = script?.rawScript ?? null
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key
      lastSentRawRef.current = raw
      const state = useEditorStore.getState()
      if (key && script) {
        state.setCurrentScript(script)
      } else {
        state.reset()
      }
      return
    }
    if (raw !== lastSentRawRef.current) {
      lastSentRawRef.current = raw
      const state = useEditorStore.getState()
      if (script) {
        state.setCurrentScript(script)
      }
    }
  }, [script])

  // Auto-sync store changes back to parent (covers update/insert/remove/move from any child)
  useEffect(() => {
    if (!onScriptChange) return
    const unsubscribe = useEditorStore.subscribe((state) => {
      const storeScript = state.currentScript
      if (!storeScript) return
      const raw = storeScript.rawScript
      if (raw !== lastSentRawRef.current) {
        lastSentRawRef.current = raw
        onScriptChange(storeScript)
      }
    })
    return () => {
      unsubscribe()
    }
  }, [onScriptChange])

  const commands = useMemo(() => {
    // Avoid flash of old data when switching events: only trust store if keys match
    const storeKey = currentScript?.key
    const propKey = script?.key
    if (storeKey && storeKey === propKey) {
      return currentScript.commands
    }
    return script?.commands ?? []
  }, [currentScript, script])

  const handleUpdateArg = useCallback(
    (commandIndex: number, argIndex: number, value: string) => {
      const state = useEditorStore.getState()
      const editableScript = state.currentScript ?? script
      if (!state.currentScript && editableScript) {
        state.setCurrentScript(editableScript)
      }
      const cmd = editableScript?.commands[commandIndex]
      if (!cmd) return
      const nextArgs = [...cmd.args]
      nextArgs[argIndex] = value
      const raw = serializeRaw(nextArgs)
      useEditorStore.getState().updateCommandAt(commandIndex, raw)
    },
    [script],
  )

  const handleUpdateArgs = useCallback(
    (commandIndex: number, argIndex: number, values: string[]) => {
      const state = useEditorStore.getState()
      const editableScript = state.currentScript ?? script
      if (!state.currentScript && editableScript) {
        state.setCurrentScript(editableScript)
      }
      const cmd = editableScript?.commands[commandIndex]
      if (!cmd) return
      const nextArgs = [...cmd.args.slice(0, argIndex), ...values]
      const raw = serializeRaw(nextArgs)
      useEditorStore.getState().updateCommandAt(commandIndex, raw)
    },
    [script],
  )

  const handleEnterPickMode = useCallback(
    (commandIndex: number, paramIndex: number, controlType: 'tile_picker' | 'npc_selector' | 'path_picker') => {
      useEditorStore.getState().setPickModeTarget({ commandIndex, paramIndex, controlType })
    },
    [],
  )

  const handleSetInlineDelay = useCallback(
    (commandIndex: number, pauseCommandIndex: number | null, valueMs: number) => {
      const state = useEditorStore.getState()
      const editableScript = state.currentScript ?? script
      if (!state.currentScript && editableScript) {
        state.setCurrentScript(editableScript)
      }
      const safeValue = `${Math.max(0, Math.round(valueMs))}`
      if (pauseCommandIndex == null) {
        useEditorStore.getState().insertCommandAt(commandIndex + 1, `pause ${safeValue}`)
        return
      }
      useEditorStore.getState().updateCommandAt(pauseCommandIndex, `pause ${safeValue}`)
    },
    [script],
  )

  const handleRemoveInlineDelay = useCallback((pauseCommandIndex: number) => {
    useEditorStore.getState().removeCommandAt(pauseCommandIndex)
  }, [])

  // Ctrl+K / Cmd+K to open CommandPalette
  useEffect(() => {
    function isEditing() {
      const active = document.activeElement
      if (!active) return false
      const tag = active.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || active.getAttribute('contenteditable') === 'true'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditing()) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const state = useEditorStore.getState()
        state.setCommandPaletteInsertIndex(commands.length)
        state.setCommandPaletteOpen(true)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [commands.length])

  const eventId = script?.eventId ?? '-'
  const preconditions = script?.preconditions.slice(1).join(' / ') ?? ''

  return (
    <div className={cx('flex h-full flex-col bg-[var(--bg-panel)]', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-[var(--text-primary)]">{eventId}</span>
          {preconditions && <span className="truncate text-[10px] text-[var(--text-tertiary)]">{preconditions}</span>}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-muted)] hover:text-[var(--accent)]"
            onClick={() => {
              const state = useEditorStore.getState()
              state.setCommandPaletteInsertIndex(commands.length)
              state.setCommandPaletteOpen(true)
            }}
            title={locale === 'zh-CN' ? '添加命令' : 'Add command'}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cx(
              'rounded p-1.5 transition-colors',
              showLineNumbers
                ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => useEditorStore.getState().setShowLineNumbers(!showLineNumbers)}
            title="行号"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cx(
              'rounded p-1.5 transition-colors',
              cardView === 'compact'
                ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => useEditorStore.getState().setCardView(cardView === 'compact' ? 'comfortable' : 'compact')}
            title="紧凑视图"
          >
            {cardView === 'compact' ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <ScriptTimeline
          commands={commands}
          locale={locale}
          resourceRegistry={resourceRegistry}
          currentPlaybackCommandId={currentPlaybackCommandId}
          onUpdateArg={handleUpdateArg}
          onUpdateArgs={handleUpdateArgs}
          onSetInlineDelay={handleSetInlineDelay}
          onRemoveInlineDelay={handleRemoveInlineDelay}
          onEnterPickMode={handleEnterPickMode}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3 py-1.5 text-[10px] text-[var(--text-tertiary)]">
        <span>{commands.length} 条命令</span>
        <span>{isPickMode ? '地图拾取模式' : ''}</span>
      </div>

      {/* Command Palette */}
      <CommandPalette
        key={commandPaletteOpen ? 'open' : 'closed'}
        open={commandPaletteOpen}
        onClose={() => useEditorStore.getState().setCommandPaletteOpen(false)}
        onSelect={(key) => {
          const template = COMMAND_TEMPLATES[key] ?? key
          const state = useEditorStore.getState()
          const editableScript = state.currentScript ?? script
          if (!state.currentScript && editableScript) {
            state.setCurrentScript(editableScript)
          }
          const nextState = useEditorStore.getState()
          const insertIndex =
            nextState.commandPaletteInsertIndex ?? nextState.currentScript?.commands.length ?? editableScript?.commands.length ?? 0
          nextState.insertCommandAt(insertIndex, template)
        }}
        locale={locale}
      />
    </div>
  )
}
