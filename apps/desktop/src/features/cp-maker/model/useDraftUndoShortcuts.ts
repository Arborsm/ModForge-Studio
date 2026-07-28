/**
 * Ctrl+Z / Ctrl+Shift+Z (and Cmd on macOS) for every authoring page.
 *
 * The binding lives beside the draft port rather than in each page so all pages
 * walk the same history with the same keys. Text fields keep their own native
 * undo: while the author is inside an input the browser's edit history is the
 * useful one, and stealing the shortcut there would drop a half-typed value.
 */

import { useEffect, useRef } from 'react'
import { useDraftUndoStore } from './undoStack'
import type { AssetDraftPort } from './draftPort'

type PortRef = { current: AssetDraftPort | null }

/**
 * Ports currently on screen. A page can mount its own port inside the edit
 * shell's; both write the same draft through the same history, so the shortcut
 * drives exactly one of them and a keystroke stays one operation.
 */
const mountedPorts: PortRef[] = []
let boundListener: ((event: KeyboardEvent) => void) | null = null

/** True while the event target owns a text caret the browser can undo itself. */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** The most recently mounted port that still has an open draft behind it. */
function activePort(): AssetDraftPort | null {
  for (let index = mountedPorts.length - 1; index >= 0; index -= 1) {
    const port = mountedPorts[index]?.current
    if (port) {
      return port
    }
  }
  return null
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') {
    return
  }
  if (isTextEditingTarget(event.target)) {
    return
  }
  const port = activePort()
  if (port === null) {
    return
  }
  if (event.shiftKey ? port.redo() : port.undo()) {
    event.preventDefault()
  }
}

function registerPort(ref: PortRef): () => void {
  mountedPorts.push(ref)
  if (boundListener === null) {
    boundListener = handleKeyDown
    window.addEventListener('keydown', boundListener)
  }
  return () => {
    const index = mountedPorts.indexOf(ref)
    if (index >= 0) {
      mountedPorts.splice(index, 1)
    }
    if (mountedPorts.length === 0 && boundListener !== null) {
      window.removeEventListener('keydown', boundListener)
      boundListener = null
    }
  }
}

/**
 * Binds undo/redo keys to `port`; while it is null (no open draft) the keys fall
 * through to whichever outer port is mounted, and do nothing if there is none.
 * A port is rebuilt on every render, so the listener reads the current one
 * through a ref instead of re-binding each time.
 */
export function useDraftUndoShortcuts(port: AssetDraftPort | null): void {
  const portRef = useRef<AssetDraftPort | null>(port)

  useEffect(() => {
    portRef.current = port
  }, [port])

  useEffect(() => registerPort(portRef), [])
}

/** Whether the shared history currently has something to undo or redo. */
export function useDraftUndoState(): { canUndo: boolean; canRedo: boolean } {
  const canUndo = useDraftUndoStore((state) => state.past.length > 0)
  const canRedo = useDraftUndoStore((state) => state.future.length > 0)
  return { canUndo, canRedo }
}
