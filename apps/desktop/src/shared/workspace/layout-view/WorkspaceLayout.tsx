import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { cx } from '@shared/lib/cx'
import { RAIL_DRAG_THRESHOLD, ROOT_PADDING, SLOT_IDS, SPLIT_GAP } from '@shared/workspace/layoutConstants'
import { findDockTarget, getRailSortTarget, type RailButtonBounds, type RailSortTarget } from '@shared/workspace/layoutDragTargets'
import { getDockGuideRects, getWorkspaceGeometry } from '@shared/workspace/layoutGeometry'
import {
  buildDefaultSnapshot,
  clamp,
  getActiveDockedPanel,
  getDockedPanelIdsForRail,
  getForcedDockForPanel,
  getOrderedPanelIdsForSlot,
  movePanelInOrder,
  normalizeChrome,
  normalizeSlots,
  sanitizeStoredState,
  sanitizeSnapshot,
} from '@shared/workspace/layoutState'
import { clampFloatRect, getHorizontalUsableWidth, getRailEdgeSizeBounds } from '@shared/workspace/layoutSizing'
import type {
  DockArea,
  PanelMode,
  RailId,
  SlotId,
  WorkspaceLayoutHandle,
  WorkspacePanelConfig,
  WorkspacePanelMeta,
  WorkspacePanelState,
  WorkspaceSize,
  WorkspaceSlotState,
  WorkspaceStoredState,
} from '@shared/contracts'
import { WorkspacePanelShell } from './WorkspacePanelShell'
import { WorkspaceDragOverlay, WorkspaceRail } from './WorkspaceRails'

export type { DockArea, WorkspaceLayoutHandle, WorkspacePanelConfig, WorkspacePanelMeta } from '@shared/contracts'

