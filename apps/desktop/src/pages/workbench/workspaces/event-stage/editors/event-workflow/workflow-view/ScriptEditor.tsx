// 右侧剧本编辑器容器

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ListOrdered, Plus, Rows3 } from 'lucide-react'
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
  eventId?: string | null
  onScriptChange?: (script: EventScript) => void
  className?: string
}

export type ScriptEditorCopy = ReturnType<typeof getScriptEditorCopy>

export function getScriptEditorCopy(locale: 'zh-CN' | 'en-US') {
  const zh = locale === 'zh-CN'
  return {
    heading: zh ? '剧本' : 'Script',
    addCommand: zh ? '添加命令' : 'Add command',
    insertCommand: zh ? '在此处添加命令' : 'Insert command here',
    addCommandShortcut: zh ? '添加命令 (Ctrl/Cmd+K)' : 'Add command (Ctrl/Cmd+K)',
    lineNumbers: zh ? '行号' : 'Line numbers',
    compactView: zh ? '紧凑视图' : 'Compact view',
    comfortableView: zh ? '舒适视图' : 'Comfortable view',
    mapPickMode: zh ? '地图拾取中' : 'Map pick mode',
    commandsCount: (count: number) => (zh ? `${count} 条命令` : `${count} commands`),
    // Timeline 空状态
    emptyTitle: zh ? '暂无命令' : 'No commands',
    emptyHint: zh ? '按 Ctrl/Cmd+K 添加命令' : 'Press Ctrl/Cmd+K to add a command',
    emptyAction: zh ? '添加命令' : 'Add command',
    // ScriptCard 行内操作 / 标签
    playFromHere: zh ? '从这里播放' : 'Play from here',
    duplicate: zh ? '复制' : 'Duplicate',
    delete: zh ? '删除' : 'Delete',
    removeDelay: zh ? '移除延迟' : 'Remove delay',
    rawCommand: zh ? '原始命令' : 'Raw command',
    emptyArg: zh ? '空' : 'empty',
    delayStep: zh ? '帧延迟' : 'Step delay',
    delayHold: zh ? '停留' : 'Hold',
    delayGeneric: zh ? '延迟' : 'Delay',
    branchWhenChoice: zh ? '当选择' : 'When choosing',
  }
}

export function ScriptEditor({
  script,
  locale = 'zh-CN',
  resourceRegistry,
  currentPlaybackCommandId = null,
  eventId,
  onScriptChange,
  className,
}: ScriptEditorProps) {
  // Subscribe only to needed state slices to avoid re-renders on unrelated store changes
  const currentScript = useEditorStore((s) => s.currentScript)
  const showLineNumbers = useEditorStore((s) => s.showLineNumbers)
  const cardView = useEditorStore((s) => s.cardView)
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
  const copy = getScriptEditorCopy(locale)

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

  return (
    <div className={cx('script-panel', className)}>
      <div className="script-toolbar">
        <span className="count-pill">
          {eventId ? <span className="mono">{eventId}</span> : null}
          {eventId ? ' · ' : null}
          {copy.commandsCount(commands.length)}
        </span>
        <div className="script-tools">
          <button
            type="button"
            className={cx('icon-btn', showLineNumbers && 'on')}
            onClick={() => useEditorStore.getState().setShowLineNumbers(!showLineNumbers)}
            title={copy.lineNumbers}
            aria-label={copy.lineNumbers}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cx('icon-btn', cardView === 'compact' && 'on')}
            onClick={() => useEditorStore.getState().setCardView(cardView === 'compact' ? 'comfortable' : 'compact')}
            title={cardView === 'compact' ? copy.comfortableView : copy.compactView}
            aria-label={cardView === 'compact' ? copy.comfortableView : copy.compactView}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <span className="tool-sep" />
          <button
            type="button"
            className="icon-btn add"
            onClick={() => {
              const state = useEditorStore.getState()
              state.setCommandPaletteInsertIndex(commands.length)
              state.setCommandPaletteOpen(true)
            }}
            title={copy.addCommand}
            aria-label={copy.addCommand}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="script-list">
        <ScriptTimeline
          commands={commands}
          locale={locale}
          copy={copy}
          resourceRegistry={resourceRegistry}
          currentPlaybackCommandId={currentPlaybackCommandId}
          onUpdateArg={handleUpdateArg}
          onUpdateArgs={handleUpdateArgs}
          onSetInlineDelay={handleSetInlineDelay}
          onRemoveInlineDelay={handleRemoveInlineDelay}
          onEnterPickMode={handleEnterPickMode}
        />
      </div>

      <div className="script-foot">
        <button
          type="button"
          className="foot-add"
          onClick={() => {
            const state = useEditorStore.getState()
            state.setCommandPaletteInsertIndex(commands.length)
            state.setCommandPaletteOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {copy.addCommand}
          <span className="kbd">Ctrl/Cmd + K</span>
        </button>
        <span>{copy.commandsCount(commands.length)}</span>
      </div>

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
