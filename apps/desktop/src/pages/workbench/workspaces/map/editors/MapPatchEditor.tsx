import { useEffect, useId, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Crosshair, Hammer, Loader2, Plus, Trash2 } from 'lucide-react'
import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import type { VirtualPreviewAsset } from '@features/cp-maker'
import type { TileHoverInfo } from '@entities/map'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import type { MapDocument } from '@entities/map'
import { loadMapAsset } from '@entities/game/api'
import { buildCpMakerMapAsset } from '@features/cp-maker/api'
import { MapViewport } from '@entities/map'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

interface MapPatchEditorProps {
  patch: DraftPatch
  draft: CpMakerDraft
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

type LoadedMapState = {
  key: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  document: MapDocument | null
  error: string | null
}

export function MapPatchEditor({
  patch,
  draft,
  onPatchChange,
  onAddVirtualAsset,
  locale = 'en-US',
  theme = 'dark',
  accentColor = 'var(--accent)',
  viewportLabels = {} as ViewportLabels,
}: MapPatchEditorProps) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const [activeTab, setActiveTab] = useState<MapEditorTab>('properties')
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const properties = (editorState['properties'] as Record<string, unknown> | undefined) ?? {}
  const warps = (editorState['warps'] as Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }> | undefined) ?? []
  const npcWarps =
    (editorState['npcWarps'] as Array<{ fromX: number; fromY: number; toMap: string; toX: number; toY: number }> | undefined) ?? []
  const mapTiles = (editorState['mapTiles'] as Array<MapTileEdit> | undefined) ?? []
  const patchMode = (editorState['patchMode'] as string | undefined) ?? 'ReplaceByLayer'
  const fromArea = (editorState['fromArea'] as Area | undefined) ?? null
  const toArea = (editorState['toArea'] as Area | undefined) ?? null

  // Tiles tab state
  const gameRootPath = draft.projectMetadata.gameRootPath
  const mapLoadKey = `${activeTab}:${gameRootPath ?? ''}:${patch.target}:${locale}`
  const [loadedMapState, setLoadedMapState] = useState<LoadedMapState>({
    key: mapLoadKey,
    status: activeTab === 'tiles' && gameRootPath ? 'loading' : 'idle',
    document: null,
    error: null,
  })
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [buildDialogOpen, setBuildDialogOpen] = useState(false)

  // Load target map for tiles tab
  useEffect(() => {
    if (activeTab !== 'tiles' || !gameRootPath) {
      return
    }

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
            setLoadedMapState({ key: mapLoadKey, status: 'ready', document: doc, error: null })
          } else {
            setLoadedMapState({
              key: mapLoadKey,
              status: 'error',
              document: null,
              error: copy.unsupportedFormat(loadedAsset.format),
            })
          }
        } else if (lastError) {
          setLoadedMapState({ key: mapLoadKey, status: 'error', document: null, error: lastError.message })
        } else {
          setLoadedMapState({
            key: mapLoadKey,
            status: 'error',
            document: null,
            error: copy.unableToLoadTarget(patch.target),
          })
        }
      } catch (err) {
        if (!cancelled) {
          setLoadedMapState({
            key: mapLoadKey,
            status: 'error',
            document: null,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTab, gameRootPath, patch.target, locale, mapLoadKey, copy])

  const currentMapState =
    loadedMapState.key === mapLoadKey
      ? loadedMapState
      : {
          key: mapLoadKey,
          status: activeTab === 'tiles' && gameRootPath ? ('loading' as const) : ('idle' as const),
          document: null,
          error: null,
        }
  const mapDocument = currentMapState.document
  const mapLoading = currentMapState.status === 'loading'
  const mapError = currentMapState.error

  const visibleLayerIds = useMemo(() => mapDocument?.layers.map((l) => l.id) ?? [], [mapDocument])

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
      <div className="flex items-center border-b border-(--border-color) px-3 py-2">
        <span className="text-xs font-medium text-(--text-primary)">{patch.target}</span>
        <span className="ml-2 text-[10px] text-(--text-secondary)">({patch.action})</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-(--border-color) bg-(--bg-panel-muted) px-2 py-1">
        {(['properties', 'warps', 'tiles', 'file'] as MapEditorTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              activeTab === tab ? 'bg-(--bg-active) text-(--text-primary)' : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {copy.tabs[tab]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'properties' ? (
          <div className="p-3">
            <MapPropertiesEditor properties={properties} onChange={(newProps) => updateEditorState({ properties: newProps })} />
          </div>
        ) : activeTab === 'warps' ? (
          <div className="space-y-4 p-3">
            <MapWarpsEditor
              title={copy.playerWarps}
              description={copy.playerWarpsDescription}
              warps={warps}
              onChange={(newWarps) => updateEditorState({ warps: newWarps })}
            />
            <MapWarpsEditor
              title={copy.npcWarps}
              description={copy.npcWarpsDescription}
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
            onBuildAsset={() => setBuildDialogOpen(true)}
            mapTiles={mapTiles}
            onMapTilesChange={(tiles) => updateEditorState({ mapTiles: tiles })}
          />
        ) : (
          <div className="space-y-4 p-3">
            {/* FromFile */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                {copy.fromFile}
              </label>
              <input
                type="text"
                placeholder={copy.fromFilePlaceholder}
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={patch.fromFile ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim()
                  onPatchChange(patch.id, { fromFile: val || undefined })
                }}
              />
              <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.fromFileDescription}</p>
            </div>

            {/* PatchMode */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                {copy.patchMode}
              </label>
              <select
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={patchMode}
                onChange={(e) => updateEditorState({ patchMode: e.target.value })}
              >
                <option value="ReplaceByLayer">{copy.modeLabels.ReplaceByLayer}</option>
                <option value="Overlay">{copy.modeLabels.Overlay}</option>
                <option value="Replace">{copy.modeLabels.Replace}</option>
              </select>
              <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.modeDescription}</p>
            </div>

            {/* FromArea */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                {copy.fromArea}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <div key={field}>
                    <span className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field}</span>
                    <input
                      type="text"
                      className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                      value={fromArea?.[field] ?? ''}
                      placeholder="0"
                      onChange={(e) => updateArea('fromArea', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.fromAreaDescription}</p>
            </div>

            {/* ToArea */}
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                {copy.toArea}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <div key={field}>
                    <span className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field}</span>
                    <input
                      type="text"
                      className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                      value={toArea?.[field] ?? ''}
                      placeholder="0"
                      onChange={(e) => updateArea('toArea', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.toAreaDescription}</p>
            </div>
          </div>
        )}
      </div>

      {buildDialogOpen && mapDocument && (
        <BuildAssetDialog
          key={mapLoadKey}
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

type BuildAssetDialogProps = {
  mapDocument: unknown
  targetMapName: string
  onClose: () => void
  onAssetBuilt: (asset: VirtualPreviewAsset) => void
}

type BuildState =
  | { phase: 'building'; message: string }
  | { phase: 'done'; asset: VirtualPreviewAsset }
  | { phase: 'error'; message: string }

function BuildAssetDialog({ mapDocument, targetMapName, onClose, onAssetBuilt }: BuildAssetDialogProps) {
  const copy = useEditorCopy().buildAssetDialog
  const titleId = useId()
  const [buildState, setBuildState] = useState<BuildState>({
    phase: 'building',
    message: copy.buildingMessage,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const relativePath = `assets/maps/${targetMapName.replace(/\//g, '_')}.tbin`
        const asset = await buildCpMakerMapAsset({
          relative_path: relativePath,
          map_document: mapDocument,
        })

        if (cancelled) {
          return
        }

        setBuildState({ phase: 'done', asset })
        onAssetBuilt(asset)
      } catch (error) {
        if (cancelled) {
          return
        }

        setBuildState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mapDocument, onAssetBuilt, targetMapName, copy.buildingMessage])

  const building = buildState.phase === 'building'
  const handleClose = () => {
    if (building) {
      return
    }
    onClose()
  }

  return (
    <Dialog open onClose={handleClose} size="sm" labelledBy={titleId} closeOnBackdrop={!building} closeOnEscape={!building}>
      <DialogHeader
        title={copy.title}
        icon={<Hammer className="h-4 w-4" />}
        onClose={handleClose}
        closeLabel={copy.closeAction}
        closeDisabled={building}
        id={titleId}
      />
      <DialogBody>
        {buildState.phase === 'building' ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-(--accent)" />
            <div className="text-center">
              <p className="text-sm font-medium text-(--text-primary)">{copy.building}</p>
              <p className="mt-1 text-xs text-(--text-secondary)">{buildState.message}</p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-panel-muted)">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-(--accent)" />
            </div>
          </div>
        ) : null}

        {buildState.phase === 'done' ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-(--success)" />
            <div className="text-center">
              <p className="text-sm font-medium text-(--text-primary)">{copy.doneTitle}</p>
              <p className="mt-1 text-xs text-(--text-secondary)">{copy.doneAssetSavedAs(buildState.asset.relativePath)}</p>
              <p className="mt-0.5 text-[10px] text-(--text-secondary)">
                {copy.doneSizeKb(Math.round((buildState.asset.bytesBase64.length * 3) / 4 / 1024))}
              </p>
            </div>
          </div>
        ) : null}

        {buildState.phase === 'error' ? (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-(--danger)" />
            <div className="text-center">
              <p className="text-sm font-medium text-(--text-primary)">{copy.errorTitle}</p>
              <p className="app-dialog-error mt-1">{buildState.message}</p>
            </div>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {building ? (
          <DialogAction onClick={handleClose} disabled>
            {copy.cancelAction}
          </DialogAction>
        ) : (
          <DialogAction tone="primary" onClick={handleClose}>
            {buildState.phase === 'done' ? copy.doneAction : copy.closeAction}
          </DialogAction>
        )}
      </DialogFooter>
    </Dialog>
  )
}

function MapPropertiesEditor({
  properties,
  onChange,
}: {
  properties: Record<string, unknown>
  onChange: (props: Record<string, unknown>) => void
}) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
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
      <p className="text-[10px] text-(--text-secondary)">{copy.propertiesDescription}</p>
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={copy.propertyPlaceholder}
            className="flex-1 rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
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
            placeholder={copy.valuePlaceholder}
            className="flex-1 rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
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
            className="icon-button h-7 w-7 shrink-0 text-(--danger)"
            aria-label={copy.removeProperty}
            title={copy.removeProperty}
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
        className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
        onClick={() => {
          const next = [...entries, { key: '', value: '' }]
          setEntries(next)
        }}
      >
        <Plus className="h-3 w-3" /> {copy.addProperty}
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
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">{title}</div>
      <p className="text-[10px] text-(--text-secondary)">{description}</p>
      {warps.map((warp, index) => (
        <div key={index} className="flex items-center gap-1.5 rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-2">
          <div className="grid flex-1 grid-cols-5 gap-1.5">
            {(['fromX', 'fromY', 'toMap', 'toX', 'toY'] as const).map((field) => (
              <div key={field}>
                <span className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field}</span>
                <input
                  type={field === 'toMap' ? 'text' : 'number'}
                  className="w-full rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
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
            className="icon-button h-7 w-7 shrink-0 self-end text-(--danger)"
            aria-label={copy.removeWarp}
            title={copy.removeWarp}
            onClick={() => onChange(warps.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
        onClick={() => onChange([...warps, { fromX: 0, fromY: 0, toMap: '', toX: 0, toY: 0 }])}
      >
        <Plus className="h-3 w-3" /> {copy.addWarp}
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
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  if (!gameRootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-(--text-secondary)">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-xs">{copy.noGameRoot}</p>
        <p className="text-[10px]">{copy.noGameRootDescription}</p>
      </div>
    )
  }

  if (mapLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-(--text-secondary)">{copy.loadingMap}</div>
  }

  if (mapError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-(--text-secondary)">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-sm text-(--danger)">{mapError}</p>
      </div>
    )
  }

  if (!mapDocument) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-(--text-secondary)">
        <Crosshair className="h-8 w-8 opacity-30" />
        <p className="text-xs">{copy.unableToLoadMap}</p>
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
          theme={theme}
          accentColor={accentColor}
          showGrid={true}
          showStatsChips={false}
          contextMenuEnabled={false}
          onHoverChange={onHoverChange}
        />
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-t border-(--border-color) bg-(--bg-panel) px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] text-(--text-secondary)">
          {hoverInfo ? (
            <>
              <span className="text-(--text-primary)">{copy.tilePosition(hoverInfo.tileX, hoverInfo.tileY)}</span>
              {hoverInfo.layerName && <span>{copy.tileLayer(hoverInfo.layerName)}</span>}
              {hoverInfo.tilesetName && <span>{copy.tileTileset(hoverInfo.tilesetName)}</span>}
              {hoverInfo.tileId != null && <span>{copy.tileId(hoverInfo.tileId)}</span>}
            </>
          ) : (
            <span>{copy.hoverHint}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hoverInfo?.layerName && (
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-2 py-1 text-[10px] font-medium text-(--text-primary) hover:bg-(--bg-active)"
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
              <Plus className="h-3 w-3" /> {copy.addTileEdit}
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-(--accent) px-2.5 py-1 text-[10px] font-medium text-(--text-on-accent) hover:opacity-90"
            onClick={onBuildAsset}
          >
            <Hammer className="h-3 w-3" /> {copy.buildAsset}
          </button>
        </div>
      </div>

      {/* MapTiles Editor */}
      {mapTiles.length > 0 && (
        <div className="max-h-45 shrink-0 overflow-auto border-t border-(--border-color) bg-(--bg-panel-muted) px-3 py-2">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
            {copy.mapTileEdits(mapTiles.length)}
          </div>
          <div className="space-y-1.5">
            {mapTiles.map((tile, index) => (
              <div key={index} className="flex items-center gap-1.5 rounded border border-(--border-color) bg-(--bg-panel) p-1.5">
                <input
                  type="text"
                  placeholder={copy.tilePlaceholders.layer}
                  className="w-20 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={tile.layer}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, layer: e.target.value }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="number"
                  placeholder={copy.tilePlaceholders.x}
                  className="w-12 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={tile.x}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, x: Number(e.target.value) }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="number"
                  placeholder={copy.tilePlaceholders.y}
                  className="w-12 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={tile.y}
                  onChange={(e) => {
                    const next = [...mapTiles]
                    next[index] = { ...tile, y: Number(e.target.value) }
                    onMapTilesChange(next)
                  }}
                />
                <input
                  type="text"
                  placeholder={copy.tilePlaceholders.tilesheet}
                  className="w-20 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
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
                  placeholder={copy.tilePlaceholders.index}
                  className="w-14 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
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
                <label className="flex items-center gap-1 text-[10px] text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={tile.remove ?? false}
                    onChange={(e) => {
                      const next = [...mapTiles]
                      next[index] = { ...tile, remove: e.target.checked || undefined }
                      onMapTilesChange(next)
                    }}
                  />
                  {copy.removeTile}
                </label>
                <input
                  type="text"
                  placeholder={copy.tilePlaceholders.properties}
                  className="min-w-0 flex-1 rounded border border-(--border-color) bg-(--bg-app) px-1.5 py-0.5 text-[10px] text-(--text-primary) outline-none focus:border-(--accent)"
                  value={
                    tile.setProperties
                      ? Object.entries(tile.setProperties)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')
                      : ''
                  }
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
                  className="icon-button h-5 w-5 shrink-0 text-(--danger)"
                  aria-label={copy.removeTileEdit}
                  title={copy.removeTileEdit}
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
