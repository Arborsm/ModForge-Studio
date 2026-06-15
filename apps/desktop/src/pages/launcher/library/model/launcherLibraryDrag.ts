import type { UniqueIdentifier } from '@dnd-kit/core'
import type { LauncherFolderPreviewItem } from './launcherLibraryDisplay'

export const LAUNCHER_LIBRARY_PACK_DROP_PREFIX = 'launcher-pack:'
export const LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX = 'launcher-folder:'
export const LAUNCHER_LIBRARY_BLANK_DROP_ID = 'launcher-library-blank'
export const LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX = 'launcher-folder-blank:'
export const LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID = 'launcher-library-active-drag'
export const LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX = 6

export const LAUNCHER_LIBRARY_DROP_TARGET_SELECTORS = [
  '[data-launcher-blank-drop-id]',
  '[data-launcher-folder-drop-id]',
  '[data-launcher-pack-drop-id]',
]

export type LauncherPointerDragSource =
  | {
      kind: 'mod'
      modId: string
      title: string
      meta: string
      imageUrl: string | null
      previewImageUrl: string | null
      enabled: boolean
      originFolderId: string | null
      originParentId: string | null
    }
  | {
      kind: 'folder'
      folderId: string
      title: string
      previewItems: LauncherFolderPreviewItem[]
    }

export type LauncherDndKitActiveDrag = {
  id: UniqueIdentifier
  source: LauncherPointerDragSource
  sourceElement: HTMLElement
  sourceRect: {
    left: number
    top: number
  }
  startX: number
  startY: number
  latestX: number
  latestY: number
  started: boolean
  modIds: string[]
}

export type LauncherDndKitDropData = {
  dropId: string
}

export type LauncherDndKitDropTarget = {
  dropId: string
  kind: 'blank' | 'folder' | 'folderBlank' | 'pack'
  containerFolderId: string | null
  rect: {
    left: number
    top: number
    width: number
    height: number
  }
}

export function getLauncherDropTargetAtPoint(
  targets: LauncherDndKitDropTarget[],
  clientX: number,
  clientY: number,
  source?: LauncherPointerDragSource | null,
) {
  const sourceFolderId = source?.kind === 'mod' ? source.originFolderId : source?.kind === 'folder' ? source.folderId : null
  const insideTargets: LauncherDndKitDropTarget[] = []
  for (const target of targets) {
    const { left, top, width, height } = target.rect
    const inside = clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height
    if (inside) {
      insideTargets.push(target)
    }
  }
  if (!insideTargets.length) {
    return null
  }

  const globalBlankTarget = targets.find((target) => target.kind === 'blank') ?? null
  const concreteTargets = insideTargets.filter((target) => target.kind !== 'blank' && target.kind !== 'folderBlank')
  const sameFolderBlankTarget =
    insideTargets.find((target) => target.kind === 'folderBlank' && target.containerFolderId === sourceFolderId) ?? null
  const anyFolderBlankTarget = insideTargets.find((target) => target.kind === 'folderBlank') ?? null
  const libraryBlankTarget = insideTargets.find((target) => target.kind === 'blank') ?? null
  const blankTarget = sameFolderBlankTarget ?? anyFolderBlankTarget ?? libraryBlankTarget

  if (source?.kind === 'mod' && source.originParentId) {
    return sameFolderBlankTarget ?? libraryBlankTarget ?? globalBlankTarget
  }

  if (source?.kind === 'mod' && source.originFolderId) {
    return blankTarget ?? globalBlankTarget
  }

  const folderTarget = concreteTargets.find((target) => target.kind === 'folder')
  if (folderTarget) {
    return folderTarget
  }
  const folderBlankTarget = insideTargets.find((target) => target.kind === 'folderBlank')
  if (folderBlankTarget) {
    return folderBlankTarget
  }
  const packTarget = concreteTargets.find((target) => target.kind === 'pack')
  if (packTarget) {
    return packTarget
  }
  return blankTarget
}

function getLauncherDropTargetKind(dropId: string): LauncherDndKitDropTarget['kind'] {
  if (dropId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
    return 'blank'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)) {
    return 'folderBlank'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX)) {
    return 'folder'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_PACK_DROP_PREFIX)) {
    return 'pack'
  }
  return 'blank'
}

function getLauncherDropTargetContainerFolderId(element: HTMLElement, dropId: string) {
  if (dropId.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)) {
    return dropId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
  }
  return element.closest<HTMLElement>('[data-launcher-folder-panel-id]')?.getAttribute('data-launcher-folder-panel-id') ?? null
}

export function getLauncherFolderIdFromBlankDropId(blankDropId: string) {
  return blankDropId.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
    ? blankDropId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
    : null
}

export function getLauncherDropIdFromElement(element: HTMLElement) {
  const blankDropId = element.getAttribute('data-launcher-blank-drop-id')
  if (blankDropId) {
    return blankDropId
  }
  const folderDropId = element.getAttribute('data-launcher-folder-drop-id')
  if (folderDropId) {
    return `${LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX}${folderDropId}`
  }
  const packDropId = element.getAttribute('data-launcher-pack-drop-id')
  if (packDropId) {
    return `${LAUNCHER_LIBRARY_PACK_DROP_PREFIX}${packDropId}`
  }
  return null
}

export function measureLauncherDndKitDropTargets(sourceElement: HTMLElement | null): LauncherDndKitDropTarget[] {
  const sourceCard = sourceElement?.closest('.launcher-library-draggable-card')
  const seen = new Set<string>()
  const targets: LauncherDndKitDropTarget[] = []

  for (const element of Array.from(document.querySelectorAll<HTMLElement>(LAUNCHER_LIBRARY_DROP_TARGET_SELECTORS.join(',')))) {
    if (!element.isConnected || element === sourceCard || (sourceCard && sourceCard.contains(element))) {
      continue
    }
    const dropId = getLauncherDropIdFromElement(element)
    if (!dropId || seen.has(dropId)) {
      continue
    }
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }
    seen.add(dropId)
    targets.push({
      dropId,
      kind: getLauncherDropTargetKind(dropId),
      containerFolderId: getLauncherDropTargetContainerFolderId(element, dropId),
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    })
  }
  return targets
}
