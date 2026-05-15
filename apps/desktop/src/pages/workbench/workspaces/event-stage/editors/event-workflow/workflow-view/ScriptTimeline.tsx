// 流式时间轴 — 卡片列表 + 间隙插入 + 拖拽排序

import { useCallback, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EventCommand } from '@entities/event'
import { useEditorStore } from '../workflow-model/editorStore'
import { ScriptCard } from './ScriptCard'

export type ScriptTimelineProps = {
  commands: EventCommand[]
  locale?: 'zh-CN' | 'en-US'
  onUpdateArg: (commandIndex: number, argIndex: number, value: string) => void
  onEnterPickMode: (commandIndex: number, paramIndex: number, controlType: 'tile_picker' | 'npc_selector') => void
}

function GapInsertButton({ index, onClick }: { index: number; onClick: (index: number) => void }) {
  return (
    <div className="group relative flex h-3 items-center justify-center py-0.5 transition-all">
      <div className="absolute inset-x-0 top-1/2 h-px bg-transparent transition-colors group-hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
      <button
        type="button"
        onClick={() => onClick(index)}
        className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-tertiary)] opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

function SortableScriptCard({
  cmd,
  index,
  selected,
  expanded,
  showLineNumber,
  cardView,
  locale,
  onSelect,
  onToggleExpand,
  onUpdateArg,
  onEnterPickMode,
  onDuplicate,
  onDelete,
  onInsert,
}: {
  cmd: EventCommand
  index: number
  selected: boolean
  expanded: boolean
  showLineNumber: boolean
  cardView: 'compact' | 'comfortable'
  locale: 'zh-CN' | 'en-US'
  onSelect: () => void
  onToggleExpand: () => void
  onUpdateArg: (argIndex: number, value: string) => void
  onEnterPickMode: (paramIndex: number, controlType: 'tile_picker' | 'npc_selector') => void
  onDuplicate: () => void
  onDelete: () => void
  onInsert: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cmd.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <GapInsertButton index={index} onClick={onInsert} />
      <ScriptCard
        command={cmd}
        index={index}
        selected={selected}
        expanded={expanded}
        showLineNumber={showLineNumber}
        cardView={cardView}
        locale={locale}
        onSelect={onSelect}
        onToggleExpand={onToggleExpand}
        onUpdateArg={onUpdateArg}
        onEnterPickMode={onEnterPickMode}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

export function ScriptTimeline({ commands, locale = 'zh-CN', onUpdateArg, onEnterPickMode }: ScriptTimelineProps) {
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
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedCommandIndex])

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

  const sortableIds = commands.map((c) => c.id)

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {commands.map((cmd, i) => (
            <div key={cmd.id} data-cmd-index={i}>
              <SortableScriptCard
                cmd={cmd}
                index={i}
                selected={selectedCommandIndex === i}
                expanded={expandedCards.has(cmd.id)}
                showLineNumber={showLineNumbers}
                cardView={cardView}
                locale={locale}
                onSelect={() => handleSelect(i)}
                onToggleExpand={() => useEditorStore.getState().toggleCardExpanded(cmd.id)}
                onUpdateArg={(argIndex, value) => onUpdateArg(i, argIndex, value)}
                onEnterPickMode={(paramIndex, controlType) => onEnterPickMode(i, paramIndex, controlType)}
                onDuplicate={() => handleDuplicate(i)}
                onDelete={() => handleDelete(i)}
                onInsert={handleInsert}
              />
            </div>
          ))}
        </SortableContext>

        {/* Bottom gap after all items */}
        <GapInsertButton index={commands.length} onClick={handleInsert} />

        {commands.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-color)] py-12 text-[var(--text-tertiary)]">
            <p className="text-sm">暂无命令</p>
            <button
              type="button"
              onClick={() => handleInsert(0)}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--text-inverse)] transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              添加命令
            </button>
          </div>
        )}
      </div>
    </DndContext>
  )
}
