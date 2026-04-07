import type {
  ScaleUpBreathType,
  ScaleUpDraft,
  ScaleUpEditorState,
  ScaleUpImageDimensions,
  ScaleUpResolvedEntry,
  ScaleUpSpriteDraft,
} from './types'

type JsonObject = Record<string, unknown>
type ScaleUpTargetSource = ScaleUpDraft['targetSource']
type ScaleUpFrameLayout = {
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  frameCount: number
}

type ScaleUpFrameOptions = {
  frameWidth?: number
  frameHeight?: number
  previewScale?: number
}

const CANONICAL_SCALEUP_TARGET = '{{Arborsm.ScaleUpUnofficial/Assets}}'
const DEFAULT_FRAME_WIDTH = 64
const DEFAULT_FRAME_HEIGHT = 64
const SCALEUP_TARGETS = new Set([
  normalizeScaleUpTarget(CANONICAL_SCALEUP_TARGET),
  normalizeScaleUpTarget('{{Platonymous.ScaleUp/Assets}}'),
])

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T
}

function normalizeAssetPath(value: string) {
  return value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
    .toLowerCase()
}

function normalizeScaleUpTarget(value: string) {
  const trimmed = value.trim()
  const unwrapped = trimmed.startsWith('{{') && trimmed.endsWith('}}')
    ? trimmed.slice(2, -2).trim()
    : trimmed
  return normalizeAssetPath(unwrapped)
}

function getContentObject(content: unknown) {
  return isJsonObject(content) ? content : { Changes: [] }
}

function getMutableContentObject(content: unknown) {
  return isJsonObject(content) ? cloneJsonValue(content) : { Changes: [] }
}

function getChanges(content: unknown) {
  const contentObject = getContentObject(content)
  const changes = Array.isArray(contentObject.Changes) ? contentObject.Changes : []
  return {
    contentObject,
    changes,
  }
}

function getMutableChanges(content: unknown) {
  const contentObject = getMutableContentObject(content)
  const changes = Array.isArray(contentObject.Changes) ? [...contentObject.Changes] : []
  contentObject.Changes = changes
  return {
    contentObject,
    changes,
  }
}

function getPatchTargetToken(patch: JsonObject) {
  return typeof patch.Target === 'string' ? patch.Target.trim() : ''
}

function isScaleUpPatch(patch: JsonObject) {
  const action = typeof patch.Action === 'string' ? patch.Action.trim() : ''
  return action.localeCompare('EditData', undefined, { sensitivity: 'accent' }) === 0
    && SCALEUP_TARGETS.has(normalizeScaleUpTarget(getPatchTargetToken(patch)))
}

function toOptionalInteger(value: unknown) {
  return Number.isInteger(value) ? Number(value) : null
}

function normalizeBreathType(value: unknown): ScaleUpBreathType {
  if (typeof value === 'number') {
    if (value === 1) {
      return 'Male'
    }
    if (value === 2) {
      return 'Female'
    }
    return 'None'
  }

  if (typeof value !== 'string') {
    return 'None'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'male') {
    return 'Male'
  }
  if (normalized === 'female') {
    return 'Female'
  }
  return 'None'
}

function isCharacterTarget(targetPath: string) {
  return normalizeAssetPath(targetPath).startsWith('characters/')
}

function createDefaultSpriteDraft(): ScaleUpSpriteDraft {
  return {
    breathType: 'None',
    spriteOriginX: null,
    spriteOriginY: null,
    chestSourceX: null,
    chestSourceY: null,
    chestSourceWidth: null,
    chestSourceHeight: null,
    chestAdjustX: null,
    chestAdjustY: null,
    headShotX: 12,
    headShotY: 58,
    headShotXRenderOffset: 0,
    headShotYRenderOffset: 0,
    miniMapXOffset: 0,
    miniMapYOffset: 0,
  }
}

