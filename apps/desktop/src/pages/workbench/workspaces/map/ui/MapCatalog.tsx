import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Copy, Loader2, Map as MapIcon, Plus, Search } from 'lucide-react'
import { loadMapAsset } from '@entities/game/api'
import { loadMapThumbnail, type MapDocument } from '@entities/map'
import { WorkspacePatchList, type AssetDraftPort, type DraftPatch, type EditorResources } from '@features/cp-maker'
import { useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import {
  buildMapCatalogEntries,
  resolveGameMapPatchTarget,
  type MapCatalogCategory,
  type MapCatalogEntry,
} from '../state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../state/useMapAuthoringCatalog'
import { parseMapDocument } from '../../asset-library/model/importGameMap'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../../model/workbenchModuleContexts'

type CatalogRow =
  | { kind: 'header'; id: string; category: MapCatalogCategory; count: number }
  | { kind: 'cards'; id: string; entries: MapCatalogEntry[] }

const CATALOG_HEADER_ROW_HEIGHT_REM = 2.5
const CATALOG_CARD_ROW_HEIGHT_REM = 7.25
const CATALOG_CARD_MIN_WIDTH_REM = 16
const CATALOG_GRID_GAP_REM = 0.75

function readRootFontSize(): number {
  if (typeof document === 'undefined') return 16
  const value = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(value) && value > 0 ? value : 16
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function MapCatalogPreview({ entry, resources }: { entry: MapCatalogEntry; resources: EditorResources }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [document, setDocument] = useState<MapDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const assetPath = entry.asset.absolutePath
  const assetFormat = entry.asset.format

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [entry.id])

  useEffect(() => {
    if (!visible || document || !assetPath || !resources.gameRootPath || assetFormat === 'tmx') return
    let cancelled = false
    setFailed(false)
    void loadMapAsset(resources.gameRootPath, assetPath, resources.locale).then(
      (loaded) => {
        if (cancelled) return
        const next = parseMapDocument(loaded.content)
        setDocument(next)
        setFailed(next === null)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [assetFormat, assetPath, document, resources.gameRootPath, resources.locale, visible])

  useEffect(() => {
    if (!document) return
    let cancelled = false
    setThumbnailUrl(null)
    setFailed(false)
    void loadMapThumbnail(document, {
      cacheKey: `asset:${entry.asset.absolutePath}:${entry.asset.sizeBytes}`,
      locale: resources.locale,
      width: 240,
      height: 176,
      gameRootPath: resources.gameRootPath,
    }).then(
      (url) => {
        if (!cancelled) setThumbnailUrl(url)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [document, entry.asset, entry.id, resources.gameRootPath, resources.locale])

  return (
    <div ref={hostRef} className="map-catalog-preview" aria-hidden="true">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" />
      ) : (
        <span className={cx('map-catalog-preview-placeholder', failed && 'is-error')}>
          {visible && (document || assetFormat !== 'tmx') && !failed ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MapIcon className="h-6 w-6" />
          )}
        </span>
      )}
    </div>
  )
}

function MapCatalogCard({
  entry,
  resources,
  onOpen,
  onImportToLibrary,
}: {
  entry: MapCatalogEntry
  resources: EditorResources
  onOpen: () => void
  onImportToLibrary: () => void
}) {
  const copy = useMapAuthoringCopy()
  const format = entry.asset.format.toUpperCase()
  const size = formatBytes(entry.asset.sizeBytes)
  return (
    <article
      className="map-catalog-card"
      role="button"
      tabIndex={0}
      aria-label={copy.patchGameMap(entry.name)}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <MapCatalogPreview entry={entry} resources={resources} />
      <div className="map-catalog-card-copy">
        <strong>{entry.name}</strong>
        <span>{entry.target}</span>
      </div>
      <div className="map-catalog-card-meta">
        <span>{copy.formatValue(format, size)}</span>
        <button
          type="button"
          className="map-catalog-card-import"
          title={copy.importInAssetLibrary(entry.name)}
          aria-label={copy.importInAssetLibrary(entry.name)}
          onClick={(event) => {
            event.stopPropagation()
            onImportToLibrary()
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

/**
 * Map authoring home: two-column layout — the change manager list on the left,
 * the game-map library on the right (clicking a map creates/opens its patch).
 */
export function MapCatalog({
  draftPort,
  resources,
  onOpenPatch,
}: {
  draftPort: AssetDraftPort
  resources: EditorResources
  onOpenPatch: (patchId: string) => void
}) {
  const copy = useMapAuthoringCopy()
  const editorCopy = useEditorCopy()
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const catalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  const [query, setQuery] = useState('')
  const [sourceMode, setSourceMode] = useState<'all' | 'project' | 'vanilla'>('all')
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)
  const [rootFontSize, setRootFontSize] = useState(readRootFontSize)
  const mapWorkspacePatches = draftPort.draft.patches.filter((patch) => patch.workspace === 'map')
  const isMapChange = (patch: DraftPatch) => patch.workspace === 'map' && (patch.action === 'EditMap' || patch.action === 'Load')
  const entries = buildMapCatalogEntries(catalog.assets)
  const needle = query.trim().toLowerCase()
  const filteredWorkspacePatches = mapWorkspacePatches.filter(
    (patch) => needle === '' || `${patch.target} ${patch.logName}`.toLowerCase().includes(needle),
  )
  const visibleEntries = entries.filter(
    (entry) => needle === '' || `${entry.name} ${entry.target} ${entry.asset.relativePath}`.toLowerCase().includes(needle),
  )
  const projectTargets = new Set(
    mapWorkspacePatches
      .filter(isMapChange)
      .map((patch) => resolveGameMapPatchTarget({ target: patch.target }).toLowerCase())
      .filter((target) => target.startsWith('maps/')),
  )
  const projectEntries = visibleEntries.filter((entry) => projectTargets.has(resolveGameMapPatchTarget(entry).toLowerCase()))
  const vanillaEntries = visibleEntries.filter((entry) => !projectTargets.has(resolveGameMapPatchTarget(entry).toLowerCase()))
  const rows: CatalogRow[] = []
  const groupOrder: Array<{ id: 'project' | 'vanilla'; label: string; items: typeof visibleEntries }> = [
    { id: 'project', label: copy.projectGroup, items: projectEntries },
    { id: 'vanilla', label: copy.vanillaGroup, items: vanillaEntries },
  ]
  for (const group of groupOrder) {
    if (sourceMode !== 'all' && sourceMode !== group.id) continue
    if (group.items.length === 0) continue
    rows.push({ kind: 'header', id: `header:${group.id}`, category: 'other', count: group.items.length })
    for (let index = 0; index < group.items.length; index += columnCount) {
      rows.push({ kind: 'cards', id: `cards:${group.id}:${index}`, entries: group.items.slice(index, index + columnCount) })
    }
  }
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => gridElement,
    estimateSize: (index) => rootFontSize * (rows[index]?.kind === 'header' ? CATALOG_HEADER_ROW_HEIGHT_REM : CATALOG_CARD_ROW_HEIGHT_REM),
    overscan: 1,
  })

  useEffect(() => {
    if (!gridElement) return
    const updateLayout = () => {
      const nextRootFontSize = readRootFontSize()
      const width = gridElement.clientWidth
      const gap = CATALOG_GRID_GAP_REM * nextRootFontSize
      const cardMinWidth = CATALOG_CARD_MIN_WIDTH_REM * nextRootFontSize
      setRootFontSize(nextRootFontSize)
      setColumnCount(Math.max(1, Math.floor((width + gap) / (cardMinWidth + gap))))
    }
    const observer = new ResizeObserver(updateLayout)
    observer.observe(gridElement)
    updateLayout()
    return () => observer.disconnect()
  }, [gridElement])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rootFontSize, rowVirtualizer])

  function openEntry(entry: MapCatalogEntry) {
    // Clicking a game map means authoring changes to it: open (or reuse) the
    // EditMap patch for that target. Copying it into the asset library is the
    // secondary action on the card.
    const id = project.addPatch('map', resolveGameMapPatchTarget(entry), 'EditMap')
    onOpenPatch(id)
  }

  return (
    <WorkspaceSplitView
      sidebarLabel={editorCopy.studioDesk.patchList.regionLabel}
      mainToolbar={
        <>
          <label className="workspace-split-view-toolbar-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <input
              className="control-input"
              type="search"
              value={query}
              placeholder={copy.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="asset-source-modes" role="group">
            {(
              [
                { id: 'all', label: copy.modeAll },
                { id: 'project', label: copy.modeProject },
                { id: 'vanilla', label: copy.modeVanilla },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === sourceMode}
                className={cx('asset-source-mode', option.id === sourceMode && 'is-active')}
                onClick={() => setSourceMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="control-button control-button-primary ml-auto"
            onClick={() => environment.onOpenModule('asset-library')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.addMapAction}</span>
          </button>
        </>
      }
      sidebar={
        <WorkspacePatchList
          patches={filteredWorkspacePatches.filter(isMapChange)}
          draftPort={draftPort}
          reorderWithin={isMapChange}
          onOpenPatch={onOpenPatch}
          title={editorCopy.studioDesk.patchList.regionLabel}
        />
      }
    >
      <div ref={setGridElement} className="map-catalog-library-content custom-scrollbar">
        {catalog.loading ? (
          <div className="map-catalog-state is-compact">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>{copy.loading}</p>
          </div>
        ) : null}
        {catalog.error ? (
          <div className="map-catalog-state is-compact is-error">
            <AlertCircle className="h-6 w-6" />
            <p>{copy.loadFailed}</p>
            <span>{catalog.error}</span>
          </div>
        ) : null}
        {!catalog.loading && visibleEntries.length === 0 ? (
          <div className="map-catalog-state is-compact">
            <MapIcon className="h-8 w-8" />
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyHint}</p>
          </div>
        ) : null}
        {rows.length > 0 ? (
          <div className="map-catalog-virtual-space" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={row.id}
                  className={cx('map-catalog-virtual-row', row.kind === 'header' ? 'is-header' : 'is-cards')}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.kind === 'header' ? (
                    <header className="map-catalog-virtual-header">
                      <h3>{row.id === 'header:project' ? copy.projectGroup : copy.vanillaGroup}</h3>
                      <span>{row.count}</span>
                    </header>
                  ) : (
                    <div
                      className="map-catalog-virtual-grid"
                      style={{
                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      }}
                    >
                      {row.entries.map((entry) => (
                        <MapCatalogCard
                          key={entry.id}
                          entry={entry}
                          resources={resources}
                          onOpen={() => openEntry(entry)}
                          onImportToLibrary={() => environment.onOpenModule('asset-library')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </WorkspaceSplitView>
  )
}
