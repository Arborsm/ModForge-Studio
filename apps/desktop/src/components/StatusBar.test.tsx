import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBar from './StatusBar'
import { editorCopy } from '../lib/editor-shell'
import type { MapAssetSummary, GameDirectoryInfo } from '../lib/desktop'
import type { TileHoverInfo } from './MapViewport'

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
    copy,
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
  it('renders status and project context groups without hover telemetry', () => {
    render(<StatusBar {...buildProps({ hoverInfo: null })} />)

    const statusGroup = screen.getByRole('group', { name: copy.rightDock.workspaceStatus })
    const contextGroup = screen.getByRole('group', { name: copy.rightDock.projectFacts })

    expect(within(statusGroup).getByText(copy.statusBar.pathValid)).toBeInTheDocument()
    expect(within(contextGroup).getByText(new RegExp(copy.center.activeScene, 'i'))).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: copy.rightDock.hoverProbe })).not.toBeInTheDocument()
  })

  it('shows hover telemetry when hover info exists', () => {
    render(<StatusBar {...buildProps({ hoverInfo: hoverInfoSample })} />)

    const hoverGroup = screen.getByRole('group', { name: copy.rightDock.hoverProbe })

    expect(within(hoverGroup).getByText(new RegExp(`^${copy.statusBar.hover}`))).toBeInTheDocument()
    expect(within(hoverGroup).getByText(new RegExp(`^${copy.statusBar.coordinates}`))).toBeInTheDocument()
    expect(within(hoverGroup).getByText(/X 384/i)).toBeInTheDocument()
  })
})
