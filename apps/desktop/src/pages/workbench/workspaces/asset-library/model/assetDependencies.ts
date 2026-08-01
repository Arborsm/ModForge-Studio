import type { ProjectAssetRef } from '@features/cp-maker'

/**
 * Normalizes a project-relative path for dependency comparison: forward
 * slashes, collapsed repeats, and a leading `./` are removed. Case is left
 * intact so callers can decide whether to fold it.
 */
export function normalizeDependencyPath(path: string): string {
  const collapsed = path
    .replaceAll('\\', '/')
    .replace(/\/{2,}/gu, '/')
    .trim()
  return collapsed.startsWith('./') ? collapsed.slice(2) : collapsed
}

/** One dependency edge whose target file is absent from the asset list. */
export type MissingAssetDependency = {
  assetPath: string
  missingPath: string
  kind: string
}

/**
 * Scans every asset's declared dependency edges and returns the ones that
 * point at files not present in the asset list, compared case-insensitively
 * after path normalization.
 */
export function findMissingAssetDependencies(assets: readonly ProjectAssetRef[]): MissingAssetDependency[] {
  const existing = new Set(assets.map((asset) => normalizeDependencyPath(asset.relativePath).toLowerCase()))
  const missing: MissingAssetDependency[] = []
  for (const asset of assets) {
    for (const dependency of asset.dependencies ?? []) {
      const normalized = normalizeDependencyPath(dependency.relativePath)
      if (normalized !== '' && !existing.has(normalized.toLowerCase())) {
        missing.push({ assetPath: asset.relativePath, missingPath: dependency.relativePath, kind: dependency.kind })
      }
    }
  }
  return missing
}

/** One direct dependency of the selected asset with its resolution state. */
export type AssetDependencyLink = {
  path: string
  kind: string
  exists: boolean
}

/** Forward and reverse dependency edges for a selected asset. */
export type AssetDependencyView = {
  dependencies: AssetDependencyLink[]
  dependents: string[]
}

/**
 * Builds the dependency view for `selectedPath`: its direct dependencies
 * (with existence state) and the reverse list of assets that declare a
 * dependency edge pointing at it.
 */
export function buildAssetDependencyView(assets: readonly ProjectAssetRef[], selectedPath: string | null): AssetDependencyView {
  if (!selectedPath) return { dependencies: [], dependents: [] }
  const selectedKey = normalizeDependencyPath(selectedPath).toLowerCase()
  const selected = assets.find((asset) => normalizeDependencyPath(asset.relativePath).toLowerCase() === selectedKey)
  if (!selected) return { dependencies: [], dependents: [] }

  const existing = new Set(assets.map((asset) => normalizeDependencyPath(asset.relativePath).toLowerCase()))
  const dependencies: AssetDependencyLink[] = (selected.dependencies ?? []).map((dependency) => {
    const normalized = normalizeDependencyPath(dependency.relativePath)
    return {
      path: dependency.relativePath,
      kind: dependency.kind,
      exists: normalized !== '' && existing.has(normalized.toLowerCase()),
    }
  })
  const dependents = assets
    .filter(
      (asset) =>
        normalizeDependencyPath(asset.relativePath).toLowerCase() !== selectedKey &&
        (asset.dependencies ?? []).some((dependency) => normalizeDependencyPath(dependency.relativePath).toLowerCase() === selectedKey),
    )
    .map((asset) => asset.relativePath)

  return { dependencies, dependents }
}
