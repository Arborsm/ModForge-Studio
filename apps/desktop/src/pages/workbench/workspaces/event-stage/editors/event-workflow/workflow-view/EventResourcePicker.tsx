import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Folder,
  Grid2X2,
  Image as ImageIcon,
  Info,
  List,
  Package,
  Search,
  Tag,
  X,
} from 'lucide-react'
import { useEventStageCopy } from '@locales/provider'
import { ItemSprite, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@pages/workbench/workspaces/item/entities/item'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'

export type EventResourceKind = 'actor' | 'item' | 'location' | 'music' | 'sound'

export type EventResourceOption = {
  id: string
  value: string
  label: string
  kind: EventResourceKind
  subtitle?: string
  badge?: string
  preview?: string
  tone?: string
  category?: string
  meta?: string
  sourcePath?: string
  item?: Pick<
    ItemWorkspaceEntry,
    | 'displayName'
    | 'rawDisplayName'
    | 'description'
    | 'internalName'
    | 'qualifiedItemId'
    | 'itemId'
    | 'kind'
    | 'category'
    | 'kindMetaLabel'
    | 'textureAssetName'
    | 'texturePathLabel'
    | 'spriteIndex'
    | 'menuSpriteIndex'
    | 'spriteWidth'
    | 'spriteHeight'
    | 'price'
    | 'edibility'
    | 'isDrink'
    | 'canBeGivenAsGift'
    | 'canBeTrashed'
    | 'contextTags'
    | 'browseCategories'
    | 'objectStats'
    | 'apparelStats'
  >
  itemTexture?: ItemTextureAssetState | null
}

type EventResourcePickerProps = {
  value: string
  label: string
  placeholder: string
  options: EventResourceOption[]
  onSelect: (value: string) => void
  selectionMode?: 'immediate' | 'confirm'
  className?: string
  triggerClassName?: string
  emptyLabel?: string
}

type ResourceFilterId = 'all' | 'game' | 'project' | 'catalog'
type ResourceViewMode = 'grid' | 'list'

const DEFAULT_PAGE_SIZE = 9
const PAGE_SIZE_OPTIONS = [9, 18, 27, 36] as const
const RESOURCE_FILTERS: ResourceFilterId[] = ['all', 'game', 'project', 'catalog']
const CATEGORY_TONES = ['#2563eb', '#0891b2', '#ea580c', '#7c3aed', '#16a34a', '#e11d48', '#0d9488', '#d97706', '#64748b']

function optionMatches(option: EventResourceOption, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return [option.label, option.value, option.subtitle, option.badge, option.category, option.meta, option.sourcePath].some((part) =>
    part?.toLowerCase().includes(normalized),
  )
}

function optionCategory(option: EventResourceOption) {
  return option.category ?? option.badge ?? option.subtitle ?? option.kind
}

function optionSourceText(option: EventResourceOption) {
  return [option.badge, option.subtitle, option.category].filter(Boolean).join(' ').toLowerCase()
}

function optionFilter(option: EventResourceOption): ResourceFilterId {
  if (option.item) {
    return 'catalog'
  }

  const source = optionSourceText(option)
  if (/当前|project|patch/u.test(source)) {
    return 'project'
  }
  if (/game|vanilla|原版|游戏资源/u.test(source)) {
    return 'game'
  }

  return 'game'
}

function optionTone(option: EventResourceOption) {
  if (option.tone) {
    return option.tone
  }

  const seed = option.category ?? option.kind
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % CATEGORY_TONES.length
  }
  return CATEGORY_TONES[hash] ?? CATEGORY_TONES[0]
}

