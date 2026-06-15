import { describe, expect, it } from 'vitest'
import {
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_PARENT_DROP_PREFIX,
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
      {
        dropId: `${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}pack-a`,
        kind: 'pack',
        containerFolderId: null,
        rect: { left: 1, top: 2, width: 100, height: 50 },
      },
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
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'visuals',
      originParentId: null,
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
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: 'visuals',
      originParentId: 'parent-a',
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
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: 'parent-a',
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
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: 'parent-a',
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
      title: 'Child A',
      meta: '',
      imageUrl: null,
      previewImageUrl: null,
      enabled: true,
      originFolderId: null,
      originParentId: null,
    }

    expect(getLauncherDropTargetAtPoint(targets, 120, 120, source)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`)
    expect(getLauncherDropTargetAtPoint(targets, 420, 120, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })
})