function parseSpriteDraft(value: unknown, targetPath: string): ScaleUpSpriteDraft | null {
  if (!isJsonObject(value)) {
    return isCharacterTarget(targetPath) ? createDefaultSpriteDraft() : null
  }

  const defaults = isCharacterTarget(targetPath) ? createDefaultSpriteDraft() : null
  const sprite: ScaleUpSpriteDraft = {
    breathType: normalizeBreathType(value.BreathType),
    spriteOriginX: toOptionalInteger(value.SpriteOriginX),
    spriteOriginY: toOptionalInteger(value.SpriteOriginY),
    chestSourceX: toOptionalInteger(value.ChestSourceX),
    chestSourceY: toOptionalInteger(value.ChestSourceY),
    chestSourceWidth: toOptionalInteger(value.ChestSourceWidth),
    chestSourceHeight: toOptionalInteger(value.ChestSourceHeight),
    chestAdjustX: toOptionalInteger(value.ChestAdjustX),
    chestAdjustY: toOptionalInteger(value.ChestAdjustY),
    headShotX: toOptionalInteger(value.HeadShotX),
    headShotY: toOptionalInteger(value.HeadShotY),
    headShotXRenderOffset: toOptionalInteger(value.HeadShotXRenderOffset),
    headShotYRenderOffset: toOptionalInteger(value.HeadShotYRenderOffset),
    miniMapXOffset: toOptionalInteger(value.MiniMapXOffset),
    miniMapYOffset: toOptionalInteger(value.MiniMapYOffset),
  }

  if (!defaults) {
    return sprite
  }

  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(sprite).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== 'None'),
    ),
    breathType: sprite.breathType,
  }
}

function extractEntryTargetPaths(entry: JsonObject) {
  const assetPaths = new Set<string>()
  if (typeof entry.Asset === 'string' && entry.Asset.trim()) {
    assetPaths.add(entry.Asset.trim())
  }

  const targetPrefix = typeof entry.Target === 'string' ? entry.Target.trim() : ''

  if (typeof entry.Assets === 'string') {
    for (const segment of entry.Assets.split(',')) {
      const trimmed = segment.trim()
      if (trimmed) {
        assetPaths.add(joinTargetAssetPath(targetPrefix, trimmed))
      }
    }
  }

  if (Array.isArray(entry.Assets)) {
    for (const entryValue of entry.Assets) {
      if (typeof entryValue === 'string' && entryValue.trim()) {
        assetPaths.add(joinTargetAssetPath(targetPrefix, entryValue.trim()))
      }
    }
  }

  return [...assetPaths]
}

function joinTargetAssetPath(targetPrefix: string, assetName: string) {
  if (!targetPrefix) {
    return assetName
  }

  const normalizedTargetPrefix = normalizeAssetPath(targetPrefix)
  const normalizedAssetName = normalizeAssetPath(assetName)
  if (normalizedAssetName.startsWith(`${normalizedTargetPrefix}/`)) {
    return assetName
  }

  return `${targetPrefix}/${assetName}`
}

function getTargetSource(entry: JsonObject, targetPath: string): ScaleUpTargetSource {
  const asset = typeof entry.Asset === 'string' && entry.Asset.trim() ? entry.Asset.trim() : null
  if (asset) {
    return {
      asset,
      target: null,
      assets: [],
      assetsFormat: 'string',
    }
  }

  const target = typeof entry.Target === 'string' && entry.Target.trim() ? entry.Target.trim() : null
  if (typeof entry.Assets === 'string') {
    return {
      asset: null,
      target,
      assets: entry.Assets.split(',').map((segment) => segment.trim()).filter(Boolean),
      assetsFormat: 'string',
    }
  }

  if (Array.isArray(entry.Assets)) {
    return {
      asset: null,
      target,
      assets: entry.Assets.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean),
      assetsFormat: 'array',
    }
  }

  return {
    asset: targetPath,
    target: null,
    assets: [],
    assetsFormat: 'string',
  }
}

function matchesTargetPath(entry: JsonObject, targetPath: string) {
  const normalizedTargetPath = normalizeAssetPath(targetPath)
  return extractEntryTargetPaths(entry).some((entryTarget) => normalizeAssetPath(entryTarget) === normalizedTargetPath)
}

function sanitizeScaleValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

function sanitizePaddingValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value))
}

