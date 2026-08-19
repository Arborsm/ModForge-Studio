import { describe, expect, it } from 'vite-plus/test'
import {
  isShortcutInputFocused,
  matchMapShortcut,
  MAP_SHORTCUTS,
  resolveShortcutDescription,
  shortcutDescriptionForTool,
  type MapShortcutContext,
} from '@pages/workbench/workspaces/map/model/mapShortcuts'

const FULL_CONTEXT: MapShortcutContext = {
  canSave: true,
  canUndoRedo: true,
  canToggleOverlay: true,
  canToggleGrid: false,
  canSwitchTools: true,
}

const BROWSE_CONTEXT: MapShortcutContext = {
  canSave: false,
  canUndoRedo: false,
  canToggleOverlay: false,
  canToggleGrid: true,
  canSwitchTools: true,
}

function keyEvent(key: string, opts: { ctrl?: boolean; shift?: boolean } = {}) {
  return { key, ctrlKey: opts.ctrl ?? false, shiftKey: opts.shift ?? false }
}

describe('matchMapShortcut', () => {
  it('matches Ctrl+S as save', () => {
    const action = matchMapShortcut(keyEvent('s', { ctrl: true }), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'save' })
  })

  it('matches Ctrl+Z as undo', () => {
    const action = matchMapShortcut(keyEvent('z', { ctrl: true }), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'undo' })
  })

  it('matches Ctrl+Shift+Z as redo', () => {
    const action = matchMapShortcut(keyEvent('z', { ctrl: true, shift: true }), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'redo' })
  })

  it('matches Ctrl+Y as redo', () => {
    const action = matchMapShortcut(keyEvent('y', { ctrl: true }), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'redo' })
  })

  it('matches G as toggleOverlay in editor context', () => {
    const action = matchMapShortcut(keyEvent('g'), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'toggleOverlay' })
  })

  it('matches G as toggleGrid in browse context', () => {
    const action = matchMapShortcut(keyEvent('g'), BROWSE_CONTEXT, false)
    expect(action).toEqual({ kind: 'toggleGrid' })
  })

  it('suppresses grid toggle when context.canToggleGrid is false', () => {
    const context: MapShortcutContext = { ...FULL_CONTEXT, canToggleOverlay: false, canToggleGrid: false }
    expect(matchMapShortcut(keyEvent('g'), context, false)).toBeNull()
  })

  it('matches B as brush tool', () => {
    const action = matchMapShortcut(keyEvent('b'), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'tool', tool: 'brush' })
  })

  it('matches E as erase tool', () => {
    const action = matchMapShortcut(keyEvent('e'), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'tool', tool: 'erase' })
  })

  it('matches I as inspect tool', () => {
    const action = matchMapShortcut(keyEvent('i'), FULL_CONTEXT, false)
    expect(action).toEqual({ kind: 'tool', tool: 'inspect' })
  })

  it('returns null for unmapped keys', () => {
    expect(matchMapShortcut(keyEvent('q'), FULL_CONTEXT, false)).toBeNull()
    expect(matchMapShortcut(keyEvent('x', { ctrl: true }), FULL_CONTEXT, false)).toBeNull()
  })

  it('suppresses save when context.canSave is false', () => {
    expect(matchMapShortcut(keyEvent('s', { ctrl: true }), BROWSE_CONTEXT, false)).toBeNull()
  })

  it('suppresses undo/redo when context.canUndoRedo is false', () => {
    expect(matchMapShortcut(keyEvent('z', { ctrl: true }), BROWSE_CONTEXT, false)).toBeNull()
    expect(matchMapShortcut(keyEvent('y', { ctrl: true }), BROWSE_CONTEXT, false)).toBeNull()
  })

  it('suppresses tool shortcuts when overlay is active', () => {
    expect(matchMapShortcut(keyEvent('b'), FULL_CONTEXT, true)).toBeNull()
    expect(matchMapShortcut(keyEvent('h'), FULL_CONTEXT, true)).toBeNull()
  })

  it('does not suppress overlay toggle when overlay is active', () => {
    expect(matchMapShortcut(keyEvent('g'), FULL_CONTEXT, true)).toEqual({ kind: 'toggleOverlay' })
  })

  it('suppresses tool switching when context.canSwitchTools is false', () => {
    const context: MapShortcutContext = { ...FULL_CONTEXT, canSwitchTools: false }
    expect(matchMapShortcut(keyEvent('b'), context, false)).toBeNull()
  })

  it('suppresses overlay toggle when context.canToggleOverlay is false', () => {
    const context: MapShortcutContext = { ...FULL_CONTEXT, canToggleOverlay: false, canToggleGrid: false }
    expect(matchMapShortcut(keyEvent('g'), context, false)).toBeNull()
  })

  it('treats key case-insensitively', () => {
    expect(matchMapShortcut(keyEvent('S', { ctrl: true }), FULL_CONTEXT, false)).toEqual({ kind: 'save' })
    expect(matchMapShortcut(keyEvent('B'), FULL_CONTEXT, false)).toEqual({ kind: 'tool', tool: 'brush' })
  })

  it('does not match Ctrl+S when ctrl is false', () => {
    expect(matchMapShortcut(keyEvent('s'), FULL_CONTEXT, false)).toBeNull()
  })

  it('does not match Ctrl+Z when shift is also pressed (that is redo, not undo)', () => {
    expect(matchMapShortcut(keyEvent('z', { ctrl: true, shift: true }), FULL_CONTEXT, false)).toEqual({ kind: 'redo' })
  })
})

