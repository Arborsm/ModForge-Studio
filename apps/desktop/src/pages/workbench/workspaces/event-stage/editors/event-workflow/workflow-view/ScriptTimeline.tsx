// 流式时间轴 — 卡片列表 + 间隙插入 + 拖拽排序

import { useCallback, useEffect, useRef } from 'react'
import { GitFork, Plus, ListPlus } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EventCommand } from '@entities/event'
import { useEditorStore } from '../workflow-model/editorStore'
import { ScriptCard } from './ScriptCard'
import type { EventResourceRegistry } from './eventResourceRegistry'
import type { EventWorkflowCopy, ScriptEditorCopy } from '@locales/api'
import {
  getInlineDelayCandidate,
  getVisiblePlaybackCommandIndex,
  shouldFoldPauseIntoPrevious,
  type InlineDelayCandidate,
} from '../workflow-model/commandInlineDelay'

export type ScriptTimelineProps = {
  commands: EventCommand[]
  locale?: 'zh-CN' | 'en-US'
  copy: ScriptEditorCopy
  workflowCopy: EventWorkflowCopy
  resourceRegistry?: EventResourceRegistry
  onUpdateArg: (commandIndex: number, argIndex: number, value: string) => void
  onUpdateArgs: (commandIndex: number, argIndex: number, values: string[]) => void
  onSetInlineDelay: (commandIndex: number, pauseCommandIndex: number | null, valueMs: number) => void
  onRemoveInlineDelay: (pauseCommandIndex: number) => void
  onEnterPickMode: (commandIndex: number, paramIndex: number, controlType: 'tile_picker' | 'npc_selector' | 'path_picker') => void
}

