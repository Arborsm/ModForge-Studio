import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getStageMetadataCacheStats } from '@entities/event'
import { getGameAssetCacheStats } from '@entities/game/api'
import { getModApiCacheStats } from '@entities/mod/api'
import { clearFileCache, canUseDesktopHost, getFileCacheStats, printHostRuntimeDiagnostics, type FileCacheStats } from '@platform/host'
import { getMapViewportCacheStats } from '@shared/lib/maps'
import type { WorkspaceMode } from '@locales/api'
import { formatBytes } from '@shared/lib/formatting'

type DebugOverlayMode = WorkspaceMode | 'launcher'

type DevDebugOverlayProps = {
  workspaceMode: DebugOverlayMode
  mapName: string | null
  eventName: string | null
  currentEventCommandId: string | null
  actorCount: number
  contextSectionLabel?: string
  contextMetrics?: MetricItem[]
}

type CacheStats = {
  desktop: ReturnType<typeof getDesktopCacheStats>
  stage: ReturnType<typeof getStageMetadataCacheStats>
  viewport: ReturnType<typeof getMapViewportCacheStats>
}

type MetricItem = [string, string]

const devDebugOverlayInsetPx = 12
const fallbackTitlebarHeightPx = 57
const fallbackInitialDevDebugOverlayTopPx = 84

function getAppTitlebarHeightPx() {
  if (typeof window === 'undefined') {
    return fallbackTitlebarHeightPx
  }

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue('--app-titlebar-height').trim()
  const parsedValue = Number.parseFloat(rawValue)
  return Number.isFinite(parsedValue) ? parsedValue : fallbackTitlebarHeightPx
}

function getMinDevDebugOverlayY() {
  return getAppTitlebarHeightPx() + devDebugOverlayInsetPx
}

function createInitialDevDebugOverlayPosition() {
  return {
    x: 20,
    y: Math.max(fallbackInitialDevDebugOverlayTopPx, getMinDevDebugOverlayY()),
  }
}

function createCacheStatsSnapshot(): CacheStats {
  return {
    desktop: getDesktopCacheStats(),
    stage: getStageMetadataCacheStats(),
    viewport: getMapViewportCacheStats(),
  }
}

const debugOverlayPrecision = (_size: number, value: number, unit: string) => {
  if (unit === 'MB') {
    return value >= 100 * 1024 * 1024 ? 0 : 1
  }

  if (unit === 'KB') {
    return value >= 100 * 1024 ? 0 : 1
  }

  return 1
}

function getDesktopCacheStats() {
  return {
    ...getGameAssetCacheStats(),
    ...getModApiCacheStats(),
  }
}

function formatOverlayBytes(value: number) {
  return formatBytes(value, { decimals: debugOverlayPrecision })
}

