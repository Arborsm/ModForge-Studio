import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapTileset } from '../lib/types'
import { gameSheetKeyOfTileset } from '../lib/gameSheets'
import {
  getTilesheetCatalog,
  subscribeTilesheetCatalog,
  vanillaTilesheetHasEvenSplit,
  vanillaTilesheetSplit,
  type VanillaTilesheetEntry,
} from '../model/vanillaTilesheets'

export type MapTilesheetPickerProjectOption = {
  value: string
  label: string
}

export type MapTilesheetPickerProps = {
  /** Sheets already attached to the map; listed first and flagged in the catalog groups. */
  attachedTilesets: readonly MapTileset[]
  /** Active sheet name, highlighted in the attached group. */
  activeTilesetName?: string | null
  /** Project image choices for the project group; omit/empty to hide the group. */
  projectImageOptions?: readonly MapTilesheetPickerProjectOption[]
  /** Whether a game directory is connected; catalog rows are disabled with a hint otherwise. */
  gameSheetsEnabled?: boolean
  /** Switch callback for attached (or already-attached catalog) sheets; omit to render them informational. */
  onPickAttached?: (name: string) => void
  /** Attach callback for a vanilla catalog sheet (dynamic reference, no project copy). */
  onPickGameSheet?: (sheet: VanillaTilesheetEntry) => void
  /** Attach callback for a project image. */
  onPickProjectImage?: (relativePath: string) => void
  /** Trigger button content; typically the active sheet name or an add label. */
  triggerLabel: ReactNode
  /** Trigger button tooltip and aria-label. */
  triggerTitle: string
  /** Extra class for the trigger button (for example `control-button` in the inspector). */
  triggerClassName?: string
}

type PickerRow = {
  id: string
  primary: string
  secondary: string | null
  badge: 'attached' | 'game' | null
  disabledTitle: string | null
  action: (() => void) | null
}

/**
 * Unified tilesheet selection dropdown: attached sheets first, then the
 * predefined vanilla catalog (`Content/Maps` and `Content/TileSheets`), then
 * project images. Vanilla picks attach as dynamic references resolved from
 * the connected game directory — nothing is copied into the project.
 */
