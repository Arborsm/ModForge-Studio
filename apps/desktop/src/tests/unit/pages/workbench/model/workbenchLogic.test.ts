import { describe, expect, it } from 'vite-plus/test'
import type { SlotId, WorkspaceSlotState } from '@shared/contracts'
import type { ResourcePreloadState } from '@entities/map'
import {
  areWorkspaceStoredStatesEqual,
  deriveWorkspaceStatus,
  getRecentGameDirectories,
  getResourcePreloadProgress,
  normalizeWorkspaceLayouts,
} from '@pages/workbench/model/workbenchLogic'

describe('workbenchLogic', () => {
  it('normalizes workspace layout records before persistence', () => {
    expect(
      normalizeWorkspaceLayouts({
        valid: {
          panels: {},
          slots: {} as Record<SlotId, WorkspaceSlotState>,
          chrome: { leftWidth: 240, rightWidth: 240, bottomHeight: 220, leftSplit: 0.5, rightSplit: 0.5, bottomSplit: 0.5 },
          presets: {},
        },
        ' ': {
          panels: {},
          slots: {} as Record<SlotId, WorkspaceSlotState>,
          chrome: { leftWidth: 240, rightWidth: 240, bottomHeight: 220, leftSplit: 0.5, rightSplit: 0.5, bottomSplit: 0.5 },
          presets: {},
        },
        list: [] as unknown as Record<string, unknown>,
      }),
    ).toEqual({
      valid: {
        panels: {},
        slots: {} as Record<SlotId, WorkspaceSlotState>,
        chrome: { leftWidth: 240, rightWidth: 240, bottomHeight: 220, leftSplit: 0.5, rightSplit: 0.5, bottomSplit: 0.5 },
        presets: {},
      },
    })
  })

  it('clamps resource preload progress', () => {
    const state: ResourcePreloadState = {
      active: true,
      message: '',
      completed: 25,
      total: 10,
      currentLabel: '',
    }

    expect(getResourcePreloadProgress(state)).toBe(100)
    expect(getResourcePreloadProgress({ ...state, total: 0 })).toBe(18)
  })

  it('keeps recent game directories unique and capped', () => {
    expect(getRecentGameDirectories('C:\\Games\\Stardew', ['D:\\Backup', 'C:\\Games\\Stardew', 'E:\\Mods'])).toEqual([
      'C:\\Games\\Stardew',
      'D:\\Backup',
      'E:\\Mods',
    ])
  })

  it('derives workspace status from the active mode', () => {
    expect(
      deriveWorkspaceStatus({
        workspaceMode: 'mod-browser',
        directoryInfoPresent: true,
        workspaceStatus: { tone: 'idle', message: 'fallback' },
        eventCount: 0,
        eventStatusMessage: '',
        characterCount: 0,
        characterStatusMessage: '',
        buildingBrowserCount: 0,
        buildingStatusMessage: '',
        itemCount: 0,
        itemStatusMessage: '',
        modDiagnostics: [{ severity: 'warning' }],
        modHasUnsavedChanges: true,
        modProjectsCount: 0,
        activeModProjectDetail: null,
        modStatusMessage: 'editing',
      }),
    ).toEqual({ tone: 'working', message: 'editing' })
  })

  it('compares workspace stored states by JSON equivalence', () => {
    const state = {
      panels: {},
      slots: {} as Record<SlotId, WorkspaceSlotState>,
      chrome: { leftWidth: 240, rightWidth: 240, bottomHeight: 220, leftSplit: 0.5, rightSplit: 0.5, bottomSplit: 0.5 },
      presets: {},
    }

    expect(areWorkspaceStoredStatesEqual(state, { ...state })).toBe(true)
    expect(areWorkspaceStoredStatesEqual(state, null)).toBe(false)
    expect(areWorkspaceStoredStatesEqual(null, state)).toBe(false)
    expect(areWorkspaceStoredStatesEqual(null, null)).toBe(true)
    expect(areWorkspaceStoredStatesEqual(undefined, undefined)).toBe(true)

    const differentState = {
      panels: {},
      slots: {} as Record<SlotId, WorkspaceSlotState>,
      chrome: { leftWidth: 300, rightWidth: 240, bottomHeight: 220, leftSplit: 0.5, rightSplit: 0.5, bottomSplit: 0.5 },
      presets: {},
    }
    expect(areWorkspaceStoredStatesEqual(state, differentState)).toBe(false)
  })
})