function optionInitials(option: Pick<EventResourceOption, 'label' | 'value'>) {
  const source = option.label || option.value
  const asciiParts = source.match(/[A-Za-z0-9]+/gu)
  if (asciiParts?.length) {
    return asciiParts
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join('')
      .toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}

function formatOptionId(option: EventResourceOption) {
  return option.item?.qualifiedItemId ?? option.meta ?? option.value
}

function formatOptionType(option: EventResourceOption) {
  return option.item?.kindMetaLabel ?? optionCategory(option)
}

function formatOptionPrice(option: EventResourceOption, noneLabel: string) {
  return option.item?.price != null ? `${option.item.price}g` : noneLabel
}

function formatOptionSubtitle(option: EventResourceOption) {
  return option.item?.internalName ?? option.subtitle ?? option.badge ?? option.kind
}

function formatOptionPath(option: EventResourceOption) {
  return option.sourcePath ?? option.item?.texturePathLabel ?? null
}

function getPageItems(page: number, pageCount: number) {
  const safePageCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(1, page), safePageCount)

  if (safePageCount <= 7) {
    return Array.from({ length: safePageCount }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, safePageCount, safePage - 1, safePage, safePage + 1])
  if (safePage <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (safePage >= safePageCount - 2) {
    pages.add(safePageCount - 3)
    pages.add(safePageCount - 2)
    pages.add(safePageCount - 1)
  }

  const sortedPages = Array.from(pages)
    .filter((candidate) => candidate >= 1 && candidate <= safePageCount)
    .sort((left, right) => left - right)
  const pageItems: Array<number | 'ellipsis-start' | 'ellipsis-end'> = []

  sortedPages.forEach((pageItem, index) => {
    const previousPage = sortedPages[index - 1]
    if (previousPage != null) {
      const gap = pageItem - previousPage
      if (gap === 2) {
        pageItems.push(previousPage + 1)
      } else if (gap > 2) {
        pageItems.push(previousPage === 1 ? 'ellipsis-start' : 'ellipsis-end')
      }
    }

    pageItems.push(pageItem)
  })

  return pageItems
}

function ResourcePreview({ option, size = 'default' }: { option: EventResourceOption; size?: 'default' | 'large' }) {
  const style = { '--resource-tone': optionTone(option) } as CSSProperties

  if (option.item) {
    return (
      <span className={cx('resource-picker__preview', 'resource-picker__preview--sprite', size === 'large' && 'is-large')} style={style}>
        <ItemSprite item={option.item} textureState={option.itemTexture ?? null} scale={size === 'large' ? 1.9 : 1.35} />
      </span>
    )
  }

  if (option.preview) {
    return (
      <span className={cx('resource-picker__preview', size === 'large' && 'is-large')} style={style} aria-hidden>
        <img src={option.preview} alt="" className="resource-picker__preview-image" />
      </span>
    )
  }

  return (
    <span className={cx('resource-picker__preview', size === 'large' && 'is-large')} style={style} aria-hidden>
      <span>{optionInitials(option)}</span>
    </span>
  )
}

function DetailField({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('resource-picker__detail-field', wide && 'is-wide')}>
      <span className="resource-picker__detail-field-label">{label}</span>
      <span className="resource-picker__detail-field-value">{value}</span>
    </div>
  )
}

