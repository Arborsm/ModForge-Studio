import bundledJson from './mapObjects.json'

/**
 * 地图编辑器"对象库"的目录 schema 与注册表：描述 tilesheet 上的预定义
 * 矩形对象（家具、结构件等），点选即得整个矩形 stamp。内置 bundled
 * 目录随模块加载直接进注册表；游戏家具与项目自定义对象可调用
 * `registerMapObjects` 按 source 追加，后注册的 source 覆盖同 id 条目。
 */

/** 对象库分类：`MAP_OBJECT_CATEGORIES` 的取值，顺序即 UI 分组顺序。 */
export type MapObjectCategory =
  | 'seating'
  | 'tables'
  | 'beds'
  | 'rugs'
  | 'lighting'
  | 'electronics'
  | 'plants'
  | 'decor'
  | 'storage'
  | 'windows'
  | 'structure'
  | 'walls-floors'
  | 'outdoor'
  | 'festival'
  | 'other'

/** 所有受支持的对象分类，按上面定义的顺序排列。 */
export const MAP_OBJECT_CATEGORIES: readonly MapObjectCategory[] = [
  'seating',
  'tables',
  'beds',
  'rugs',
  'lighting',
  'electronics',
  'plants',
  'decor',
  'storage',
  'windows',
  'structure',
  'walls-floors',
  'outdoor',
  'festival',
  'other',
]

/** 对象在 sheet 上的矩形区域（tile 单位）。 */
export type MapCatalogObjectRect = { x: number; y: number; width: number; height: number }

/**
 * 对象目录中的一条预定义对象：引用 tilesheet 目录 key（如
 * `TileSheets/furniture`、`Maps/townInterior`）上的一个矩形 stamp。
 */
export type MapCatalogObject = {
  id: string
  /** tilesheet 目录 key，形如 `TileSheets/furniture`。 */
  sheet: string
  rect: MapCatalogObjectRect
  category: MapObjectCategory
  /** 按 locale code（'en-US'、'zh-CN'…）存的显示名。 */
  names: Record<string, string>
}

/** `parseMapObjectsJson` 的结果：成功返回对象列表，失败返回带 source 前缀的错误。 */
export type MapObjectsParseResult = { ok: true; objects: MapCatalogObject[] } | { ok: false; error: string }

const OBJECT_CATEGORY_SET = new Set<string>(MAP_OBJECT_CATEGORIES)

