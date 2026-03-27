import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getStageMetadataCacheStats } from '../lib/app/eventStageShared'
import { getDesktopCacheStats } from '../lib/desktop'
import { getMapViewportCacheStats } from '../lib/mapViewportCache'
import type { WorkspaceMode } from '../lib/editor-shell'

type DevDebugOverlayProps = {
  workspaceMode: WorkspaceMode
  mapName: string | null
  eventName: string | null
  currentEventCommandId: string | null
  actorCount: number
}

type MemoryStats = {
  usedJsHeapSize?: number
  totalJsHeapSize?: number
  jsHeapSizeLimit?: number
}

type CacheStats = {
  desktop: ReturnType<typeof getDesktopCacheStats>
  stage: ReturnType<typeof getStageMetadataCacheStats>
  viewport: ReturnType<typeof getMapViewportCacheStats>
}

function formatBytes(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return 'n/a'
  }

  const mb = value / (1024 * 1024)
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

function useFps() {
  const [fps, setFps] = useState(0)
  const [frameTimeMs, setFrameTimeMs] = useState(0)

  useEffect(() => {
    let frameId = 0
    let lastTime = performance.now()
    let lastSample = lastTime
    let frameCount = 0

    const tick = (now: number) => {
      frameCount += 1
      setFrameTimeMs(now - lastTime)
      lastTime = now

      if (now - lastSample >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - lastSample)))
        frameCount = 0
        lastSample = now
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  return { fps, frameTimeMs }
}

export function DevDebugOverlay({
  workspaceMode,
  mapName,
  eventName,
  currentEventCommandId,
  actorCount,
}: DevDebugOverlayProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 84 })
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({})
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    desktop: getDesktopCacheStats(),
    stage: getStageMetadataCacheStats(),
    viewport: getMapViewportCacheStats(),
  })
  const pointerOffsetRef = useRef({ x: 0, y: 0 })
  const dragPointerIdRef = useRef<number | null>(null)
  const { fps, frameTimeMs } = useFps()

  useEffect(() => {
    const updateMemory = () => {
      const memory = (performance as Performance & { memory?: MemoryStats }).memory
      setMemoryStats(memory ?? {})
      setCacheStats({
        desktop: getDesktopCacheStats(),
        stage: getStageMetadataCacheStats(),
        viewport: getMapViewportCacheStats(),
      })
    }

    updateMemory()
    const interval = window.setInterval(updateMemory, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const metrics = useMemo(
    () => [
      ['FPS', fps ? String(fps) : '...'],
      ['Frame', `${frameTimeMs.toFixed(1)} ms`],
      ['Heap Used', formatBytes(memoryStats.usedJsHeapSize)],
      ['Heap Total', formatBytes(memoryStats.totalJsHeapSize)],
      ['Heap Limit', formatBytes(memoryStats.jsHeapSizeLimit)],
      [
        'Desktop Cache',
        `${cacheStats.desktop.scanMaps + cacheStats.desktop.mapAsset + cacheStats.desktop.textAsset + cacheStats.desktop.imageDataUrl} entries`,
      ],
      ['Stage Cache', `${cacheStats.stage.hat + cacheStats.stage.hair} entries`],
      ['Viewport Cache', `${cacheStats.viewport.images} loaded / ${cacheStats.viewport.pendingImages} pending`],
      ['DPR', window.devicePixelRatio.toFixed(2)],
      ['Viewport', `${window.innerWidth}x${window.innerHeight}`],
      ['Renderer', 'Canvas 2D'],
      ['Mode', workspaceMode],
      ['Map', mapName ?? 'n/a'],
      ['Event', eventName ?? 'n/a'],
      ['Command', currentEventCommandId ?? 'n/a'],
      ['Actors', String(actorCount)],
      ['DOM', typeof document === 'undefined' ? 'n/a' : String(document.getElementsByTagName('*').length)],
    ],
    [
      actorCount,
      cacheStats.desktop.imageDataUrl,
      cacheStats.desktop.mapAsset,
      cacheStats.desktop.scanMaps,
      cacheStats.desktop.textAsset,
      cacheStats.stage.hair,
      cacheStats.stage.hat,
      cacheStats.viewport.images,
      cacheStats.viewport.pendingImages,
      currentEventCommandId,
      eventName,
      fps,
      frameTimeMs,
      mapName,
      memoryStats.jsHeapSizeLimit,
      memoryStats.totalJsHeapSize,
      memoryStats.usedJsHeapSize,
      workspaceMode,
    ],
  )

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragPointerIdRef.current = event.pointerId
    pointerOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return
    }

    setPosition({
      x: Math.max(12, event.clientX - pointerOffsetRef.current.x),
      y: Math.max(12, event.clientY - pointerOffsetRef.current.y),
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return
    }

    dragPointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="fixed z-[260] w-[280px] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] shadow-[var(--shadow-float)] backdrop-blur"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="flex cursor-grab items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-2 active:cursor-grabbing"
        onPointerDown={beginDrag}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Dev Debug</p>
          <p className="text-xs text-[var(--text-tertiary)]">runtime diagnostics</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</p>
              <p className="mt-1 truncate text-xs text-[var(--text-primary)]">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
