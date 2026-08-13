/**
 * Source-pane state for the building authoring editor.
 *
 * The left pane lists two populations at once — the buildings this patch
 * already edits and the vanilla buildings it could still override — so this
 * hook resolves the vanilla index once (shared cache with the codex page) and
 * joins it with the patch entry keys.
 *
 * Vanilla rows are layered by `createConstructibleBuildingGroups`, the same
 * grouping the codex uses, so an upgrade chain reads as one building with
 * stages rather than as four unrelated ids.
 */

import { useEffect, useState } from 'react'
import {
  type BuildingDataFields,
  type BuildingWorkspaceEntry,
  type ConstructibleBuildingGroup,
  createBuildingEntriesFromRecords,
  createConstructibleBuildingGroups,
  loadBuildingWorkspaceEntries,
  loadVanillaBuildingRecords,
} from '@entities/building'
import type { GameDirectoryInfo } from '@entities/game/api'
import { resolveLocalizedText, tryParseStringAssetReference } from '@entities/game/api'
import type { LocaleCode } from '@locales'

/** One row of the source list. */
export type BuildingSourceRow = {
  /** `Data/Buildings` entry key. */
  key: string
  displayName: string
  /** Present when the vanilla index knows this key; drives the stage badge. */
  vanilla: BuildingWorkspaceEntry | null
  /** Whether the patch currently defines an entry under this key. */
  inProject: boolean
}

/** Vanilla rows of one upgrade chain, titled by the chain's root building. */
export type BuildingSourceGroup = {
  key: string
  label: string
  stageCount: number
  rows: BuildingSourceRow[]
}

export type BuildingSourceMode = 'all' | 'project' | 'vanilla'

/** One stage of the upgrade chain the entry being edited belongs to. */
export type BuildingChainStage = {
  key: string
  displayName: string
  /** Whether this stage is the entry currently open in the form. */
  isActive: boolean
  /** Whether this patch defines an entry for the stage. */
  inProject: boolean
}

export type BuildingSourceGroups = {
  project: BuildingSourceRow[]
  vanillaGroups: BuildingSourceGroup[]
  /** Resolved project entry display names, keyed by entry key. */
  resolvedNames: Map<string, string>
}

export type VanillaBuildingIndexState = {
  entries: Map<string, BuildingWorkspaceEntry>
  groups: ConstructibleBuildingGroup[]
  records: Record<string, unknown>
  loading: boolean
  available: boolean
}

const EMPTY_VANILLA: VanillaBuildingIndexState = {
  entries: new Map(),
  groups: [],
  records: {},
  loading: false,
  available: false,
}

