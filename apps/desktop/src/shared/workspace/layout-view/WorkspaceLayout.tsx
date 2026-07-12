import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { normalizeChrome, buildDefaultLayoutState, sanitizeStoredState } from '@shared/workspace/layoutState'
import { getRailEdgeSizeBounds, getHorizontalUsableWidth } from '@shared/workspace/layoutSizing'
import { getWorkspaceGeometry } from '@shared/workspace/layoutGeometry'
import { SPLIT_GAP } from '@shared/workspace/layoutConstants'
import type {
  WorkspaceLayoutHandle,
  WorkspacePanelConfig,
  WorkspaceResizeRail,
  WorkspaceSize,
  WorkspaceStoredState,
} from '@shared/contracts'
import { WorkspacePanelShell } from './WorkspacePanelShell'

export type { WorkspaceLayoutHandle, WorkspacePanelArea, WorkspacePanelConfig } from '@shared/contracts'

type WorkspaceLayoutProps = {
  panels: WorkspacePanelConfig[]
  storageKey: string
  persistedState?: Partial<WorkspaceStoredState> | null
  onPersistStateChange?: (storageKey: string, state: WorkspaceStoredState) => void
}

type ResizeInteraction = {
  kind: 'edge' | 'split'
  rail: WorkspaceResizeRail
  pointerId: number
  startX: number
  startY: number
  startValue: number
}