function useFps() {
  const [fps, setFps] = useState(0)
  const [frameTimeMs, setFrameTimeMs] = useState(0)

  useEffect(() => {
    let frameId = 0
    let lastTime = performance.now()
    let lastSample = lastTime
    let frameCount = 0
    let latestFrameTimeMs = 0

    const tick = (now: number) => {
      frameCount += 1
      latestFrameTimeMs = now - lastTime
      lastTime = now

      if (now - lastSample >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - lastSample)))
        setFrameTimeMs(latestFrameTimeMs)
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
  contextSectionLabel = 'Workspace',
  contextMetrics: externalContextMetrics,
}: DevDebugOverlayProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState(createInitialDevDebugOverlayPosition)
  const [clearing, setClearing] = useState(false)
  const [refreshingFileCache, setRefreshingFileCache] = useState(false)
  const [printingHostRuntime, setPrintingHostRuntime] = useState(false)
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats>(() => createCacheStatsSnapshot())
  const [fileCacheStats, setFileCacheStats] = useState<FileCacheStats | null>(null)
  const pointerOffsetRef = useRef({ x: 0, y: 0 })
  const dragPointerIdRef = useRef<number | null>(null)
  const dragHandleRef = useRef<HTMLDivElement | null>(null)
  const { fps, frameTimeMs } = useFps()
  const desktopHost = canUseDesktopHost()

  useEffect(() => {
    let disposed = false

    setCacheStats(createCacheStatsSnapshot())

    const loadInitialFileCacheStats = async () => {
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

    void loadInitialFileCacheStats()

    return () => {
      disposed = true
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
    if (externalContextMetrics?.length) {
      return externalContextMetrics
    }

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
    externalContextMetrics,
    mapName,
    workspaceMode,
  ])

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragPointerIdRef.current = event.pointerId
    dragHandleRef.current = event.currentTarget
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
      x: Math.max(devDebugOverlayInsetPx, event.clientX - pointerOffsetRef.current.x),
      y: Math.max(getMinDevDebugOverlayY(), event.clientY - pointerOffsetRef.current.y),
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return
    }

    dragPointerIdRef.current = null
    if (dragHandleRef.current?.hasPointerCapture(event.pointerId)) {
      dragHandleRef.current.releasePointerCapture(event.pointerId)
    }
    dragHandleRef.current = null
  }

  const handleClearFileCache = async () => {
    if (!desktopHost || clearing || refreshingFileCache) {
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

  const handleRefreshFileCache = async () => {
    if (!desktopHost || refreshingFileCache || clearing) {
      return
    }

    setRefreshingFileCache(true)
    setClearMessage(null)
    setCacheStats(createCacheStatsSnapshot())
    try {
      const nextStats = await getFileCacheStats()
      setFileCacheStats(nextStats)
    } catch (error) {
      setFileCacheStats(null)
      setClearMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setRefreshingFileCache(false)
    }
  }

  const handlePrintHostRuntimeDiagnostics = async () => {
    if (!desktopHost || printingHostRuntime) {
      return
    }

    setPrintingHostRuntime(true)
    try {
      await printHostRuntimeDiagnostics()
    } finally {
      setPrintingHostRuntime(false)
    }
  }

  const renderMetricGrid = (items: MetricItem[]) => (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-2.5 py-2"
        >
          <p className="text-[10px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">{label}</p>
          <p className="mt-1 truncate text-xs text-(--text-primary)">{value}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div
      data-testid="app-debug-overlay"
      className="fixed z-260 w-75 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] shadow-(--shadow-float) backdrop-blur"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="flex items-center justify-between gap-3 border-b border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-2">
        <div className="flex-1 cursor-grab select-none active:cursor-grabbing" onPointerDown={beginDrag}>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">Dev Debug</p>
          <p className="text-xs text-(--text-tertiary)">workspace diagnostics</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-(--border-color) px-2 py-1 text-[11px] text-(--text-secondary)"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed ? (
        <div className="space-y-3 px-3 py-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">Runtime</p>
            {renderMetricGrid(runtimeMetrics)}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">{contextSectionLabel}</p>
            {renderMetricGrid(contextMetrics)}
          </div>

          {desktopHost ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">Host Runtime</p>
                    <p className="mt-1 text-xs text-(--text-primary)">Print scheduler snapshot to host log</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-(--border-color) px-2 py-1 text-[11px] text-(--text-secondary) disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handlePrintHostRuntimeDiagnostics()}
                    disabled={printingHostRuntime}
                  >
                    {printingHostRuntime ? 'Printing...' : 'Output'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel)_74%,transparent)] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">File Cache</p>
                    <p className="mt-1 text-xs text-(--text-primary)">
                      {fileCacheStats
                        ? `${fileCacheStats.entryCount} entries / ${formatOverlayBytes(fileCacheStats.totalSizeBytes)}`
                        : 'Loading...'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-(--border-color) px-2 py-1 text-[11px] text-(--text-secondary) disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleRefreshFileCache()}
                      disabled={refreshingFileCache || clearing}
                    >
                      {refreshingFileCache ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-(--border-color) px-2 py-1 text-[11px] text-(--text-secondary) disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleClearFileCache()}
                      disabled={clearing || refreshingFileCache}
                    >
                      {clearing ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] break-all text-(--text-tertiary)">{fileCacheStats?.rootPath ?? 'n/a'}</p>
                {clearMessage ? <p className="mt-2 text-[11px] text-(--text-secondary)">{clearMessage}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
