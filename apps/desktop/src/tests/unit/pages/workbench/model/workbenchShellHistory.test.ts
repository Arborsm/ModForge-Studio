import { describe, expect, it } from 'vite-plus/test'
import {
  areWorkbenchShellLocationsEqual,
  canGoWorkbenchShellBack,
  canGoWorkbenchShellForward,
  createWorkbenchShellHistory,
  getWorkbenchShellHistoryLocation,
  goWorkbenchShellBack,
  goWorkbenchShellForward,
  pushWorkbenchShellHistory,
  resetWorkbenchShellHistory,
  type WorkbenchShellLocation,
} from '@pages/workbench/model/workbenchShellHistory'

function loc(partial: Partial<WorkbenchShellLocation> = {}): WorkbenchShellLocation {
  return {
    workbenchRoute: 'home',
    workspaceMode: 'map',
    workspaceViewMode: 'preview',
    registeredWorkbenchViewId: null,
    ...partial,
  }
}

describe('workbenchShellHistory', () => {
  it('seeds a single root location', () => {
    const history = createWorkbenchShellHistory(loc())
    expect(history.entries).toHaveLength(1)
    expect(history.index).toBe(0)
    expect(getWorkbenchShellHistoryLocation(history)).toEqual(loc())
    expect(canGoWorkbenchShellBack(history)).toBe(false)
    expect(canGoWorkbenchShellForward(history)).toBe(false)
  })

  it('pushes distinct locations and supports back/forward', () => {
    let history = createWorkbenchShellHistory(loc({ workbenchRoute: 'home' }))
    history = pushWorkbenchShellHistory(history, loc({ workbenchRoute: 'workspace', workspaceMode: 'map', workspaceViewMode: 'preview' }))
    history = pushWorkbenchShellHistory(
      history,
      loc({ workbenchRoute: 'workspace', workspaceMode: 'characters', workspaceViewMode: 'preview' }),
    )

    expect(history.entries).toHaveLength(3)
    expect(canGoWorkbenchShellBack(history)).toBe(true)
    expect(canGoWorkbenchShellForward(history)).toBe(false)

    history = goWorkbenchShellBack(history)
    expect(getWorkbenchShellHistoryLocation(history).workspaceMode).toBe('map')
    expect(canGoWorkbenchShellForward(history)).toBe(true)

    history = goWorkbenchShellForward(history)
    expect(getWorkbenchShellHistoryLocation(history).workspaceMode).toBe('characters')
  })

  it('dedupes identical consecutive locations', () => {
    let history = createWorkbenchShellHistory(loc())
    history = pushWorkbenchShellHistory(history, loc())
    history = pushWorkbenchShellHistory(history, loc())
    expect(history.entries).toHaveLength(1)
  })

  it('truncates forward branch on push after back', () => {
    let history = createWorkbenchShellHistory(loc({ workbenchRoute: 'home' }))
    history = pushWorkbenchShellHistory(history, loc({ workbenchRoute: 'workspace', workspaceMode: 'map' }))
    history = pushWorkbenchShellHistory(history, loc({ workbenchRoute: 'workspace', workspaceMode: 'events' }))
    history = goWorkbenchShellBack(history)
    history = pushWorkbenchShellHistory(history, loc({ workbenchRoute: 'workspace', workspaceMode: 'items' }))

    expect(history.entries.map((entry) => entry.workspaceMode)).toEqual(['map', 'map', 'items'])
    expect(history.entries[0].workbenchRoute).toBe('home')
    expect(canGoWorkbenchShellForward(history)).toBe(false)
  })

  it('is a no-op at stack boundaries', () => {
    const root = createWorkbenchShellHistory(loc())
    expect(goWorkbenchShellBack(root)).toBe(root)

    let history = pushWorkbenchShellHistory(root, loc({ workbenchRoute: 'workspace', workspaceMode: 'map' }))
    expect(goWorkbenchShellForward(history)).toBe(history)
  })

  it('resets to a new root for project switch/close', () => {
    let history = createWorkbenchShellHistory(loc({ workbenchRoute: 'home' }))
    history = pushWorkbenchShellHistory(history, loc({ workbenchRoute: 'workspace', workspaceMode: 'map' }))
    history = resetWorkbenchShellHistory(loc({ workbenchRoute: 'home', workspaceMode: 'map' }))

    expect(history.entries).toHaveLength(1)
    expect(history.index).toBe(0)
    expect(getWorkbenchShellHistoryLocation(history).workspaceMode).toBe('map')
    expect(canGoWorkbenchShellBack(history)).toBe(false)
  })

  it('compares registered view ids when deduping', () => {
    expect(areWorkbenchShellLocationsEqual(loc({ registeredWorkbenchViewId: 'dev-a' }), loc({ registeredWorkbenchViewId: 'dev-b' }))).toBe(
      false,
    )
    expect(areWorkbenchShellLocationsEqual(loc({ registeredWorkbenchViewId: 'dev-a' }), loc({ registeredWorkbenchViewId: 'dev-a' }))).toBe(
      true,
    )
  })
})
