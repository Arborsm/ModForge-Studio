import { describe, expect, it } from 'vite-plus/test'
import {
  areWorkbenchShellLocationsEqual,
  createWorkbenchShellHistory,
  getWorkbenchShellHistoryLocation,
  goWorkbenchShellBack,
  goWorkbenchShellForward,
  pushWorkbenchShellHistory,
  resetWorkbenchShellHistory,
} from '@pages/workbench/model/workbenchShellHistory'

describe('workbench shell history', () => {
  it('moves backward and forward through module locations', () => {
    let history = createWorkbenchShellHistory({ kind: 'home' })
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'map-browser' })
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'item-browser' })
    history = goWorkbenchShellBack(history)
    expect(getWorkbenchShellHistoryLocation(history)).toEqual({ kind: 'module', moduleId: 'map-browser' })
    history = goWorkbenchShellForward(history)
    expect(getWorkbenchShellHistoryLocation(history)).toEqual({ kind: 'module', moduleId: 'item-browser' })
  })

  it('truncates forward entries after new navigation and deduplicates the current module', () => {
    let history = createWorkbenchShellHistory({ kind: 'home' })
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'map-browser' })
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'event-browser' })
    history = goWorkbenchShellBack(history)
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'item-browser' })
    history = pushWorkbenchShellHistory(history, { kind: 'module', moduleId: 'item-browser' })
    expect(history.entries).toEqual([
      { kind: 'home' },
      { kind: 'module', moduleId: 'map-browser' },
      { kind: 'module', moduleId: 'item-browser' },
    ])
  })

  it('resets project-scoped history and compares stable module ids', () => {
    const reset = resetWorkbenchShellHistory({ kind: 'module', moduleId: 'project-content' })
    expect(reset.entries).toEqual([{ kind: 'module', moduleId: 'project-content' }])
    expect(areWorkbenchShellLocationsEqual({ kind: 'module', moduleId: 'map-browser' }, { kind: 'module', moduleId: 'map-browser' })).toBe(
      true,
    )
    expect(areWorkbenchShellLocationsEqual({ kind: 'home' }, { kind: 'module', moduleId: 'map-browser' })).toBe(false)
  })
})
