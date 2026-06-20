import { describe, expect, it } from 'vite-plus/test'
import {
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_PARENT_DROP_PREFIX,
  LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX,
  getLauncherReorderFolderDropId,
  getLauncherReorderRootDropId,
  getLauncherReorderPayloadFromDropId,
  getLauncherDropIdFromElement,
  getLauncherDropTargetAtPoint,
  getLauncherFolderIdFromBlankDropId,
  measureLauncherDndKitDropTargets,
} from './launcherLibraryDrag'

describe('launcherLibraryDrag', () => {
  it('extracts folder ids only from folder blank drop ids', () => {
    expect(getLauncherFolderIdFromBlankDropId(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`)).toBe('visuals')
    expect(getLauncherFolderIdFromBlankDropId(LAUNCHER_LIBRARY_BLANK_DROP_ID)).toBeNull()
  })

  it('reads drop ids from blank, folder, and pack targets', () => {
    const blank = document.createElement('div')
    blank.setAttribute('data-launcher-blank-drop-id', LAUNCHER_LIBRARY_BLANK_DROP_ID)
    expect(getLauncherDropIdFromElement(blank)).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)

    const folder = document.createElement('div')
    folder.setAttribute('data-launcher-folder-drop-id', 'folder-a')
    expect(getLauncherDropIdFromElement(folder)).toBe(`${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}folder-a`)

    const pack = document.createElement('div')
    pack.setAttribute('data-launcher-pack-drop-id', 'pack-a')
    expect(getLauncherDropIdFromElement(pack)).toBe(`${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}pack-a`)
  })

  it('reads parent drop ids from parent mod cards', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-launcher-parent-drop-id', 'mod-a')
    expect(getLauncherDropIdFromElement(parent)).toBe(`${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`)
  })

  it('reads reorder drop ids with encoded container and item keys', () => {
    const card = document.createElement('div')
    card.setAttribute('data-launcher-reorder-item-key', 'm:Mod.Alpha')
    card.setAttribute('data-launcher-reorder-container-key', 'folder:visuals')

    const dropId = getLauncherDropIdFromElement(card)

    expect(dropId).toBe(getLauncherReorderFolderDropId('folder:visuals', 'm:Mod.Alpha'))
    expect(getLauncherReorderPayloadFromDropId(dropId ?? '')).toEqual({
      containerKey: 'folder:visuals',
      afterKey: 'm:Mod.Alpha',
    })
  })

  it('measures visible drop targets and skips source descendants', () => {
    const source = document.createElement('div')
    const skipped = document.createElement('div')
    skipped.setAttribute('data-launcher-folder-drop-id', 'inside-source')
    source.append(skipped)
    source.className = 'launcher-library-draggable-card'
    document.body.append(source)

    const target = document.createElement('div')
    target.setAttribute('data-launcher-pack-drop-id', 'pack-a')
    Object.defineProperty(target, 'offsetParent', { value: document.body, configurable: true })
    target.getBoundingClientRect = () =>
      ({
        left: 1,
        top: 2,
        width: 100,
        height: 50,
        right: 101,
        bottom: 52,
        x: 1,
        y: 2,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.append(target)

    const targets = measureLauncherDndKitDropTargets(source)

    expect(targets).toEqual([
      expect.objectContaining({
        dropId: `${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}pack-a`,
        kind: 'pack',
        containerFolderId: null,
        rect: { left: 1, top: 2, width: 100, height: 50 },
      }),
    ])

    source.remove()
    target.remove()
  })

  it('resolves the most specific drop target at a pointer position', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 500, height: 500 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`,
        kind: 'folder' as const,
        containerFolderId: null,
        rect: { left: 20, top: 20, width: 100, height: 100 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 40, 40)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`)
    expect(getLauncherDropTargetAtPoint(targets, 160, 40)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
    expect(getLauncherDropTargetAtPoint(targets, 300, 40)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
    expect(getLauncherDropTargetAtPoint(targets, 520, 40)).toBeNull()
  })

  it('prioritizes folder targets when dragging into the library', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`,
        kind: 'folder' as const,
        containerFolderId: null,
        rect: { left: 20, top: 20, width: 200, height: 200 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 80, 80)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`)
  })

  it('prioritizes expanded folder blank targets when dragging into a folder panel', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 500, height: 500 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}gameplay`,
        kind: 'folderBlank' as const,
        containerFolderId: 'gameplay',
        rect: { left: 20, top: 20, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}parent-a`,
        kind: 'parent' as const,
        containerFolderId: 'gameplay',
        rect: { left: 80, top: 80, width: 160, height: 120 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 80, 80)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}gameplay`)
  })

  it('prioritizes compatible reorder targets over assignment targets', () => {
    const targets = [
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`,
        kind: 'folder' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 200, height: 200 },
      },
      {
        dropId: getLauncherReorderFolderDropId('folder:visuals', 'm:Mod.Beta'),
        kind: 'reorderFolder' as const,
        containerFolderId: 'visuals',
        containerKey: 'folder:visuals',
        afterKey: 'm:Mod.Beta',
        rect: { left: 0, top: 0, width: 200, height: 24 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'mod-a',
      modKey: 'Mod.Alpha',
      title: 'Alpha',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'visuals',
      originParentId: null,
      originParentKey: null,
    }

    // The pointer is over the reorder card (rect 0..24) → with "drop onto the
    // card" semantics the dragged card inserts before it. Since Mod.Beta is the
    // only/first card in the folder, the slot is __start__.
    expect(getLauncherDropTargetAtPoint(targets, 20, 12, source)?.dropId).toBe(
      getLauncherReorderFolderDropId('folder:visuals', '__start__'),
    )
  })

  it('resolves reorder insertion slot from the card under the pointer', () => {
    // Three root cards stacked vertically: Alpha (top), Beta (mid), Gamma (bottom).
    const cardRect = (top: number) => ({ left: 0, top, width: 200, height: 80 })
    const targets = [
      {
        dropId: getLauncherReorderRootDropId('view:all', 'm:Mod.Alpha'),
        kind: 'reorderRoot' as const,
        containerFolderId: null,
        containerKey: 'view:all',
        afterKey: 'm:Mod.Alpha',
        rect: cardRect(0),
      },
      {
        dropId: getLauncherReorderRootDropId('view:all', 'm:Mod.Beta'),
        kind: 'reorderRoot' as const,
        containerFolderId: null,
        containerKey: 'view:all',
        afterKey: 'm:Mod.Beta',
        rect: cardRect(100),
      },
      {
        dropId: getLauncherReorderRootDropId('view:all', 'm:Mod.Gamma'),
        kind: 'reorderRoot' as const,
        containerFolderId: null,
        containerKey: 'view:all',
        afterKey: 'm:Mod.Gamma',
        rect: cardRect(200),
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'mod-d',
      modKey: 'Mod.Delta',
      title: 'Delta',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: null,
      originParentKey: null,
    }

    // "Drop onto the card" semantics: dropping onto a card inserts before it
    // (the dragged card takes that card's position). Dropping onto Alpha → start.
    expect(getLauncherDropTargetAtPoint(targets, 10, 10, source)?.afterKey).toBe('__start__')
    // Anywhere over Alpha still inserts before Alpha.
    expect(getLauncherDropTargetAtPoint(targets, 10, 70, source)?.afterKey).toBe('__start__')
    // Over Beta → insert before Beta (after Alpha), while the visual hover stays on Beta.
    const betaTarget = getLauncherDropTargetAtPoint(targets, 10, 170, source)
    expect(betaTarget?.afterKey).toBe('m:Mod.Alpha')
    expect(betaTarget?.activeDropId).toBe(getLauncherReorderRootDropId('view:all', 'm:Mod.Beta'))
    // Below the last card's bottom edge → append after Gamma.
    expect(getLauncherDropTargetAtPoint(targets, 10, 350, source)?.afterKey).toBe('m:Mod.Gamma')
  })

  it('returns null when no reorder target is compatible', () => {
    // Only reorder targets are present (as they would be under reorderOnly
    // measurement). The source belongs to a different container, so none are
    // compatible and no assignment fallback exists.
    const targets = [
      {
        dropId: `${LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX}${encodeURIComponent('folder:visuals')}:${encodeURIComponent('m:Mod.Beta')}`,
        kind: 'reorderFolder' as const,
        containerFolderId: 'visuals',
        containerKey: 'folder:visuals',
        afterKey: 'm:Mod.Beta',
        rect: { left: 0, top: 0, width: 200, height: 24 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'mod-a',
      modKey: 'Mod.Alpha',
      title: 'Alpha',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'gameplay',
      originParentId: null,
      originParentKey: null,
    }

    expect(getLauncherDropTargetAtPoint(targets, 20, 12, source)).toBeNull()
  })

  it('keeps releases beside an expanded folder on the library blank target', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 800, height: 600 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}gameplay`,
        kind: 'folderBlank' as const,
        containerFolderId: 'gameplay',
        rect: { left: 20, top: 20, width: 260, height: 420 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 360, 160)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })

  it('uses the library blank target when releasing a foldered mod outside folder targets', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'child-a',
      modKey: 'Child.A',
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'visuals',
      originParentId: null,
      originParentKey: null,
    }

    expect(getLauncherDropTargetAtPoint(targets, 80, 80, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })

  it('keeps child mod releases inside their current folder blank target', () => {
    const targets = [
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`,
        kind: 'folderBlank' as const,
        containerFolderId: 'visuals',
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}nested`,
        kind: 'folder' as const,
        containerFolderId: 'visuals',
        rect: { left: 20, top: 20, width: 200, height: 200 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'child-a',
      modKey: 'Child.A',
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'visuals',
      originParentId: 'parent-a',
      originParentKey: 'Parent.A',
    }

    expect(getLauncherDropTargetAtPoint(targets, 80, 80, source)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`)
  })

  it('does not assign a child mod to an outer folder when dragging it out of its parent', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 500, height: 500 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`,
        kind: 'folderBlank' as const,
        containerFolderId: 'visuals',
        rect: { left: 20, top: 20, width: 300, height: 300 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'child-a',
      modKey: 'Child.A',
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: 'parent-a',
      originParentKey: 'Parent.A',
    }

    expect(getLauncherDropTargetAtPoint(targets, 200, 200, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })

  it('uses the library blank target when releasing a top-level child mod', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 260, top: 260, width: 200, height: 200 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'child-a',
      modKey: 'Child.A',
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: 'parent-a',
      originParentKey: 'Parent.A',
    }

    expect(getLauncherDropTargetAtPoint(targets, 300, 300, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })

  it('keeps the latest pointer position authoritative for folder drop resolution', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 800, height: 600 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`,
        kind: 'folderBlank' as const,
        containerFolderId: 'visuals',
        rect: { left: 100, top: 100, width: 280, height: 360 },
      },
    ]
    const source = {
      kind: 'mod' as const,
      modId: 'child-a',
      modKey: 'Child.A',
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: null,
      originParentKey: null,
    }

    expect(getLauncherDropTargetAtPoint(targets, 120, 120, source)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`)
    expect(getLauncherDropTargetAtPoint(targets, 420, 120, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })
})
