import { describe, expect, it, vi } from 'vite-plus/test'

describe('electron dev identity helpers', () => {
  it('builds a desktop entry keyed by the dev app id instead of an absolute icon path', async () => {
    const { appDesktopId, buildDevDesktopEntry } = await import('../../../scripts/electronDevIdentity.mjs')

    const entry = buildDevDesktopEntry({
      electronPath: '/opt/Electron/electron',
      desktopRoot: '/repo/apps/desktop',
    })

    expect(entry).toContain(`Icon=${appDesktopId}`)
    expect(entry).toContain(`StartupWMClass=${appDesktopId}`)
    expect(entry).toContain(`X-GNOME-WMName=${appDesktopId}`)
    expect(entry).toContain('"--class=io.github.Arborsm.ModForgeStudio.dev"')
    expect(entry).toContain('"--app-id=io.github.Arborsm.ModForgeStudio.dev"')
    expect(entry).toContain('"/repo/apps/desktop/electron-dist/main.cjs"')
    expect(entry).not.toContain('Icon=/')
  })

  it('quotes desktop Exec arguments without changing paths that contain spaces', async () => {
    const { buildDevDesktopEntry } = await import('../../../scripts/electronDevIdentity.mjs')

    const entry = buildDevDesktopEntry({
      electronPath: '/opt/Electron Dev/electron',
      desktopRoot: '/repo/ModForge Studio/apps/desktop',
    })

    expect(entry).toContain('Exec="/opt/Electron Dev/electron"')
    expect(entry).toContain('"/repo/ModForge Studio/apps/desktop/electron-dist/main.cjs"')
  })

  it('builds a systemd app scope that libksysguard can map back to the desktop entry', async () => {
    const { buildElectronScopeSpawnArgs } = await import('../../../scripts/electronDevIdentity.mjs')

    expect(buildElectronScopeSpawnArgs('/cache/modforge-studio', ['--flag'], { pid: 4242 })).toEqual([
      '--user',
      '--scope',
      '--unit=app-io.github.Arborsm.ModForgeStudio.dev-4242.scope',
      '--collect',
      '--quiet',
      '/cache/modforge-studio',
      '--flag',
    ])
  })

  it('checks both the user systemd socket and systemd-run before enabling scope launch', async () => {
    const { systemdUserScopeAvailable } = await import('../../../scripts/electronDevIdentity.mjs')
    const fsModule = {
      statSync: vi.fn(() => ({
        isSocket: () => true,
      })),
    }
    const spawnSyncFn = vi.fn(() => ({ status: 0 }))

    expect(
      systemdUserScopeAvailable({
        env: { XDG_RUNTIME_DIR: '/run/user/1000' },
        fsModule,
        spawnSyncFn,
        platform: 'linux',
      }),
    ).toBe(true)

    expect(fsModule.statSync).toHaveBeenCalledWith('/run/user/1000/systemd/private')
    expect(spawnSyncFn).toHaveBeenCalledWith('systemd-run', ['--version'], { stdio: 'ignore' })
  })
})
