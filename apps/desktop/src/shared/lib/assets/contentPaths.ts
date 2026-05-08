const CONTENT_PREFIX_PATTERN = /^Content\\+/iu
const XNB_SUFFIX_PATTERN = /\.xnb$/iu

export const CHARACTER_DATA_ASSET_PATH = 'Content\\Data\\Characters.xnb'
export const CHARACTER_GIFT_TASTES_ASSET_PATH = 'Content\\Data\\NPCGiftTastes.xnb'
export const OBJECT_DATA_ASSET_PATH = 'Content\\Data\\Objects.xnb'
export const SPRING_OBJECTS_ASSET_PATH = 'Content\\Maps\\springobjects.xnb'

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
