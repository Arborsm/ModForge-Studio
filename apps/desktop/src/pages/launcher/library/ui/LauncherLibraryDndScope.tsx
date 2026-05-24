import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
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
  type DragEndEvent,
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
  LAUNCHER_LIBRARY_PARENT_DROP_PREFIX,
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
  return (
    <div
      className="launcher-library-pending-drag-preview-layer"
      style={{
        transform: `translate3d(${drag.latestX}px, ${drag.latestY}px, 0)`,
      }}
    >
      <LauncherDragPreview source={drag.source} count={drag.modIds.length} pending={!drag.started} />
    </div>
  )
}

function LauncherDndKitDropTargetLayer({ targets }: { targets: LauncherDndKitDropTarget[] }) {
  return (
    <div className="launcher-library-dnd-target-layer" aria-hidden="true">
      {targets.map((target) => (
        <LauncherDndKitDropTargetBox key={target.dropId} target={target} />
      ))}
    </div>
  )
}

function LauncherDndKitDropTargetBox({ target }: { target: LauncherDndKitDropTarget }) {
  const { setNodeRef } = useDroppable({
    id: target.dropId,
    data: { dropId: target.dropId } satisfies LauncherDndKitDropData,
  })

  return (
    <span
      ref={setNodeRef}
      className="launcher-library-dnd-target-box"
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
  pendingOverlay,
  activeOverlay,
}: {
  onControlsChange: (controls: LauncherDndKitControls | null) => void
  dropTargets: LauncherDndKitDropTarget[]
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
      <LauncherDndKitDropTargetLayer targets={dropTargets} />
      {pendingOverlay ? <LauncherPendingDragPreview drag={pendingOverlay} /> : null}
      <DragOverlay dropAnimation={null} zIndex={80}>
        {activeOverlay ? <LauncherDragPreview source={activeOverlay.source} count={activeOverlay.modIds.length} /> : null}
      </DragOverlay>
    </>
  )
}

