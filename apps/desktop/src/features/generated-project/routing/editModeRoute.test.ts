import { describe, expect, test } from 'vitest'
import { getEditModeRoute } from '@features/generated-project'

describe('getEditModeRoute', () => {
  test('uses Studio Desk for mods workspace', () => {
    expect(getEditModeRoute('mods', true)).toBe('studio-desk')
  })

  test('uses Studio Desk when no draft is active', () => {
    expect(getEditModeRoute('events', false)).toBe('studio-desk')
  })

  test('uses workspace editor for independent workspaces with a draft', () => {
    expect(getEditModeRoute('events', true)).toBe('workspace-editor')
  })
})
