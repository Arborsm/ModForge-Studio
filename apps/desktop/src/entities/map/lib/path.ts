export function normalizePath(path: string) {
  return path.replaceAll('/', '\\')
}

export function getMapDirectory(sourcePath: string) {
  const normalizedSource = normalizePath(sourcePath)
  const separatorIndex = normalizedSource.lastIndexOf('\\')
  return separatorIndex >= 0 ? normalizedSource.slice(0, separatorIndex) : normalizedSource
}