function areStoredStatesEqual(left: WorkspaceStoredState, right: WorkspaceStoredState) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const WorkspaceLayout = forwardRef<WorkspaceLayoutHandle, WorkspaceLayoutProps>(function WorkspaceLayout(
  { panels, storageKey, persistedState = null, onPersistStateChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const interactionRef = useRef<ResizeInteraction | null>(null)
  const [rootSize, setRootSize] = useState<WorkspaceSize>({ width: 0, height: 0 })
  const [state, setState] = useState<WorkspaceStoredState>(() => sanitizeStoredState(persistedState, panels))
  const stateRef = useRef(state)
  const panelsRef = useRef(panels)
  const rootSizeRef = useRef(rootSize)
  const persistStateChangeRef = useRef(onPersistStateChange)
  const panelSchemaKey = panels.map((panel) => panel.id).join('|')
  const geometry = getWorkspaceGeometry(panels, state, rootSize)
  const geometryRef = useRef(geometry)

  useLayoutEffect(() => {
    stateRef.current = state
    rootSizeRef.current = rootSize
    panelsRef.current = panels
    geometryRef.current = geometry
  }, [geometry, panels, rootSize, state])

  useEffect(() => {
    persistStateChangeRef.current = onPersistStateChange
  }, [onPersistStateChange])

  useLayoutEffect(() => {
    const nextState = sanitizeStoredState(persistedState, panelsRef.current)
    if (areStoredStatesEqual(stateRef.current, nextState)) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!areStoredStatesEqual(stateRef.current, nextState)) {
        setState(nextState)
      }
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [panelSchemaKey, persistedState, storageKey])

  useImperativeHandle(
    ref,
    () => ({
      resetLayout: () => setState(buildDefaultLayoutState(panelsRef.current)),
    }),
    [],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setRootSize({ width: root.clientWidth, height: root.clientHeight })
    })

    resizeObserver.observe(root)
    setRootSize({ width: root.clientWidth, height: root.clientHeight })
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!interactionRef.current) {
      persistStateChangeRef.current?.(storageKey, state)
    }
  }, [state, storageKey])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current
      if (!interaction) {
        return
      }

      event.preventDefault()
      const currentSize = rootSizeRef.current
      const currentPanels = panelsRef.current

      if (interaction.kind === 'edge') {
        setState((current) => {
          const bounds = getRailEdgeSizeBounds(interaction.rail, currentPanels, current, currentSize)
          const delta =
            interaction.rail === 'left'
              ? event.clientX - interaction.startX
              : interaction.rail === 'right'
                ? interaction.startX - event.clientX
                : interaction.startY - event.clientY
          const nextSize = Math.min(bounds.max, Math.max(bounds.min, interaction.startValue + delta))

          if (interaction.rail === 'bottom') {
            return {
              chrome: normalizeChrome({ ...current.chrome, bottomHeight: nextSize }, currentPanels),
            }
          }

          const leftVisible = currentPanels.some((panel) => panel.area === 'left')
          const rightVisible = currentPanels.some((panel) => panel.area === 'right')
          const usable = getHorizontalUsableWidth(currentSize, leftVisible, rightVisible)
          const key = interaction.rail === 'left' ? 'leftWidth' : 'rightWidth'

          return {
            chrome: normalizeChrome({ ...current.chrome, [key]: nextSize / Math.max(1, usable) }, currentPanels),
          }
        })
        return
      }

      const rect = geometryRef.current.areaRects[interaction.rail]
      if (!rect) {
        return
      }

      const span = Math.max(1, (interaction.rail === 'bottom' ? rect.width : rect.height) - SPLIT_GAP)
      const delta = interaction.rail === 'bottom' ? event.clientX - interaction.startX : event.clientY - interaction.startY
      const key = interaction.rail === 'left' ? 'leftSplit' : interaction.rail === 'right' ? 'rightSplit' : 'bottomSplit'
      const nextRatio = Math.min(0.8, Math.max(0.2, interaction.startValue + delta / span))

      setState((current) => ({
        chrome: normalizeChrome({ ...current.chrome, [key]: nextRatio }, currentPanels),
      }))
    }

    const finishInteraction = () => {
      if (!interactionRef.current) {
        return
      }

      interactionRef.current = null
      persistStateChangeRef.current?.(storageKey, stateRef.current)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', finishInteraction)
    window.addEventListener('pointercancel', finishInteraction)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishInteraction)
      window.removeEventListener('pointercancel', finishInteraction)
    }
  }, [storageKey])

  function beginEdgeResize(rail: WorkspaceResizeRail, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const leftVisible = panelsRef.current.some((panel) => panel.area === 'left')
    const rightVisible = panelsRef.current.some((panel) => panel.area === 'right')
    const usable = getHorizontalUsableWidth(rootSizeRef.current, leftVisible, rightVisible)
    const startValue =
      rail === 'bottom'
        ? stateRef.current.chrome.bottomHeight
        : stateRef.current.chrome[rail === 'left' ? 'leftWidth' : 'rightWidth'] * Math.max(1, usable)
    interactionRef.current = {
      kind: 'edge',
      rail,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function beginSplitResize(rail: WorkspaceResizeRail, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const key = rail === 'left' ? 'leftSplit' : rail === 'right' ? 'rightSplit' : 'bottomSplit'
    interactionRef.current = {
      kind: 'split',
      rail,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: stateRef.current.chrome[key],
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  return (
    <div ref={rootRef} className="workspace-root" data-workspace-layout data-storage-key={storageKey}>
      {(['left', 'right', 'bottom'] as const).map((rail) => {
        const resizer = geometry.edgeResizers[rail]
        if (!resizer) {
          return null
        }

        return (
          <div
            key={`edge-${rail}`}
            className={`workspace-edge-resizer workspace-edge-resizer-${rail}`}
            data-workspace-resizer={rail}
            role="separator"
            aria-orientation={rail === 'bottom' ? 'horizontal' : 'vertical'}
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
            className={`workspace-split-resizer workspace-split-resizer-${rail}`}
            data-workspace-split-resizer={rail}
            role="separator"
            aria-orientation={rail === 'bottom' ? 'vertical' : 'horizontal'}
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
        const rect = geometry.panelRects[panel.id]
        if (!rect) {
          return null
        }

        return (
          <WorkspacePanelShell
            key={panel.id}
            panel={panel}
            rect={rect}
            hideDockHeader={Boolean(panel.hideDockHeader) || panel.area !== 'center' || panel.id === 'viewport'}
          >
            {panel.content}
          </WorkspacePanelShell>
        )
      })}
    </div>
  )
})
