import { useEffect, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ImageOff, Search, Star } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import {
  MAP_OBJECT_CATEGORIES,
  findTilesheetByKey,
  gameSheetImagePath,
  gameSheetKeyOfTileset,
  getMapObjects,
  mapObjectDisplayName,
  subscribeMapObjects,
  type MapCatalogObject,
  type MapObjectCategory,
  type MapTileset,
} from '@entities/map'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'
import { FAVORITE_OBJECTS_LIMIT, usePreferencesStore } from '@shared/lib/app-state'
import { cx } from '@shared/lib/helper'
import { packMapObjectsIntoRows } from '../../model/mapObjectLayout'

/** 固定缩略缩放：1 tile = 24px（4 格对象是 1 格的 4 倍大）。 */
const TILE_PX = 24
/** 布局单元宽度（tile）：一个单元 = 4 tile 宽的对象位。 */
const CELL_UNITS = 4
/** 名称区高度（两行小字，px）。 */
const NAME_LINES_PX = 28
/** 行内对象间距（px），与 CSS gap 一致。 */
const ROW_GAP_PX = 6
/** 收藏伪分类的取值。 */
const FAVORITES_CATEGORY = '__favorites__' as const

type CategoryFilter = MapObjectCategory | '' | typeof FAVORITES_CATEGORY

type MapObjectLibraryPanelProps = {
  gameRootPath: string | null
  locale: LocaleCode
  /** capabilities.tilesetManagement；false（session）时只允许点选已附着 sheet 的对象。 */
  canAttach: boolean
  attachedTilesets: readonly MapTileset[]
  onPickObject: (object: MapCatalogObject) => void
  /** 「整图」子 tab 内容（去悬浮后的 MapTilesetPalette 由父级传入）。 */
  sheetTab: ReactNode
}

type ThumbState = { status: 'loading' | 'ready' | 'error'; image: HTMLImageElement | null }

/**
 * 地图编辑器底部「对象库」面板：对象 tab 以横向分类 tab 条 + 搜索过滤目录
 * （内置 bundled、游戏家具、项目自定义），装箱成行虚拟滚动，点选即调
 * `onPickObject`，星标可收藏（偏好持久化）；整图 tab 渲染父级传入的停靠
 * MapTilesetPalette。未连接游戏目录时对象 tab 显示 unavailable。
 */
