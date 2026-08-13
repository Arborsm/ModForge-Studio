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
  Pause,
  Play,
  Search,
  Tag,
  X,
} from 'lucide-react'
import { resourceSpriteStyle, type ResourceSprite } from '@entities/asset-schema'
import { loadAudioDataUrl, loadXactAudioDataUrl } from '@entities/game/api'
import { ItemSprite, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { useResourceBrowserCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'

export type ResourceBrowserKind = 'actor' | 'item' | 'location' | 'music' | 'sound' | 'texture' | 'map' | 'building'
export type ResourceSourceKind = 'game' | 'project' | 'catalog'

export type ResourceBrowserOption = {
  id: string
  value: string
  label: string
  kind: ResourceBrowserKind
  aliases?: readonly string[]
  subtitle?: string
  badge?: string
  preview?: string
  sprite?: ResourceSprite
  tone?: string
  category?: string
  meta?: string
  sourcePath?: string
  sourceKind?: ResourceSourceKind
  /** Optional audio file used to draw waveforms and play music/sound cues. */
  audio?: { absolutePath: string; kind: 'music' | 'sound'; cue?: string; rootPath?: string }
  /** Optional kind-specific fields shown in the detail panel. */
  fields?: readonly { label: string; value: string; wide?: boolean }[]
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

export type ResourcePickerProps = {
  value: string
  label: string
  placeholder: string
  options: readonly ResourceBrowserOption[]
  onSelect: (value: string) => void
  selectionMode?: 'immediate' | 'confirm'
  className?: string
  triggerClassName?: string
  triggerContent?: ReactNode
  /** Changing this value opens the browser from an external workflow step. */
  openRequest?: string | number
  emptyLabel?: string
}

type ResourceFilterId = 'all' | 'game' | 'project' | 'catalog'
type ResourceViewMode = 'grid' | 'list'

const DEFAULT_PAGE_SIZE = 9
const PAGE_SIZE_OPTIONS = [9, 18, 27, 36] as const
const RESOURCE_FILTERS: ResourceFilterId[] = ['all', 'game', 'project', 'catalog']
const CATEGORY_TONES = ['#2563eb', '#0891b2', '#ea580c', '#7c3aed', '#16a34a', '#e11d48', '#0d9488', '#d97706', '#64748b']

function optionMatches(option: ResourceBrowserOption, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return [
    option.label,
    option.value,
    ...(option.aliases ?? []),
    option.subtitle,
    option.badge,
    option.category,
    option.meta,
    option.sourcePath,
  ].some((part) => part?.toLowerCase().includes(normalized))
}

function optionCategory(option: ResourceBrowserOption) {
  return option.category ?? option.badge ?? option.subtitle ?? option.kind
}

function optionSourceText(option: ResourceBrowserOption) {
  return [option.badge, option.subtitle, option.category].filter(Boolean).join(' ').toLowerCase()
}

function optionFilter(option: ResourceBrowserOption): ResourceFilterId {
  if (option.sourceKind) {
    return option.sourceKind
  }
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

function optionTone(option: ResourceBrowserOption) {
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

function optionInitials(option: Pick<ResourceBrowserOption, 'label' | 'value'>) {
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

function formatOptionId(option: ResourceBrowserOption) {
  return option.item?.qualifiedItemId ?? option.meta ?? option.value
}

function formatOptionType(option: ResourceBrowserOption) {
  return option.item?.kindMetaLabel ?? optionCategory(option)
}

function formatOptionPrice(option: ResourceBrowserOption, noneLabel: string) {
  return option.item?.price != null ? `${option.item.price}g` : noneLabel
}

function formatOptionSubtitle(option: ResourceBrowserOption) {
  return option.item?.internalName ?? option.subtitle ?? option.badge ?? option.kind
}

function formatOptionPath(option: ResourceBrowserOption) {
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

function ResourcePreview({ option, size = 'default' }: { option: ResourceBrowserOption; size?: 'default' | 'large' }) {
  const style = { '--resource-tone': optionTone(option) } as CSSProperties

  if (option.item) {
    return (
      <span className={cx('resource-picker__preview', 'resource-picker__preview--sprite', size === 'large' && 'is-large')} style={style}>
        <ItemSprite item={option.item} textureState={option.itemTexture ?? null} scale={size === 'large' ? 1.9 : 1.35} />
      </span>
    )
  }

  if (option.sprite) {
    return (
      <span className={cx('resource-picker__preview', 'resource-picker__preview--sprite', size === 'large' && 'is-large')} style={style}>
        <span style={resourceSpriteStyle(option.sprite)} />
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

function isEmptyField(value: unknown, noneLabel: string): boolean {
  if (value === noneLabel) {
    return true
  }
  if (value == null || value === '') {
    return true
  }
  return false
}

function ResourceDetailDialog({
  option,
  copy,
  onClose,
}: {
  option: ResourceBrowserOption
  copy: ReturnType<typeof useResourceBrowserCopy>['picker']
  onClose: () => void
}) {
  const item = option.item
  const chips = [
    formatOptionId(option),
    formatOptionType(option),
    item?.browseCategories?.find((category) => category !== 'all'),
    item?.price != null ? `${item.price}g` : null,
  ].filter((chip): chip is string => Boolean(chip))

  const generalFields = [
    { label: copy.fieldValue, value: option.value },
    { label: copy.fieldName, value: item?.internalName ?? option.label },
    { label: copy.fieldDisplayName, value: item?.displayName ?? option.label },
    { label: copy.fieldInternalName, value: item?.internalName },
    { label: copy.fieldType, value: formatOptionType(option) },
    { label: copy.fieldCategory, value: item?.category ?? option.category },
    { label: copy.fieldPrice, value: formatOptionPrice(option, copy.none) },
    { label: copy.fieldDescription, value: item?.description ?? option.meta ?? option.subtitle, wide: true },
  ].filter((field) => !isEmptyField(field.value, copy.none))

  const visualFields = [
    { label: copy.fieldTexture, value: item?.texturePathLabel ?? option.preview },
    { label: copy.fieldSpriteIndex, value: item?.spriteIndex ?? item?.menuSpriteIndex },
  ].filter((field) => !isEmptyField(field.value, copy.none))

  const sourceFields = [
    { label: copy.fieldSourcePath, value: formatOptionPath(option) },
    { label: copy.fieldMeta, value: option.meta },
    { label: copy.fieldSubtitle, value: option.subtitle ?? option.badge },
  ].filter((field) => !isEmptyField(field.value, copy.none))

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
          {generalFields.length > 0 ? (
            <section className="resource-picker__detail-section">
              <h4>
                <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                {copy.detailsGeneral}
              </h4>
              <div className="resource-picker__detail-grid">
                {generalFields
                  .filter((field) => !field.wide)
                  .map((field) => (
                    <DetailField key={field.label} label={field.label} value={field.value} />
                  ))}
              </div>
              {generalFields
                .filter((field) => field.wide)
                .map((field) => (
                  <DetailField key={field.label} label={field.label} value={field.value} wide />
                ))}
            </section>
          ) : null}

          {visualFields.length > 0 ? (
            <section className="resource-picker__detail-section">
              <h4>
                <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                {copy.detailsVisual}
              </h4>
              <div className="resource-picker__detail-grid">
                {visualFields.map((field) => (
                  <DetailField key={field.label} label={field.label} value={field.value} />
                ))}
              </div>
            </section>
          ) : null}

          {sourceFields.length > 0 ? (
            <section className="resource-picker__detail-section">
              <h4>
                <Database className="h-3.5 w-3.5" aria-hidden />
                {copy.detailsSource}
              </h4>
              <div className="resource-picker__detail-grid">
                {sourceFields.map((field) => (
                  <DetailField key={field.label} label={field.label} value={field.value} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function formatAudioWaveformBars(seed: string) {
  const values: number[] = []
  let hash = 0
  for (let i = 0; i < 32; i++) {
    const code = seed.codePointAt(i % seed.length) ?? 0
    hash = (hash * 31 + code) % 100
    values.push(12 + (hash % 84))
  }
  return values
}

export function AudioCard({
  option,
  selected,
  onSelect,
  onDetail,
  copy,
}: {
  option: ResourceBrowserOption
  selected: boolean
  onSelect: () => void
  onDetail: () => void
  copy: ReturnType<typeof useResourceBrowserCopy>['picker']
}) {
  const [playing, setPlaying] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bars = useMemo(() => formatAudioWaveformBars(option.value), [option.value])

  useEffect(() => {
    if (!option.audio) {
      return
    }
    let cancelled = false
    const { rootPath, cue } = option.audio
    if (rootPath && cue) {
      loadXactAudioDataUrl(rootPath, cue)
        .then((dataUrl) => {
          if (!cancelled) {
            setUrl(dataUrl)
          }
        })
        .catch(() => {})
    } else {
      loadAudioDataUrl(option.audio.absolutePath)
        .then((dataUrl) => {
          if (!cancelled) {
            setUrl(dataUrl)
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [option.audio])

  useEffect(() => {
    if (!url || !playing) {
      audioRef.current?.pause()
      return
    }
    const audio = new Audio(url)
    audio.loop = option.audio?.kind === 'music'
    audio.volume = option.audio?.kind === 'music' ? 0.6 : 0.7
    audio.addEventListener('ended', () => setPlaying(false))
    audio.addEventListener('error', () => setPlaying(false))
    void audio.play().catch(() => setPlaying(false))
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [url, playing, option.audio?.kind])

  function togglePlay(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setPlaying((p) => !p)
  }

  return (
    <article className={cx('resource-picker__item-card', 'resource-picker__item-card--audio', selected && 'is-selected')}>
      <button type="button" className="resource-picker__item-card-main" onClick={onSelect}>
        <span className="resource-picker__audio-waveform" aria-hidden="true">
          {bars.map((height, index) => (
            <span key={index} className="resource-picker__audio-bar" style={{ '--audio-bar-height': `${height}%` } as CSSProperties} />
          ))}
        </span>
        <span className="resource-picker__audio-info">
          <span className="resource-picker__item-name">{option.label}</span>
          <span className="resource-picker__item-id">{option.value}</span>
          <span className="resource-picker__item-type">{formatOptionType(option)}</span>
        </span>
      </button>
      <button
        type="button"
        className={cx('resource-picker__audio-play', playing && 'is-playing')}
        title={playing ? copy.audioPause : copy.audioPlay}
        aria-label={playing ? copy.audioPause : copy.audioPlay}
        onClick={togglePlay}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        type="button"
        className="resource-picker__detail-button"
        title={copy.detailAction}
        aria-label={`${copy.detailAction}: ${option.label}`}
        onClick={onDetail}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </article>
  )
}

function ImageCard({
  option,
  selected,
  onSelect,
  onDetail,
  copy,
}: {
  option: ResourceBrowserOption
  selected: boolean
  onSelect: () => void
  onDetail: () => void
  copy: ReturnType<typeof useResourceBrowserCopy>['picker']
}) {
  return (
    <article className={cx('resource-picker__item-card', 'resource-picker__item-card--image', selected && 'is-selected')}>
      <button type="button" className="resource-picker__item-card-main" onClick={onSelect}>
        <span className="resource-picker__image-preview" aria-hidden="true">
          {option.preview ? (
            <img src={option.preview} alt="" className="resource-picker__image-preview-image" />
          ) : (
            <ResourcePreview option={option} />
          )}
        </span>
        <span className="resource-picker__image-info">
          <span className="resource-picker__item-name">{option.label}</span>
          <span className="resource-picker__item-id">{option.value}</span>
          <span className="resource-picker__item-type">{formatOptionType(option)}</span>
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
        onClick={onDetail}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </article>
  )
}

function EntityCard({
  option,
  selected,
  onSelect,
  onDetail,
  copy,
}: {
  option: ResourceBrowserOption
  selected: boolean
  onSelect: () => void
  onDetail: () => void
  copy: ReturnType<typeof useResourceBrowserCopy>['picker']
}) {
  return (
    <article className={cx('resource-picker__item-card', 'resource-picker__item-card--entity', selected && 'is-selected')}>
      <button type="button" className="resource-picker__item-card-main" onClick={onSelect}>
        <div className="resource-picker__entity-header">
          <ResourcePreview option={option} size="large" />
          <span className="resource-picker__item-title-group">
            <span className="resource-picker__item-name">{option.label}</span>
            <span className="resource-picker__item-id">
              {formatOptionId(option)} · {formatOptionType(option)}
            </span>
          </span>
        </div>
        <span className="resource-picker__item-meta">
          {option.subtitle ? (
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <ClipboardList className="h-3 w-3" aria-hidden />
                {copy.fieldSubtitle}
              </span>
              <span className="resource-picker__meta-value">{option.subtitle}</span>
            </span>
          ) : null}
          {option.meta ? (
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <Database className="h-3 w-3" aria-hidden />
                {copy.fieldMeta}
              </span>
              <span className="resource-picker__meta-value">{option.meta}</span>
            </span>
          ) : null}
          {formatOptionPath(option) ? (
            <span className="resource-picker__meta-row">
              <span className="resource-picker__meta-label">
                <Folder className="h-3 w-3" aria-hidden />
                {copy.fieldSourcePath}
              </span>
              <span className="resource-picker__meta-value">{formatOptionPath(option)}</span>
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className="resource-picker__detail-button"
        title={copy.detailAction}
        aria-label={`${copy.detailAction}: ${option.label}`}
        onClick={onDetail}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </article>
  )
}

export function ResourcePicker({
  value,
  label,
  placeholder,
  options,
  onSelect,
  selectionMode = 'immediate',
  className,
  triggerClassName,
  triggerContent,
  openRequest,
  emptyLabel,
}: ResourcePickerProps) {
  const copy = useResourceBrowserCopy().picker
  const [query, setQuery] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<ResourceFilterId>('all')
  const [viewMode, setViewMode] = useState<ResourceViewMode>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [draftValue, setDraftValue] = useState(value)
  const [detailOption, setDetailOption] = useState<ResourceBrowserOption | null>(null)
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
        } satisfies ResourceBrowserOption)
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

  const previousOpenRequest = useRef<string | number | undefined>(undefined)
  useEffect(() => {
    if (openRequest === undefined || openRequest === previousOpenRequest.current) {
      return
    }
    previousOpenRequest.current = openRequest
    openDialog()
  }, [openRequest])

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

  function renderResourceCard(option: ResourceBrowserOption) {
    const selectedOption = option.value === draftValue
    const onSelect = () => chooseValue(option.value)
    const onDetail = () => setDetailOption(option)
    switch (option.kind) {
      case 'music':
      case 'sound':
        return <AudioCard key={option.id} option={option} selected={selectedOption} onSelect={onSelect} onDetail={onDetail} copy={copy} />
      case 'texture':
      case 'map':
        return <ImageCard key={option.id} option={option} selected={selectedOption} onSelect={onSelect} onDetail={onDetail} copy={copy} />
      case 'building':
      case 'actor':
      case 'location':
        return <EntityCard key={option.id} option={option} selected={selectedOption} onSelect={onSelect} onDetail={onDetail} copy={copy} />
      case 'item':
      default:
        return (
          <article
            key={option.id}
            className={cx('resource-picker__item-card', `resource-picker__item-card--${option.kind}`, selectedOption && 'is-selected')}
          >
            <button type="button" className="resource-picker__item-card-main" onClick={onSelect}>
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
              onClick={onDetail}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </article>
        )
    }
  }

  function renderResourceListRow(option: ResourceBrowserOption) {
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
          'inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border-subtle bg-surface-app px-2 text-meta-px font-medium text-text-primary transition-colors hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] [&::-webkit-details-marker]:hidden',
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
        {triggerContent ?? <span className="max-w-28 truncate">{selected?.label ?? (value || placeholder)}</span>}
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
                  disabled={!draftValue}
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
