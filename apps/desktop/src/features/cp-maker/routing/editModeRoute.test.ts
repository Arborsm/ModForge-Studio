import { describe, expect, test } from 'vite-plus/test'
import { getEditModeRoute } from '@features/cp-maker'

describe('getEditModeRoute', () => {
  test('uses workspace editor for mods workspace', () => {
    expect(getEditModeRoute('mods', true)).toBe('workspace-editor')
  })

  test('uses workspace editor when no draft is active', () => {
    expect(getEditModeRoute('events', false)).toBe('workspace-editor')
  })

  test('uses workspace editor for independent workspaces with a draft', () => {
    expect(getEditModeRoute('events', true)).toBe('workspace-editor')
  })
})