function fail(source: string, detail: string): MapObjectsParseResult {
  return { ok: false, error: `${source}: ${detail}` }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析并校验一份对象目录 JSON 文档。schema 为
 * `{ "version": 1, "objects": [{ "id", "sheet", "rect", "category", "names" }] }`，
 * version 只接受 1 或缺省。id 非空且大小写不敏感去重；sheet 必须是
 * `文件夹/文件名` 形式的 Content asset key；rect 四字段均为整数且
 * x/y>=0、width/height>=1；category 必须是已知枚举值；names 为 locale
 * code 到显示名的映射，至少含一个非空值（en-US 允许缺失）。任何失败
 * 都带 `source` 前缀与 `objects[i]` 下标，不做部分成功。
 */
export function parseMapObjectsJson(text: string, source: string): MapObjectsParseResult {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (error) {
    return fail(source, error instanceof Error ? error.message : String(error))
  }
  if (!isPlainObject(root)) {
    return fail(source, 'the catalog root must be an object')
  }
  const version = root.version
  if (version !== undefined && version !== 1) {
    return fail(source, `unsupported catalog version ${JSON.stringify(version)}`)
  }
  const objects = root.objects
  if (!Array.isArray(objects)) {
    return fail(source, 'the catalog must contain an "objects" array')
  }
  const seen = new Set<string>()
  const entries: MapCatalogObject[] = []
  for (const [index, raw] of objects.entries()) {
    const label = `objects[${index}]`
    if (!isPlainObject(raw)) {
      return fail(source, `${label} must be an object`)
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (id === '') {
      return fail(source, `${label}.id must be a non-empty string`)
    }
    const sheet = typeof raw.sheet === 'string' ? raw.sheet : ''
    if (!/^[^/]+\/[^/]+$/u.test(sheet)) {
      return fail(source, `${label}.sheet must be a Content asset key like "Maps/townInterior"`)
    }
    const rect = raw.rect
    if (!isPlainObject(rect)) {
      return fail(source, `${label}.rect must be an object`)
    }
    if (!Number.isInteger(rect.x) || (rect.x as number) < 0) {
      return fail(source, `${label}.rect.x must be a non-negative integer`)
    }
    if (!Number.isInteger(rect.y) || (rect.y as number) < 0) {
      return fail(source, `${label}.rect.y must be a non-negative integer`)
    }
    if (!Number.isInteger(rect.width) || (rect.width as number) < 1) {
      return fail(source, `${label}.rect.width must be a positive integer`)
    }
    if (!Number.isInteger(rect.height) || (rect.height as number) < 1) {
      return fail(source, `${label}.rect.height must be a positive integer`)
    }
    const category = raw.category
    if (typeof category !== 'string' || !OBJECT_CATEGORY_SET.has(category)) {
      return fail(source, `${label}.category must be one of: ${MAP_OBJECT_CATEGORIES.join(', ')}`)
    }
    const names = raw.names
    if (!isPlainObject(names)) {
      return fail(source, `${label}.names must be an object mapping locale codes to display names`)
    }
    const nameValues = Object.values(names)
    const hasInvalidName = nameValues.some((value) => typeof value !== 'string')
    const hasNonEmptyName = nameValues.some((value) => typeof value === 'string' && value.trim() !== '')
    if (hasInvalidName || !hasNonEmptyName) {
      return fail(source, `${label}.names must map locale codes to non-empty display names`)
    }
    const dedupeKey = id.toLowerCase()
    if (seen.has(dedupeKey)) {
      return fail(source, `${label} duplicates the id "${id}"`)
    }
    seen.add(dedupeKey)
    entries.push({
      id,
      sheet,
      rect: { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number },
      category: category as MapObjectCategory,
      names: names as Record<string, string>,
    })
  }
  return { ok: true, objects: entries }
}

/** 内置对象目录的注册表 source。 */
export const BUNDLED_MAP_OBJECTS_SOURCE = 'bundled'
/** 游戏内家具等原版对象的注册表 source。 */
export const GAME_FURNITURE_SOURCE = 'game-furniture'
/** 项目自定义对象文件（`assets/map-objects.json`）的注册表 source。 */
export const PROJECT_MAP_OBJECTS_SOURCE = 'project:assets/map-objects.json'

const bundledParse = parseMapObjectsJson(JSON.stringify(bundledJson), 'mapObjects.json')
if (!bundledParse.ok) {
  throw new Error(`Invalid bundled map objects catalog: ${bundledParse.error}`)
}

const customObjectsBySource = new Map<string, readonly MapCatalogObject[]>()
const objectListeners = new Set<() => void>()
let mergedObjects: readonly MapCatalogObject[] = []

function rebuildMergedObjects() {
  const byId = new Map<string, MapCatalogObject>()
  for (const objects of customObjectsBySource.values()) {
    for (const object of objects) byId.set(object.id.toLowerCase(), object)
  }
  mergedObjects = Object.freeze([...byId.values()])
  for (const listener of objectListeners) listener()
}

/**
 * 注册（或替换）某个 source 贡献的对象目录条目；后注册的 source 覆盖
 * 同 id 的早注册条目。source 失效时需配套调用 `unregisterMapObjects`。
 */
export function registerMapObjects(source: string, objects: readonly MapCatalogObject[]) {
  customObjectsBySource.set(source, objects)
  rebuildMergedObjects()
}

/** 移除某个 source 贡献的全部对象目录条目；source 不存在时无副作用。 */
export function unregisterMapObjects(source: string) {
  if (!customObjectsBySource.delete(source)) return
  rebuildMergedObjects()
}

/** 合并后的对象目录（内置 bundled 加已注册自定义条目），引用在注册变化前稳定。 */
export function getMapObjects(): readonly MapCatalogObject[] {
  return mergedObjects
}

/** useSyncExternalStore subscribe：注册表变化时触发。 */
export function subscribeMapObjects(listener: () => void) {
  objectListeners.add(listener)
  return () => {
    objectListeners.delete(listener)
  }
}

/**
 * 按 locale 取对象显示名：优先精确命中，其次回退 en-US，再取首个非空
 * 名称，最后回退到 id。en-US 缺失或 names 为空时仍能给出可读结果。
 */
export function mapObjectDisplayName(object: MapCatalogObject, locale: string): string {
  return object.names[locale] ?? object.names['en-US'] ?? Object.values(object.names).find((name) => name.trim() !== '') ?? object.id
}

// 内置 bundled 对象在模块加载时直接进注册表；构建期数据解析失败即抛错。
registerMapObjects(BUNDLED_MAP_OBJECTS_SOURCE, bundledParse.objects)
