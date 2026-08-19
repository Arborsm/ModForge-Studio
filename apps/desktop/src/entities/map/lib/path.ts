/**
 * @file Map path normalization helpers: backslash normalization and map
 * directory extraction for project-relative asset resolution.
 */

/** Normalizes forward slashes to backslashes for Windows-style path comparison. */
export function normalizePath(path: string) {
  return path.replaceAll('/', '\\')
}

/** Returns the directory portion of a map source path (text before the last `\`). */
export function getMapDirectory(sourcePath: string) {
  const normalizedSource = normalizePath(sourcePath)
  const separatorIndex = normalizedSource.lastIndexOf('\\')
  return separatorIndex >= 0 ? normalizedSource.slice(0, separatorIndex) : ''
}