export function MapObjectLibraryPanel({
  gameRootPath,
  locale,
  canAttach,
  attachedTilesets,
  onPickObject,
  sheetTab,
}: MapObjectLibraryPanelProps) {
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const [activeTab, setActiveTab] = useState<'objects' | 'sheet'>('objects')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('')
  const objects = useSyncExternalStore(subscribeMapObjects, getMapObjects)
  const favoriteObjects = usePreferencesStore((state) => state.mapEditorPalette.favoriteObjects)
  const setMapEditorPalette = usePreferencesStore((state) => state.setMapEditorPalette)
  const favoriteIds = new Set(favoriteObjects)

  function toggleFavorite(id: string) {
    const current = usePreferencesStore.getState().mapEditorPalette.favoriteObjects
    const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(0, FAVORITE_OBJECTS_LIMIT)
    setMapEditorPalette({ favoriteObjects: next })
  }

  const normalizedSearch = search.trim().toLowerCase()
  const attachedSheetKeys = new Set(
    attachedTilesets.map((tileset) => gameSheetKeyOfTileset(tileset)).filter((key): key is string => key !== null),
  )
  const filtered = objects.filter((object) => {
    if (category === FAVORITES_CATEGORY && !favoriteIds.has(object.id)) return false
    if (category !== '' && category !== FAVORITES_CATEGORY && object.category !== category) return false
    if (normalizedSearch !== '' && !mapObjectDisplayName(object, locale).toLowerCase().includes(normalizedSearch)) return false
    return true
  })

  // 列数随面板宽度自适应：每列一个 CELL_UNITS×TILE_PX 对象位。
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    if (!gridElement) return
    const observer = new ResizeObserver(() => setGridWidth(gridElement.clientWidth))
    observer.observe(gridElement)
    setGridWidth(gridElement.clientWidth)
    return () => observer.disconnect()
  }, [gridElement])
  const columns = Math.max(2, Math.min(12, Math.floor((gridWidth + ROW_GAP_PX) / (CELL_UNITS * TILE_PX + ROW_GAP_PX))))

  const rows = packMapObjectsIntoRows(filtered, columns)
  const rowHeightOf = (row: (typeof rows)[number]) => row.heightUnits * TILE_PX + NAME_LINES_PX + ROW_GAP_PX
  const rowVirtualizer = useVirtualizer({
    count: activeTab === 'objects' ? rows.length : 0,
    getScrollElement: () => gridElement,
    estimateSize: (index) => rowHeightOf(rows[index]!),
    overscan: 2,
  })
  useEffect(() => {
    rowVirtualizer.measure()
  }, [columns, filtered, rowVirtualizer])

  const categoryChips: ReadonlyArray<{ value: CategoryFilter; label: string; icon?: ReactNode }> = [
    { value: '', label: copy.objectLibraryAllCategories },
    { value: FAVORITES_CATEGORY, label: copy.objectLibraryFavorites, icon: <Star className="h-3 w-3" aria-hidden="true" /> },
    ...MAP_OBJECT_CATEGORIES.map((item) => ({ value: item as CategoryFilter, label: copy.objectLibraryCategory[item] })),
  ]

  return (
    <div className="map-object-library">
      <div className="map-object-library-header">
        <div className="map-object-library-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'objects'}
            className={cx('map-object-library-tab', activeTab === 'objects' && 'is-active')}
            onClick={() => setActiveTab('objects')}
          >
            {copy.objectLibraryObjectsTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sheet'}
            className={cx('map-object-library-tab', activeTab === 'sheet' && 'is-active')}
            onClick={() => setActiveTab('sheet')}
          >
            {copy.objectLibrarySheetTab}
          </button>
        </div>
        {activeTab === 'objects' ? (
          <label className="map-object-library-search">
            <Search className="map-object-library-search-icon h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.objectLibrarySearch}
              aria-label={copy.objectLibrarySearch}
            />
          </label>
        ) : null}
      </div>
      {activeTab === 'sheet' ? (
        <div className="map-object-library-tab-body">{sheetTab}</div>
      ) : gameRootPath === null ? (
        <div className="map-object-library-state">{copy.objectLibraryUnavailable}</div>
      ) : objects.length === 0 ? (
        <div className="map-object-library-state">{copy.objectLibraryLoading}</div>
      ) : (
        <>
          <div className="map-object-library-categories" role="tablist" aria-label={copy.objectLibraryAllCategories}>
            {categoryChips.map((chip) => (
              <button
                key={chip.value || 'all'}
                type="button"
                role="tab"
                aria-selected={category === chip.value}
                className={cx('map-object-library-chip', category === chip.value && 'is-active')}
                onClick={() => setCategory(chip.value)}
              >
                {chip.icon}
                {chip.label}
              </button>
            ))}
          </div>
          <div className="map-object-library-grid" ref={setGridElement}>
            {filtered.length === 0 ? (
              <div className="map-object-library-state">
                {category === FAVORITES_CATEGORY && normalizedSearch === '' ? copy.objectLibraryFavoritesEmpty : copy.objectLibraryEmpty}
              </div>
            ) : (
              <div className="map-object-library-virtual" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index]!
                  return (
                    <div
                      key={row.key}
                      className="map-object-library-row"
                      style={{ height: `${rowHeightOf(row)}px`, transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {row.items.map((object) => (
                        <ObjectThumbnail
                          key={object.id}
                          object={object}
                          locale={locale}
                          columns={columns}
                          gameRootPath={gameRootPath}
                          errorFactory={copy.tilesetImageError}
                          available={attachedSheetKeys.has(object.sheet) || (canAttach && findTilesheetByKey(object.sheet) != null)}
                          favorite={favoriteIds.has(object.id)}
                          favoriteLabel={copy.objectLibraryFavoriteToggle(mapObjectDisplayName(object, locale))}
                          onToggleFavorite={() => toggleFavorite(object.id)}
                          onPick={() => onPickObject(object)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 单个对象的缩略图按钮：固定 1 tile=24px 缩放（超列宽的对象整体等比缩
 * 小），CSS background 按对象矩形在 sheet 上的 tile 坐标取负偏移；下方名
 * 称最多两行（title 全名）；右上角星标切换收藏。sheet 未附着且不可附加
 * 时禁用淡显；图像加载中/失败显示占位图标。
 */
function ObjectThumbnail({
  object,
  locale,
  columns,
  gameRootPath,
  errorFactory,
  available,
  favorite,
  favoriteLabel,
  onToggleFavorite,
  onPick,
}: {
  object: MapCatalogObject
  locale: LocaleCode
  columns: number
  gameRootPath: string
  errorFactory: (path: string) => string
  available: boolean
  favorite: boolean
  favoriteLabel: string
  onToggleFavorite: () => void
  onPick: () => void
}) {
  const imagePath = gameSheetImagePath(object.sheet, gameRootPath)
  const [thumbState, setThumbState] = useState<ThumbState>({ status: 'loading', image: null })

  useEffect(() => {
    let current = true
    setThumbState({ status: 'loading', image: null })
    void loadImage(imagePath, locale, errorFactory)
      .then((image) => {
        if (current) setThumbState({ status: 'ready', image })
      })
      .catch(() => {
        if (current) setThumbState({ status: 'error', image: null })
      })
    return () => {
      current = false
    }
  }, [errorFactory, imagePath, locale])

  const scale = object.rect.width > columns ? columns / object.rect.width : 1
  const thumbWidth = Math.round(object.rect.width * TILE_PX * scale)
  const thumbHeight = Math.round(object.rect.height * TILE_PX * scale)
  // 名称用足布局槽位宽度（每格位 CELL_UNITS×TILE_PX），避免 1 格宽对象的名字被裁断。
  const slotWidth = Math.min(object.rect.width, columns) * CELL_UNITS * TILE_PX
  const name = mapObjectDisplayName(object, locale)

  return (
    <span className="map-object-library-object" style={{ width: `${slotWidth}px` }}>
      <button
        type="button"
        className={cx('map-object-library-object-pick', !available && 'is-disabled')}
        disabled={!available}
        title={name}
        onClick={onPick}
      >
        <span className="map-object-library-object-thumb" style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}>
          {thumbState.status === 'ready' && thumbState.image ? (
            <i
              className="map-object-library-object-sprite"
              style={{
                width: `${thumbWidth}px`,
                height: `${thumbHeight}px`,
                backgroundImage: `url(${JSON.stringify(thumbState.image.src)})`,
                backgroundSize: `${thumbState.image.naturalWidth * scale}px ${thumbState.image.naturalHeight * scale}px`,
                backgroundPosition: `${-object.rect.x * TILE_PX * scale}px ${-object.rect.y * TILE_PX * scale}px`,
              }}
              aria-hidden="true"
            />
          ) : (
            <ImageOff className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span className="map-object-library-object-name">{name}</span>
      </button>
      <span
        role="button"
        tabIndex={0}
        className={cx('map-object-library-object-fav', favorite && 'is-favorite')}
        aria-label={favoriteLabel}
        aria-pressed={favorite}
        title={favoriteLabel}
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleFavorite()
          }
        }}
        onPointerDown={(event: PointerEvent<HTMLSpanElement>) => event.stopPropagation()}
      >
        <Star className="h-3 w-3" aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
      </span>
    </span>
  )
}
