import { describe, expect, it } from 'vitest'
import {
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_PARENT_DROP_ATTRIBUTE,
  LAUNCHER_LIBRARY_PARENT_DROP_PREFIX,
  getLauncherDropIdFromElement,
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
        rect: { left: 1, top: 2, width: 100, height: 50 },
      },
    ])

    source.remove()
    target.remove()
  })
})
