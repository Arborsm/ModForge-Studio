import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
} from '@dnd-kit/core'
import { cx } from '@shared/lib/cx'
import {
  LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
  LAUNCHER_LIBRARY_BLANK_DROP_ID,
  LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX,
  LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX,
  LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX,
  LAUNCHER_LIBRARY_PACK_DROP_PREFIX,
  LAUNCHER_LIBRARY_SUPPRESS_RELEASE_CLICK_DATA_KEY,
  getLauncherDropTargetAtPoint,
  measureLauncherDndKitDropTargets,
  type LauncherDndKitActiveDrag,
  type LauncherDndKitDropData,
  type LauncherDndKitDropTarget,
  type LauncherPointerDragSource,
} from '../model/launcherLibraryDrag'
import { LauncherPointerDragContext } from './launcherLibraryPointerDragContext'

type LauncherDndKitControls = {
  handleDndPointerDown: (event: PointerEvent<HTMLElement>) => void
  setDraggableActivatorNodeRef: (node: HTMLElement | null) => void
}

function LauncherDragPreview({ source, count, pending = false }: { source: LauncherPointerDragSource; count: number; pending?: boolean }) {
  if (source.kind === 'folder') {
    const previewItems = source.previewItems.slice(0, 4)
    const previewKind = previewItems.length === 1 ? previewItems[0]?.kind : previewItems.length === 0 ? 'empty' : 'mixed'
    return (
      <div
        className={cx(
          'launcher-library-drag-preview launcher-library-pointer-drag-preview launcher-library-folder-drag-preview',
          pending && 'launcher-library-pointer-drag-preview-pending',
        )}
        data-testid="launcher-library-drag-preview"
        aria-hidden="true"
      >
        <span
          className="launcher-library-folder-drag-preview-grid"
          data-preview-count={previewItems.length}
          data-preview-kind={previewKind}
        >
          {previewItems.length
            ? previewItems.map((item) => (
                <span
                  key={item.id}
                  className={cx(
                    'launcher-library-folder-drag-preview-tile',
                    item.kind === 'folder' && 'launcher-library-folder-drag-preview-folder-tile',
                  )}
                >
                  {item.kind === 'mod' && item.imageUrl ? (
                    <img src={item.imageUrl} alt="" draggable={false} />
                  ) : item.kind === 'folder' ? (
                    <span className="launcher-library-folder-drag-preview-folder-glyph" />
                  ) : (
                    item.title.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))
            : Array.from({ length: 4 }, (_, index) => (
                <span
                  key={`placeholder-${index}`}
                  className="launcher-library-folder-drag-preview-tile launcher-library-folder-drag-preview-placeholder"
                />
              ))}
        </span>
        <span>{source.title}</span>
      </div>
    )
  }

  return (
    <div
      className={cx(
        'launcher-library-drag-preview launcher-library-pointer-drag-preview',
        pending && 'launcher-library-pointer-drag-preview-pending',
      )}
      data-testid="launcher-library-drag-preview"
      aria-hidden="true"
    >
      <div className={cx('launcher-library-mod-drag-preview-card', !source.enabled && 'launcher-library-mod-drag-preview-card-disabled')}>
        {source.previewImageUrl ? (
          <img src={source.previewImageUrl} alt="" draggable={false} />
        ) : (
          <span className="launcher-library-mod-drag-preview-fallback">{source.title.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="launcher-library-mod-drag-preview-copy">
          <strong>{source.title}</strong>
          <span>{source.meta}</span>
        </span>
      </div>
      {count > 1 ? <span className="launcher-library-drag-preview-count">{count}</span> : null}
    </div>
  )
}

function LauncherPendingDragPreview({ drag }: { drag: LauncherDndKitActiveDrag }) {
  const left = drag.sourceRect.left + drag.latestX - drag.startX
  const top = drag.sourceRect.top + drag.latestY - drag.startY

  const preview = (
    <div
      className="launcher-library-drag-portal-scope launcher-library-pending-drag-preview-layer"
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
      }}
    >
      <LauncherDragPreview source={drag.source} count={drag.modIds.length} pending={!drag.started} />
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(preview, document.body)
}

function LauncherActiveDragOverlay({ drag }: { drag: LauncherDndKitActiveDrag | null }) {
  const overlay = (
    <div className="launcher-library-drag-portal-scope">
      <DragOverlay dropAnimation={null} zIndex={80}>
        {drag ? <LauncherDragPreview source={drag.source} count={drag.modIds.length} /> : null}
      </DragOverlay>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(overlay, document.body)
}

function getLauncherDndTargetKind(dropId: string) {
  if (dropId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
    return 'blank'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX) || dropId.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)) {
    return 'folder'
  }
  if (dropId.startsWith(LAUNCHER_LIBRARY_PACK_DROP_PREFIX)) {
    return 'pack'
  }
  return 'target'
}

function LauncherDndKitDropTargetLayer({ targets, activeDropId }: { targets: LauncherDndKitDropTarget[]; activeDropId: string | null }) {
  const layer = (
    <div className="launcher-library-dnd-target-layer" aria-hidden="true">
      {targets.map((target) => (
        <LauncherDndKitDropTargetBox key={target.dropId} target={target} active={target.dropId === activeDropId} />
      ))}
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(layer, document.body)
}

function LauncherDndKitDropTargetBox({ target, active }: { target: LauncherDndKitDropTarget; active: boolean }) {
  const { setNodeRef } = useDroppable({
    id: target.dropId,
    data: { dropId: target.dropId } satisfies LauncherDndKitDropData,
  })

  return (
    <span
      ref={setNodeRef}
      className={cx(
        'launcher-library-dnd-target-box',
        active && 'launcher-library-dnd-target-box-active',
        active && `launcher-library-dnd-target-box-${getLauncherDndTargetKind(target.dropId)}`,
      )}
      data-launcher-dnd-target-id={target.dropId}
      style={{
        left: target.rect.left,
        top: target.rect.top,
        width: target.rect.width,
        height: target.rect.height,
      }}
    />
  )
}

function LauncherLibraryDndBridge({
  onControlsChange,
  dropTargets,
  activeDropId,
  pendingOverlay,
  activeOverlay,
}: {
  onControlsChange: (controls: LauncherDndKitControls | null) => void
  dropTargets: LauncherDndKitDropTarget[]
  activeDropId: string | null
  pendingOverlay: LauncherDndKitActiveDrag | null
  activeOverlay: LauncherDndKitActiveDrag | null
}) {
  const {
    listeners: draggableListeners,
    setActivatorNodeRef,
    setNodeRef: setDraggableNodeRef,
  } = useDraggable({
    id: LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
  })
  const draggableListenersRef = useRef(draggableListeners)

  useEffect(() => {
    draggableListenersRef.current = draggableListeners
  }, [draggableListeners])

  const handleDndPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    draggableListenersRef.current?.onPointerDown?.(event)
  }, [])

  useEffect(() => {
    const controls = {
      handleDndPointerDown,
      setDraggableActivatorNodeRef: (node: HTMLElement | null) => {
        setActivatorNodeRef(node)
        setDraggableNodeRef(node)
      },
    }
    onControlsChange(controls)
    return () => onControlsChange(null)
  }, [handleDndPointerDown, onControlsChange, setActivatorNodeRef, setDraggableNodeRef])

  return (
    <>
      <LauncherDndKitDropTargetLayer targets={dropTargets} activeDropId={activeDropId} />
      {pendingOverlay ? <LauncherPendingDragPreview drag={pendingOverlay} /> : null}
      <LauncherActiveDragOverlay drag={activeOverlay} />
    </>
  )
}

export function LauncherLibraryDndScope({
  children,
  resolveDraggedModIds,
  onAddModsToPack,
  onAssignModsToLibraryFolder,
  onRemoveChildModsFromParent,
  onRemoveModsFromLibraryFolders,
  onReleaseModsFromLibraryFolder,
  onMoveFolderToFolder,
}: {
  children: ReactNode
  resolveDraggedModIds: (modId: string) => string[]
  onAddModsToPack: (packId: string, modIds: string[]) => void
  onAssignModsToLibraryFolder: (folderId: string, modIds: string[]) => void
  onRemoveChildModsFromParent: (modIds: string[]) => void
  onRemoveModsFromLibraryFolders: (modIds: string[]) => void
  onReleaseModsFromLibraryFolder: (modIds: string[]) => void
  onMoveFolderToFolder: (folderId: string, parentFolderId: string | null) => void
}) {
  const pendingDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const activeDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const [pendingOverlay, setPendingOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [activeOverlay, setActiveOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [dropTargets, setDropTargets] = useState<LauncherDndKitDropTarget[]>([])
  const [activeDropId, setActiveDropId] = useState<string | null>(null)
  const [dndKitControls, setDndKitControls] = useState<LauncherDndKitControls | null>(null)
  const latestPointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const dropTargetsRef = useRef<LauncherDndKitDropTarget[]>([])
  const activeDropIdRef = useRef<string | null>(null)
  const releaseClickSuppressionTimeoutRef = useRef<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX } }))
  const measuring = useMemo(
    () => ({
      droppable: {
        strategy: MeasuringStrategy.BeforeDragging,
      },
    }),
    [],
  )

  const clearReleaseClickSuppression = useCallback(() => {
    if (releaseClickSuppressionTimeoutRef.current !== null) {
      window.clearTimeout(releaseClickSuppressionTimeoutRef.current)
      releaseClickSuppressionTimeoutRef.current = null
    }
    delete document.body.dataset[LAUNCHER_LIBRARY_SUPPRESS_RELEASE_CLICK_DATA_KEY]
  }, [])

  const armReleaseClickSuppression = useCallback(() => {
    clearReleaseClickSuppression()
    document.body.dataset[LAUNCHER_LIBRARY_SUPPRESS_RELEASE_CLICK_DATA_KEY] = 'true'
    releaseClickSuppressionTimeoutRef.current = window.setTimeout(clearReleaseClickSuppression, 80)
  }, [clearReleaseClickSuppression])

  const activatePendingDrag = useCallback(() => {
    const drag = pendingDragRef.current
    if (!drag || activeDragRef.current) {
      return null
    }
    const activeDrag = { ...drag, started: true, shouldSuppressClick: true }
    const nextTargets = measureLauncherDndKitDropTargets(drag.sourceElement)
    activeDragRef.current = activeDrag
    pendingDragRef.current = null
    setPendingOverlay(null)
    setActiveOverlay(activeDrag)
    dropTargetsRef.current = nextTargets
    setDropTargets(nextTargets)
    drag.sourceElement.classList.add('launcher-library-card-grab-pending')
    document.body.classList.add('launcher-library-dragging-active')
    return activeDrag
  }, [])

  const finishPointerDrag = useCallback(
    (cancelled = false, overDropId?: string | null) => {
      const drag = activeDragRef.current ?? pendingDragRef.current
      activeDragRef.current = null
      pendingDragRef.current = null
      setActiveOverlay(null)
      setPendingOverlay(null)
      dropTargetsRef.current = []
      activeDropIdRef.current = null
      setDropTargets([])
      setActiveDropId(null)
      drag?.sourceElement.classList.remove('launcher-library-card-grab-pending')
      document.body.classList.remove('launcher-library-dragging-active')
      if (drag?.shouldSuppressClick) {
        armReleaseClickSuppression()
      }
      if (!drag || cancelled) {
        return
      }
      if (!drag.started) {
        return
      }

      const effectiveOverId = overDropId ?? null
      const modIds = drag.source.kind === 'mod' ? drag.modIds : []
      const folderDragId = drag.source.kind === 'folder' ? drag.source.folderId : null
      const originFolderId = drag.source.kind === 'mod' ? drag.source.originFolderId : null
      const targetFolderBlankId = effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
        ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
        : null
      const targetDropFolderId = effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX)
        ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX.length)
        : effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX)
          ? effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_BLANK_DROP_PREFIX.length)
          : null

      if (
        modIds.length &&
        drag.source.kind === 'mod' &&
        drag.source.originParentId &&
        targetFolderBlankId &&
        targetFolderBlankId === originFolderId
      ) {
        onRemoveChildModsFromParent(modIds)
      } else if (modIds.length && targetFolderBlankId && targetFolderBlankId !== originFolderId) {
        onAssignModsToLibraryFolder(targetFolderBlankId, modIds)
      } else if (modIds.length && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_PACK_DROP_PREFIX)) {
        onAddModsToPack(effectiveOverId.slice(LAUNCHER_LIBRARY_PACK_DROP_PREFIX.length), modIds)
      } else if (modIds.length && targetDropFolderId) {
        onAssignModsToLibraryFolder(targetDropFolderId, modIds)
      } else if (modIds.length && effectiveOverId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
        onRemoveChildModsFromParent(modIds)
        onRemoveModsFromLibraryFolders(modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originParentId) {
        onRemoveChildModsFromParent(modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originFolderId) {
        onReleaseModsFromLibraryFolder(modIds)
      } else if (folderDragId && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX)) {
        const targetFolderId = effectiveOverId.slice(LAUNCHER_LIBRARY_FOLDER_DROP_PREFIX.length)
        if (targetFolderId !== folderDragId) {
          onMoveFolderToFolder(folderDragId, targetFolderId)
        }
      } else if (folderDragId && effectiveOverId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
        onMoveFolderToFolder(folderDragId, null)
      }
    },
    [
      onAddModsToPack,
      onAssignModsToLibraryFolder,
      onMoveFolderToFolder,
      onRemoveChildModsFromParent,
      onRemoveModsFromLibraryFolders,
      onReleaseModsFromLibraryFolder,
      armReleaseClickSuppression,
    ],
  )

  useEffect(() => {
    const suppressDocumentClickAfterDrag = (event: globalThis.MouseEvent) => {
      if (
        !document.body.classList.contains('launcher-library-dragging-active') &&
        document.body.dataset[LAUNCHER_LIBRARY_SUPPRESS_RELEASE_CLICK_DATA_KEY] !== 'true'
      ) {
        return
      }
      clearReleaseClickSuppression()
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    document.addEventListener('click', suppressDocumentClickAfterDrag, { capture: true })
    return () => document.removeEventListener('click', suppressDocumentClickAfterDrag, { capture: true })
  }, [clearReleaseClickSuppression])

  const startPointerDrag = useCallback(
    (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.buttons !== 1) {
        return
      }
      const modIds = source.kind === 'mod' ? resolveDraggedModIds(source.modId) : []
      const sourceElement = event.currentTarget.closest<HTMLElement>('.launcher-library-draggable-card') ?? event.currentTarget
      const existingDrag = activeDragRef.current ?? pendingDragRef.current
      if (existingDrag?.sourceElement === sourceElement && !existingDrag.started) {
        return
      }
      const sourceRect = sourceElement.getBoundingClientRect()
      const drag = {
        id: LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
        source,
        sourceElement,
        sourceRect: {
          left: sourceRect.left,
          top: sourceRect.top,
        },
        startX: event.clientX,
        startY: event.clientY,
        latestX: event.clientX,
        latestY: event.clientY,
        started: false,
        shouldSuppressClick: false,
        modIds,
      }
      pendingDragRef.current = drag
    },
    [resolveDraggedModIds],
  )

  useEffect(() => {
    const showPendingDragFeedback = (event: globalThis.PointerEvent) => {
      const drag = pendingDragRef.current
      if (!drag || drag.started) {
        return
      }
      if (event.buttons !== 1) {
        return
      }
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (distance < LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX) {
        return
      }
      const nextDrag = { ...drag, latestX: event.clientX, latestY: event.clientY, shouldSuppressClick: true }
      pendingDragRef.current = nextDrag
      nextDrag.sourceElement.classList.add('launcher-library-card-grab-pending')
      document.body.classList.add('launcher-library-dragging-active')
      setPendingOverlay(nextDrag)
      const pointerX = event.clientX
      const pointerY = event.clientY
      window.requestAnimationFrame(() => {
        if (pendingDragRef.current || activeDragRef.current) {
          setDropTargets((current) => {
            const nextTargets = current.length ? current : measureLauncherDndKitDropTargets(nextDrag.sourceElement)
            const target = getLauncherDropTargetAtPoint(nextTargets, pointerX, pointerY, nextDrag.source)
            dropTargetsRef.current = nextTargets
            activeDropIdRef.current = target?.dropId ?? null
            setActiveDropId((activeDropId) => (activeDropId === (target?.dropId ?? null) ? activeDropId : (target?.dropId ?? null)))
            return nextTargets
          })
        }
      })
    }

    const clearPendingDragStyle = () => {
      const drag = pendingDragRef.current
      drag?.sourceElement.classList.remove('launcher-library-card-grab-pending')
      if (!activeDragRef.current) {
        document.body.classList.remove('launcher-library-dragging-active')
      }
    }

    window.addEventListener('pointermove', showPendingDragFeedback, { passive: true })
    window.addEventListener('pointerup', clearPendingDragStyle)
    window.addEventListener('pointercancel', clearPendingDragStyle)
    return () => {
      window.removeEventListener('pointermove', showPendingDragFeedback)
      window.removeEventListener('pointerup', clearPendingDragStyle)
      window.removeEventListener('pointercancel', clearPendingDragStyle)
      document.body.classList.remove('launcher-library-dragging-active')
    }
  }, [])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const drag = pendingDragRef.current
      if (!drag) {
        return
      }
      if (String(event.active.id) !== String(drag.id)) {
        return
      }
      activatePendingDrag()
    },
    [activatePendingDrag],
  )

  useEffect(() => {
    const updateActiveDropTargetFromPointer = (event: globalThis.PointerEvent) => {
      if (!activeDragRef.current && !pendingDragRef.current) {
        return
      }
      const drag = activeDragRef.current ?? pendingDragRef.current
      const target = getLauncherDropTargetAtPoint(dropTargets, event.clientX, event.clientY, drag?.source)
      latestPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      activeDropIdRef.current = target?.dropId ?? null
      setActiveDropId((current) => (current === (target?.dropId ?? null) ? current : (target?.dropId ?? null)))
    }

    window.addEventListener('pointermove', updateActiveDropTargetFromPointer, { passive: true })
    return () => window.removeEventListener('pointermove', updateActiveDropTargetFromPointer)
  }, [dropTargets])

  const getDropIdAtLatestPointer = useCallback(() => {
    const drag = activeDragRef.current ?? pendingDragRef.current
    const pointer = latestPointerRef.current
    if (!drag || !pointer) {
      return activeDropIdRef.current
    }
    return (
      getLauncherDropTargetAtPoint(dropTargetsRef.current, pointer.clientX, pointer.clientY, drag.source)?.dropId ?? activeDropIdRef.current
    )
  }, [])

  const handleDragEnd = useCallback(() => {
    finishPointerDrag(false, getDropIdAtLatestPointer())
  }, [finishPointerDrag, getDropIdAtLatestPointer])

  const handleDragCancel = useCallback(() => {
    finishPointerDrag(true)
  }, [finishPointerDrag])

  useEffect(() => {
    const finishDragFromPointer = (event: globalThis.PointerEvent) => {
      latestPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      if (activeDragRef.current) {
        finishPointerDrag(false, getDropIdAtLatestPointer())
      } else if (pendingDragRef.current) {
        finishPointerDrag(true)
      }
    }
    const handleWindowBlur = () => finishPointerDrag(true)
    window.addEventListener('pointerup', finishDragFromPointer)
    window.addEventListener('pointercancel', handleWindowBlur)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointerup', finishDragFromPointer)
      window.removeEventListener('pointercancel', handleWindowBlur)
      window.removeEventListener('blur', handleWindowBlur)
      finishPointerDrag(true)
      clearReleaseClickSuppression()
    }
  }, [clearReleaseClickSuppression, finishPointerDrag, getDropIdAtLatestPointer])

  return (
    <LauncherPointerDragContext.Provider
      value={useMemo(
        () => ({
          startPointerDrag,
          handleDndPointerDown: (event: PointerEvent<HTMLElement>) => dndKitControls?.handleDndPointerDown(event),
          setDraggableActivatorNodeRef: (node: HTMLElement | null) => {
            dndKitControls?.setDraggableActivatorNodeRef(node)
          },
        }),
        [dndKitControls, startPointerDrag],
      )}
    >
      {children}
      <DndContext
        autoScroll={false}
        sensors={sensors}
        measuring={measuring}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <LauncherLibraryDndBridge
          onControlsChange={setDndKitControls}
          dropTargets={dropTargets}
          activeDropId={activeDropId}
          pendingOverlay={pendingOverlay}
          activeOverlay={activeOverlay}
        />
      </DndContext>
    </LauncherPointerDragContext.Provider>
  )
}