/** Loads the vanilla building index once per game root and locale. */
export function useVanillaBuildingIndex(
  gameRootPath: string | null,
  directoryInfo: GameDirectoryInfo | null,
  locale: LocaleCode,
): VanillaBuildingIndexState {
  const [state, setState] = useState<VanillaBuildingIndexState>(EMPTY_VANILLA)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setState(EMPTY_VANILLA)
      return
    }

    let cancelled = false
    setState({ entries: new Map(), groups: [], records: {}, loading: true, available: false })

    void Promise.all([loadBuildingWorkspaceEntries(gameRootPath, locale), loadVanillaBuildingRecords(gameRootPath, locale)])
      .then(([entries, records]) => {
        if (cancelled) {
          return
        }
        setState({
          entries: new Map(entries.map((entry) => [entry.key.toLowerCase(), entry])),
          groups: createConstructibleBuildingGroups(entries),
          records,
          loading: false,
          available: true,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ entries: new Map(), groups: [], records: {}, loading: false, available: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  return state
}

function matchesSearch(row: BuildingSourceRow, needle: string): boolean {
  if (!needle) {
    return true
  }
  return row.key.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle)
}

function draftUpgradeFromKey(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  const value = (raw as Record<string, unknown>)['BuildingToUpgrade']
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Resolves the upgrade chain the active entry sits in, in build order.
 *
 * `BuildingToUpgrade` is a single backwards link, so a chain is only visible
 * after following every link: walk back to the stage nobody upgrades from, then
 * forward through whichever stage points at the previous one. Project entries and
 * vanilla entries are walked through the same node map, so a patch that inserts a
 * stage into a vanilla chain shows up in the right place instead of as an
 * orphan.
 */
export function buildUpgradeChainStages({
  activeKey,
  projectKeys,
  projectEntries,
  vanilla,
}: {
  activeKey: string | null
  projectKeys: readonly string[]
  projectEntries: Readonly<Record<string, unknown>>
  vanilla: VanillaBuildingIndexState
}): BuildingChainStage[] {
  if (activeKey === null) {
    return []
  }

  type ChainNode = { key: string; displayName: string; inProject: boolean; upgradeFrom: string | null }
  const nodes = new Map<string, ChainNode>()

  for (const entry of vanilla.entries.values()) {
    nodes.set(entry.key.toLowerCase(), {
      key: entry.key,
      displayName: entry.displayName,
      inProject: false,
      upgradeFrom: entry.upgradeFromKey,
    })
  }
  // Project entries win: they may rewrite the link a vanilla stage stores.
  for (const key of projectKeys) {
    const raw = projectEntries[key]
    const vanillaNode = nodes.get(key.toLowerCase())
    nodes.set(key.toLowerCase(), {
      key,
      displayName: draftDisplayName(raw, vanillaNode?.displayName ?? key),
      inProject: true,
      upgradeFrom: draftUpgradeFromKey(raw) ?? vanillaNode?.upgradeFrom ?? null,
    })
  }

  const active = nodes.get(activeKey.toLowerCase())
  if (active === undefined) {
    return []
  }

  const visited = new Set<string>([active.key.toLowerCase()])
  const backwards: ChainNode[] = []
  let cursor = active.upgradeFrom === null ? undefined : nodes.get(active.upgradeFrom.toLowerCase())
  while (cursor !== undefined && !visited.has(cursor.key.toLowerCase())) {
    visited.add(cursor.key.toLowerCase())
    backwards.unshift(cursor)
    cursor = cursor.upgradeFrom === null ? undefined : nodes.get(cursor.upgradeFrom.toLowerCase())
  }

  const forwards: ChainNode[] = []
  let previousKey = active.key.toLowerCase()
  for (;;) {
    const next = Array.from(nodes.values()).find(
      (node) => node.upgradeFrom !== null && node.upgradeFrom.toLowerCase() === previousKey && !visited.has(node.key.toLowerCase()),
    )
    if (next === undefined) {
      break
    }
    visited.add(next.key.toLowerCase())
    forwards.push(next)
    previousKey = next.key.toLowerCase()
  }

  const chain = [...backwards, active, ...forwards]
  if (chain.length < 2) {
    return []
  }
  return chain.map((node) => ({
    key: node.key,
    displayName: node.displayName,
    isActive: node.key.toLowerCase() === active.key.toLowerCase(),
    inProject: node.inProject,
  }))
}

function draftDisplayName(raw: unknown, key: string): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return key
  }
  const name = (raw as Record<string, unknown>)['Name']
  return typeof name === 'string' && name.trim() ? name : key
}

/**
 * Splits every known building into the groups the pane renders.
 *
 * Project entries keep the patch's authoring order; vanilla entries keep their
 * upgrade-chain grouping, and a chain whose stages are all already overridden
 * by the patch disappears from the vanilla side rather than rendering an empty
 * group header.
 */
export async function buildBuildingSourceGroups({
  rootPath,
  locale,
  projectKeys,
  projectEntries,
  vanilla,
  mode,
  search,
  ungroupedLabel,
}: {
  rootPath: string | null
  locale: LocaleCode
  projectKeys: readonly string[]
  projectEntries: Readonly<Record<string, unknown>>
  vanilla: VanillaBuildingIndexState
  mode: BuildingSourceMode
  search: string
  /** Group title for vanilla buildings that are not part of any upgrade chain. */
  ungroupedLabel: string
}): Promise<BuildingSourceGroups> {
  const needle = search.trim().toLowerCase()
  const projectKeySet = new Set(projectKeys.map((key) => key.toLowerCase()))

  const rawProjectNames = projectKeys.map((key) => ({
    key,
    raw: draftDisplayName(projectEntries[key], key),
  }))

  const resolvedProjectNames =
    rootPath === null
      ? rawProjectNames.map(({ key, raw }) => ({ key, name: raw }))
      : await Promise.all(
          rawProjectNames.map(async ({ key, raw }) => ({
            key,
            name: (await resolveLocalizedText(rootPath, locale, raw)) ?? raw,
          })),
        )

  const nameByKey = new Map(resolvedProjectNames.map(({ key, name }) => [key, name]))

  const project =
    mode === 'vanilla'
      ? []
      : projectKeys
          .map((key) => ({
            key,
            displayName: nameByKey.get(key) ?? key,
            vanilla: vanilla.entries.get(key.toLowerCase()) ?? null,
            inProject: true,
          }))
          .filter((row) => matchesSearch(row, needle))

  if (mode === 'project') {
    return { project, vanillaGroups: [], resolvedNames: nameByKey }
  }

  const standalone: BuildingSourceRow[] = []
  const vanillaGroups: BuildingSourceGroup[] = []

  for (const group of vanilla.groups) {
    const rows = group.entries
      .filter((entry) => !projectKeySet.has(entry.key.toLowerCase()))
      .map((entry) => ({ key: entry.key, displayName: entry.displayName, vanilla: entry, inProject: false }))
      .filter((row) => matchesSearch(row, needle))

    if (rows.length === 0) {
      continue
    }

    if (group.stageCount <= 1) {
      standalone.push(...rows)
      continue
    }

    vanillaGroups.push({ key: group.key, label: group.displayName, stageCount: group.stageCount, rows })
  }

  if (standalone.length > 0) {
    vanillaGroups.push({
      key: 'standalone',
      label: ungroupedLabel,
      stageCount: standalone.length,
      rows: standalone.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    })
  }

  return { project, vanillaGroups, resolvedNames: nameByKey }
}

/**
 * Builds the preview entry for the building being edited.
 *
 * The preview always renders the entry as the patch defines it, so an author
 * sees a `Texture` or `Size` edit immediately; vanilla data is only a fallback
 * for keys the patch does not redefine.
 */
export function buildPreviewEntry(
  entryKey: string | null,
  entryValue: unknown,
  vanilla: VanillaBuildingIndexState,
): BuildingWorkspaceEntry | null {
  if (entryKey === null) {
    return null
  }
  const record: Record<string, unknown> =
    typeof entryValue === 'object' && entryValue !== null && !Array.isArray(entryValue) ? (entryValue as Record<string, unknown>) : {}
  const vanillaEntry = vanilla.entries.get(entryKey.toLowerCase()) ?? null
  const vanillaRecord = vanillaEntry ? vanilla.records[vanillaEntry.key] : null
  const merged =
    vanillaRecord && typeof vanillaRecord === 'object' && !Array.isArray(vanillaRecord)
      ? { ...(vanillaRecord as Record<string, unknown>), ...record }
      : record

  // Reuses the codex read model so the preview resolves `SourceRect`, `Size`
  // and the texture asset name exactly the way the codex does.
  const [entry] = createBuildingEntriesFromRecords({ [entryKey]: merged as BuildingDataFields })
  if (entry === undefined || vanillaEntry === null) {
    return entry ?? null
  }
  // A `[LocalizedText …]` token inherited from the vanilla record is what the
  // raw asset stores; the preview shows the localized text the player reads.
  const displayName = typeof record['Name'] === 'string' && tryParseStringAssetReference(record['Name']) === null
  const description = typeof record['Description'] === 'string' && tryParseStringAssetReference(record['Description']) === null
  return {
    ...entry,
    displayName: displayName ? entry.displayName : vanillaEntry.displayName,
    description: description ? entry.description : (vanillaEntry.description ?? entry.description),
  }
}