function GapInsertButton({ index, label, onClick }: { index: number; label: string; onClick: (index: number) => void }) {
  return (
    <div className="gap-insert">
      <div className="gap-insert-line" />
      <button type="button" onClick={() => onClick(index)} className="gap-insert-button" title={label} aria-label={label}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

function SortableScriptCard({
  cmd,
  index,
  allCommands,
  selected,
  expanded,
  showLineNumber,
  cardView,
  locale,
  copy,
  workflowCopy,
  resourceRegistry,
  inlineDelay,
  onSelect,
  onToggleExpand,
  onUpdateArg,
  onUpdateArgs,
  onSetInlineDelay,
  onRemoveInlineDelay,
  onEnterPickMode,
  onDuplicate,
  onDelete,
  onPlayFromHere,
  onInsert,
  branchLabel,
}: {
  cmd: EventCommand
  index: number
  /** The exact command list the timeline renders; used to fold a playing `pause` onto its host card. */
  allCommands: EventCommand[]
  selected: boolean
  expanded: boolean
  showLineNumber: boolean
  cardView: 'compact' | 'comfortable'
  locale: 'zh-CN' | 'en-US'
  copy: ScriptEditorCopy
  workflowCopy: EventWorkflowCopy
  resourceRegistry?: EventResourceRegistry
  inlineDelay: InlineDelayCandidate | null
  onSelect: () => void
  onToggleExpand: () => void
  onUpdateArg: (argIndex: number, value: string) => void
  onUpdateArgs: (argIndex: number, values: string[]) => void
  onSetInlineDelay: (pauseCommandIndex: number | null, valueMs: number) => void
  onRemoveInlineDelay: (pauseCommandIndex: number) => void
  onEnterPickMode: (paramIndex: number, controlType: 'tile_picker' | 'npc_selector' | 'path_picker') => void
  onDuplicate: () => void
  onDelete: () => void
  onPlayFromHere: () => void
  onInsert: (index: number) => void
  branchLabel?: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cmd.id })
  // Per-card playback subscription: only the previously/currently playing cards
  // re-render when playback advances, instead of the whole timeline. The fold
  // check reads the rendered list (not the store's currentScript, which is only
  // synced lazily once editing starts).
  const playing = useEditorStore((state) => {
    const playbackId = state.playbackCommandId
    if (!playbackId) {
      return false
    }
    if (cmd.id === playbackId) {
      return true
    }
    const playbackIndex = allCommands.findIndex((command) => command.id === playbackId)
    return playbackIndex > 0 && shouldFoldPauseIntoPrevious(allCommands, playbackIndex) && allCommands[playbackIndex - 1]?.id === cmd.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <GapInsertButton index={index} label={copy.insertCommand} onClick={onInsert} />
      {branchLabel ? (
        <div className="branch-label">
          <GitFork className="h-3.5 w-3.5" />
          {copy.branchWhenChoice}
          <span className="opt">{branchLabel}</span>
        </div>
      ) : null}
      <div className={branchLabel ? 'branch' : undefined}>
        <ScriptCard
          command={cmd}
          index={index}
          selected={selected}
          playing={playing}
          expanded={expanded}
          showLineNumber={showLineNumber}
          cardView={cardView}
          locale={locale}
          copy={copy}
          workflowCopy={workflowCopy}
          resourceRegistry={resourceRegistry}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onUpdateArg={onUpdateArg}
          onUpdateArgs={onUpdateArgs}
          inlineDelay={inlineDelay}
          onSetInlineDelay={onSetInlineDelay}
          onRemoveInlineDelay={onRemoveInlineDelay}
          onEnterPickMode={onEnterPickMode}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onPlayFromHere={onPlayFromHere}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
    </div>
  )
}

function getBranchLabel(previousCommand: EventCommand | undefined, command: EventCommand, copy: ScriptEditorCopy) {
  if (command.command !== 'switchEvent' || previousCommand?.command !== 'quickQuestion') {
    return null
  }
  const choice = previousCommand.choices?.[0]?.label
  if (!choice) {
    return null
  }
  if (/^yes$/iu.test(choice)) return copy.yesChoiceLabel
  if (/^no$/iu.test(choice)) return copy.noChoiceLabel
  return choice
}

export function ScriptTimeline({
  commands,
  locale = 'zh-CN',
  copy,
  workflowCopy,
  resourceRegistry,
  onUpdateArg,
  onUpdateArgs,
  onSetInlineDelay,
  onRemoveInlineDelay,
  onEnterPickMode,
}: ScriptTimelineProps) {
  const selectedCommandIndex = useEditorStore((s) => s.selectedCommandIndex)
  const expandedCards = useEditorStore((s) => s.expandedCards)
  const showLineNumbers = useEditorStore((s) => s.showLineNumbers)
  const cardView = useEditorStore((s) => s.cardView)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  )

  // Scroll selected command into view
  useEffect(() => {
    if (selectedCommandIndex == null) return
    const el = document.querySelector(`[data-cmd-index="${selectedCommandIndex}"]`)
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedCommandIndex])

  // Only scroll when the playback position actually moves — not on every edit
  // that mutates `commands` (which would jolt the view on each keystroke).
  // Store subscription keeps this off the render path entirely; the rendered
  // command list comes from the prop mirror (store currentScript is lazy).
  const commandsRef = useRef(commands)
  useEffect(() => {
    commandsRef.current = commands
  })
  useEffect(() => {
    let lastPlaybackId: string | null = null
    return useEditorStore.subscribe((state) => {
      const playbackId = state.playbackCommandId
      if (playbackId === lastPlaybackId) return
      lastPlaybackId = playbackId
      const playbackCommandIndex = getVisiblePlaybackCommandIndex(commandsRef.current, playbackId)
      if (playbackCommandIndex == null) return
      const el = document.querySelector(`[data-cmd-index="${playbackCommandIndex}"]`)
      if (typeof el?.scrollIntoView === 'function') {
        // Keep the playing command vertically centered so the author always sees
        // the surrounding beats; `center` clamps naturally at both list ends.
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [])

  // Keyboard navigation — uses getState() inside listener so we don't need
  // commands in deps and avoid re-registering on every store update.
  useEffect(() => {
    function isEditing() {
      const active = document.activeElement
      if (!active) return false
      const tag = active.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || active.getAttribute('contenteditable') === 'true'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditing()) return
      const state = useEditorStore.getState()
      const idx = state.selectedCommandIndex
      const len = state.currentScript?.commands.length ?? 0
      if (len === 0) return

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          const prev = idx == null ? len - 1 : Math.max(0, idx - 1)
          state.setSelectedCommandIndex(prev)
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          const next = idx == null ? 0 : Math.min(len - 1, idx + 1)
          state.setSelectedCommandIndex(next)
          break
        }
        case 'Enter': {
          if (idx != null) {
            e.preventDefault()
            const cmd = state.currentScript?.commands[idx]
            if (cmd) state.toggleCardExpanded(cmd.id)
          }
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (idx != null && e.key === 'Delete') {
            e.preventDefault()
            state.removeCommandAt(idx)
          }
          break
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleInsert = useCallback((index: number) => {
    const state = useEditorStore.getState()
    state.setCommandPaletteInsertIndex(index)
    state.setCommandPaletteOpen(true)
  }, [])

  const handleSelect = useCallback((index: number) => {
    useEditorStore.getState().setSelectedCommandIndex(index)
  }, [])

  const handleDelete = useCallback((index: number) => {
    useEditorStore.getState().removeCommandAt(index)
  }, [])

  const handleDuplicate = useCallback((index: number) => {
    const cmd = useEditorStore.getState().currentScript?.commands[index]
    if (!cmd) return
    useEditorStore.getState().insertCommandAt(index + 1, cmd.raw)
  }, [])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = commands.findIndex((c) => c.id === active.id)
    const toIndex = commands.findIndex((c) => c.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      useEditorStore.getState().moveCommand(fromIndex, toIndex)
    }
  }

  const visibleCommandEntries = commands
    .map((cmd, index) => ({ cmd, index }))
    .filter(({ index }) => !shouldFoldPauseIntoPrevious(commands, index))
  const sortableIds = visibleCommandEntries.map(({ cmd }) => cmd.id)

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="script-timeline">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {visibleCommandEntries.map(({ cmd, index: i }, visibleIndex) => (
            <div key={cmd.id} data-cmd-index={i}>
              <SortableScriptCard
                cmd={cmd}
                index={i}
                allCommands={commands}
                branchLabel={getBranchLabel(visibleCommandEntries[visibleIndex - 1]?.cmd, cmd, copy)}
                selected={selectedCommandIndex === i}
                expanded={expandedCards.has(cmd.id)}
                showLineNumber={showLineNumbers}
                cardView={cardView}
                locale={locale}
                copy={copy}
                workflowCopy={workflowCopy}
                resourceRegistry={resourceRegistry}
                inlineDelay={getInlineDelayCandidate(commands, i)}
                onSelect={() => handleSelect(i)}
                onToggleExpand={() => useEditorStore.getState().toggleCardExpanded(cmd.id)}
                onUpdateArg={(argIndex, value) => onUpdateArg(i, argIndex, value)}
                onUpdateArgs={(argIndex, values) => onUpdateArgs(i, argIndex, values)}
                onSetInlineDelay={(pauseCommandIndex, valueMs) => onSetInlineDelay(i, pauseCommandIndex, valueMs)}
                onRemoveInlineDelay={onRemoveInlineDelay}
                onEnterPickMode={(paramIndex, controlType) => onEnterPickMode(i, paramIndex, controlType)}
                onDuplicate={() => handleDuplicate(i)}
                onDelete={() => handleDelete(i)}
                onPlayFromHere={() => handleSelect(i)}
                onInsert={handleInsert}
              />
            </div>
          ))}
        </SortableContext>

        {/* Bottom gap after all items */}
        <GapInsertButton index={commands.length} label={copy.insertCommand} onClick={handleInsert} />

        {commands.length === 0 && (
          <div className="script-empty">
            <ListPlus className="h-7 w-7 opacity-40" />
            <p className="text-text-secondary text-sm font-medium">{copy.emptyTitle}</p>
            <p className="text-meta-px">{copy.emptyHint}</p>
            <button
              type="button"
              onClick={() => handleInsert(0)}
              className="bg-accent text-text-inverse mt-1 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              {copy.emptyAction}
            </button>
          </div>
        )}
      </div>
    </DndContext>
  )
}
