import { describe, expect, it } from 'vitest'
import {
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE,
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

  it('reads drop ids from blank, folder, pack, and parent targets', () => {
    const blank = document.createElement('div')
    blank.setAttribute('data-launcher-blank-drop-id', LAUNCHER_LIBRARY_BLANK_DROP_ID)
    expect(getLauncherDropIdFromElement(blank)).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)

    const folder = document.createElement('div')
    folder.setAttribute('data-launcher-folder-drop-id', 'folder-a')
    expect(getLauncherDropIdFromElement(folder)).toBe(`${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}folder-a`)

    const pack = document.createElement('div')
    pack.setAttribute('data-launcher-pack-drop-id', 'pack-a')
    expect(getLauncherDropIdFromElement(pack)).toBe(`${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}pack-a`)

    const parent = document.createElement('div')
    parent.setAttribute(LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE, 'mod-a')
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
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: null,
        rect: { left: 140, top: 20, width: 100, height: 100 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 40, 40)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}visuals`)
    expect(getLauncherDropTargetAtPoint(targets, 160, 40)?.dropId).toBe(`${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`)
    expect(getLauncherDropTargetAtPoint(targets, 300, 40)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
    expect(getLauncherDropTargetAtPoint(targets, 520, 40)).toBeNull()
  })

  it('prioritizes folder targets over parent mod targets when dragging into the library', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: null,
        rect: { left: 20, top: 20, width: 200, height: 200 },
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

  it('prioritizes expanded folder blank targets over parent mod targets when dragging into a folder panel', () => {
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
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: 'gameplay',
        rect: { left: 20, top: 20, width: 140, height: 140 },
      },
    ]

    expect(getLauncherDropTargetAtPoint(targets, 80, 80)?.dropId).toBe(`${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}gameplay`)
  })

  it('ignores parent mod targets below a mod being released from a folder', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: null,
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
      originParentId: null,
    }

    expect(getLauncherDropTargetAtPoint(targets, 80, 80, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })

  it('prioritizes same-folder parent targets over folder targets when dragging a child mod inside its folder', () => {
    const targets = [
      {
        dropId: `${LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX}visuals`,
        kind: 'folderBlank' as const,
        containerFolderId: 'visuals',
        rect: { left: 0, top: 0, width: 300, height: 300 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: 'visuals',
        rect: { left: 20, top: 20, width: 200, height: 200 },
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

    expect(getLauncherDropTargetAtPoint(targets, 80, 80, source)?.dropId).toBe(`${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`)
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
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-a`,
        kind: 'parent' as const,
        containerFolderId: 'visuals',
        rect: { left: 30, top: 30, width: 120, height: 120 },
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

  it('does not assign a top-level child mod to another top-level parent while releasing it', () => {
    const targets = [
      {
        dropId: LAUNCHER_LIBRARY_BLANK_DROP_ID,
        kind: 'blank' as const,
        containerFolderId: null,
        rect: { left: 260, top: 260, width: 200, height: 200 },
      },
      {
        dropId: `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}mod-b`,
        kind: 'parent' as const,
        containerFolderId: null,
        rect: { left: 30, top: 30, width: 180, height: 180 },
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

    expect(getLauncherDropTargetAtPoint(targets, 100, 100, source)?.dropId).toBe(LAUNCHER_LIBRARY_BLANK_DROP_ID)
  })
})