function sanitizePositiveDimension(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function inferScaleUpImageMetrics(images?: {
  resultImage?: ScaleUpImageDimensions | null
  originalImage?: ScaleUpImageDimensions | null
}) {
  const resultWidth = sanitizePositiveDimension(images?.resultImage?.width)
  const resultHeight = sanitizePositiveDimension(images?.resultImage?.height)
  const originalWidth = sanitizePositiveDimension(images?.originalImage?.width)
  const originalHeight = sanitizePositiveDimension(images?.originalImage?.height)
  const hasOriginalDimensions = resultWidth > 0 && resultHeight > 0 && originalWidth > 0 && originalHeight > 0

  if (!hasOriginalDimensions) {
    return {
      scale: 1,
      paddingWidth: 0,
      paddingHeight: 0,
      resultWidth,
      resultHeight,
      originalWidth: 0,
      originalHeight: 0,
      hasOriginalDimensions: false,
    }
  }

  const widthScale = resultWidth / originalWidth
  const heightScale = resultHeight / originalHeight
  const inferredScale = Math.floor(Math.min(widthScale, heightScale))
  const scale = Math.max(1, Number.isFinite(inferredScale) ? inferredScale : 1)
  const paddingWidth = Math.max(0, resultWidth - originalWidth * scale)
  const paddingHeight = Math.max(0, resultHeight - originalHeight * scale)
  const hasScaleUpDimensions = Math.abs(widthScale - heightScale) < 0.001 && (scale > 1 || paddingWidth > 0 || paddingHeight > 0)

  return {
    scale,
    paddingWidth,
    paddingHeight,
    resultWidth,
    resultHeight,
    originalWidth,
    originalHeight,
    hasOriginalDimensions: hasScaleUpDimensions,
  }
}

function resolveScaleUpFrameLayout(
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
  options?: ScaleUpFrameOptions,
): ScaleUpFrameLayout {
  const baseFrameWidth = sanitizePositiveDimension(options?.frameWidth, DEFAULT_FRAME_WIDTH)
  const baseFrameHeight = sanitizePositiveDimension(options?.frameHeight, DEFAULT_FRAME_HEIGHT)
  const metrics = inferScaleUpImageMetrics(images)

  if (metrics.hasOriginalDimensions) {
    const columns = Math.max(1, Math.floor(metrics.originalWidth / baseFrameWidth))
    const rows = Math.max(1, Math.floor(metrics.originalHeight / baseFrameHeight))
    const frameWidth = Math.max(baseFrameWidth, baseFrameWidth * metrics.scale)
    const frameHeight = Math.max(baseFrameHeight, baseFrameHeight * metrics.scale)
    return {
      frameWidth,
      frameHeight,
      columns,
      rows,
      frameCount: Math.max(1, columns * rows),
    }
  }

  if (metrics.resultWidth <= 0 || metrics.resultHeight <= 0) {
    return {
      frameWidth: baseFrameWidth,
      frameHeight: baseFrameHeight,
      columns: 0,
      rows: 0,
      frameCount: 0,
    }
  }

  if (metrics.resultWidth < baseFrameWidth || metrics.resultHeight < baseFrameHeight) {
    return {
      frameWidth: Math.max(metrics.resultWidth, baseFrameWidth),
      frameHeight: Math.max(metrics.resultHeight, baseFrameHeight),
      columns: 1,
      rows: 1,
      frameCount: 1,
    }
  }

  const columns = Math.max(1, Math.floor(metrics.resultWidth / baseFrameWidth))
  const rows = Math.max(1, Math.floor(metrics.resultHeight / baseFrameHeight))
  return {
    frameWidth: baseFrameWidth,
    frameHeight: baseFrameHeight,
    columns,
    rows,
    frameCount: Math.max(1, columns * rows),
  }
}

export function getScaleUpFrameCount(
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
  options?: ScaleUpFrameOptions,
) {
  return resolveScaleUpFrameLayout(images, options).frameCount
}

export function getScaleUpFrameBounds(
  images: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  } | undefined,
  frameIndex: number,
  options?: ScaleUpFrameOptions,
) {
  const layout = resolveScaleUpFrameLayout(images, options)
  if (layout.frameCount <= 0) {
    return {
      frameWidth: layout.frameWidth,
      frameHeight: layout.frameHeight,
      frameX: 0,
      frameY: 0,
    }
  }

  const clampedFrameIndex = Math.max(0, Math.min(layout.frameCount - 1, frameIndex))
  return {
    frameWidth: layout.frameWidth,
    frameHeight: layout.frameHeight,
    frameX: (clampedFrameIndex % layout.columns) * layout.frameWidth,
    frameY: Math.floor(clampedFrameIndex / layout.columns) * layout.frameHeight,
  }
}

export function getScaleUpFramePreviewScale(
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
  options?: ScaleUpFrameOptions,
) {
  const layout = resolveScaleUpFrameLayout(images, options)
  const baseFrameWidth = sanitizePositiveDimension(options?.frameWidth, DEFAULT_FRAME_WIDTH)
  const baseFrameHeight = sanitizePositiveDimension(options?.frameHeight, DEFAULT_FRAME_HEIGHT)
  const previewScale = typeof options?.previewScale === 'number' && Number.isFinite(options.previewScale) && options.previewScale > 0
    ? options.previewScale
    : 1

  if (layout.frameWidth <= 0 || layout.frameHeight <= 0) {
    return previewScale
  }

  return previewScale * Math.min(
    baseFrameWidth / layout.frameWidth,
    baseFrameHeight / layout.frameHeight,
    1,
  )
}

