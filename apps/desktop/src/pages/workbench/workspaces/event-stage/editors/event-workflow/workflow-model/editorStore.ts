/**
 * @file Event editor Zustand global state store.
 */

import { create } from 'zustand'
import { nextDraftEditMergeKey, tagNextDraftEdit } from '@features/cp-maker'
import type { EventScript, EventCommand } from '@entities/event'
import { parseRawArgs } from './rawSerializer'

export type PickModeTarget = {
  commandIndex: number
  paramIndex: number
  controlType: 'tile_picker' | 'npc_selector' | 'path_picker'
} | null

type ScriptCardView = 'compact' | 'comfortable'

interface EditorState {
  selectedEventKey: string | null
  setSelectedEventKey: (key: string | null) => void

  selectedCommandIndex: number | null
  setSelectedCommandIndex: (index: number | null) => void

  // Playback position (the command id playback has advanced to)
  // Kept in the store rather than editor root state: when playback advances only
  // subscribed cards re-render, avoiding re-rendering the whole editor (including all dnd cards) on every command transition.
  playbackCommandId: string | null
  setPlaybackCommandId: (id: string | null) => void

  // Currently parsed event script (injected by the parent layer)
  currentScript: EventScript | null
  setCurrentScript: (script: EventScript | null) => void

  // Pick Mode (map picking)
  pickModeTarget: PickModeTarget
  setPickModeTarget: (target: PickModeTarget) => void
  isPickMode: boolean

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  commandPaletteInsertIndex: number | null
  setCommandPaletteInsertIndex: (index: number | null) => void

  // View preferences
  cardView: ScriptCardView
  setCardView: (view: ScriptCardView) => void
  showLineNumbers: boolean
  setShowLineNumbers: (show: boolean) => void

  // Edit state
  expandedCards: Set<string>
  toggleCardExpanded: (id: string) => void

  // Operations
  insertCommandAt: (index: number, raw: string) => void
  updateCommandAt: (index: number, raw: string) => void
  removeCommandAt: (index: number) => void
  moveCommand: (fromIndex: number, toIndex: number) => void

  // Reset
  reset: () => void
}

/**
 * Announces the pipeline operation the resulting draft write belongs to.
 *
 * A command edit reaches the draft indirectly: the store rebuilds the raw
 * script and the editor stages it as one entry write. Tagging the write keeps
 * each pipeline operation its own undo step — structural ones (insert, remove,
 * move) never merge, while retyping the same command's arguments does.
 */
function tagPipelineEdit(operation: 'insert' | 'remove' | 'move'): void
function tagPipelineEdit(operation: 'update', index: number): void
function tagPipelineEdit(operation: 'insert' | 'update' | 'remove' | 'move', index?: number): void {
  tagNextDraftEdit(operation === 'update' ? `event:update:${index}` : nextDraftEditMergeKey(`event:${operation}`))
}

function rebuildScriptRaw(script: EventScript): EventScript {
  const rawSegments = [
    script.scene.musicCue ?? '',
    script.scene.cameraInstruction ?? '',
    script.scene.characterInstruction ?? '',
    ...script.commands.map((cmd) => cmd.raw),
  ]
  return {
    ...script,
    rawScript: rawSegments.join('/'),
    rawSegments,
  }
}