type WorkspaceLayoutProps = {
  panels: WorkspacePanelConfig[]
  storageKey?: string
  persistedState?: Partial<WorkspaceStoredState> | null
  onPersistStateChange?: (storageKey: string, state: WorkspaceStoredState) => void
  onLayoutMetaChange?: (payload: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => void
}

function areStoredStatesEqual(left: WorkspaceStoredState, right: WorkspaceStoredState) {
  return JSON.stringify(left) === JSON.stringify(right)
}

type DragDockTarget = DockArea | null

type DragInteraction =
  | {
      kind: 'move'
      panelId: string
      pointerId: number
      offsetX: number
      offsetY: number
    }
  | {
      kind: 'edge-resize'
      rail: 'left' | 'right' | 'bottom'
      pointerId: number
      startX: number
      startY: number
      startSize: number
    }
  | {
      kind: 'split-resize'
      rail: RailId
      pointerId: number
    }
  | {
      kind: 'float-resize'
      panelId: string
      pointerId: number
      startX: number
      startY: number
      startWidth: number
      startHeight: number
    }
  | {
      kind: 'rail-drag'
      source: 'rail' | 'floating'
      panelId: string
      pointerId: number
      startX: number
      startY: number
      dragging: boolean
    }

export const WorkspaceLayout = forwardRef<WorkspaceLayoutHandle, WorkspaceLayoutProps>(function WorkspaceLayout(
  { panels, storageKey = 'modforge:workspace-layout:v7', persistedState = null, onPersistStateChange, onLayoutMetaChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const railButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const interactionRef = useRef<DragInteraction | null>(null)
  const suppressRailClickRef = useRef<string | null>(null)
  const [rootSize, setRootSize] = useState<WorkspaceSize>({ width: 0, height: 0 })
  const [state, setState] = useState<WorkspaceStoredState>(() => sanitizeStoredState(persistedState, panels))
  const stateRef = useRef(state)
  const persistStateChangeRef = useRef(onPersistStateChange)
  const panelsRef = useRef(panels)
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null)
  const [dragDockTarget, setDragDockTarget] = useState<DragDockTarget>(null)
  const [railSortTarget, setRailSortTarget] = useState<RailSortTarget>(null)
  const [dragPreview, setDragPreview] = useState<{ panelId: string; x: number; y: number } | null>(null)
  const [measuredDockHeights, setMeasuredDockHeights] = useState<Record<string, number>>({})
  const panelSchemaKey = useMemo(() => panels.map((panel) => panel.id).join('|'), [panels])

  const panelMap = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel])) as Record<string, WorkspacePanelConfig>,
    [panels],
  )

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setMeasuredDockHeights((current) => {
        let changed = false
        const next = { ...current }

        for (const entry of entries) {
          const panelId = (entry.target as HTMLElement).dataset.panelId
          if (!panelId) {
            continue
          }

          const measuredHeight = Math.ceil((entry.target as HTMLElement).scrollHeight)
          if (!measuredHeight || next[panelId] === measuredHeight) {
            continue
          }

          next[panelId] = measuredHeight
          changed = true
        }

        return changed ? next : current
      })
    })

    Object.values(panelContentRefs.current).forEach((element) => {
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [panels, state.panels])

  useLayoutEffect(() => {
    panelsRef.current = panels
  }, [panels])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    persistStateChangeRef.current = onPersistStateChange
  }, [onPersistStateChange])

  useLayoutEffect(() => {
    const nextState = sanitizeStoredState(persistedState, panelsRef.current)
    if (areStoredStatesEqual(stateRef.current, nextState)) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      if (areStoredStatesEqual(stateRef.current, nextState)) {
        return
      }

      setState(nextState)
      setMeasuredDockHeights({})
      setDraggedPanelId(null)
      setDragDockTarget(null)
      setRailSortTarget(null)
      setDragPreview(null)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [panelSchemaKey, persistedState, storageKey])

  const geometry = useMemo(
    () => getWorkspaceGeometry(panels, panelMap, state, rootSize, measuredDockHeights),
    [measuredDockHeights, panelMap, panels, rootSize, state],
  )
  const dockGuides = useMemo(() => getDockGuideRects(rootSize, geometry, panels), [geometry, panels, rootSize])

  useImperativeHandle(
    ref,
    () => ({
      resetLayout: () => setState((current) => ({ ...buildDefaultSnapshot(panels), presets: current.presets })),
      savePreset: (name) =>
        setState((current) => ({
          ...current,
          presets: {
            ...current.presets,
            [name]: {
              panels: current.panels,
              slots: current.slots,
              chrome: current.chrome,
            },
          },
        })),
      loadPreset: (name) =>
        setState((current) => {
          const preset = current.presets[name]
          return preset ? { ...sanitizeSnapshot(preset, panels), presets: current.presets } : current
        }),
      deletePreset: (name) =>
        setState((current) => {
          const nextPresets = { ...current.presets }
          delete nextPresets[name]
          return { ...current, presets: nextPresets }
        }),
      getPresetNames: () => Object.keys(state.presets).sort((left, right) => left.localeCompare(right)),
      getPanelMeta: () =>
        panels.map((panel) => ({
          id: panel.id,
          title: panel.title,
          visible: state.panels[panel.id]?.mode !== 'hidden',
          mode: state.panels[panel.id]?.mode ?? 'docked',
          dock: state.panels[panel.id]?.dock ?? 'right-top',
        })),
      setPanelVisibility: (id, visible) =>
        setState((current) => {
          const currentPanel = current.panels[id]
          if (!currentPanel) {
            return current
          }

          const nextMode: PanelMode = visible ? currentPanel.lastMode : 'hidden'
          const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
          const nextPanels: Record<string, WorkspacePanelState> = {
            ...current.panels,
            [id]: {
              ...currentPanel,
              mode: nextMode,
              lastMode: !visible || currentPanel.mode === 'hidden' ? currentPanel.lastMode : currentPanel.mode,
              zIndex: visible && nextMode === 'floating' ? nextZ : currentPanel.zIndex,
            },
          }
          let nextSlots = current.slots

          if (visible && currentPanel.lastMode === 'docked' && currentPanel.dock !== 'center') {
            nextSlots = {
              ...current.slots,
              [currentPanel.dock]: {
                ...current.slots[currentPanel.dock],
                activePanelId: id,
                expanded: true,
              },
            }
          }

          return {
            ...current,
            panels: nextPanels,
            slots: normalizeSlots(panels, nextPanels, nextSlots),
          }
        }),
    }),
    [panels, state],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setRootSize({
        width: root.clientWidth,
        height: root.clientHeight,
      })
    })

    resizeObserver.observe(root)
    setRootSize({
      width: root.clientWidth,
      height: root.clientHeight,
    })

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    persistStateChangeRef.current?.(storageKey, state)
  }, [state, storageKey])

  useEffect(() => {
    onLayoutMetaChange?.({
      panelItems: panels.map((panel) => ({
        id: panel.id,
        title: panel.title,
        visible: state.panels[panel.id]?.mode !== 'hidden',
        mode: state.panels[panel.id]?.mode ?? 'docked',
        dock: state.panels[panel.id]?.dock ?? 'right-top',
      })),
      presetNames: Object.keys(state.presets).sort((left, right) => left.localeCompare(right)),
    })
  }, [onLayoutMetaChange, panels, state.panels, state.presets])

  const applyRailOrderDrop = useCallback(
    (panelId: string, slot: SlotId, index: number) => {
      setState((current) => {
        const currentPanel = current.panels[panelId]
        if (!currentPanel) {
          return current
        }

        const nextPanels: Record<string, WorkspacePanelState> = {
          ...current.panels,
          [panelId]: {
            ...currentPanel,
            mode: 'docked',
            lastMode: 'docked',
            dock: slot,
          },
        }

        const nextSlots = Object.fromEntries(
          SLOT_IDS.map((slotId) => {
            const orderedIds = getOrderedPanelIdsForSlot(panels, nextPanels, current.slots, slotId)
            const nextOrder = slotId === slot ? movePanelInOrder(orderedIds, panelId, index) : orderedIds.filter((id) => id !== panelId)

            return [
              slotId,
              {
                ...current.slots[slotId],
                activePanelId: slotId === slot ? panelId : current.slots[slotId].activePanelId,
                expanded: slotId === slot ? true : current.slots[slotId].expanded,
                panelOrder: nextOrder,
              },
            ]
          }),
        ) as Record<SlotId, WorkspaceSlotState>

        return {
          ...current,
          panels: nextPanels,
          slots: normalizeSlots(panels, nextPanels, nextSlots),
        }
      })
    },
    [panels],
  )

  const dock = useCallback(
    (panelId: string, dockArea: DockArea) => {
      setState((current) => {
        const currentPanel = current.panels[panelId]
        if (!currentPanel) {
          return current
        }

        const nextPanels: Record<string, WorkspacePanelState> = {
          ...current.panels,
          [panelId]: {
            ...currentPanel,
            mode: 'docked',
            lastMode: 'docked',
            dock: dockArea,
          },
        }

        let nextSlots = current.slots
        if (dockArea !== 'center') {
          const orderedIds = getOrderedPanelIdsForSlot(panels, nextPanels, current.slots, dockArea)
          const nextOrder = movePanelInOrder(orderedIds, panelId, orderedIds.length)
          nextSlots = {
            ...Object.fromEntries(
              SLOT_IDS.map((slotId) => [
                slotId,
                {
                  ...current.slots[slotId],
                  panelOrder: slotId === dockArea ? nextOrder : current.slots[slotId].panelOrder.filter((id) => id !== panelId),
                },
              ]),
            ),
            [dockArea]: {
              ...current.slots[dockArea],
              activePanelId: panelId,
              expanded: true,
              panelOrder: nextOrder,
            },
          } as Record<SlotId, WorkspaceSlotState>
        }

        return {
          ...current,
          panels: nextPanels,
          slots: normalizeSlots(panels, nextPanels, nextSlots),
        }
      })
    },
    [panels],
  )

  const undock = useCallback(
    (panelId: string) => {
      setState((current) => {
        const currentPanel = current.panels[panelId]
        if (!currentPanel) {
          return current
        }

        const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
        const dockRect = geometry.dockedRects[panelId] ?? {
          x: 80,
          y: 80,
          width: currentPanel.width,
          height: currentPanel.height,
        }
        const nextPanels: Record<string, WorkspacePanelState> = {
          ...current.panels,
          [panelId]: {
            ...currentPanel,
            mode: 'floating',
            lastMode: 'floating',
            x: dockRect.x + 24,
            y: dockRect.y + 24,
            width: Math.max(currentPanel.width, dockRect.width),
            height: Math.max(currentPanel.height, dockRect.height),
            zIndex: nextZ,
          },
        }

        return {
          ...current,
          panels: nextPanels,
          slots: normalizeSlots(panels, nextPanels, current.slots),
        }
      })
    },
    [geometry.dockedRects, panels],
  )

  const floatPanelAtPoint = useCallback(
    (panelId: string, clientX: number, clientY: number) => {
      const root = rootRef.current
      const panel = panelMap[panelId]
      if (!root || !panel) {
        undock(panelId)
        return
      }

      const rootRect = root.getBoundingClientRect()

      setState((current) => {
        const currentPanel = current.panels[panelId]
        if (!currentPanel) {
          return current
        }

        const nextZ = Math.max(...Object.values(current.panels).map((candidate) => candidate.zIndex), 0) + 1
        const width = Math.max(currentPanel.width, panel.minWidth)
        const height = Math.max(currentPanel.height, panel.minHeight)
        const nextRect = clampFloatRect(
          {
            x: clientX - rootRect.left - width / 2,
            y: clientY - rootRect.top - 22,
            width,
            height,
          },
          rootSize,
          panel,
        )
        const nextPanels: Record<string, WorkspacePanelState> = {
          ...current.panels,
          [panelId]: {
            ...currentPanel,
            mode: 'floating',
            lastMode: 'floating',
            x: nextRect.x,
            y: nextRect.y,
            width: nextRect.width,
            height: nextRect.height,
            zIndex: nextZ,
          },
        }

        return {
          ...current,
          panels: nextPanels,
          slots: normalizeSlots(panels, nextPanels, current.slots),
        }
      })
    },
    [panelMap, panels, rootSize, undock],
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current
      const root = rootRef.current
      if (!interaction || !root) {
        return
      }

      const rootRect = root.getBoundingClientRect()

      if (interaction.kind === 'move') {
        const panel = panelMap[interaction.panelId]
        const currentPanel = state.panels[interaction.panelId]
        const rect = clampFloatRect(
          {
            x: event.clientX - rootRect.left - interaction.offsetX,
            y: event.clientY - rootRect.top - interaction.offsetY,
            width: currentPanel.width,
            height: currentPanel.height,
          },
          rootSize,
          panel,
        )

        setState((current) => ({
          ...current,
          panels: {
            ...current.panels,
            [interaction.panelId]: {
              ...current.panels[interaction.panelId],
              mode: 'floating',
              lastMode: 'floating',
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          },
        }))
        return
      }

      if (interaction.kind === 'rail-drag') {
        const deltaX = event.clientX - interaction.startX
        const deltaY = event.clientY - interaction.startY
        const distance = Math.hypot(deltaX, deltaY)

        if (!interaction.dragging && distance < RAIL_DRAG_THRESHOLD) {
          return
        }

        if (!interaction.dragging) {
          interactionRef.current = {
            ...interaction,
            dragging: true,
          }
          setDraggedPanelId(interaction.panelId)
          suppressRailClickRef.current = interaction.panelId
        }

        setDragPreview({
          panelId: interaction.panelId,
          x: event.clientX - rootRect.left,
          y: event.clientY - rootRect.top,
        })

        const localPointer = {
          x: event.clientX - rootRect.left,
          y: event.clientY - rootRect.top,
        }
        const nextTarget = findDockTarget(dockGuides, localPointer)

        setDragDockTarget((current) => (current === nextTarget ? current : nextTarget))
        if (nextTarget) {
          setRailSortTarget(null)
          return
        }

        const buttonBounds: RailButtonBounds[] = []
        for (const button of Object.values(railButtonRefs.current)) {
          if (!button) {
            continue
          }

          const slot = button.dataset.slot as SlotId | undefined
          const panelId = button.dataset.panelId
          if (!slot || !panelId) {
            continue
          }

          const rect = button.getBoundingClientRect()
          buttonBounds.push({
            slot,
            panelId,
            rect: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          })
        }

        const nextSortTarget = getRailSortTarget(
          buttonBounds,
          { x: event.clientX, y: event.clientY },
          interaction.panelId,
          panels,
          state.panels,
          state.slots,
        )

        setRailSortTarget((current) =>
          current?.slot === nextSortTarget?.slot &&
          current?.index === nextSortTarget?.index &&
          current?.panelId === nextSortTarget?.panelId &&
          current?.position === nextSortTarget?.position
            ? current
            : nextSortTarget,
        )
        return
      }

      if (interaction.kind === 'edge-resize') {
        setState((current) => {
          const bounds = getRailEdgeSizeBounds(interaction.rail, panels, panelMap, current, rootSize)
          const nextSize = clamp(
            interaction.rail === 'left'
              ? interaction.startSize + (event.clientX - interaction.startX)
              : interaction.rail === 'right'
                ? interaction.startSize - (event.clientX - interaction.startX)
                : interaction.startSize - (event.clientY - interaction.startY),
            bounds.min,
            bounds.max,
          )

          if (interaction.rail === 'bottom') {
            return {
              ...current,
              chrome: {
                ...current.chrome,
                bottomHeight: nextSize,
              },
            }
          }

          const leftRailVisible = getDockedPanelIdsForRail(panels, current.panels, 'left').length > 0
          const rightRailVisible = getDockedPanelIdsForRail(panels, current.panels, 'right').length > 0
          const leftPanelVisible = Boolean(
            getActiveDockedPanel(panelMap, current, 'left-top') || getActiveDockedPanel(panelMap, current, 'left-bottom'),
          )
          const rightPanelVisible = Boolean(
            getActiveDockedPanel(panelMap, current, 'right-top') || getActiveDockedPanel(panelMap, current, 'right-bottom'),
          )
          const usable = getHorizontalUsableWidth(rootSize, leftRailVisible, rightRailVisible, leftPanelVisible, rightPanelVisible)
          const nextRatio = nextSize / Math.max(1, usable)

          return {
            ...current,
            chrome: normalizeChrome(
              {
                ...current.chrome,
                [interaction.rail === 'left' ? 'leftWidth' : 'rightWidth']: nextRatio,
              },
              panels,
            ),
          }
        })
        return
      }

      if (interaction.kind === 'split-resize') {
        const container = geometry.railContainers[interaction.rail]
        if (!container) {
          return
        }

        if (interaction.rail === 'left' || interaction.rail === 'right') {
          const ratio = clamp((event.clientY - rootRect.top - container.y) / Math.max(1, container.height - SPLIT_GAP), 0.2, 0.8)
          setState((current) => ({
            ...current,
            chrome: {
              ...current.chrome,
              [interaction.rail === 'left' ? 'leftSplit' : 'rightSplit']: ratio,
            },
          }))
        } else {
          const ratio = clamp((event.clientX - rootRect.left - container.x) / Math.max(1, container.width - SPLIT_GAP), 0.2, 0.8)
          setState((current) => ({
            ...current,
            chrome: {
              ...current.chrome,
              bottomSplit: ratio,
            },
          }))
        }
        return
      }

      const panel = panelMap[interaction.panelId]
      setState((current) => ({
        ...current,
        panels: {
          ...current.panels,
          [interaction.panelId]: {
            ...current.panels[interaction.panelId],
            width: clamp(
              interaction.startWidth + (event.clientX - interaction.startX),
              panel.minWidth,
              Math.max(panel.minWidth, rootSize.width - ROOT_PADDING * 2),
            ),
            height: clamp(
              interaction.startHeight + (event.clientY - interaction.startY),
              panel.minHeight,
              Math.max(panel.minHeight, rootSize.height - ROOT_PADDING * 2),
            ),
          },
        },
      }))
    }

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current
      interactionRef.current = null

      if (interaction?.kind === 'rail-drag') {
        if (interaction.dragging) {
          if (railSortTarget) {
            applyRailOrderDrop(interaction.panelId, railSortTarget.slot, railSortTarget.index)
          } else if (dragDockTarget) {
            dock(interaction.panelId, dragDockTarget)
          } else {
            const root = rootRef.current
            if (root) {
              const rootRect = root.getBoundingClientRect()
              const x = event.clientX - rootRect.left
              const y = event.clientY - rootRect.top
              const withinCenter =
                x >= geometry.centerRect.x &&
                x <= geometry.centerRect.x + geometry.centerRect.width &&
                y >= geometry.centerRect.y &&
                y <= geometry.centerRect.y + geometry.centerRect.height

              if (withinCenter) {
                floatPanelAtPoint(interaction.panelId, event.clientX, event.clientY)
              } else if (interaction.source === 'floating') {
                floatPanelAtPoint(interaction.panelId, event.clientX, event.clientY)
              }
            }
          }
        }
        setDraggedPanelId(null)
        setDragDockTarget(null)
        setRailSortTarget(null)
        setDragPreview(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [
    applyRailOrderDrop,
    dock,
    dockGuides,
    dragDockTarget,
    floatPanelAtPoint,
    geometry.centerRect,
    geometry.railContainers,
    panelMap,
    panels,
    railSortTarget,
    rootSize,
    state.panels,
    state.slots,
  ])

  function bringToFront(panelId: string) {
    setState((current) => {
      const nextZ = Math.max(...Object.values(current.panels).map((panel) => panel.zIndex), 0) + 1
      return {
        ...current,
        panels: {
          ...current.panels,
          [panelId]: {
            ...current.panels[panelId],
            zIndex: nextZ,
          },
        },
      }
    })
  }

  function restoreToSidebar(panelId: string) {
    const currentPanel = state.panels[panelId]
    const panel = panelMap[panelId]
    if (!currentPanel || !panel) {
      return
    }

    const targetDock = currentPanel.dock === 'center' ? (getForcedDockForPanel() ?? panel.defaultDock ?? 'right-top') : currentPanel.dock

    dock(panelId, targetDock)
  }

  function hide(panelId: string) {
    setState((current) => {
      const currentPanel = current.panels[panelId]
      if (!currentPanel) {
        return current
      }

      const nextPanels: Record<string, WorkspacePanelState> = {
        ...current.panels,
        [panelId]: {
          ...currentPanel,
          lastMode: currentPanel.mode === 'hidden' ? currentPanel.lastMode : currentPanel.mode,
          mode: 'hidden',
        },
      }

      return {
        ...current,
        panels: nextPanels,
        slots: normalizeSlots(panels, nextPanels, current.slots),
      }
    })
  }

  function collapseDockedPanel(panelId: string) {
    setState((current) => {
      const panelState = current.panels[panelId]
      if (!panelState || panelState.mode !== 'docked' || panelState.dock === 'center') {
        return current
      }

      return {
        ...current,
        slots: {
          ...current.slots,
          [panelState.dock]: {
            ...current.slots[panelState.dock],
            expanded: false,
            activePanelId: panelId,
            panelOrder: current.slots[panelState.dock].panelOrder,
          },
        },
      }
    })
  }

  function toggleSlot(slot: SlotId, panelId: string) {
    setState((current) => {
      const slotState = current.slots[slot]
      return {
        ...current,
        slots: {
          ...current.slots,
          [slot]: {
            activePanelId: panelId,
            expanded: slotState.activePanelId === panelId ? !slotState.expanded : true,
            panelOrder: slotState.panelOrder,
          },
        },
      }
    })
  }

  function beginMove(panelId: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button, [data-panel-no-drag="true"]')) {
      return
    }

    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect) {
      return
    }

    const currentPanel = state.panels[panelId]
    const rect =
      currentPanel.mode === 'floating'
        ? { x: currentPanel.x, y: currentPanel.y }
        : { x: geometry.dockedRects[panelId]?.x ?? ROOT_PADDING, y: geometry.dockedRects[panelId]?.y ?? ROOT_PADDING }

    if (currentPanel.mode !== 'floating') {
      undock(panelId)
    } else {
      bringToFront(panelId)
    }

    interactionRef.current = {
      kind: 'move',
      panelId,
      pointerId: event.pointerId,
      offsetX: event.clientX - rootRect.left - rect.x,
      offsetY: event.clientY - rootRect.top - rect.y,
    }
  }

  function beginEdgeResize(rail: 'left' | 'right' | 'bottom', event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      kind: 'edge-resize',
      rail,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize:
        rail === 'bottom'
          ? (geometry.railContainers.bottom?.height ?? state.chrome.bottomHeight)
          : (geometry.railContainers[rail]?.width ?? 0),
    }
  }

  function beginSplitResize(rail: RailId, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      kind: 'split-resize',
      rail,
      pointerId: event.pointerId,
    }
  }

  function beginFloatResize(panelId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    bringToFront(panelId)
    interactionRef.current = {
      kind: 'float-resize',
      panelId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: state.panels[panelId].width,
      startHeight: state.panels[panelId].height,
    }
  }

  function beginRailDrag(panelId: string, event: ReactPointerEvent<HTMLElement>, source: 'rail' | 'floating' = 'rail') {
    if (event.button !== 0) {
      return
    }

    interactionRef.current = {
      kind: 'rail-drag',
      source,
      panelId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
  }

  function stopHeaderDrag(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation()
  }

  function handleRailButtonClick(slot: SlotId, panelId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressRailClickRef.current === panelId) {
      suppressRailClickRef.current = null
      event.preventDefault()
      return
    }

    toggleSlot(slot, panelId)
  }

  function endToolDrag() {
    setDraggedPanelId(null)
    setDragDockTarget(null)
    setRailSortTarget(null)
    setDragPreview(null)
  }

  function dropToDock(area: DockArea, panelId?: string | null) {
    const nextPanelId = panelId ?? draggedPanelId
    if (!nextPanelId) {
      return
    }

    dock(nextPanelId, area)
    setDraggedPanelId(null)
    setDragDockTarget(null)
  }

  return (
    <div ref={rootRef} className="workspace-root">
      {(['left', 'right'] as const).map((rail) => (
        <WorkspaceRail
          key={rail}
          rail={rail}
          railRect={geometry.rails[rail]}
          panels={panels}
          panelMap={panelMap}
          panelStates={state.panels}
          slots={state.slots}
          draggedPanelId={draggedPanelId}
          railSortTarget={railSortTarget}
          railButtonRefs={railButtonRefs}
          onUndock={undock}
          onHide={hide}
          onDock={dock}
          onRailButtonClick={handleRailButtonClick}
          onBeginRailDrag={beginRailDrag}
        />
      ))}

      <WorkspaceDragOverlay
        draggedPanelId={draggedPanelId}
        dockGuides={dockGuides}
        dragDockTarget={dragDockTarget}
        dragPreview={dragPreview}
        panelMap={panelMap}
        onDragDockTargetChange={setDragDockTarget}
        onDropToDock={dropToDock}
        onEndToolDrag={endToolDrag}
      />

      {(['left', 'right', 'bottom'] as const).map((rail) => {
        const resizer = geometry.edgeResizers[rail]
        if (!resizer) {
          return null
        }

        return (
          <div
            key={`edge-${rail}`}
            className={cx(
              'workspace-dock-resizer',
              rail === 'left'
                ? 'workspace-dock-resizer-right'
                : rail === 'right'
                  ? 'workspace-dock-resizer-left'
                  : 'workspace-dock-resizer-bottom',
            )}
            style={{
              left: `${resizer.x}px`,
              top: `${resizer.y}px`,
              width: `${resizer.width}px`,
              height: `${resizer.height}px`,
            }}
            onPointerDown={(event) => beginEdgeResize(rail, event)}
          />
        )
      })}

      {(['left', 'right', 'bottom'] as const).map((rail) => {
        const resizer = geometry.splitResizers[rail]
        if (!resizer) {
          return null
        }

        return (
          <div
            key={`split-${rail}`}
            className={cx(
              'workspace-split-resizer',
              rail === 'bottom' ? 'workspace-split-resizer-vertical' : 'workspace-split-resizer-horizontal',
            )}
            style={{
              left: `${resizer.x}px`,
              top: `${resizer.y}px`,
              width: `${resizer.width}px`,
              height: `${resizer.height}px`,
            }}
            onPointerDown={(event) => beginSplitResize(rail, event)}
          />
        )
      })}

      {panels.map((panel) => {
        const panelState = state.panels[panel.id]
        if (!panelState || panelState.mode === 'hidden') {
          return null
        }
        const hideWhileDragging = panelState.mode === 'floating' && draggedPanelId === panel.id

        const rect =
          panelState.mode === 'floating'
            ? clampFloatRect(
                {
                  x: panelState.x,
                  y: panelState.y,
                  width: panelState.width,
                  height: panelState.height,
                },
                rootSize,
                panel,
              )
            : geometry.dockedRects[panel.id]

        if (!rect) {
          return null
        }

        const hideDockHeader =
          panelState.mode === 'docked' && (panel.hideDockHeader || panelState.dock !== 'center' || panel.id === 'viewport')

        return (
          <WorkspacePanelShell
            key={panel.id}
            panel={panel}
            panelState={panelState}
            rect={rect}
            hideWhileDragging={hideWhileDragging}
            hideDockHeader={hideDockHeader}
            onBringToFront={bringToFront}
            onBeginMove={beginMove}
            onBeginRailDrag={beginRailDrag}
            onStopHeaderDrag={stopHeaderDrag}
            onDock={dock}
            onUndock={undock}
            onHide={hide}
            onRestoreToSidebar={restoreToSidebar}
            onCollapseDockedPanel={collapseDockedPanel}
            onBeginFloatResize={beginFloatResize}
          >
            <div
              ref={(node) => {
                panelContentRefs.current[panel.id] = node
              }}
              data-panel-id={panel.id}
              className="min-h-0 flex-1 overflow-hidden"
            >
              {panel.content}
            </div>
          </WorkspacePanelShell>
        )
      })}
    </div>
  )
})
