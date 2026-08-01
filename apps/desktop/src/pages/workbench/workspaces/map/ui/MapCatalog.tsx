import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, ChevronDown, ChevronUp, Copy, Loader2, Map as MapIcon, Search, Trash2 } from 'lucide-react'
import { loadMapAsset } from '@entities/game/api'
import { loadMapThumbnail, type MapDocument } from '@entities/map'
import { DeleteConfirmDialog, groupPatchesByTarget, type AssetDraftPort, type DraftPatch, type EditorResources } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import {
  buildMapCatalogEntries,
  resolveGameMapPatchTarget,
  type MapCatalogCategory,
  type MapCatalogEntry,
} from '../state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../state/useMapAuthoringCatalog'
import { parseMapDocument } from '../../asset-library/model/importGameMap'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../../model/workbenchModuleContexts'

type SourceMode = 'all' | 'project' | 'game'

type CatalogRow =
  | { kind: 'header'; id: string; category: MapCatalogCategory; count: number }
  | { kind: 'cards'; id: string; entries: MapCatalogEntry[] }

const CATEGORY_ORDER: readonly MapCatalogCategory[] = ['farm', 'town', 'interior', 'wild', 'mine', 'island', 'festival', 'other']
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

function mapOpenErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function MapCatalogPreview({ entry, resources }: { entry: MapCatalogEntry; resources: EditorResources }) {
  const project = useWorkbenchProject()
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(entry.embeddedDocument !== null)
  const [document, setDocument] = useState<MapDocument | null>(entry.embeddedDocument)
  const [failed, setFailed] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const assetPath = entry.asset?.absolutePath ?? null
  const assetFormat = entry.asset?.format ?? null
  const projectAssetPath = entry.projectAsset?.relativePath ?? null

  useEffect(() => {
    if (!visible || document || !projectAssetPath) return
    let cancelled = false
    setFailed(false)
    void project.loadProjectMapAsset(projectAssetPath).then(
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
  }, [document, project.loadProjectMapAsset, projectAssetPath, visible])

  useEffect(() => {
    if (entry.embeddedDocument) {
      setVisible(true)
      setDocument(entry.embeddedDocument)
      setFailed(false)
      return
    }
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
  }, [entry.embeddedDocument, entry.id])

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
    const cacheKey = entry.asset
      ? `asset:${entry.asset.absolutePath}:${entry.asset.sizeBytes}`
      : `project:${entry.id}:${entry.patch?.updatedAt ?? entry.projectAsset?.sha256 ?? 0}:${document.sourcePath}:${document.width}x${document.height}`
    void loadMapThumbnail(document, { cacheKey, locale: resources.locale, width: 240, height: 176 }).then(
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
  }, [document, entry.asset, entry.id, resources.locale])

  return (
    <div ref={hostRef} className="map-catalog-preview" aria-hidden="true">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" />
      ) : (
        <span className={cx('map-catalog-preview-placeholder', failed && 'is-error')}>
          {visible && (document || (entry.asset && entry.asset.format !== 'tmx')) && !failed ? (
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
  opening,
  onOpen,
  onImportToLibrary,
}: {
  entry: MapCatalogEntry
  resources: EditorResources
  opening: boolean
  onOpen: () => void
  onImportToLibrary?: () => void
}) {
  const copy = useMapAuthoringCopy()
  const format =
    entry.asset?.format.toUpperCase() ??
    entry.projectAsset?.relativePath.split('.').at(-1)?.toUpperCase() ??
    entry.embeddedDocument?.format.toUpperCase() ??
    entry.patch?.action ??
    ''
  const size = entry.asset
    ? formatBytes(entry.asset.sizeBytes)
    : entry.projectAsset
      ? formatBytes(entry.projectAsset.sizeBytes)
      : (entry.patch?.fromFile ?? entry.target)
  return (
    <article
      className={cx('map-catalog-card', opening && 'is-opening')}
      role="button"
      tabIndex={opening ? -1 : 0}
      aria-disabled={opening}
      aria-busy={opening}
      aria-label={entry.sourceKind === 'game' ? copy.patchGameMap(entry.name) : copy.openMap(entry.name)}
      onClick={() => {
        if (!opening) onOpen()
      }}
      onKeyDown={(event) => {
        if (!opening && (event.key === 'Enter' || event.key === ' ')) {
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
        <span className={cx('asset-editor-badge', entry.sourceKind === 'project' && 'is-ok')}>
          {entry.sourceKind === 'project' ? copy.projectBadge : copy.gameBadge}
        </span>
        <span>{opening ? copy.openingMap : copy.formatValue(format, size)}</span>
        {entry.sourceKind === 'game' && onImportToLibrary ? (
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
        ) : null}
      </div>
    </article>
  )
}

/**
 * Row enable switch with a token-aware third state. When `enabled` is a token
 * expression, the switch shows the expression instead of a boolean and clicking
 * never overwrites it; converting to a fixed value is an explicit action.
 */
function MapPatchEnabledToggle({ patch, draftPort, title }: { patch: DraftPatch; draftPort: AssetDraftPort; title: string }) {
  const copy = useMapAuthoringCopy()
  const [menuOpen, setMenuOpen] = useState(false)
  if (typeof patch.enabled === 'string') {
    return (
      <span className="map-patch-enabled-expression">
        <button
          type="button"
          className="map-patch-toggle map-patch-toggle-expression"
          title={copy.patchManager.enabledByExpression}
          aria-label={copy.patchManager.enabledByExpression}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {patch.enabled}
        </button>
        {menuOpen ? (
          <span className="map-patch-toggle-menu">
            <button
              type="button"
              onClick={() => {
                draftPort.updatePatch(patch.id, { enabled: true })
                setMenuOpen(false)
              }}
            >
              {copy.patchManager.setAlwaysEnabled}
            </button>
            <button
              type="button"
              onClick={() => {
                draftPort.updatePatch(patch.id, { enabled: false })
                setMenuOpen(false)
              }}
            >
              {copy.patchManager.setAlwaysDisabled}
            </button>
          </span>
        ) : null}
      </span>
    )
  }
  const enabled = patch.enabled !== false
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? copy.patchManager.toggleDisable(title) : copy.patchManager.toggleEnable(title)}
      className={cx('map-patch-toggle', enabled && 'is-on')}
      onClick={() => draftPort.updatePatch(patch.id, { enabled: !enabled })}
    />
  )
}

/**
 * Patch manager: same-target EditMap/Load stacks in export order, with
 * reorder, duplicate, toggle, and delete. Rows open the patch editor; a
 * boundary move (or one crossing a different target) is disabled so an action
 * never shifts export order without visibly changing this group.
 */
function MapPatchManager({
  patches,
  draftPort,
  onOpenPatch,
}: {
  patches: readonly DraftPatch[]
  draftPort: AssetDraftPort
  onOpenPatch: (patchId: string) => void
}) {
  const copy = useMapAuthoringCopy()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const [deleteTarget, setDeleteTarget] = useState<DraftPatch | null>(null)
  const managed = patches.filter((patch) => patch.action === 'EditMap' || patch.action === 'Load')
  const groups = groupPatchesByTarget(managed, () => true)

  return (
    <div className="map-patch-manager">
      {groups.map((group) => (
        <section key={group.target} className="map-patch-group">
          <header className="map-patch-group-header">
            <h3>{group.target}</h3>
            <span>{copy.patchManager.count(group.patches.length)}</span>
          </header>
          <ol className="map-patch-group-list">
            {group.patches.map((patch, rowIndex) => {
              const title = patch.logName || patch.fromFile || patch.target
              const enabled = patch.enabled !== false
              const whenSummary = patch.when
                ? Object.entries(patch.when)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(', ')
                : ''
              const priority = patch.priority !== undefined && Number(patch.priority) !== 0 ? String(patch.priority) : null
              const arrayIndex = managed.findIndex((candidate) => candidate.id === patch.id)
              const upNeighbor = managed.at(arrayIndex - 1)
              const downNeighbor = managed.at(arrayIndex + 1)
              const canMoveUp = upNeighbor !== undefined && group.patches.some((candidate) => candidate.id === upNeighbor.id)
              const canMoveDown = downNeighbor !== undefined && group.patches.some((candidate) => candidate.id === downNeighbor.id)
              return (
                <li key={patch.id} className={cx('map-patch-row', !enabled && 'is-disabled')}>
                  <span className="map-patch-order">{rowIndex + 1}</span>
                  <span className="asset-editor-badge">
                    {copy.patchManager.actionBadges[patch.action === 'EditMap' ? 'EditMap' : 'Load']}
                  </span>
                  <button
                    type="button"
                    className="map-patch-row-copy"
                    aria-label={copy.openMap(title)}
                    onClick={() => onOpenPatch(patch.id)}
                  >
                    <strong>{title}</strong>
                    <span className="map-patch-row-details">
                      {patch.fromFile && patch.fromFile !== title ? (
                        <span className="map-patch-detail">
                          {copy.patchManager.fromFile}: {patch.fromFile}
                        </span>
                      ) : null}
                      {whenSummary ? (
                        <span className="map-patch-detail">
                          {copy.patchManager.when}: {whenSummary}
                        </span>
                      ) : null}
                      {expertMode && priority !== null ? (
                        <span className="map-patch-detail">
                          {copy.patchManager.priority}: {priority}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <MapPatchEnabledToggle patch={patch} draftPort={draftPort} title={title} />
                  <div className="map-patch-row-actions">
                    <button
                      type="button"
                      disabled={!canMoveUp}
                      title={copy.patchManager.moveUp}
                      aria-label={copy.patchManager.moveUp}
                      onClick={() => draftPort.reorderPatch(patch.id, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveDown}
                      title={copy.patchManager.moveDown}
                      aria-label={copy.patchManager.moveDown}
                      onClick={() => draftPort.reorderPatch(patch.id, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={copy.patchManager.duplicate}
                      aria-label={copy.patchManager.duplicate}
                      onClick={() => draftPort.duplicatePatch(patch.id)}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={copy.patchManager.delete}
                      aria-label={copy.patchManager.delete}
                      onClick={() => setDeleteTarget(patch)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        title={copy.patchManager.deleteTitle}
        message={deleteTarget ? copy.patchManager.deleteMessage(deleteTarget.logName || deleteTarget.fromFile || deleteTarget.target) : ''}
        cancelLabel={copy.patchManager.cancel}
        confirmLabel={copy.patchManager.confirmDelete}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) draftPort.removePatch(deleteTarget.id)
        }}
      />
    </div>
  )
}

/** First-level map library backed by the real game scan and project patches. */
export function MapCatalog({
  draftPort,
  resources,
  onOpenPatch,
  onOpenMapAsset,
}: {
  draftPort: AssetDraftPort
  resources: EditorResources
  onOpenPatch: (patchId: string) => void
  onOpenMapAsset: (relativePath: string, document?: MapDocument) => void
}) {
  const copy = useMapAuthoringCopy()
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const publishNotification = useNotificationPublisher()
  const catalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  const [query, setQuery] = useState('')
  const [sourceMode, setSourceMode] = useState<SourceMode>('all')
  const [openingEntryId, setOpeningEntryId] = useState<string | null>(null)
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)
  const [rootFontSize, setRootFontSize] = useState(readRootFontSize)
  const [view, setView] = useState<'library' | 'patches'>('library')
  const mapWorkspacePatches = draftPort.draft.patches.filter((patch) => patch.workspace === 'map')
  const hasManageablePatches = mapWorkspacePatches.some((patch) => patch.action === 'EditMap' || patch.action === 'Load')
  const entries = buildMapCatalogEntries(mapWorkspacePatches, catalog.assets, draftPort.draft.projectAssets)
  const needle = query.trim().toLowerCase()
  const visibleEntries = entries.filter(
    (entry) =>
      (sourceMode === 'all' || entry.sourceKind === sourceMode) &&
      (needle === '' || `${entry.name} ${entry.target} ${entry.asset?.relativePath ?? ''}`.toLowerCase().includes(needle)),
  )
  const rows: CatalogRow[] = []
  if (sourceMode === 'all') {
    for (const source of ['project', 'game'] as const) {
      const sourceEntries = visibleEntries.filter((entry) => entry.sourceKind === source)
      if (sourceEntries.length === 0) continue
      rows.push({ kind: 'header', id: `header:${source}`, category: source === 'project' ? 'farm' : 'other', count: sourceEntries.length })
      for (let index = 0; index < sourceEntries.length; index += columnCount) {
        rows.push({
          kind: 'cards',
          id: `cards:${source}:${index}`,
          entries: sourceEntries.slice(index, index + columnCount),
        })
      }
    }
  } else {
    for (const category of CATEGORY_ORDER) {
      const categoryEntries = visibleEntries.filter((entry) => entry.category === category)
      if (categoryEntries.length === 0) continue
      rows.push({ kind: 'header', id: `header:${category}`, category, count: categoryEntries.length })
      for (let index = 0; index < categoryEntries.length; index += columnCount) {
        rows.push({
          kind: 'cards',
          id: `cards:${category}:${index}`,
          entries: categoryEntries.slice(index, index + columnCount),
        })
      }
    }
  }
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => contentElement,
    estimateSize: (index) => rootFontSize * (rows[index]?.kind === 'header' ? CATALOG_HEADER_ROW_HEIGHT_REM : CATALOG_CARD_ROW_HEIGHT_REM),
    overscan: 1,
  })

  useEffect(() => {
    if (!contentElement) return
    const updateLayout = () => {
      const nextRootFontSize = readRootFontSize()
      const width = contentElement.clientWidth
      const gap = CATALOG_GRID_GAP_REM * nextRootFontSize
      const cardMinWidth = CATALOG_CARD_MIN_WIDTH_REM * nextRootFontSize
      setRootFontSize(nextRootFontSize)
      setColumnCount(Math.max(1, Math.floor((width + gap) / (cardMinWidth + gap))))
    }
    const observer = new ResizeObserver(updateLayout)
    observer.observe(contentElement)
    updateLayout()
    return () => observer.disconnect()
  }, [contentElement])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rootFontSize, rowVirtualizer])

  // Deleting the last map patch while the manager is open leaves nothing to
  // manage; fall back to the library instead of showing an empty manager.
  useEffect(() => {
    if (view === 'patches' && !hasManageablePatches) setView('library')
  }, [hasManageablePatches, view])

  async function openEntry(entry: MapCatalogEntry) {
    // Clicking a game map means authoring changes to it: open (or reuse) the
    // EditMap patch for that target. Copying it into the asset library is the
    // secondary action on the card.
    if (entry.sourceKind === 'game') {
      const id = project.addPatch('map', resolveGameMapPatchTarget(entry), 'EditMap')
      onOpenPatch(id)
      return
    }
    if (openingEntryId) return
    setOpeningEntryId(entry.id)
    const notificationId = `map-catalog-open:${draftPort.draft.draftStorageKey}`
    publishNotification({ id: notificationId, level: 'info', title: copy.openingMap, loading: true, autoDismissMs: null })
    try {
      if (entry.patch) {
        dismissNotification(notificationId)
        onOpenPatch(entry.patch.id)
        return
      }
      if (entry.projectAsset) {
        const loaded = await project.loadProjectMapAsset(entry.projectAsset.relativePath)
        const document = parseMapDocument(loaded.content)
        if (!document) throw new Error(copy.openFailed)
        dismissNotification(notificationId)
        onOpenMapAsset(entry.projectAsset.relativePath, document)
        return
      }
      throw new Error(copy.openFailed)
    } catch (error) {
      console.error(
        `[map-catalog.openFailed] target=${entry.target} source=${entry.projectAsset?.relativePath ?? entry.patch?.fromFile ?? 'unknown'} error=${mapOpenErrorMessage(error)}`,
      )
      publishNotification({ id: notificationId, level: 'error', title: copy.openFailed })
      setOpeningEntryId(null)
    }
  }

  const modes: Array<{ id: SourceMode; label: string }> = [
    { id: 'all', label: copy.sourceAll },
    { id: 'project', label: copy.sourceProject },
    { id: 'game', label: copy.sourceGame },
  ]

  return (
    <div className="map-catalog">
      <div className="map-catalog-toolbar">
        {hasManageablePatches ? (
          <div className="map-catalog-view-switch" role="group" aria-label={copy.patchManager.viewPatches}>
            <button
              type="button"
              className={cx(view === 'library' && 'is-active')}
              aria-pressed={view === 'library'}
              onClick={() => setView('library')}
            >
              {copy.patchManager.viewLibrary}
            </button>
            <button
              type="button"
              className={cx(view === 'patches' && 'is-active')}
              aria-pressed={view === 'patches'}
              onClick={() => setView('patches')}
            >
              {copy.patchManager.viewPatches}
            </button>
          </div>
        ) : null}
        <div className="map-catalog-intro">
          <h2>{view === 'patches' ? copy.patchManager.viewPatches : copy.libraryTitle}</h2>
          <p>{view === 'patches' ? copy.patchManager.hint : copy.libraryHint}</p>
        </div>
        {view === 'library' ? (
          <>
            <label className="map-catalog-search">
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
            <div className="map-catalog-modes" role="group">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={cx(sourceMode === mode.id && 'is-active')}
                  aria-pressed={sourceMode === mode.id}
                  onClick={() => setSourceMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div ref={setContentElement} className="map-catalog-content">
        {view === 'patches' && hasManageablePatches ? (
          <MapPatchManager patches={mapWorkspacePatches} draftPort={draftPort} onOpenPatch={onOpenPatch} />
        ) : (
          <>
            {catalog.loading ? (
              <div className="map-catalog-state">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>{copy.loading}</p>
              </div>
            ) : null}
            {catalog.error ? (
              <div className="map-catalog-state is-error">
                <AlertCircle className="h-6 w-6" />
                <p>{copy.loadFailed}</p>
                <span>{catalog.error}</span>
              </div>
            ) : null}
            {!catalog.loading && visibleEntries.length === 0 ? (
              <div className="map-catalog-state">
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
                          <h3>
                            {row.id === 'header:project'
                              ? copy.projectSection
                              : row.id === 'header:game'
                                ? copy.gameSection
                                : copy.categories[row.category]}
                          </h3>
                          <span>{row.count}</span>
                        </header>
                      ) : (
                        <div className="map-catalog-virtual-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                          {row.entries.map((entry) => (
                            <MapCatalogCard
                              key={entry.id}
                              entry={entry}
                              resources={resources}
                              opening={openingEntryId === entry.id}
                              onOpen={() => void openEntry(entry)}
                              onImportToLibrary={entry.sourceKind === 'game' ? () => environment.onOpenModule('asset-library') : undefined}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
