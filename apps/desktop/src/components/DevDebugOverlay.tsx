import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getStageMetadataCacheStats } from '../lib/app/eventStageShared'
import { canUseDesktopHost, clearFileCache, getDesktopCacheStats, getFileCacheStats, type FileCacheStats } from '../lib/desktop'
import { getMapViewportCacheStats } from '../lib/mapViewportCache'
import type { WorkspaceMode } from '../lib/editor-shell'

type DevDebugOverlayProps = {
  workspaceMode: WorkspaceMode
  mapName: string | null
  eventName: string | null
  currentEventCommandId: string | null
  actorCount: number
}

type CacheStats = {
  desktop: ReturnType<typeof getDesktopCacheStats>
  stage: ReturnType<typeof getStageMetadataCacheStats>
  viewport: ReturnType<typeof getMapViewportCacheStats>
}

type MetricItem = [string, string]

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(value >= 100 * 1024 ? 0 : 1)} KB`
  }

  return `${value} B`
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
  const [clearing, setClearing] = useState(false)
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    desktop: getDesktopCacheStats(),
    stage: getStageMetadataCacheStats(),
    viewport: getMapViewportCacheStats(),
  })
  const [fileCacheStats, setFileCacheStats] = useState<FileCacheStats | null>(null)
  const pointerOffsetRef = useRef({ x: 0, y: 0 })
  const dragPointerIdRef = useRef<number | null>(null)
  const { fps, frameTimeMs } = useFps()
  const desktopHost = canUseDesktopHost()

  useEffect(() => {
    let disposed = false

    const updateStats = async () => {
      setCacheStats({
        desktop: getDesktopCacheStats(),
        stage: getStageMetadataCacheStats(),
        viewport: getMapViewportCacheStats(),
      })

      if (!desktopHost) {
        if (!disposed) {
          setFileCacheStats(null)
        }
        return
      }

      try {
        const nextStats = await getFileCacheStats()
        if (!disposed) {
          setFileCacheStats(nextStats)
        }
      } catch {
        if (!disposed) {
          setFileCacheStats(null)
        }
      }
    }

    void updateStats()
    const interval = window.setInterval(() => {
      void updateStats()
    }, 1000)

    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [desktopHost])

  const runtimeMetrics = useMemo(
    (): MetricItem[] => [
      ['FPS', fps ? String(fps) : '...'],
      ['Frame', `${frameTimeMs.toFixed(1)} ms`],
      ['DPR', window.devicePixelRatio.toFixed(2)],
      ['Viewport', `${window.innerWidth}x${window.innerHeight}`],
      ['Mode', workspaceMode],
    ],
    [fps, frameTimeMs, workspaceMode],
  )

  const contextMetrics = useMemo(() => {
    if (workspaceMode === 'map') {
      return [
        ['Map', mapName ?? 'n/a'],
        ['Viewport Cache', `${cacheStats.viewport.images} loaded / ${cacheStats.viewport.pendingImages} pending`],
        [
          'Desktop Requests',
          `${cacheStats.desktop.scanMaps + cacheStats.desktop.mapAsset + cacheStats.desktop.textAsset + cacheStats.desktop.imageDataUrl}`,
        ],
      ] as MetricItem[]
    }

    if (workspaceMode === 'events') {
      return [
        ['Event', eventName ?? 'n/a'],
        ['Command', currentEventCommandId ?? 'n/a'],
        ['Actors', String(actorCount)],
        ['Stage Cache', `${cacheStats.stage.hat + cacheStats.stage.hair} entries`],
        ['Viewport Cache', `${cacheStats.viewport.images} loaded / ${cacheStats.viewport.pendingImages} pending`],
      ] as MetricItem[]
    }

    return [['Context', 'No workspace-specific stats']] as MetricItem[]
  }, [
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
    mapName,
    workspaceMode,
  ])

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

  const handleClearFileCache = async () => {
    if (!desktopHost || clearing) {
      return
    }

    setClearing(true)
    setClearMessage(null)
    try {
      await clearFileCache()
      const nextStats = await getFileCacheStats()
      setFileCacheStats(nextStats)
      setClearMessage('File cache cleared')
    } catch (error) {
      setClearMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setClearing(false)
    }
  }

  const renderMetricGrid = (items: MetricItem[]) => (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-primary)]">{value}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="fixed z-[260] w-[300px] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] shadow-[var(--shadow-float)] backdrop-blur"
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
          <p className="text-xs text-[var(--text-tertiary)]">workspace diagnostics</p>
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
        <div className="space-y-3 px-3 py-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Runtime</p>
            {renderMetricGrid(runtimeMetrics)}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Workspace</p>
            {renderMetricGrid(contextMetrics)}
          </div>

          {desktopHost ? (
            <div className="rounded-xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">File Cache</p>
                  <p className="mt-1 text-xs text-[var(--text-primary)]">
                    {fileCacheStats ? `${fileCacheStats.entryCount} entries / ${formatBytes(fileCacheStats.totalSizeBytes)}` : 'Loading...'}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleClearFileCache()}
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
              <p className="mt-2 break-all text-[11px] text-[var(--text-tertiary)]">{fileCacheStats?.rootPath ?? 'n/a'}</p>
              {clearMessage ? <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{clearMessage}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
