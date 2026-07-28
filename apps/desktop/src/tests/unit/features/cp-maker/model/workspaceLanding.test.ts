import { describe, expect, test } from 'vite-plus/test'
import { resolveWorkspaceLanding } from '@features/cp-maker'

describe('resolveWorkspaceLanding', () => {
  test('mods workspace resolves to projectContent landing', () => {
    expect(resolveWorkspaceLanding('mods')).toEqual({ kind: 'projectContent' })
  })

  test('data-asset workspaces resolve to direct asset editing', () => {
    expect(resolveWorkspaceLanding('characters')).toEqual({ kind: 'asset', action: 'EditData', target: 'Data/Characters' })
    expect(resolveWorkspaceLanding('buildings')).toEqual({ kind: 'asset', action: 'EditData', target: 'Data/Buildings' })
    expect(resolveWorkspaceLanding('items')).toEqual({ kind: 'asset', action: 'EditData', target: 'Data/Objects' })
  })

  test('map workspace resolves to assetGroup with map targets', () => {
    const landing = resolveWorkspaceLanding('map')
    expect(landing.kind).toBe('assetGroup')
    if (landing.kind === 'assetGroup') {
      expect(landing.targets.length).toBeGreaterThan(0)
      expect(landing.targets.some((t) => t.startsWith('Maps/'))).toBe(true)
    }
  })

  test('mail, dialogue, schedules, and events are module landings', () => {
    expect(resolveWorkspaceLanding('mail')).toEqual({ kind: 'module' })
    expect(resolveWorkspaceLanding('dialogue')).toEqual({ kind: 'module' })
    expect(resolveWorkspaceLanding('schedules')).toEqual({ kind: 'module' })
    expect(resolveWorkspaceLanding('events')).toEqual({ kind: 'module' })
  })

  test('unknown workspace defaults to module', () => {
    expect(resolveWorkspaceLanding('unknown' as any)).toEqual({ kind: 'module' })
  })
})