export function MapTilesheetPicker({
  attachedTilesets,
  activeTilesetName = null,
  projectImageOptions = [],
  gameSheetsEnabled = false,
  onPickAttached,
  onPickGameSheet,
  onPickProjectImage,
  triggerLabel,
  triggerTitle,
  triggerClassName,
}: MapTilesheetPickerProps) {
  const labels = useEditorCopy().studioDesk.mapPatchEditor
  const catalog = useSyncExternalStore(subscribeTilesheetCatalog, getTilesheetCatalog)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    globalThis.document.addEventListener('pointerdown', onPointerDown, true)
    globalThis.document.addEventListener('keydown', onKeyDown, true)
    return () => {
      globalThis.document.removeEventListener('pointerdown', onPointerDown, true)
      globalThis.document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  /** Catalog key → attached tileset name, for flagging catalog rows the map already references. */
  const attachedGameSheets = useMemo(() => {
    const index = new Map<string, string>()
    for (const tileset of attachedTilesets) {
      const key = gameSheetKeyOfTileset(tileset)
      if (key) index.set(key.toLowerCase(), tileset.name)
    }
    return index
  }, [attachedTilesets])

  const normalizedQuery = query.trim().toLowerCase()

  function matches(text: string) {
    return normalizedQuery === '' || text.toLowerCase().includes(normalizedQuery)
  }

  const attachedRows: PickerRow[] = attachedTilesets
    .filter((tileset) => matches(tileset.name))
    .map((tileset) => ({
      id: `attached:${tileset.name}`,
      primary: tileset.name,
      secondary: labels.sheetPickerTileCount(tileset.tileCount),
      badge: gameSheetKeyOfTileset(tileset) ? 'game' : null,
      disabledTitle: null,
      action: onPickAttached ? () => onPickAttached(tileset.name) : null,
    }))

  function catalogRows(group: VanillaTilesheetEntry['group']): PickerRow[] {
    return catalog
      .filter((sheet) => sheet.group === group && matches(sheet.name))
      .map((sheet) => {
        const attachedName = attachedGameSheets.get(sheet.key.toLowerCase())
        const evenSplit = vanillaTilesheetHasEvenSplit(sheet)
        const split = vanillaTilesheetSplit(sheet)
        return {
          id: `game:${sheet.key}`,
          primary: sheet.name,
          secondary: labels.sheetPickerSheetMeta(sheet.imageWidth, sheet.imageHeight, split.columns, split.rows),
          badge: attachedName != null ? 'attached' : null,
          disabledTitle: !evenSplit ? labels.sheetPickerUnevenSplit : !gameSheetsEnabled ? labels.sheetPickerNoGameRoot : null,
          action:
            attachedName != null && onPickAttached
              ? () => onPickAttached(attachedName)
              : attachedName == null && evenSplit && gameSheetsEnabled && onPickGameSheet
                ? () => onPickGameSheet(sheet)
                : null,
        }
      })
  }

  const projectRows: PickerRow[] = projectImageOptions
    .filter((option) => matches(option.label) || matches(option.value))
    .map((option) => ({
      id: `project:${option.value}`,
      primary: option.label,
      secondary: null,
      badge: null,
      disabledTitle: null,
      action: onPickProjectImage ? () => onPickProjectImage(option.value) : null,
    }))

  const groups: Array<{ id: string; title: string; rows: PickerRow[] }> = [
    { id: 'attached', title: labels.sheetPickerAttachedGroup, rows: attachedRows },
    // Session modes omit the attach callbacks: their pickers only switch
    // between attached sheets, so the catalog/project groups stay hidden.
    ...(onPickGameSheet
      ? [
          { id: 'game-maps', title: labels.sheetPickerGameMapsGroup, rows: catalogRows('maps') },
          { id: 'game-tilesheets', title: labels.sheetPickerGameTilesheetsGroup, rows: catalogRows('tilesheets') },
        ]
      : []),
    ...(onPickProjectImage && projectImageOptions.length > 0
      ? [{ id: 'project', title: labels.sheetPickerProjectGroup, rows: projectRows }]
      : []),
  ]
  const totalRows = groups.reduce((count, group) => count + group.rows.length, 0)

  function pick(row: PickerRow) {
    if (!row.action) return
    row.action()
    setOpen(false)
  }

  return (
    <div className="map-tilesheet-picker" ref={rootRef}>
      <button
        type="button"
        className={cx('map-tilesheet-picker-trigger', triggerClassName, open && 'is-open')}
        aria-label={triggerTitle}
        title={triggerTitle}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setQuery('')
          setOpen((current) => !current)
        }}
      >
        <span className="map-tilesheet-picker-trigger-label">{triggerLabel}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div className="map-tilesheet-picker-pop" role="listbox" aria-label={triggerTitle}>
          <label className="map-tilesheet-picker-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={labels.searchTilesets}
              aria-label={labels.searchTilesets}
              spellCheck={false}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="map-tilesheet-picker-scroll">
            {totalRows === 0 ? (
              <p className="map-tilesheet-picker-empty">{labels.sheetPickerEmpty}</p>
            ) : (
              groups.map((group) =>
                group.rows.length === 0 ? null : (
                  <section key={group.id} className="map-tilesheet-picker-group">
                    <strong>{group.title}</strong>
                    {group.rows.map((row) => {
                      const isActive = row.id === `attached:${activeTilesetName}`
                      return (
                        <button
                          key={row.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={cx('map-tilesheet-picker-row', isActive && 'is-active', !row.action && 'is-disabled')}
                          disabled={!row.action}
                          title={row.disabledTitle ?? undefined}
                          onClick={() => pick(row)}
                        >
                          {isActive ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                          <span className="map-tilesheet-picker-row-name">{row.primary}</span>
                          {row.badge ? (
                            <span className={cx('map-tilesheet-picker-row-badge', `is-${row.badge}`)}>
                              {row.badge === 'attached' ? labels.sheetPickerAttachedBadge : labels.sheetPickerGameBadge}
                            </span>
                          ) : null}
                          {row.secondary ? <small>{row.secondary}</small> : null}
                        </button>
                      )
                    })}
                  </section>
                ),
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
