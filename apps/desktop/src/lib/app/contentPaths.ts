const CONTENT_PREFIX_PATTERN = /^Content\\+/iu
const XNB_SUFFIX_PATTERN = /\.xnb$/iu

export function buildGameContentPath(rootPath: string, assetName: string | null) {
  if (!assetName) {
    return null
  }

  const normalizedAssetName = assetName
    .replaceAll('/', '\\')
    .replace(CONTENT_PREFIX_PATTERN, '')
    .replace(XNB_SUFFIX_PATTERN, '')

  if (!normalizedAssetName) {
    return null
  }

  return `${rootPath}\\Content\\${normalizedAssetName}.xnb`
}
