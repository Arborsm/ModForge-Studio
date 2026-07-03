import type { UniqueIdentifier } from '@dnd-kit/core'
import { LAUNCHER_LIBRARY_CUSTOM_ORDER_START_KEY, type LauncherFolderPreviewItem } from './launcherLibraryDisplay'

export const LAUNCHER_LIBRARY_PACK_DROP_PREFIX = 'launcher-pack:'
export const LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX = 'launcher-folder:'
export const LAUNCHER_LIBRARY_PARENT_DROP_PREFIX = 'launcher-parent:'
export const LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX = 'launcher-reorder-root:'
export const LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX = 'launcher-reorder-folder:'
export const LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX = 'launcher-reorder-parent:'
export const LAUNCHER_LIBRARY_BLANK_DROP_ID = 'launcher-library-blank'
export const LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX = 'launcher-folder-blank:'
export const LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID = 'launcher-library-active-drag'
export const LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX = 6
/** Body dataset key used to consume only the click emitted by a launcher drag release. */
export const LAUNCHER_LIBRARY_SUPPRESS_RELEASE_CLICK_DATA_KEY = 'launcherLibrarySuppressReleaseClick'

export const LAUNCHER_LIBRARY_DROP_TARGET_SELECTORS = [
  '[data-launcher-blank-drop-id]',
  '[data-launcher-folder-drop-id]',
  '[data-launcher-pack-drop-id]',
  '[data-launcher-parent-drop-id]',
  '[data-launcher-reorder-item-key]',
]

/** Attribute marking a draggable card that participates in custom reorder. */
export const LAUNCHER_LIBRARY_REORDER_ITEM_ATTRIBUTE = 'data-launcher-reorder-item-key'
export const LAUNCHER_LIBRARY_REORDER_CONTAINER_ATTRIBUTE = 'data-launcher-reorder-container-key'

export type LauncherPointerDragSource =
  | {
      kind: 'mod'
      modId: string
      modKey: string
      title: string
      meta: string
      imageUrl: string | null
      previewImageUrl: string | null
      enabled: boolean
      originFolderId: string | null
      originParentId: string | null
      originParentKey: string | null
    }
  | {
      kind: 'folder'
      folderId: string
      originFolderId: string | null
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
  shouldSuppressClick: boolean
  modIds: string[]
}

export type LauncherDndKitDropData = {
  dropId: string
}

export type LauncherDndKitDropTarget = {
  dropId: string
  kind: 'blank' | 'folder' | 'folderBlank' | 'pack' | 'parent' | 'reorderRoot' | 'reorderFolder' | 'reorderParent'
  containerFolderId: string | null
  containerKey?: string | null
  afterKey?: string | null
  activeDropId?: string | null
  rect: {
    left: number
    top: number
    width: number
    height: number
  }
}

function encodeReorderDropId(prefix: string, containerKey: string, afterKey: string) {
  return `${prefix}${encodeURIComponent(containerKey)}:${encodeURIComponent(afterKey)}`
}

export function getLauncherReorderRootDropId(containerKey: string, afterKey: string) {
  return encodeReorderDropId(LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX, containerKey, afterKey)
}

export function getLauncherReorderFolderDropId(containerKey: string, afterKey: string) {
  return encodeReorderDropId(LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX, containerKey, afterKey)
}

export function getLauncherReorderParentDropId(containerKey: string, afterKey: string) {
  return encodeReorderDropId(LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX, containerKey, afterKey)
}

