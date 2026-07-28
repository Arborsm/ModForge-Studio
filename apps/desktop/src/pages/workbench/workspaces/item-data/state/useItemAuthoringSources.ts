/**
 * Source-pane state for the item authoring editor.
 *
 * The left pane lists two populations at once — the objects this patch already
 * edits and the vanilla objects it could still override — so this hook resolves
 * the vanilla index once (shared cache with the codex page) and joins it with
 * the patch entry keys.
 *
 * Vanilla rows are layered by `Type`, the same split the game uses to decide
 * which menus and machines an object belongs to; with ~800 vanilla objects a
 * flat list is unusable, and `Type` is the grouping an author already thinks in.
 */

import { useEffect, useState } from 'react'
import {
  createObjectEntriesFromRecords,
  loadItemWorkspaceEntries,
  loadVanillaObjectRecords,
  type ItemWorkspaceEntry,
  type ObjectDataFields,
} from '@entities/item'
import { tryParseStringAssetReference } from '@entities/game/api'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode } from '@locales'

/** Rows rendered per group before the pane asks the author to narrow the search. */
export const MAX_ROWS_PER_GROUP = 40

/** One row of the source list. */
export type ItemSourceRow = {
  /** `Data/Objects` entry key, i.e. the unqualified object id. */
  key: string
  displayName: string
  /** Present when the vanilla index knows this key; drives the override badge. */
  vanilla: ItemWorkspaceEntry | null
  /** Whether the patch currently defines an entry under this key. */
  inProject: boolean
}

/** Vanilla rows sharing one `Type`. */
export type ItemSourceGroup = {
  key: string
  label: string
  /** Rows the pane renders; capped at `MAX_ROWS_PER_GROUP`. */
  rows: ItemSourceRow[]
  /** Rows the group actually holds, so the pane can report what it dropped. */
  totalRows: number
}

export type ItemSourceMode = 'all' | 'project' | 'vanilla'

export type ItemSourceGroups = {
  project: ItemSourceRow[]
  vanillaGroups: ItemSourceGroup[]
  /** Vanilla placeholder objects literally named `???`; kept out of the normal groups. */
  placeholderRows: ItemSourceRow[]
}

export type VanillaObjectIndexState = {
  entries: Map<string, ItemWorkspaceEntry>
  records: Record<string, unknown>
  loading: boolean
  available: boolean
}

const EMPTY_VANILLA: VanillaObjectIndexState = { entries: new Map(), records: {}, loading: false, available: false }