export function LauncherLibraryDndScope({
  children,
  resolveDraggedModIds,
  onAddModsToPack,
  onAssignModsToParent,
  onAssignModsToLibraryFolder,
  onRemoveChildModsFromParent,
  onRemoveModsFromLibraryFolders,
  onReleaseModsFromLibraryFolder,
  onMoveFolderToFolder,
}: {
  children: ReactNode
  resolveDraggedModIds: (modId: string) => string[]
  onAddModsToPack: (packId: string, modIds: string[]) => void
  onAssignModsToParent: (parentModId: string, modIds: string[]) => void
  onAssignModsToLibraryFolder: (folderId: string, modIds: string[]) => void
  onRemoveChildModsFromParent: (modIds: string[]) => void
  onRemoveModsFromLibraryFolders: (modIds: string[]) => void
  onReleaseModsFromLibraryFolder: (modIds: string[]) => void
  onMoveFolderToFolder: (folderId: string, parentFolderId: string | null) => void
}) {
  const pendingDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const activeDragRef = useRef<LauncherDndKitActiveDrag | null>(null)
  const suppressClickRef = useRef<{ element: HTMLElement; expiresAt: number } | null>(null)
  const [pendingOverlay, setPendingOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [activeOverlay, setActiveOverlay] = useState<LauncherDndKitActiveDrag | null>(null)
  const [dropTargets, setDropTargets] = useState<LauncherDndKitDropTarget[]>([])
  const [dndKitControls, setDndKitControls] = useState<LauncherDndKitControls | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: LAUNCHER_LIBRARY_DRAG_START_DISTANCE_PX } }))
  const measuring = useMemo(
    () => ({
      droppable: {
        strategy: MeasuringStrategy.BeforeDragging,
      },
    }),
    [],
  )

  const activatePendingDrag = useCallback(() => {
    const drag = pendingDragRef.current
    if (!drag || activeDragRef.current) {
      return null
    }
    const activeDrag = { ...drag, started: true }
    activeDragRef.current = activeDrag
    pendingDragRef.current = null
    setPendingOverlay(null)
    setActiveOverlay(activeDrag)
    setDropTargets(measureLauncherDndKitDropTargets(drag.sourceElement))
    return activeDrag
  }, [])

  const finishPointerDrag = useCallback(
    (cancelled = false, overDropId?: string | null) => {
      const drag = activeDragRef.current ?? pendingDragRef.current
      activeDragRef.current = null
      pendingDragRef.current = null
      setActiveOverlay(null)
      setPendingOverlay(null)
      setDropTargets([])
      if (!drag || cancelled) {
        return
      }
      if (!drag.started) {
        return
      }
      suppressClickRef.current = { element: drag.sourceElement, expiresAt: Date.now() + 500 }

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

      if (modIds.length && targetFolderBlankId && targetFolderBlankId !== originFolderId) {
        onAssignModsToLibraryFolder(targetFolderBlankId, modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originFolderId) {
        onReleaseModsFromLibraryFolder(modIds)
      } else if (drag.source.kind === 'mod' && drag.source.originParentId) {
        onRemoveChildModsFromParent(modIds)
      } else if (modIds.length && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_PACK_DROP_PREFIX)) {
        onAddModsToPack(effectiveOverId.slice(LAUNCHER_LIBRARY_PACK_DROP_PREFIX.length), modIds)
      } else if (modIds.length && effectiveOverId?.startsWith(LAUNCHER_LIBRARY_PARENT_DROP_PREFIX)) {
        onAssignModsToParent(effectiveOverId.slice(LAUNCHER_LIBRARY_PARENT_DROP_PREFIX.length), modIds)
      } else if (modIds.length && targetDropFolderId) {
        onAssignModsToLibraryFolder(targetDropFolderId, modIds)
      } else if (modIds.length && effectiveOverId === LAUNCHER_LIBRARY_BLANK_DROP_ID) {
        onRemoveChildModsFromParent(modIds)
        onRemoveModsFromLibraryFolders(modIds)
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
      onAssignModsToParent,
      onMoveFolderToFolder,
      onRemoveChildModsFromParent,
      onRemoveModsFromLibraryFolders,
      onReleaseModsFromLibraryFolder,
    ],
  )

  const suppressClickAfterDrag = useCallback((event: MouseEvent<HTMLElement>) => {
    const suppressClick = suppressClickRef.current
    if (!suppressClick || Date.now() > suppressClick.expiresAt) {
      suppressClickRef.current = null
      return
    }
    if (event.currentTarget !== suppressClick.element) {
      return
    }
    suppressClickRef.current = null
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const startPointerDrag = useCallback(
    (source: LauncherPointerDragSource, event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.buttons !== 1) {
        return
      }
      const modIds = source.kind === 'mod' ? resolveDraggedModIds(source.modId) : []
      const existingDrag = activeDragRef.current ?? pendingDragRef.current
      if (existingDrag?.sourceElement === event.currentTarget && !existingDrag.started) {
        setPendingOverlay((current) =>
          current?.sourceElement === event.currentTarget ? { ...current, latestX: event.clientX, latestY: event.clientY } : current,
        )
        return
      }
      const drag = {
        id: LAUNCHER_LIBRARY_ACTIVE_DRAGGABLE_ID,
        source,
        sourceElement: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        latestX: event.clientX,
        latestY: event.clientY,
        started: false,
        modIds,
      }
      pendingDragRef.current = drag
      setPendingOverlay(drag)
    },
    [resolveDraggedModIds],
  )

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overDropId = (event.over?.data.current as LauncherDndKitDropData | undefined)?.dropId ?? String(event.over?.id ?? '')
      finishPointerDrag(false, overDropId || null)
    },
    [finishPointerDrag],
  )

  const handleDragCancel = useCallback(() => {
    finishPointerDrag(true)
  }, [finishPointerDrag])

  useEffect(() => {
    const cancelPendingDrag = () => {
      if (pendingDragRef.current) {
        pendingDragRef.current = null
        setPendingOverlay(null)
      }
    }
    const handleWindowBlur = () => finishPointerDrag(true)
    window.addEventListener('pointerup', cancelPendingDrag)
    window.addEventListener('pointercancel', cancelPendingDrag)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointerup', cancelPendingDrag)
      window.removeEventListener('pointercancel', cancelPendingDrag)
      window.removeEventListener('blur', handleWindowBlur)
      finishPointerDrag(true)
    }
  }, [finishPointerDrag])

  return (
    <LauncherPointerDragContext.Provider
      value={useMemo(
        () => ({
          startPointerDrag,
          suppressClickAfterDrag,
          handleDndPointerDown: (event: PointerEvent<HTMLElement>) => dndKitControls?.handleDndPointerDown(event),
          setDraggableActivatorNodeRef: (node: HTMLElement | null) => {
            dndKitControls?.setDraggableActivatorNodeRef(node)
          },
        }),
        [dndKitControls, startPointerDrag, suppressClickAfterDrag],
      )}
    >
      {children}
      <DndContext
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
          pendingOverlay={pendingOverlay}
          activeOverlay={activeOverlay}
        />
      </DndContext>
    </LauncherPointerDragContext.Provider>
  )
}
