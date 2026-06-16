import type { ComponentProps } from 'react'
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import StatusBar from './StatusBar'
import { editorCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import type { MapAssetSummary, GameDirectoryInfo } from '@shared/contracts'
import type { TileHoverInfo } from '@shared/contracts'

const copy = editorCopy['en-US']

const hoverInfoSample: TileHoverInfo = {
  tileX: 12,
  tileY: 8,
  pixelX: 384,
  pixelY: 256,
  layerName: 'Front',
  gid: 42,
  tilesetName: 'SpringObjects',
  tileId: 112,
  tileProperties: null,
  objectHits: [],
}

function buildProps(overrides: Partial<ComponentProps<typeof StatusBar>> = {}): ComponentProps<typeof StatusBar> {
  return {
    appMode: 'workbench',
    launcherPage: 'library',
    workspaceMode: 'map',
    workspaceStatus: {
      tone: 'ready',
      message: 'Workspace ready.',
    },
    directoryInfo: { rootPath: 'E:\\Games\\Stardew Valley' } as GameDirectoryInfo,
    mapAssets: [{ format: 'xnb' } as MapAssetSummary],
    activeAsset: null,
    mapDocument: null,
    pathLabel: 'Maps/Town',
    hoverInfo: null,
    ...overrides,
  }
}

describe('StatusBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders status and project context groups without hover telemetry', () => {
    renderWithLocale(<StatusBar {...buildProps({ hoverInfo: null })} />)

    const statusGroup = screen.getByRole('group', { name: copy.rightDock.workspaceStatus })
    const contextGroup = screen.getByRole('group', { name: copy.rightDock.projectFacts })

    expect(within(statusGroup).getByText(copy.statusBar.pathValid)).toBeTruthy()
    expect(within(contextGroup).getByText(new RegExp(copy.center.activeScene, 'i'))).toBeTruthy()
    expect(screen.queryByRole('group', { name: copy.rightDock.hoverProbe })).toBeNull()
  })

  it('shows hover telemetry when hover info exists', () => {
    renderWithLocale(<StatusBar {...buildProps({ hoverInfo: hoverInfoSample })} />)

    const hoverGroup = screen.getByRole('group', { name: copy.rightDock.hoverProbe })

    expect(within(hoverGroup).getByText(new RegExp(`^${copy.statusBar.hover}`))).toBeTruthy()
    expect(within(hoverGroup).getByText(new RegExp(`^${copy.statusBar.coordinates}`))).toBeTruthy()
    expect(within(hoverGroup).getByText(/X 384/i)).toBeTruthy()
  })

  it('renders launcher mode status details instead of workspace telemetry', () => {
    renderWithLocale(
      <StatusBar
        {...buildProps({
          appMode: 'launcher',
          launcherPage: 'updates',
          hoverInfo: hoverInfoSample,
        })}
      />,
    )

    expect(screen.getByText(copy.shell.launcher)).toBeTruthy()
    expect(screen.getByText(copy.launcher.pages.updates)).toBeTruthy()
    expect(screen.queryAllByRole('group', { name: copy.rightDock.workspaceStatus })).toHaveLength(0)
    expect(screen.queryAllByRole('group', { name: copy.rightDock.hoverProbe })).toHaveLength(0)
  })
})