/** Loads the vanilla object index once per game root and locale. */
export function useVanillaObjectIndex(
  gameRootPath: string | null,
  directoryInfo: GameDirectoryInfo | null,
  locale: LocaleCode,
): VanillaObjectIndexState {
  const [state, setState] = useState<VanillaObjectIndexState>(EMPTY_VANILLA)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setState(EMPTY_VANILLA)
      return
    }

    let cancelled = false
    setState({ entries: new Map(), records: {}, loading: true, available: false })

    void Promise.all([loadItemWorkspaceEntries(gameRootPath, locale), loadVanillaObjectRecords(gameRootPath, locale)])
      .then(([entries, records]) => {
        if (cancelled) {
          return
        }
        setState({
          entries: new Map(entries.filter((entry) => entry.kind === 'object').map((entry) => [entry.itemId.toLowerCase(), entry])),
          records,
          loading: false,
          available: true,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState(EMPTY_VANILLA)
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  return state
}

function matchesSearch(row: ItemSourceRow, needle: string): boolean {
  if (!needle) {
    return true
  }
  return row.key.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle)
}

function objectRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function draftDisplayName(raw: unknown, key: string): string {
  const record = objectRecord(raw)
  for (const field of ['DisplayName', 'Name']) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return key
}

/**
 * Splits every known object into the groups the pane renders.
 *
 * Project entries keep the patch's authoring order; vanilla entries are grouped
 * by `Type` and each group is capped, because the search is the intended way to
 * reach one of ~800 objects and rendering them all would stall the pane. The cap
 * is reported through `totalRows` rather than applied silently.
 */
export function buildItemSourceGroups({
  projectKeys,
  projectEntries,
  vanilla,
  mode,
  search,
  ungroupedLabel,
}: {
  projectKeys: readonly string[]
  projectEntries: Readonly<Record<string, unknown>>
  vanilla: VanillaObjectIndexState
  mode: ItemSourceMode
  search: string
  /** Group title for vanilla objects with no `Type`. */
  ungroupedLabel: string
}): ItemSourceGroups {
  const needle = search.trim().toLowerCase()
  const projectKeySet = new Set(projectKeys.map((key) => key.toLowerCase()))

  const project =
    mode === 'vanilla'
      ? []
      : projectKeys
          .map((key) => ({
            key,
            displayName: draftDisplayName(projectEntries[key], key),
            vanilla: vanilla.entries.get(key.toLowerCase()) ?? null,
            inProject: true,
          }))
          .filter((row) => matchesSearch(row, needle))

  if (mode === 'project') {
    return { project, vanillaGroups: [], placeholderRows: [] }
  }

  const byType = new Map<string, ItemSourceRow[]>()
  const placeholderRows: ItemSourceRow[] = []
  for (const entry of vanilla.entries.values()) {
    if (projectKeySet.has(entry.itemId.toLowerCase())) {
      continue
    }
    const row: ItemSourceRow = { key: entry.itemId, displayName: entry.displayName, vanilla: entry, inProject: false }
    if (!matchesSearch(row, needle)) {
      continue
    }
    // Vanilla ships a pile of unused placeholder objects literally named `???`;
    // they are noise for authors, so they get their own collapsed group instead
    // of drowning the real ones.
    if (row.displayName.trim() === '???') {
      placeholderRows.push(row)
      continue
    }
    const type = entry.rawType?.trim() || ungroupedLabel
    const rows = byType.get(type)
    if (rows === undefined) {
      byType.set(type, [row])
    } else {
      rows.push(row)
    }
  }

  const vanillaGroups = Array.from(byType, ([label, rows]) => ({
    key: label,
    label,
    totalRows: rows.length,
    rows: rows.sort((left, right) => left.displayName.localeCompare(right.displayName)).slice(0, MAX_ROWS_PER_GROUP),
  })).sort((left, right) => right.totalRows - left.totalRows || left.label.localeCompare(right.label))

  return { project, vanillaGroups, placeholderRows }
}

/**
 * Builds the preview entry for the object being edited.
 *
 * The preview always renders the entry as the patch defines it, so an author
 * sees a `Texture` or `SpriteIndex` edit immediately; vanilla data is only a
 * fallback for keys the patch does not redefine. The vanilla row's localized
 * display name wins over a `[LocalizedText …]` token the patch inherited, since
 * the token is what the raw asset stores and not what the player reads.
 */
export function buildPreviewItem(
  entryKey: string | null,
  entryValue: unknown,
  vanilla: VanillaObjectIndexState,
): ItemWorkspaceEntry | null {
  if (entryKey === null) {
    return null
  }
  const record = objectRecord(entryValue)
  const vanillaEntry = vanilla.entries.get(entryKey.toLowerCase()) ?? null
  const merged = { ...objectRecord(vanilla.records[entryKey]), ...record }

  // Reuses the codex read model so the preview resolves the sprite rect and the
  // texture asset name exactly the way the codex does.
  const [entry] = createObjectEntriesFromRecords({ [entryKey]: merged as ObjectDataFields })
  if (entry === undefined) {
    return null
  }
  if (vanillaEntry === null) {
    return entry
  }
  // A `[LocalizedText …]` token the patch inherited from the vanilla record is
  // what the raw asset stores, not what the player reads: fall back to the
  // vanilla row's already-localized text until the author writes real text.
  const displayName = typeof record['DisplayName'] === 'string' && tryParseStringAssetReference(record['DisplayName']) === null
  const description = typeof record['Description'] === 'string' && tryParseStringAssetReference(record['Description']) === null
  return {
    ...entry,
    displayName: displayName ? entry.displayName : vanillaEntry.displayName,
    description: description ? entry.description : vanillaEntry.description,
  }
}
