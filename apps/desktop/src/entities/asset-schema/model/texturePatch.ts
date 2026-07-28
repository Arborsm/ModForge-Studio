/**
 * Companion-image lookup shared by every structured asset editor.
 *
 * A data entry only names its sheet (`Texture`); whether that sheet exists is a
 * property of the *draft*, not of the entry, so each authoring page has to join
 * the entry against the draft's `Load` / `EditImage` patches to tell an author
 * whether the sprite they just referenced will actually ship.
 */

/** Minimal structural view over a draft patch used for texture lookups. */
export type AssetTexturePatchInput = {
  action: string
  target: string
  fromFile?: string
  logName?: string
}

/** Read-only status of the Load/EditImage patch backing one texture asset. */
export type AssetTexturePatchState = {
  assetTarget: string
  patchFound: boolean
  patchAction: string | null
  patchLogName: string | null
  fromFile: string | null
  /** Whether `fromFile` is among the draft's staged files, not just referenced. */
  fileInDraft: boolean
}

function normalizeAssetTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

/**
 * Scans draft patches for the Load/EditImage patch providing one texture asset
 * and reports its `fromFile` plus whether that file is present among the draft's
 * virtual assets.
 *
 * `assetName` is the entry's own texture value, so an entry pointing at a shared
 * vanilla sheet reports on that sheet rather than on a guessed per-entry path.
 */
export function findTexturePatchState(
  patches: ReadonlyArray<AssetTexturePatchInput>,
  assetName: string,
  virtualAssets: ReadonlyArray<{ relativePath: string }>,
): AssetTexturePatchState {
  const assetTarget = assetName.trim()
  const wanted = normalizeAssetTarget(assetTarget)
  const match = patches.find(
    (patch) => (patch.action === 'Load' || patch.action === 'EditImage') && normalizeAssetTarget(patch.target) === wanted,
  )
  const fromFile = match?.fromFile?.trim() || null
  return {
    assetTarget,
    patchFound: Boolean(match),
    patchAction: match?.action ?? null,
    patchLogName: match?.logName?.trim() || null,
    fromFile,
    fileInDraft: fromFile !== null && virtualAssets.some((asset) => asset.relativePath === fromFile),
  }
}
