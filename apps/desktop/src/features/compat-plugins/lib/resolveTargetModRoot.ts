/**
 * @file Resolves the installed root directory of a target mod by UniqueID,
 * using existing entities-layer commands (`detectDefaultGameDirectory` +
 * `scanModProjects`). No new backend command needed.
 * @module features/compat-plugins
 */
import { detectDefaultGameDirectory } from '@entities/game/api'
import { scanModProjects } from '@entities/mod/api'

/** Resolves the absolute path of an installed mod by its UniqueID. Returns null if not found. */
export async function resolveTargetModRoot(uniqueId: string): Promise<string | null> {
  const gameRoot = await detectDefaultGameDirectory()
  if (!gameRoot) return null
  const modsPath = `${gameRoot}/Mods`
  const projects = await scanModProjects(modsPath)
  const match = projects.find((project) => project.uniqueId === uniqueId)
  return match?.absolutePath ?? null
}