function ResourceDetailDialog({
  option,
  copy,
  onClose,
}: {
  option: EventResourceOption
  copy: ReturnType<typeof useEventStageCopy>['resourcePicker']
  onClose: () => void
}) {
  const item = option.item
  const chips = [
    formatOptionId(option),
    formatOptionType(option),
    item?.browseCategories?.find((category) => category !== 'all'),
    item?.price != null ? `${item.price}g` : null,
  ].filter((chip): chip is string => Boolean(chip))

  return (
    <div
      className="resource-picker__detail-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className="resource-picker__detail-dialog" role="dialog" aria-modal="true" aria-label={copy.detailsTitle}>
        <header className="resource-picker__detail-header">
          <ResourcePreview option={option} size="large" />
          <div className="resource-picker__detail-heading">
            <h3>{item ? `${item.displayName} (${item.internalName})` : option.label}</h3>
            <div className="resource-picker__detail-chips">
              {chips.map((chip, index) => (
                <span key={`${chip}:${index}`} className={cx('resource-picker__detail-chip', index === 1 && 'is-accent')}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="resource-picker__icon-button" title={copy.close} aria-label={copy.close} onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="resource-picker__detail-body">
          <section className="resource-picker__detail-section">
            <h4>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              {copy.detailsGeneral}
            </h4>
            <div className="resource-picker__detail-grid">
              <DetailField label={copy.fieldValue} value={option.value} />
              <DetailField label={copy.fieldName} value={item?.internalName ?? option.label} />
              <DetailField label={copy.fieldDisplayName} value={item?.displayName ?? option.label} />
              <DetailField label={copy.fieldInternalName} value={item?.internalName ?? copy.none} />
              <DetailField label={copy.fieldType} value={formatOptionType(option)} />
              <DetailField label={copy.fieldCategory} value={item?.category ?? option.category ?? copy.none} />
              <DetailField label={copy.fieldPrice} value={formatOptionPrice(option, copy.none)} />
            </div>
            <DetailField label={copy.fieldDescription} value={item?.description ?? option.meta ?? option.subtitle ?? copy.none} wide />
          </section>

          <section className="resource-picker__detail-section">
            <h4>
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              {copy.detailsVisual}
            </h4>
            <div className="resource-picker__detail-grid">
              <DetailField label={copy.fieldTexture} value={item?.texturePathLabel ?? option.preview ?? copy.none} />
              <DetailField label={copy.fieldSpriteIndex} value={item?.spriteIndex ?? item?.menuSpriteIndex ?? copy.none} />
            </div>
          </section>

          <section className="resource-picker__detail-section">
            <h4>
              <Database className="h-3.5 w-3.5" aria-hidden />
              {copy.detailsSource}
            </h4>
            <div className="resource-picker__detail-grid">
              <DetailField label={copy.fieldSourcePath} value={formatOptionPath(option) ?? copy.none} />
              <DetailField label={copy.fieldMeta} value={option.meta ?? copy.none} />
              <DetailField label={copy.fieldSubtitle} value={option.subtitle ?? option.badge ?? copy.none} />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

export function EventResourcePicker({
  value,
  label,
  placeholder,
  options,
  onSelect,
  selectionMode = 'immediate',
  className,
  triggerClassName,
  emptyLabel,
}: EventResourcePickerProps) {
  const copy = useEventStageCopy().resourcePicker
  const [query, setQuery] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<ResourceFilterId>('all')
  const [viewMode, setViewMode] = useState<ResourceViewMode>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftValue, setDraftValue] = useState(value)
  const [detailOption, setDetailOption] = useState<EventResourceOption | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const draftValueRef = useRef(value)
  const selected = options.find((option) => option.value === value)
  const draftSelected = options.find((option) => option.value === draftValue)
  const filtered = useMemo(() => options.filter((option) => optionMatches(option, query)), [options, query])
  const filterCounts = useMemo(() => {
    const counts: Record<ResourceFilterId, number> = { all: filtered.length, game: 0, project: 0, catalog: 0 }
    for (const option of filtered) {
      counts[optionFilter(option)] += 1
    }
    return counts
  }, [filtered])
  const sourceFiltered = useMemo(
    () => (activeFilter === 'all' ? filtered : filtered.filter((option) => optionFilter(option) === activeFilter)),
    [activeFilter, filtered],
  )
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const option of sourceFiltered) {
      const category = optionCategory(option)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  }, [sourceFiltered])
  const visibleCategories = useMemo(() => {
    const normalized = categoryQuery.trim().toLowerCase()
    if (!normalized) {
      return categories
    }
    return categories.filter(([category]) => category.toLowerCase().includes(normalized))
  }, [categories, categoryQuery])
  const effectiveActiveCategory =
    activeCategory === 'all' || categories.some(([category]) => category === activeCategory) ? activeCategory : 'all'
  const categoryFiltered = useMemo(
    () =>
      effectiveActiveCategory === 'all'
        ? sourceFiltered
        : sourceFiltered.filter((option) => optionCategory(option) === effectiveActiveCategory),
    [effectiveActiveCategory, sourceFiltered],
  )
  const trimmedQuery = query.trim()
  const canApplyQuery = trimmedQuery.length > 0 && filtered.length === 0 && !options.some((option) => option.value === trimmedQuery)
  const pageCount = Math.max(1, Math.ceil((categoryFiltered.length + (canApplyQuery ? 1 : 0)) / pageSize))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStartIndex = (safeCurrentPage - 1) * pageSize
  const customOption =
    canApplyQuery && pageStartIndex === 0
      ? ({
          id: `custom:${trimmedQuery}`,
          value: trimmedQuery,
          label: trimmedQuery,
          kind: options[0]?.kind ?? 'actor',
          badge: copy.filtersProject,
        } satisfies EventResourceOption)
      : null
  const pageOptionStartIndex = customOption ? Math.max(0, pageStartIndex - 1) : pageStartIndex - (canApplyQuery ? 1 : 0)
  const pageOptions = categoryFiltered.slice(pageOptionStartIndex, pageOptionStartIndex + pageSize - (customOption ? 1 : 0))
  const rangeStart = categoryFiltered.length || canApplyQuery ? pageStartIndex + 1 : 0
  const rangeEnd = Math.min(pageStartIndex + pageSize, categoryFiltered.length + (canApplyQuery ? 1 : 0))
  const triggerTitle = value ? `${label}: ${value}` : label
  const draftLabel = draftSelected?.label ?? draftValue ?? placeholder
  const effectiveEmptyLabel = emptyLabel ?? copy.none
  const usesConfirmSelection = selectionMode === 'confirm'
  const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({
    value: size,
    label: copy.pageSizeOption(size),
  }))

  useEffect(() => {
    if (!open) {
      return
    }

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 20)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (detailOption) {
          setDetailOption(null)
          return
        }
        closeDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [detailOption, open])

  function openDialog() {
    draftValueRef.current = value
    setDraftValue(value)
    setQuery('')
    setCategoryQuery('')
    setActiveCategory('all')
    setActiveFilter('all')
    setCurrentPage(1)
    setDetailOption(null)
    setOpen(true)
  }

  function closeDialog() {
    setDetailOption(null)
    setOpen(false)
  }

  function selectCategory(category: string) {
    setActiveCategory(category)
    setCurrentPage(1)
  }

  function selectFilter(filter: ResourceFilterId) {
    setActiveFilter(filter)
    setCurrentPage(1)
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery)
    setCurrentPage(1)
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize)
    setCurrentPage(1)
  }

  function commitValue(nextValue?: string) {
    const committedValue = nextValue ?? draftValueRef.current
    if (!committedValue) {
      return
    }
    onSelect(committedValue)
    setQuery('')
    setCategoryQuery('')
    closeDialog()
  }

  function chooseValue(nextValue: string) {
    draftValueRef.current = nextValue
    if (usesConfirmSelection) {
      setDraftValue(nextValue)
      return
    }
    commitValue(nextValue)
  }

  function renderResourceCard(option: EventResourceOption) {
    const selectedOption = option.value === draftValue
    return (
      <article key={option.id} className={cx('resource-picker__item-card', selectedOption && 'is-selected')}>
        <button type="button" className="resource-picker__item-card-main" onClick={() => chooseValue(option.value)}>
          <div className="resource-picker__item-header">
            <ResourcePreview option={option} />
            <span className="resource-picker__item-title-group">
              <span className="resource-picker__item-name">{option.label}</span>
              <span className="resource-picker__item-id">
                {formatOptionId(option)} · {formatOptionType(option)}
              </span>
            </span>
          </div>
          <span className="resource-picker__item-meta">
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <Tag className="h-3 w-3" aria-hidden />
                {copy.fieldType}
              </span>
              <span className="resource-picker__item-type">{formatOptionType(option)}</span>
            </span>
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <Database className="h-3 w-3" aria-hidden />
                {copy.fieldPrice}
              </span>
              <span className="resource-picker__meta-value">{formatOptionPrice(option, option.meta ?? copy.none)}</span>
            </span>
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <ClipboardList className="h-3 w-3" aria-hidden />
                {copy.fieldInternalName}
              </span>
              <span className="resource-picker__meta-value">{formatOptionSubtitle(option)}</span>
            </span>
          </span>
          {formatOptionPath(option) ? (
            <span className="resource-picker__item-path">
              <Folder className="h-3 w-3" aria-hidden />
              {formatOptionPath(option)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className="resource-picker__detail-button"
          title={copy.detailAction}
          aria-label={`${copy.detailAction}: ${option.label}`}
          onClick={() => setDetailOption(option)}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </article>
    )
  }

  function renderResourceListRow(option: EventResourceOption) {
    const selectedOption = option.value === draftValue
    return (
      <div key={option.id} className={cx('resource-picker__list-row', selectedOption && 'is-selected')}>
        <button type="button" className="resource-picker__list-row-main" onClick={() => chooseValue(option.value)}>
          <ResourcePreview option={option} />
          <span className="resource-picker__list-row-name">{option.label}</span>
          <span className="resource-picker__list-row-id">{formatOptionId(option)}</span>
          <span className="resource-picker__item-type">{formatOptionType(option)}</span>
          <span className="resource-picker__list-row-weight">{formatOptionPrice(option, option.meta ?? copy.none)}</span>
          <span className="resource-picker__list-row-path">{formatOptionPath(option) ?? formatOptionSubtitle(option)}</span>
        </button>
        <button
          type="button"
          className="resource-picker__list-row-detail"
          title={copy.detailAction}
          aria-label={`${copy.detailAction}: ${option.label}`}
          onClick={() => setDetailOption(option)}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <span className={cx('inline-flex', className)}>
      <button
        type="button"
        className={cx(
          'inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-(--border-color) bg-(--bg-app) px-2 text-[11px] font-medium text-(--text-primary) transition-colors hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] [&::-webkit-details-marker]:hidden',
          triggerClassName,
        )}
        title={triggerTitle}
        aria-label={triggerTitle}
        onClick={(event) => {
          event.preventDefault()
          if (open) {
            closeDialog()
            return
          }
          openDialog()
        }}
      >
        <span className="max-w-28 truncate">{selected?.label ?? (value || placeholder)}</span>
      </button>
      {open ? (
        <div className="resource-picker__overlay">
          <div ref={dialogRef} className="resource-picker__dialog" role="dialog" aria-modal="true" aria-label={label}>
            <header className="resource-picker__header">
              <div className="resource-picker__title-group">
                <span className="resource-picker__title-icon" aria-hidden>
                  <Package className="h-4 w-4" />
                </span>
                <div className="resource-picker__title-copy">
                  <p className="resource-picker__title">{label}</p>
                  <p className="resource-picker__subtitle">{copy.summary(categoryFiltered.length, options.length, draftLabel)}</p>
                </div>
              </div>
              <button
                type="button"
                className="resource-picker__icon-button"
                title={copy.close}
                aria-label={copy.close}
                onClick={closeDialog}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="resource-picker__body">
              <aside className="resource-picker__sidebar">
                <label className="resource-picker__sidebar-search">
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">{copy.categorySearchPlaceholder}</span>
                  <input
                    type="search"
                    value={categoryQuery}
                    placeholder={copy.categorySearchPlaceholder}
                    onChange={(event) => setCategoryQuery(event.target.value)}
                  />
                </label>
                <div className="resource-picker__category-list">
                  <button
                    type="button"
                    className={cx('resource-picker__category-item', effectiveActiveCategory === 'all' && 'is-active')}
                    onClick={() => selectCategory('all')}
                  >
                    <span className="resource-picker__category-name">
                      <span className="resource-picker__category-icon" style={{ '--category-tone': CATEGORY_TONES[0] } as CSSProperties}>
                        <Package className="h-3.5 w-3.5" />
                      </span>
                      {copy.allCategory}
                    </span>
                    <span className="resource-picker__category-count">{sourceFiltered.length}</span>
                  </button>
                  {visibleCategories.map(([category, count], index) => (
                    <button
                      key={category}
                      type="button"
                      className={cx('resource-picker__category-item', effectiveActiveCategory === category && 'is-active')}
                      onClick={() => selectCategory(category)}
                    >
                      <span className="resource-picker__category-name">
                        <span
                          className="resource-picker__category-icon"
                          style={{ '--category-tone': CATEGORY_TONES[(index + 1) % CATEGORY_TONES.length] } as CSSProperties}
                        >
                          {category.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate">{category}</span>
                      </span>
                      <span className="resource-picker__category-count">{count}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="resource-picker__content">
                <div className="resource-picker__toolbar">
                  <label className="resource-picker__search">
                    <Search className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{copy.searchLabel}</span>
                    <input
                      ref={inputRef}
                      value={query}
                      placeholder={placeholder}
                      onChange={(event) => updateQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || !trimmedQuery) {
                          return
                        }
                        event.preventDefault()
                        chooseValue(categoryFiltered[0]?.value ?? trimmedQuery)
                      }}
                    />
                  </label>
                  <div className="resource-picker__filters">
                    {RESOURCE_FILTERS.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className={cx('resource-picker__filter-chip', activeFilter === filter && 'is-active')}
                        onClick={() => selectFilter(filter)}
                      >
                        {copy.filterLabels[filter]}
                        <span>{filterCounts[filter]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="resource-picker__view-toggle">
                    <button
                      type="button"
                      className={cx('resource-picker__view-button', viewMode === 'grid' && 'is-active')}
                      title={copy.gridView}
                      aria-label={copy.gridView}
                      onClick={() => setViewMode('grid')}
                    >
                      <Grid2X2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cx('resource-picker__view-button', viewMode === 'list' && 'is-active')}
                      title={copy.listView}
                      aria-label={copy.listView}
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="resource-picker__toolbar-count">
                    {copy.pageRange(rangeStart, rangeEnd, categoryFiltered.length + (canApplyQuery ? 1 : 0))}
                  </span>
                </div>

                <div className="resource-picker__list-head">
                  <span>{effectiveActiveCategory === 'all' ? copy.allResources : effectiveActiveCategory}</span>
                  <span>{copy.visibleCount(categoryFiltered.length)}</span>
                </div>

                {viewMode === 'grid' ? (
                  <div className="resource-picker__items-grid">
                    {customOption ? (
                      <article className={cx('resource-picker__item-card', customOption.value === draftValue && 'is-selected')}>
                        <button type="button" className="resource-picker__item-card-main" onClick={() => chooseValue(customOption.value)}>
                          <div className="resource-picker__item-header">
                            <ResourcePreview option={customOption} />
                            <span className="resource-picker__item-title-group">
                              <span className="resource-picker__item-name">{trimmedQuery}</span>
                              <span className="resource-picker__item-id">{copy.customSubtitle}</span>
                            </span>
                          </div>
                        </button>
                      </article>
                    ) : null}
                    {pageOptions.map(renderResourceCard)}
                  </div>
                ) : (
                  <div className="resource-picker__items-list">
                    <div className="resource-picker__list-header">
                      <span />
                      <span>{copy.fieldDisplayName}</span>
                      <span>{copy.fieldValue}</span>
                      <span>{copy.fieldType}</span>
                      <span>{copy.fieldPrice}</span>
                      <span>{copy.fieldSourcePath}</span>
                      <span />
                    </div>
                    {customOption ? (
                      <div className={cx('resource-picker__list-row', customOption.value === draftValue && 'is-selected')}>
                        <button type="button" className="resource-picker__list-row-main" onClick={() => chooseValue(customOption.value)}>
                          <ResourcePreview option={customOption} />
                          <span className="resource-picker__list-row-name">{trimmedQuery}</span>
                          <span className="resource-picker__list-row-id">{trimmedQuery}</span>
                          <span className="resource-picker__item-type">{copy.customSubtitle}</span>
                          <span className="resource-picker__list-row-weight">{copy.none}</span>
                          <span className="resource-picker__list-row-path">{copy.filtersProject}</span>
                        </button>
                      </div>
                    ) : null}
                    {pageOptions.map(renderResourceListRow)}
                  </div>
                )}

                {categoryFiltered.length === 0 && !canApplyQuery ? <p className="resource-picker__empty">{effectiveEmptyLabel}</p> : null}
              </section>
            </div>

            <footer className="resource-picker__footer">
              <span className="resource-picker__selected" title={draftValue}>
                {copy.selectedLabel(draftLabel)}
              </span>
              <label className="resource-picker__page-size">
                <span>{copy.pageSizeLabel}</span>
                <CompactSelect
                  ariaLabel={copy.pageSizeLabel}
                  value={pageSize}
                  options={pageSizeOptions}
                  onChange={updatePageSize}
                  triggerClassName="resource-picker__page-size-trigger"
                  menuClassName="resource-picker__page-size-menu"
                  placement="top-end"
                />
              </label>
              <nav className="resource-picker__pagination" aria-label={copy.pageInfo(safeCurrentPage, pageCount)}>
                <button
                  type="button"
                  className="resource-picker__page-button"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {getPageItems(safeCurrentPage, pageCount).map((pageItem) =>
                  typeof pageItem === 'number' ? (
                    <button
                      key={pageItem}
                      type="button"
                      className={cx('resource-picker__page-button', safeCurrentPage === pageItem && 'is-active')}
                      onClick={() => setCurrentPage(pageItem)}
                    >
                      {pageItem}
                    </button>
                  ) : (
                    <span key={pageItem} className="resource-picker__page-ellipsis">
                      ...
                    </span>
                  ),
                )}
                <button
                  type="button"
                  className="resource-picker__page-button"
                  disabled={safeCurrentPage === pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <span className="resource-picker__page-info">{copy.pageInfo(safeCurrentPage, pageCount)}</span>
              </nav>
              <div className="resource-picker__actions">
                <button type="button" className="resource-picker__button resource-picker__button--secondary" onClick={closeDialog}>
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  className="resource-picker__button resource-picker__button--primary"
                  onClick={() => commitValue(draftValue)}
                >
                  {copy.confirm}
                </button>
              </div>
            </footer>

            {detailOption ? <ResourceDetailDialog option={detailOption} copy={copy} onClose={() => setDetailOption(null)} /> : null}
          </div>
        </div>
      ) : null}
    </span>
  )
}