export const useEditorStore = create<EditorState>((set) => ({
  // Event selection
  selectedEventKey: null,
  setSelectedEventKey: (key) => set({ selectedEventKey: key, selectedCommandIndex: null }),

  // Command selection
  selectedCommandIndex: null,
  setSelectedCommandIndex: (index) => set({ selectedCommandIndex: index }),

  // Playback position
  playbackCommandId: null,
  setPlaybackCommandId: (id) => set({ playbackCommandId: id }),

  // Current script
  currentScript: null,
  setCurrentScript: (script) => set({ currentScript: script }),

  // Pick Mode
  pickModeTarget: null,
  isPickMode: false,
  setPickModeTarget: (target) => set({ pickModeTarget: target, isPickMode: target != null }),

  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  commandPaletteInsertIndex: null,
  setCommandPaletteInsertIndex: (index) => set({ commandPaletteInsertIndex: index }),

  // View preferences
  cardView: 'comfortable',
  setCardView: (view) => set({ cardView: view }),
  showLineNumbers: true,
  setShowLineNumbers: (show) => set({ showLineNumbers: show }),

  // Edit state
  expandedCards: new Set(),
  toggleCardExpanded: (id) =>
    set((state) => {
      const next = new Set(state.expandedCards)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedCards: next }
    }),

  // Operations
  insertCommandAt: (index, raw) =>
    set((state) => {
      if (!state.currentScript) return state
      tagPipelineEdit('insert')
      const cmds = [...state.currentScript.commands]
      const parsed = parseRawArgs(raw)
      const newCmd: EventCommand = {
        id: `cmd:${Date.now()}`,
        index,
        raw,
        command: parsed[0] ?? '',
        args: parsed,
        kind: 'action',
        title: raw,
        detail: '',
      }
      cmds.splice(index, 0, newCmd)
      const reindexed = cmds.map((c, i) => ({ ...c, index: i }))
      const nextScript = rebuildScriptRaw({
        ...state.currentScript,
        commands: reindexed,
      })
      return { currentScript: nextScript, selectedCommandIndex: index }
    }),

  updateCommandAt: (index, raw) =>
    set((state) => {
      if (!state.currentScript) return state
      tagPipelineEdit('update', index)
      const parsed = parseRawArgs(raw)
      const cmds = state.currentScript.commands.map((c, i) => (i === index ? { ...c, raw, command: parsed[0] ?? '', args: parsed } : c))
      const nextScript = rebuildScriptRaw({
        ...state.currentScript,
        commands: cmds,
      })
      return { currentScript: nextScript }
    }),

  removeCommandAt: (index) =>
    set((state) => {
      if (!state.currentScript) return state
      tagPipelineEdit('remove')
      const removedId = state.currentScript.commands[index]?.id
      const cmds = state.currentScript.commands.filter((_, i) => i !== index)
      const reindexed = cmds.map((c, i) => ({ ...c, index: i }))
      const nextScript = rebuildScriptRaw({
        ...state.currentScript,
        commands: reindexed,
      })
      const nextExpanded = new Set(state.expandedCards)
      if (removedId) nextExpanded.delete(removedId)
      return {
        currentScript: nextScript,
        selectedCommandIndex:
          state.selectedCommandIndex === index
            ? null
            : state.selectedCommandIndex != null && state.selectedCommandIndex > index
              ? state.selectedCommandIndex - 1
              : state.selectedCommandIndex,
        expandedCards: nextExpanded,
      }
    }),

  moveCommand: (fromIndex, toIndex) =>
    set((state) => {
      if (!state.currentScript) return state
      tagPipelineEdit('move')
      const cmds = [...state.currentScript.commands]
      const [moved] = cmds.splice(fromIndex, 1)
      cmds.splice(toIndex, 0, moved)
      const reindexed = cmds.map((c, i) => ({ ...c, index: i }))
      const nextScript = rebuildScriptRaw({
        ...state.currentScript,
        commands: reindexed,
      })

      let nextSelected = state.selectedCommandIndex
      if (nextSelected != null) {
        if (fromIndex === nextSelected) {
          nextSelected = toIndex
        } else if (fromIndex < nextSelected && toIndex >= nextSelected) {
          nextSelected -= 1
        } else if (fromIndex > nextSelected && toIndex <= nextSelected) {
          nextSelected += 1
        }
      }

      return { currentScript: nextScript, selectedCommandIndex: nextSelected }
    }),

  reset: () =>
    set({
      currentScript: null,
      selectedCommandIndex: null,
      playbackCommandId: null,
      pickModeTarget: null,
      isPickMode: false,
      commandPaletteOpen: false,
      commandPaletteInsertIndex: null,
      expandedCards: new Set(),
    }),
}))