export function getLauncherReorderPayloadFromDropId(dropId: string) {
  const prefix = [
    LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX,
    LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX,
    LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX,
  ].find((value) => dropId.startsWith(value))
  if (!prefix) {
    return null
  }

  const payload = dropId.slice(prefix.length)
  const separatorIndex = payload.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }

  try {
    const containerKey = decodeURIComponent(payload.slice(0, separatorIndex))
    const afterKey = decodeURIComponent(payload.slice(separatorIndex + 1))
    return containerKey && afterKey ? { containerKey, afterKey } : null
  } catch {
    return null
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

  // Reorder targets represent draggable cards (rect = card rect, afterKey = that
  // card's own item key). In custom-sort mode, hovering a card inserts before
  // that card; releasing below the last card appends to the end.
  const reorderTarget = resolveReorderTargetAtPoint(targets, clientX, clientY, source)
  if (reorderTarget) {
    return reorderTarget
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

function isLauncherReorderTargetCompatible(target: LauncherDndKitDropTarget, source?: LauncherPointerDragSource | null) {
  if (!source) {
    return true
  }
  if (target.kind === 'reorderRoot') {
    return source.kind === 'folder' ? !source.originFolderId : !source.originFolderId && !source.originParentId
  }
  if (target.kind === 'reorderFolder') {
    const targetFolderId = target.containerKey?.startsWith('folder:') ? target.containerKey.slice('folder:'.length) : target.containerKey
    if (!targetFolderId) {
      return false
    }
    return source.kind === 'folder'
      ? normalizeDropLookup(source.originFolderId) === normalizeDropLookup(targetFolderId)
      : !source.originParentId && normalizeDropLookup(source.originFolderId) === normalizeDropLookup(targetFolderId)
  }
  if (target.kind === 'reorderParent') {
    const targetParentKey = target.containerKey?.startsWith('parent:') ? target.containerKey.slice('parent:'.length) : target.containerKey
    return (
      source.kind === 'mod' &&
      Boolean(source.originParentKey) &&
      normalizeDropLookup(source.originParentKey) === normalizeDropLookup(targetParentKey)
    )
  }
  return true
}

/**
 * Resolves a reorder insertion slot from the pointer position. Reorder targets
 * are draggable cards (rect = card rect, afterKey = that card's own item key).
 *
 * Resolution accounts for both X and Y so a multi-column grid behaves: we first
 * look for the card actually under the pointer and insert before it. If the
 * pointer sits in a gap between cards, we fall back to the spatially nearest
 * card. Releasing below the final card appends after that final card.
 */
function resolveReorderTargetAtPoint(
  targets: LauncherDndKitDropTarget[],
  clientX: number,
  clientY: number,
  source?: LauncherPointerDragSource | null,
): LauncherDndKitDropTarget | null {
  const compatible = targets.filter(
    (target) =>
      (target.kind === 'reorderRoot' || target.kind === 'reorderFolder' || target.kind === 'reorderParent') &&
      isLauncherReorderTargetCompatible(target, source),
  )
  if (!compatible.length) {
    return null
  }

  // Group by container so a root drag only reorders within the root container,
  // a folder drag only within its folder, etc.
  const byContainer = new Map<string, LauncherDndKitDropTarget[]>()
  for (const target of compatible) {
    const containerKey = target.containerKey ?? ''
    const list = byContainer.get(containerKey)
    if (list) {
      list.push(target)
    } else {
      byContainer.set(containerKey, [target])
    }
  }

  for (const [, cards] of byContainer) {
    if (!cards.length) {
      continue
    }
    const prefix =
      cards[0]!.kind === 'reorderRoot'
        ? LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX
        : cards[0]!.kind === 'reorderFolder'
          ? LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX
          : LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX
    const containerKey = cards[0]!.containerKey ?? ''
    const encode = (afterKey: string) => encodeReorderDropId(prefix, containerKey, afterKey)
    // "Insert at the drop point" semantics: dropping a card onto card B moves
    // it to B's position and pushes B (and everything after) down. So the
    // resolved slot is always "before the card under the pointer". The only
    // exception is when the pointer is below the bottom edge of the last card
    // (no card hovered) → append to the end.
    const lastCard = cards[cards.length - 1]!
    const lastBottom = lastCard.rect.top + lastCard.rect.height

    const insertBefore = (card: LauncherDndKitDropTarget) => {
      const index = cards.indexOf(card)
      const afterKey =
        index === 0 ? LAUNCHER_LIBRARY_CUSTOM_ORDER_START_KEY : (cards[index - 1]!.afterKey ?? LAUNCHER_LIBRARY_CUSTOM_ORDER_START_KEY)
      return { ...card, dropId: encode(afterKey), activeDropId: card.dropId, afterKey }
    }

    // 1) Pointer directly over a card → insert before that card.
    const hovered = cards.find((card) => {
      const { left, top, width, height } = card.rect
      return clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height
    })
    if (hovered) {
      return insertBefore(hovered)
    }

    // 2) Pointer below the last card's bottom edge → append to the end.
    if (clientY >= lastBottom) {
      const afterKey = lastCard.afterKey ?? LAUNCHER_LIBRARY_CUSTOM_ORDER_START_KEY
      return { ...lastCard, dropId: encode(afterKey), afterKey }
    }

    // 3) Pointer in a gap (e.g. over the dragged source card, which is excluded
    // from measurement). Insert before the spatially nearest card so the
    // indicator does not jump across columns.
    let nearestCard = cards[0]!
    let nearestDist = Number.POSITIVE_INFINITY
    for (const card of cards) {
      const { left, top, width, height } = card.rect
      const cx = left + width / 2
      const cy = top + height / 2
      const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2
      if (dist < nearestDist) {
        nearestDist = dist
        nearestCard = card
      }
    }
    return insertBefore(nearestCard)
  }
  return null
}

function normalizeDropLookup(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
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
  if (dropId.startsWith(LAUNCHER_LIBRARY_PARENT_DROP_PREFIX)) {
    return 'parent'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX)) {
    return 'reorderRoot'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX)) {
    return 'reorderFolder'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX)) {
    return 'reorderParent'
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

export function getLauncherDropIdFromElement(element: HTMLElement, options: { reorderOnly?: boolean } = {}) {
  // In reorder mode the cards themselves carry reorder attributes; these must win
  // over the card's assign attributes (data-launcher-parent-drop-id on mod cards,
  // data-launcher-folder-drop-id on folder cards), otherwise every card resolves
  // as an assign target and reorder never hits.
  const reorderItemKey = element.getAttribute(LAUNCHER_LIBRARY_REORDER_ITEM_ATTRIBUTE)
  const reorderContainerKey = element.getAttribute(LAUNCHER_LIBRARY_REORDER_CONTAINER_ATTRIBUTE)
  if (reorderItemKey && reorderContainerKey) {
    const prefix = reorderPrefixForContainer(reorderContainerKey)
    if (prefix) {
      return encodeReorderDropId(prefix, reorderContainerKey, reorderItemKey)
    }
  }
  if (options.reorderOnly) {
    return null
  }
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
  const parentDropId = element.getAttribute('data-launcher-parent-drop-id')
  if (parentDropId) {
    return `${LAUNCHER_LIBRARY_PARENT_DROP_PREFIX}${parentDropId}`
  }
  return null
}

/** Maps a reorder container key to its drop-id prefix. */
function reorderPrefixForContainer(containerKey: string) {
  if (containerKey.startsWith('view:')) {
    return LAUNCHER_LIBRARY_REORDER_ROOT_PREFIX
  }
  if (containerKey.startsWith('folder:')) {
    return LAUNCHER_LIBRARY_REORDER_FOLDER_PREFIX
  }
  if (containerKey.startsWith('parent:')) {
    return LAUNCHER_LIBRARY_REORDER_PARENT_PREFIX
  }
  return null
}

export function measureLauncherDndKitDropTargets(
  sourceElement: HTMLElement | null,
  options: { reorderOnly?: boolean } = {},
): LauncherDndKitDropTarget[] {
  const sourceCard = sourceElement?.closest('.launcher-library-draggable-card')
  const seen = new Set<string>()
  const targets: LauncherDndKitDropTarget[] = []

  for (const element of Array.from(document.querySelectorAll<HTMLElement>(LAUNCHER_LIBRARY_DROP_TARGET_SELECTORS.join(',')))) {
    if (!element.isConnected || element === sourceCard || (sourceCard && sourceCard.contains(element))) {
      continue
    }
    const dropId = getLauncherDropIdFromElement(element, { reorderOnly: options.reorderOnly })
    if (!dropId || seen.has(dropId)) {
      continue
    }
    const kind = getLauncherDropTargetKind(dropId)
    if (options.reorderOnly && kind !== 'reorderRoot' && kind !== 'reorderFolder' && kind !== 'reorderParent') {
      continue
    }
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }
    const reorderPayload = getLauncherReorderPayloadFromDropId(dropId)
    seen.add(dropId)
    targets.push({
      dropId,
      kind,
      containerFolderId: getLauncherDropTargetContainerFolderId(element, dropId),
      containerKey: reorderPayload?.containerKey ?? null,
      afterKey: reorderPayload?.afterKey ?? null,
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