describe('isShortcutInputFocused', () => {
  it('returns true for INPUT, SELECT, TEXTAREA', () => {
    expect(isShortcutInputFocused({ tagName: 'INPUT' } as Element)).toBe(true)
    expect(isShortcutInputFocused({ tagName: 'SELECT' } as Element)).toBe(true)
    expect(isShortcutInputFocused({ tagName: 'TEXTAREA' } as Element)).toBe(true)
  })

  it('returns false for DIV and null', () => {
    expect(isShortcutInputFocused({ tagName: 'DIV' } as Element)).toBe(false)
    expect(isShortcutInputFocused(null)).toBe(false)
  })
})

describe('MAP_SHORTCUTS table', () => {
  it('has stable description keys (redo has two bindings, so duplicates are expected)', () => {
    const descriptions = MAP_SHORTCUTS.map((b) => b.description)
    // 13 bindings, 12 unique descriptions (redo has Ctrl+Shift+Z and Ctrl+Y).
    expect(descriptions).toHaveLength(13)
    expect(new Set(descriptions).size).toBe(12)
  })

  it('covers all seven AssetTool ids', () => {
    const tools = MAP_SHORTCUTS.filter((b) => b.action.kind === 'tool').map((b) => (b.action as { kind: 'tool'; tool: string }).tool)
    expect(tools.sort()).toEqual(['brush', 'erase', 'eyedropper', 'fill', 'hand', 'inspect', 'rectangle'])
  })
})

describe('resolveShortcutDescription', () => {
  const shortcutsCopy: Record<string, string> = {
    shortcutSave: 'Ctrl+S',
    shortcutToolBrush: 'B',
  }

  it('returns the localized description for a known key', () => {
    expect(resolveShortcutDescription('shortcutSave', shortcutsCopy)).toBe('Ctrl+S')
    expect(resolveShortcutDescription('shortcutToolBrush', shortcutsCopy)).toBe('B')
  })

  it('returns undefined for an unknown key', () => {
    expect(resolveShortcutDescription('shortcutUnknown', shortcutsCopy)).toBeUndefined()
  })
})

describe('shortcutDescriptionForTool', () => {
  const shortcutsCopy: Record<string, string> = {
    shortcutToolBrush: 'B',
    shortcutToolInspect: 'I',
  }

  it('resolves the shortcut for a tool id', () => {
    expect(shortcutDescriptionForTool('brush', shortcutsCopy)).toBe('B')
    expect(shortcutDescriptionForTool('inspect', shortcutsCopy)).toBe('I')
  })

  it('returns undefined when the copy map is missing the tool key', () => {
    expect(shortcutDescriptionForTool('fill', shortcutsCopy)).toBeUndefined()
  })
})
