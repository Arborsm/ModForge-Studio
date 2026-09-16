/**
 * @file Directory-pack source aggregation helpers: collects the mod roots a
 * `directory-pack` page reads (the target mod itself plus content packs whose
 * `ContentPackFor` targets it), tags listed entries with their source root,
 * and validates plugin-supplied `sourceModRoot` values against the Mods
 * directory.
 * @module features/compat-plugins
 */
import { detectDefaultGameDirectory } from '@entities/game/api'
import { scanModProjects } from '@entities/mod/api'
import { listCompatPluginEntries, type CompatPluginEntrySummary } from '../api/directoryPackApi'
import { findProjectByUniqueIds, normalizeUniqueId, type ScannedProjectLike } from './resolveTargetModRoot'

/** One mod directory that contributes directory-pack entries. */
export type DirectoryPackSourceRoot = {
  /** Absolute path of the contributing mod's root directory. */
  modRoot: string
  /** Display name of the contributing mod. */
  modName: string
}

/** A listed directory-pack entry tagged with the mod directory it came from. */
export type DirectoryPackEntry = CompatPluginEntrySummary & {
  /** Absolute path of the mod root containing this entry (target mod or content pack). */
  sourceModRoot: string
  /** Display name of the mod containing this entry. */
  sourceModName: string
}

/** Display name for a scanned mod project: manifest name, then folder name, then UniqueID. */
export function directoryPackSourceName(project: ScannedProjectLike): string {
  const name = project.name?.trim()
  if (name) return name
  const folder = project.folderName?.trim()
  if (folder) return folder
  return project.uniqueId?.trim() || project.absolutePath
}

/**
 * Collects installed content packs whose `ContentPackFor` UniqueID matches any
 * of the target mod's candidate ids. Matching is case-insensitive; scan order
 * is preserved and duplicates by path are removed. Pure; exported for tests.
 */
export function collectContentPackRoots(
  projects: readonly ScannedProjectLike[],
  targetUniqueIds: readonly string[],
): DirectoryPackSourceRoot[] {
  const wanted = new Set(targetUniqueIds.map(normalizeUniqueId).filter(Boolean))
  if (wanted.size === 0) return []
  const seen = new Set<string>()
  const roots: DirectoryPackSourceRoot[] = []
  for (const project of projects) {
    const contentPackFor = project.contentPackFor
    if (contentPackFor == null || !wanted.has(normalizeUniqueId(contentPackFor))) continue
    const pathKey = normalizeUniqueId(project.absolutePath)
    if (seen.has(pathKey)) continue
    seen.add(pathKey)
    roots.push({ modRoot: project.absolutePath, modName: directoryPackSourceName(project) })
  }
  return roots
}

/**
 * Collects every mod directory a `directory-pack` page should read: the target
 * mod itself (matched by any candidate UniqueID) first, then content packs
 * that target it. Returns an empty list when the target mod is not installed.
 * Pure; exported for tests.
 */
export function collectDirectoryPackSourceRoots(
  projects: readonly ScannedProjectLike[],
  targetUniqueIds: readonly string[],
): DirectoryPackSourceRoot[] {
  const target = findProjectByUniqueIds(projects, targetUniqueIds)
  if (!target) return []
  return [{ modRoot: target.absolutePath, modName: directoryPackSourceName(target) }, ...collectContentPackRoots(projects, targetUniqueIds)]
}

/**
 * Resolves the game's Mods directory and scans it for directory-pack source
 * roots (target mod + content packs). Returns null when the game directory is
 * unknown. Uses the cached `scanModProjects` under the hood.
 */
export async function scanDirectoryPackSourceRoots(
  targetUniqueIds: readonly string[],
): Promise<{ modsPath: string; roots: DirectoryPackSourceRoot[] } | null> {
  const gameRoot = await detectDefaultGameDirectory()
  if (!gameRoot) return null
  const modsPath = `${gameRoot}/Mods`
  const projects = await scanModProjects(modsPath)
  return { modsPath, roots: collectDirectoryPackSourceRoots(projects, targetUniqueIds) }
}

/**
 * Lists directory-pack entries under one source root and tags each entry with
 * that root's identity. A missing `rootSubdir` directory yields an empty list
 * (the host command treats it as "no entries"), so source roots without the
 * declared subdirectory never fail the aggregate listing.
 */
export async function listTaggedDirectoryPackEntries(
  root: DirectoryPackSourceRoot,
  params: { rootSubdir?: string; entryFile: string; entryImage?: string },
): Promise<DirectoryPackEntry[]> {
  const entries = await listCompatPluginEntries({
    modRoot: root.modRoot,
    rootSubdir: params.rootSubdir ?? '',
    entryFile: params.entryFile,
    entryImage: params.entryImage,
  })
  return entries.map((entry) => ({ ...entry, sourceModRoot: root.modRoot, sourceModName: root.modName }))
}

/**
 * Aggregates tagged directory-pack entries across every source root of the
 * target mod: the mod itself plus its content packs. Entry identity is the
 * (sourceModRoot, id) pair — `id` alone is only unique within one pack.
 */
export async function listAggregatedDirectoryPackEntries(
  targetUniqueIds: readonly string[],
  params: { rootSubdir?: string; entryFile: string; entryImage?: string },
): Promise<DirectoryPackEntry[]> {
  const scan = await scanDirectoryPackSourceRoots(targetUniqueIds)
  if (!scan) return []
  const grouped = await Promise.all(scan.roots.map((root) => listTaggedDirectoryPackEntries(root, params)))
  return grouped.flat()
}

/**
 * Composite identity of a directory-pack entry: source mod root (normalized,
 * since Windows paths are case-insensitive) + pack-local entry id.
 */
export function compatEntryKey(entry: { sourceModRoot: string; id: string }): string {
  return `${normalizeUniqueId(entry.sourceModRoot)}::${entry.id}`
}

/** A run of entries that share one source mod root, headed by the mod's display name. */
export type CompatEntryGroup<T extends { sourceModRoot: string; sourceModName: string }> = {
  sourceModRoot: string
  sourceModName: string
  entries: T[]
}

/**
 * Groups entries by their source mod root, preserving first-seen order (the
 * aggregation lists the target mod first, then its content packs). Pure;
 * exported for tests.
 */
export function groupEntriesBySource<T extends { sourceModRoot: string; sourceModName: string }>(
  entries: readonly T[],
): CompatEntryGroup<T>[] {
  const groups: CompatEntryGroup<T>[] = []
  const byRoot = new Map<string, CompatEntryGroup<T>>()
  for (const entry of entries) {
    const key = normalizeUniqueId(entry.sourceModRoot)
    let group = byRoot.get(key)
    if (!group) {
      group = { sourceModRoot: entry.sourceModRoot, sourceModName: entry.sourceModName, entries: [] }
      byRoot.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

const normalizePathForCompare = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * Returns true when `child` nests strictly under the `parent` directory.
 * Comparison is separator- and case-normalized (Windows paths are
 * case-insensitive). Used to validate plugin-supplied `sourceModRoot` values
 * against the host-resolved Mods directory so a plugin cannot read or write
 * outside it.
 */
export function isPathWithinDirectory(parent: string, child: string): boolean {
  const normalizedParent = normalizePathForCompare(parent)
  const normalizedChild = normalizePathForCompare(child)
  return normalizedChild.startsWith(`${normalizedParent}/`)
}