export function getScaleUpFramePreviewMetrics(
  images: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  } | undefined,
  frameIndex: number,
  options?: ScaleUpFrameOptions,
) {
  const bounds = getScaleUpFrameBounds(images, frameIndex, options)
  const layout = resolveScaleUpFrameLayout(images, options)
  const metrics = inferScaleUpImageMetrics(images)
  const previewScale = getScaleUpFramePreviewScale(images, options)
  const sheetWidth = (metrics.resultWidth > 0 ? metrics.resultWidth : layout.frameWidth * Math.max(1, layout.columns)) * previewScale
  const sheetHeight = (metrics.resultHeight > 0 ? metrics.resultHeight : layout.frameHeight * Math.max(1, layout.rows)) * previewScale

  return {
    frameWidth: bounds.frameWidth * previewScale,
    frameHeight: bounds.frameHeight * previewScale,
    frameX: bounds.frameX * previewScale,
    frameY: bounds.frameY * previewScale,
    sheetWidth,
    sheetHeight,
  }
}

function buildScaleUpEntryKey(targetPath: string) {
  const normalized = targetPath
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => segment.trim().replace(/[^A-Za-z0-9_]+/g, '_'))
    .filter(Boolean)
    .join('.')
  return `ModForge.ScaleUp.${normalized || 'Target'}`
}

export function findScaleUpEntry(content: unknown, targetPath: string): ScaleUpResolvedEntry | null {
  const { changes } = getChanges(content)

  for (let patchIndex = changes.length - 1; patchIndex >= 0; patchIndex -= 1) {
    const patch = changes[patchIndex]
    if (!isJsonObject(patch) || !isScaleUpPatch(patch) || !isJsonObject(patch.Entries)) {
      continue
    }

    for (const [key, value] of Object.entries(patch.Entries)) {
      if (Array.isArray(value)) {
        for (let entryIndex = 0; entryIndex < value.length; entryIndex += 1) {
          const candidate = value[entryIndex]
          if (!isJsonObject(candidate) || !matchesTargetPath(candidate, targetPath)) {
            continue
          }

          return {
            key,
            patchIndex,
            entryIndex,
            targetPath,
            targetToken: getPatchTargetToken(patch),
            targetSource: getTargetSource(candidate, targetPath),
            scale: sanitizeScaleValue(candidate.Scale),
            paddingWidth: sanitizePaddingValue(candidate.PaddingWidth),
            paddingHeight: sanitizePaddingValue(candidate.PaddingHeight),
            sprite: parseSpriteDraft(candidate.Sprite, targetPath),
          }
        }
        continue
      }

      if (!isJsonObject(value) || !matchesTargetPath(value, targetPath)) {
        continue
      }

      return {
        key,
        patchIndex,
        entryIndex: null,
        targetPath,
        targetToken: getPatchTargetToken(patch),
        targetSource: getTargetSource(value, targetPath),
        scale: sanitizeScaleValue(value.Scale),
        paddingWidth: sanitizePaddingValue(value.PaddingWidth),
        paddingHeight: sanitizePaddingValue(value.PaddingHeight),
        sprite: parseSpriteDraft(value.Sprite, targetPath),
      }
    }
  }

  return null
}

export function deriveScaleUpDraft(
  targetPath: string,
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
): ScaleUpDraft {
  const { scale, paddingWidth, paddingHeight } = inferScaleUpImageMetrics(images)

  return {
    key: buildScaleUpEntryKey(targetPath),
    targetPath,
    targetToken: CANONICAL_SCALEUP_TARGET,
    targetSource: {
      asset: targetPath,
      target: null,
      assets: [],
      assetsFormat: 'string',
    },
    scale,
    paddingWidth,
    paddingHeight,
    sprite: isCharacterTarget(targetPath) ? createDefaultSpriteDraft() : null,
  }
}

function toSpriteJson(sprite: ScaleUpSpriteDraft | null) {
  if (!sprite) {
    return undefined
  }

  const spriteJson: JsonObject = {}
  if (sprite.breathType !== 'None') {
    spriteJson.BreathType = sprite.breathType
  }

  const fieldMap: Array<[keyof ScaleUpSpriteDraft, string]> = [
    ['spriteOriginX', 'SpriteOriginX'],
    ['spriteOriginY', 'SpriteOriginY'],
    ['chestSourceX', 'ChestSourceX'],
    ['chestSourceY', 'ChestSourceY'],
    ['chestSourceWidth', 'ChestSourceWidth'],
    ['chestSourceHeight', 'ChestSourceHeight'],
    ['chestAdjustX', 'ChestAdjustX'],
    ['chestAdjustY', 'ChestAdjustY'],
    ['headShotX', 'HeadShotX'],
    ['headShotY', 'HeadShotY'],
    ['headShotXRenderOffset', 'HeadShotXRenderOffset'],
    ['headShotYRenderOffset', 'HeadShotYRenderOffset'],
    ['miniMapXOffset', 'MiniMapXOffset'],
    ['miniMapYOffset', 'MiniMapYOffset'],
  ]

  for (const [field, jsonKey] of fieldMap) {
    const value = sprite[field]
    if (typeof value === 'number') {
      spriteJson[jsonKey] = value
    }
  }

  return Object.keys(spriteJson).length ? spriteJson : undefined
}

