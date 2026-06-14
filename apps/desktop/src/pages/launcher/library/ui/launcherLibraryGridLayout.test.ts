import { describe, expect, it } from 'vitest'
import type { LauncherLibraryItem, LauncherVirtualFolder } from '@features/launcher/model/types'
import type { LauncherLibraryDisplayItem } from '../model/launcherLibraryDisplay'
import { buildLauncherLibraryGridBlocks, getLauncherLibraryPanelPlacement } from './launcherLibraryGridLayout'

function mod(id: string): LauncherLibraryItem {
  return {
    id,
    labelKey: id,
    name: id,
    author: null,
    version: null,
    description: null,
    uniqueId: id,
    folderName: id,
    absolutePath: `E:\\Mods\\${id}`,
    enabled: true,
    nexusModId: null,
    updateKeys: [],
    modUrl: null,
    imageUrl: null,
    requiredDependencies: [],
    missingRequiredDependencies: [],
  }
}

function folder(id: string, modCount: number): LauncherLibraryDisplayItem {
  const mods = Array.from({ length: modCount }, (_, index) => mod(`${id}-mod-${index}`))
  const virtualFolder: LauncherVirtualFolder = {
    id,
    name: id,
    parentFolderId: null,
    modKeys: mods.map((item) => item.uniqueId),
    coverModKeys: [],
  }
  return { kind: 'folder', folder: virtualFolder, mods, childFolders: [] }
}

describe('launcherLibraryGridLayout', () => {
  it('keeps balanced panel placement as the default for floating module panels', () => {
    expect(getLauncherLibraryPanelPlacement(20, 8)).toEqual({ columnSpan: 5, rowSpan: 4 })
  })

  it('prefers a square placement for opened library folders', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 20)], 8, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 5,
      rowSpan: 4,
      columnStart: 0,
      rowStart: 0,
    })
  })

  it('collapses opened folders into the current small-window column count', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 20)], 4, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 4,
      rowSpan: 5,
    })
  })

  it('falls back to one long column when the viewport only fits one card', () => {
    const [placedFolder] =
      buildLauncherLibraryGridBlocks([folder('large-folder', 6)], 1, (folderId) => folderId === 'large-folder', 260)[0]?.items ?? []

    expect(placedFolder).toMatchObject({
      columnSpan: 1,
      rowSpan: 6,
    })
  })
})
