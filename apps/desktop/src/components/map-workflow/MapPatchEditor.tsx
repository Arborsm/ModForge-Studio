import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Crosshair, Hammer } from 'lucide-react'
import { BuildAssetDialog } from '../generated-project/BuildAssetDialog'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import type { MapDocument } from '../../lib/maps/types'
import type { TileHoverInfo } from '../MapViewport'
import { loadMapAsset } from '../../lib/desktop'
import { MapViewport } from '../MapViewport'

interface MapPatchEditorProps {
  patch: DraftPatch
  draft: GeneratedProjectDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset?: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
}

type MapEditorTab = 'properties' | 'warps' | 'tiles' | 'file'

type Area = {
  x: number | string
  y: number | string
  width: number | string
  height: number | string
}

export function MapPatchEditor({
  patch,
  draft,
  onPatchChange,
  onAddVirtualAsset,
  locale = 'en-US',
  theme = 'dark',
  accentColor = '#6366f1',
  viewportLabels = {} as ViewportLabels,
}: MapPatchEditorProps) {
  void draft // reserved for future use
  void onAddVirtualAsset // reserved for BuildAssetDialog integration
  const [activeTab, setActiveTab] = useState<MapEditorTab>('properties')
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const properties = (editorState['properties'] as Record<string, unknown> | undefined) ?? {}
  const warps = (editorState['warps'] as Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }> | undefined) ?? []
  const npcWarps = (editorState['npcWarps'] as Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }> | undefined) ?? []
  const mapTiles = (editorState['mapTiles'] as Array<MapTileEdit> | undefined) ?? []
  const patchMode = (editorState['patchMode'] as string | undefined) ?? 'ReplaceByLayer'
  const fromArea = (editorState['fromArea'] as Area | undefined) ?? null
  const toArea = (editorState['toArea'] as Area | undefined) ?? null

  // Tiles tab state
  const gameRootPath = draft.projectMetadata.gameRootPath
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [buildDialogOpen, setBuildDialogOpen] = useState(false)

  // Load target map for tiles tab
  useEffect(() => {
    if (activeTab !== 'tiles' || !gameRootPath) {
      setMapDocument(null)
      setMapError(null)
      return
    }

    setMapLoading(true)
    setMapError(null)

    let cancelled = false

    void (async () => {
      try {
        // Extract map name from target, e.g. "Maps/Town" -> "Town"
        const targetParts = patch.target.split('/')
        const mapName = targetParts[targetParts.length - 1] ?? patch.target

        // Try loading in order of preference: .xnb, .tbin, .tmx
        const extensions = ['.xnb', '.tbin', '.tmx']
        let lastError: Error | null = null
        let loadedAsset: Awaited<ReturnType<typeof loadMapAsset>> | null = null

        for (const ext of extensions) {
          const mapPath = `${gameRootPath}/Content/Maps/${mapName}${ext}`
          try {
            loadedAsset = await loadMapAsset(gameRootPath, mapPath, locale)
            if (!cancelled) break
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
          }
        }

        if (cancelled) return

        if (loadedAsset) {
          if (loadedAsset.format === 'xnb' || loadedAsset.format === 'tbin') {
            const doc = JSON.parse(loadedAsset.content) as MapDocument
            setMapDocument(doc)
          } else {
            setMapError(`Format ${loadedAsset.format} not yet supported for tile editing.`)
          }
        } else if (lastError) {
          setMapError(lastError.message)
        } else {
          setMapError(`Unable to load map for target "${patch.target}".`)
        }
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTab, gameRootPath, patch.target, locale])

  const visibleLayerIds = useMemo(
    () => mapDocument?.layers.map((l) => l.id) ?? [],
    [mapDocument],
  )

  function updateEditorState(updates: Record<string, unknown>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, ...updates },
    })
  }

  function updateArea(areaType: 'fromArea' | 'toArea', field: keyof Area, raw: string) {
    const current = areaType === 'fromArea' ? fromArea : toArea
    const next: Area = current ? { ...current } : { x: 0, y: 0, width: 0, height: 0 }
    const num = Number(raw)
    next[field] = Number.isNaN(num) ? raw : num
    updateEditorState({ [areaType]: next })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">{patch.target}</span>
        <span className="ml-2 text-[10px] text-[var(--text-secondary)]">({patch.action})</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-1">
        {(['properties', 'warps', 'tiles', 'file'] as MapEditorTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              activeTab === tab
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'properties' ? 'MapProperties' : tab === 'warps' ? 'Warps' : tab === 'tiles' ? 'Tiles' : 'FromFile'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'properties' ? (
          <div className="p-3">
            <MapPropertiesEditor
              properties={properties}
              onChange={(newProps) => updateEditorState({ properties: newProps })}
            />
          </div>
        ) : activeTab === 'warps' ? (
          <div className="space-y-4 p-3">
            <MapWarpsEditor
              title="Player Warps"
              description="Add warp points to teleport players (AddWarps)"
              warps={warps}
              onChange={(newWarps) => updateEditorState({ warps: newWarps })}
            />
            <MapWarpsEditor
              title="NPC Warps"
              description="Add warp points for NPC pathfinding (AddNpcWarps)"
              warps={npcWarps}
              onChange={(newWarps) => updateEditorState({ npcWarps: newWarps })}
            />
          </div>
        ) : activeTab === 'tiles' ? (
          <MapTilesEditor
            mapDocument={mapDocument}
            mapLoading={mapLoading}
            mapError={mapError}
            hoverInfo={hoverInfo}
            onHoverChange={setHoverInfo}
            visibleLayerIds={visibleLayerIds}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            viewportLabels={viewportLabels}
            gameRootPath={gameRootPath}
            onBuildAsset={() =>
              setBuildDialogOpen(true)
            }
            mapTiles={mapTiles}
            onMapTilesChange={(tiles) => updateEditorState({ mapTiles: tiles })}
          />
        ) : (
          <div className="space-y-4 p-3">
            {/* FromFile */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                FromFile
              </label>
              <input
                type="text"
                placeholder="assets/CustomMap.tbin"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={patch.fromFile ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim()
                  onPatchChange(patch.id, { fromFile: val || undefined })
                }}
              />
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                Path to a .tbin, .tmx, or .xnb map file to overlay onto the target.
              </p>
            </div>

            {/* PatchMode */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Patch Mode
              </label>
              <select
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={patchMode}
                onChange={(e) => updateEditorState({ patchMode: e.target.value })}
              >
                <option value="ReplaceByLayer">ReplaceByLayer</option>
                <option value="Overlay">Overlay</option>
                <option value="Replace">Replace</option>
              </select>
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                ReplaceByLayer: replace matching layers. Overlay: merge layers. Replace: replace entire map.
              </p>
            </div>

            {/* FromArea */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                From Area (Source Crop)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <div key={field}>
                    <span className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field}</span>
                    <input
                      type="text"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={fromArea?.[field] ?? ''}
                      placeholder="0"
                      onChange={(e) => updateArea('fromArea', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                Crop region from the source map. Numbers or tokens like {'{{X}}'}.
              </p>
            </div>

            {/* ToArea */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                To Area (Target Position)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <div key={field}>
                    <span className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field}</span>
                    <input
                      type="text"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={toArea?.[field] ?? ''}
                      placeholder="0"
                      onChange={(e) => updateArea('toArea', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                Position on the target map. Numbers or tokens like {'{{X}}'}.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Build Asset Dialog */}
      {buildDialogOpen && mapDocument && (
        <BuildAssetDialog
          open={buildDialogOpen}
          mapDocument={mapDocument}
          targetMapName={patch.target.split('/').pop() ?? patch.target}
          onClose={() => setBuildDialogOpen(false)}
          onAssetBuilt={(asset) => {
            onAddVirtualAsset(asset)
            onPatchChange(patch.id, { fromFile: asset.relativePath })
          }}
        />
      )}
    </div>
  )
}

function MapPropertiesEditor({
  properties,
  onChange,
}: {
  properties: Record<string, unknown>
  onChange: (props: Record<string, unknown>) => void
}) {
  const [entries, setEntries] = useState<Array<{ key: string; value: string }>>(() => {
    return Object.entries(properties).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
  })

  function syncToParent(newEntries: Array<{ key: string; value: string }>) {
    const props: Record<string, unknown> = {}
    for (const e of newEntries) {
      if (!e.key.trim()) continue
      // Try parse as JSON, fallback to string
      try {
        props[e.key.trim()] = JSON.parse(e.value)
      } catch {
        props[e.key.trim()] = e.value
      }
    }
    onChange(props)
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-[var(--text-secondary)]">Edit map properties (Music, Outdoors, Warp, etc.)</p>
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Property"
            className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            value={entry.key}
            onChange={(e) => {
              const next = [...entries]
              next[index] = { ...entry, key: e.target.value }
              setEntries(next)
              syncToParent(next)
            }}
          />
          <input
            type="text"
            placeholder="Value"
            className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            value={entry.value}
            onChange={(e) => {
              const next = [...entries]
              next[index] = { ...entry, value: e.target.value }
              setEntries(next)
              syncToParent(next)
            }}
          />
          <button
            type="button"
            className="icon-button h-7 w-7 shrink-0 text-red-400"
            onClick={() => {
              const next = entries.filter((_, i) => i !== index)
              setEntries(next)
              syncToParent(next)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        onClick={() => {
          const next = [...entries, { key: '', value: '' }]
          setEntries(next)
        }}
      >
        <Plus className="h-3 w-3" /> Add property
      </button>
    </div>
  )
}

function MapWarpsEditor({
  title,
  description,
  warps,
  onChange,
}: {
  title: string
  description: string
  warps: Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }>
  onChange: (warps: Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }>) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{title}</div>
      <p className="text-[10px] text-[var(--text-secondary)]">{description}</p>
      {warps.map((warp, index) => (
        <div key={index} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2">
          <div className="grid grid-cols-5 gap-1.5 flex-1">
            {(['fromX', 'fromY', 'toMap', 'toX', 'toY'] as const).map((field) => (
              <div key={field}>
                <span className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field}</span>
                <input
                  type={field === 'toMap' ? 'text' : 'number'}
                  className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={warp[field]}
                  onChange={(e) => {
                    const next = [...warps]
                    next[index] = {
                      ...warp,
                      [field]: field === 'toMap' ? e.target.value : Number(e.target.value),
                    }
                    onChange(next)
                  }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="icon-button h-7 w-7 shrink-0 self-end text-red-400"
            onClick={() => onChange(warps.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        onClick={() =>
          onChange([...warps, { fromX: 0, fromY: 0, toMap: '', toX: 0, toY: 0 }])
        }
      >
        <Plus className="h-3 w-3" /> Add warp
      </button>
    </div>
  )
}

interface MapTileEdit {
  layer: string
  x: number
  y: number
  setTilesheet?: string
  setIndex?: number | string
  remove?: boolean
  setProperties?: Record<string, string>
}

function MapTilesEditor({
  mapDocument,
  mapLoading,
  mapError,
  hoverInfo,
  onHoverChange,
  visibleLayerIds,
  locale,
  theme,
  accentColor,
  viewportLabels,
  gameRootPath,
  onBuildAsset,
  mapTiles,
  onMapTilesChange,
}: {
  mapDocument: MapDocument | null
  mapLoading: boolean
  mapError: string | null
  hoverInfo: TileHoverInfo | null
  onHoverChange: (info: TileHoverInfo | null) => void
  visibleLayerIds: number[]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  viewportLabels: ViewportLabels
  gameRootPath: string | null
  onBuildAsset: () => void
  mapTiles: MapTileEdit[]
  onMapTilesChange: (tiles: MapTileEdit[]) => void
}) {
  if (!gameRootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-xs">No game root path configured.</p>
        <p className="text-[10px]">Set the game directory in draft settings to load the map.</p>
      </div>
    )
  }

  if (mapLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Loading map...
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-sm text-red-400">{mapError}</p>
      </div>
    )
  }

  if (!mapDocument) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-xs">Unable to load map for preview.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Map Viewport */}
      <div className="min-h-0 flex-1">
        <MapViewport
          locale={locale}
          mapDocument={mapDocument}
          visibleLayerIds={visibleLayerIds}
          visibleObjectGroupIds={[]}
          labels={viewportLabels}
          theme={theme}
          accentColor={accentColor}
          showGrid={true}
          showStatsChips={false}
          contextMenuEnabled={false}
          onHoverChange={onHoverChange}
        />
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
          {hoverInfo ? (
            <>
              <span className="text-[var(--text-primary)]">Tile: ({hoverInfo.tileX}, {hoverInfo.tileY})</span>
              {hoverInfo.layerName && <span>Layer: {hoverInfo.layerName}</span>}
              {hoverInfo.tilesetName && <span>Tileset: {hoverInfo.tilesetName}</span>}
              {hoverInfo.tileId != null && <span>GID: {hoverInfo.tileId}</span>}
            </>
          ) : (
            <span>Hover over the map to see tile details.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hoverInfo?.layerName && (
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
              onClick={() => {
                onMapTilesChange([
                  ...mapTiles,
                  {
                    layer: hoverInfo.layerName || 'Back',
                    x: hoverInfo.tileX,
                    y: hoverInfo.tileY,
                    setTilesheet: hoverInfo.tilesetName ?? undefined,
                    setIndex: hoverInfo.tileId ?? undefined,
                  },
                ])
              }}
            >
              <Plus className="h-3 w-3" /> Add Tile Edit
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90"
            onClick={onBuildAsset}
          >
            <Hammer className="h-3 w-3" /> Build Asset
          </button>
        </div>
      </div>

      {/* MapTiles Editor */}
      {mapTiles.length > 0 && (
        <div className="shrink-0 max-h-[180px] overflow-auto border-t border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            MapTiles Edits ({mapTiles.length})
          </div>
          <div className="space-y-1.5">
            {mapTiles.map((tile, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5"
              >
                <input
                  type="text"
                  placeholder="Layer"
                  className="w-20 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.layer}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, layer: e.target.value }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="number"
                  placeholder="X"
                  className="w-12 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.x}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, x: Number(e.target.value) }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="number"
                  placeholder="Y"
                  className="w-12 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.y}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, y: Number(e.target.value) }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="text"
                  placeholder="Tilesheet"
                  className="w-20 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.setTilesheet ?? ''}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    const val = e.target.value.trim()
                    next[index] = { ...tile, setTilesheet: val || undefined }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="text"
                  placeholder="Index"
                  className="w-14 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.setIndex ?? ''}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    const val = e.target.value.trim()
                    if (!val) {
                      const { setIndex, ...rest } = tile
                      void setIndex
                      next[index] = rest
                    } else {
                      const num = Number(val)
                      next[index] = { ...tile, setIndex: Number.isNaN(num) ? val : num }
                    }
                    onMapTilesChange(next)
                  }}
                />
                <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={tile.remove ?? false}
                    onChange={(e) => {
                      const next = [...mapTiles]
                      next[index] = { ...tile, remove: e.target.checked || undefined }
                      onMapTilesChange(next)
                    }}
                  />
                  Remove
                </label>
                <input
                  type="text"
                  placeholder="Props (key=value,...)"
                  className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={tile.setProperties ? Object.entries(tile.setProperties).map(([k, v]) => `${k}=${v}`).join(', ') : ''}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    const text = e.target.value.trim()
                    if (!text) {
                      const { setProperties, ...rest } = tile
                      void setProperties
                      next[index] = rest
                    } else {
                      const props: Record<string, string> = {}
                      for (const part of text.split(',')) {
                        const [k, ...vParts] = part.split('=')
                        if (k?.trim()) {
                          props[k.trim()] = vParts.join('=').trim()
                        }
                      }
                      next[index] = { ...tile, setProperties: props }
                    }
                    onMapTilesChange(next)
                  }}
                />
                <button
                  type="button"
                  className="icon-button h-5 w-5 shrink-0 text-red-400"
                  onClick={() => onMapTilesChange(mapTiles.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