function buildEntryJson(draft: ScaleUpDraft) {
  const entry: JsonObject = {
    Scale: Math.max(1, Math.floor(draft.scale)),
    PaddingWidth: Math.max(0, Math.floor(draft.paddingWidth)),
    PaddingHeight: Math.max(0, Math.floor(draft.paddingHeight)),
  }

  if (draft.targetSource.asset?.trim()) {
    entry.Asset = draft.targetSource.asset.trim()
  } else if (draft.targetSource.target?.trim() && draft.targetSource.assets.length) {
    entry.Target = draft.targetSource.target.trim()
    entry.Assets = draft.targetSource.assetsFormat === 'array'
      ? [...draft.targetSource.assets]
      : draft.targetSource.assets.join(', ')
  } else {
    entry.Asset = draft.targetPath
  }

  const sprite = toSpriteJson(draft.sprite)
  if (sprite) {
    entry.Sprite = sprite
  }

  return entry
}

function getPatchEntries(patch: JsonObject) {
  return isJsonObject(patch.Entries) ? { ...patch.Entries } : {}
}

function findPatchIndexForTargetToken(changes: unknown[], targetToken: string) {
  const normalizedTargetToken = normalizeScaleUpTarget(targetToken)
  return changes.findIndex((entry) => isJsonObject(entry) && normalizeScaleUpTarget(getPatchTargetToken(entry)) === normalizedTargetToken)
}

export function upsertScaleUpEntry(content: unknown, draft: ScaleUpDraft) {
  const { contentObject, changes } = getMutableChanges(content)
  const existingEntry = findScaleUpEntry(contentObject, draft.targetPath)
  const entryJson = buildEntryJson(draft)

  if (existingEntry) {
    const patch = isJsonObject(changes[existingEntry.patchIndex]) ? { ...(changes[existingEntry.patchIndex] as JsonObject) } : {}
    const entries = getPatchEntries(patch)
    const entryKey = draft.key || existingEntry.key

    if (existingEntry.entryIndex != null && Array.isArray(entries[existingEntry.key])) {
      const existingArray = [...(entries[existingEntry.key] as unknown[])]
      existingArray[existingEntry.entryIndex] = entryJson
      entries[existingEntry.key] = existingArray
      if (draft.key !== existingEntry.key) {
        entries[entryKey] = existingArray
        delete entries[existingEntry.key]
      }
    } else {
      entries[entryKey] = entryJson
      if (draft.key !== existingEntry.key) {
        delete entries[existingEntry.key]
      }
    }
    patch.Entries = entries
    changes[existingEntry.patchIndex] = patch
    contentObject.Changes = changes
    return contentObject
  }

  const patchIndex = findPatchIndexForTargetToken(changes, draft.targetToken)
  if (patchIndex >= 0) {
    const patch = isJsonObject(changes[patchIndex]) ? { ...(changes[patchIndex] as JsonObject) } : {}
    const entries = getPatchEntries(patch)
    entries[draft.key] = entryJson
    patch.Entries = entries
    changes[patchIndex] = patch
  } else {
    changes.push({
      Action: 'EditData',
      Target: draft.targetToken,
      Entries: {
        [draft.key]: entryJson,
      },
    })
  }

  contentObject.Changes = changes
  return contentObject
}

export function getScaleUpEditorState(
  content: unknown,
  targetPath: string,
  images?: {
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  },
): ScaleUpEditorState {
  const existingEntry = findScaleUpEntry(content, targetPath)
  if (existingEntry) {
    return {
      source: 'existing',
      draft: existingEntry,
    }
  }

  return {
    source: 'derived',
    draft: deriveScaleUpDraft(targetPath, images),
  }
}

export type {
  ScaleUpBreathType,
  ScaleUpDraft,
  ScaleUpEditorState,
  ScaleUpImageDimensions,
  ScaleUpResolvedEntry,
  ScaleUpSpriteDraft,
} from './types'
