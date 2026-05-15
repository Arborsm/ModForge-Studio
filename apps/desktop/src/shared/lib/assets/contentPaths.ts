const CONTENT_PREFIX_PATTERN = /^Content\\+/iu
const XNB_SUFFIX_PATTERN = /\.xnb$/iu

/** Vanilla character data asset path. */
export const CHARACTER_DATA_ASSET_PATH = 'Content\\Data\\Characters.xnb'
/** Vanilla NPC gift taste data asset path. */
export const CHARACTER_GIFT_TASTES_ASSET_PATH = 'Content\\Data\\NPCGiftTastes.xnb'
/** Vanilla object data asset path. */
export const OBJECT_DATA_ASSET_PATH = 'Content\\Data\\Objects.xnb'
/** Vanilla spring objects tilesheet path. */
export const SPRING_OBJECTS_ASSET_PATH = 'Content\\Maps\\springobjects.xnb'

/** Builds an absolute `Content\\*.xnb` path from a game root and asset name. */
export function buildGameContentPath(rootPath: string, assetName: string | null) {
  if (!assetName) {
    return null
  }

  const normalizedAssetName = assetName.replaceAll('/', '\\').replace(CONTENT_PREFIX_PATTERN, '').replace(XNB_SUFFIX_PATTERN, '')

  if (!normalizedAssetName) {
    return null
  }

  return `${rootPath}\\Content\\${normalizedAssetName}.xnb`
}
