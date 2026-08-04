import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  LayoutGrid,
  RefreshCw,
  Search,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { type ComponentType, type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { LoadingMotionFallback, LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import type { LauncherSettings } from '@features/launcher/api'
import { canUseDesktopHost } from '@platform/host'
import { reportAppEvent } from '@platform/observability'
import { normalizeLauncherDiscoverToolbarState, type LauncherDiscoverToolbarState } from '@features/launcher'
import { useLauncherDiscover, useLauncherPort, useLauncherRemoteModDetail, parseLauncherModIdQuery } from '@features/launcher'
import type { LauncherDiscoverDetail, QueueLauncherDownloadInput } from '@features/launcher'
import { LauncherBlockedState, LauncherEmptyState, LauncherModDetailPanel } from '@features/launcher'
import { applyAppUiStatePatch, getAppUiStateSnapshot, initializeAppUiState } from '@shared/lib/app-state'
import { listenForLauncherModDetailDismiss } from '@shared/lib/launcher-overlay-events'
import { LauncherDiscoverCard } from './LauncherDiscoverCard'
import { formatCompactNumber } from './launcherDiscoverFormat'
import type { LauncherDiscoverSearchRequest } from '../model/launcherDiscoverSearchRequest'

type LauncherDiscoverPageProps = {
  settings: LauncherSettings
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  searchRequest?: LauncherDiscoverSearchRequest | null
  /** False while the discover route is hidden (cached pages stay mounted). */
  routeActive?: boolean
}

type DiscoverOption<T extends string | number> = {
  value: T
  label: string
}

const CATEGORY_OPTIONS = [
  'Gameplay Mechanics',
  'Interiors',
  'Items',
  'Livestock and Animals',
  'Locations',
  'Maps',
  'Miscellaneous',
  'Modding Tools',
  'New Characters',
  'Pets / Horses',
  'Player',
  'Portraits',
  'User Interface',
  'Visuals and Graphics',
]

const LANGUAGE_OPTIONS = ['Any', 'English', 'Chinese', 'Japanese', 'Spanish', 'German', 'French']

const TIME_RANGE_VALUES = ['all', 'day', 'week', 'month', 'year'] as const
const SORT_VALUES = ['newest', 'updated', 'trending', 'downloads', 'endorsements', 'name'] as const
const PAGE_SIZE_VALUES = [20, 40, 80] as const

type DiscoverAccordionSection = 'category' | 'tags' | 'search' | 'language' | 'limits'
type DiscoverItem = ReturnType<typeof useLauncherDiscover>['items'][number]
type DiscoverFilters = ReturnType<typeof useLauncherDiscover>['filters']
type RangePresetKey = 'any' | 'lt10kb' | '10to100kb' | 'gt100kb' | '10kPlus' | '100kPlus' | '500kPlus' | '1kPlus' | '5kPlus'

const DEFAULT_DISCOVER_OPEN_SECTION: DiscoverAccordionSection = 'category'

type RangePreset = {
  key: RangePresetKey
  label: string
  min: string
  max: string
}

const FILE_SIZE_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: 'lt10kb', label: '< 10 KB', min: '', max: '10240' },
  { key: '10to100kb', label: '10-100 KB', min: '10240', max: '102400' },
  { key: 'gt100kb', label: '> 100 KB', min: '102400', max: '' },
]

const DOWNLOAD_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: '10kPlus', label: '10K+', min: '10000', max: '' },
  { key: '100kPlus', label: '100K+', min: '100000', max: '' },
  { key: '500kPlus', label: '500K+', min: '500000', max: '' },
]

const ENDORSEMENT_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: '1kPlus', label: '1K+', min: '1000', max: '' },
  { key: '5kPlus', label: '5K+', min: '5000', max: '' },
  { key: '10kPlus', label: '10K+', min: '10000', max: '' },
]

function parseTagTokens(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getCurrentTagDraft(value: string) {
  const parts = value.split(',')
  return parts[parts.length - 1]?.trim() ?? ''
}

function applyTagSuggestion(currentValue: string, tag: string) {
  const tokens = parseTagTokens(currentValue)
  if (tokens.includes(tag)) {
    return currentValue
  }

  const parts = currentValue.split(',')
  const currentDraft = parts[parts.length - 1]?.trim() ?? ''
  const committed = currentDraft
    ? parts
        .slice(0, -1)
        .map((item) => item.trim())
        .filter(Boolean)
    : tokens
  return [...committed, tag].join(', ')
}

const LAUNCHER_DISCOVER_PROGRESS_NOTIFICATION_ID = 'launcher-discover-progress'
const LAUNCHER_DISCOVER_MOD_ID_NOTIFICATION_ID = 'launcher-discover-mod-id-not-found'

function getDiscoverPaginationItems(page: number, totalPages: number, capacity: number) {
  if (totalPages <= 0) {
    return []
  }

  //页码全部能塞下时直接铺开 1..totalPages。
  if (totalPages <= capacity) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  //塞不下时按容量压缩：首尾各占 1 个槽，省略号各占 1 个槽，剩下的槽围绕当前页居中铺开。
  //两侧是否需要省略号取决于当前页位置，capacity 始终被填满。
  const slotsForCenter = Math.max(1, capacity - 2 /* first + last */ - 2 /* two ellipses */)

  let start = page - Math.floor(slotsForCenter / 2)
  let end = start + slotsForCenter - 1
  if (start < 2) {
    start = 2
    end = Math.min(totalPages - 1, start + slotsForCenter - 1)
  }
  if (end > totalPages - 1) {
    end = totalPages - 1
    start = Math.max(2, end - slotsForCenter + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  if (start > 2) {
    items.push('ellipsis')
  }
  for (let value = start; value <= end; value += 1) {
    items.push(value)
  }
  if (end < totalPages - 1) {
    items.push('ellipsis')
  }
  items.push(totalPages)
  return items
}

function getInitialDiscoverToolbarState(): LauncherDiscoverToolbarState {
  return normalizeLauncherDiscoverToolbarState(getAppUiStateSnapshot().launcher.discoverToolbar)
}

function scrollElementToTop(element: HTMLElement | null) {
  if (!element) {
    return
  }

  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    return
  }

  element.scrollTop = 0
  element.scrollLeft = 0
}

function scrollDiscoverResultsViewportToTop(viewport: HTMLDivElement | null, content: HTMLDivElement | null) {
  scrollElementToTop(viewport)
  scrollElementToTop(content)

  const shell = content?.closest<HTMLElement>('.launcher-shell-view, .launcher-shell-main, .launcher-shell-routed')
  scrollElementToTop(shell ?? null)
}

function getBlockedReasonLines(reason: string | null | undefined) {
  return (reason ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function hasActiveDiscoverFilters(query: string, filters: DiscoverFilters) {
  if (query.trim()) {
    return true
  }

  if (filters.includeAdult) {
    return true
  }

  return (
    Boolean(filters.titleQuery.trim()) ||
    Boolean(filters.descriptionQuery.trim()) ||
    Boolean(filters.authorQuery.trim()) ||
    Boolean(filters.uploaderQuery.trim()) ||
    Boolean(filters.category.trim()) ||
    Boolean(filters.language.trim()) ||
    Boolean(filters.tagsInclude.trim()) ||
    Boolean(filters.tagsExclude.trim()) ||
    Boolean(filters.minFileSize.trim()) ||
    Boolean(filters.maxFileSize.trim()) ||
    Boolean(filters.minDownloads.trim()) ||
    Boolean(filters.maxDownloads.trim()) ||
    Boolean(filters.minEndorsements.trim()) ||
    Boolean(filters.maxEndorsements.trim())
  )
}

function DiscoverMenu<T extends string | number>({
  label,
  value,
  options,
  open,
  disabled = false,
  onToggle,
  onSelect,
  icon: Icon,
}: {
  label: string
  value: T
  options: DiscoverOption<T>[]
  open: boolean
  disabled?: boolean
  onToggle: () => void
  onSelect: (value: T) => void
  icon?: ComponentType<{ className?: string }>
}) {
  const active = options.find((option) => option.value === value) ?? options[0]
  const isNonDefault = options.length > 0 && options[0]!.value !== value

  return (
    <div className="launcher-discover-menu">
      {/* Ruler: render every option inside a trigger-shaped shell so the menu
          adopts the width of the longest label and the trigger stays fixed
          instead of drifting with the active option. Hidden from view and AT. */}
      <span className="launcher-discover-menu-ruler" aria-hidden="true">
        {options.map((option) => (
          <span key={`ruler:${String(option.value)}`} className="launcher-discover-menu-trigger">
            {Icon ? <span className="launcher-discover-menu-ruler-mark" /> : null}
            <span>{option.label}</span>
            <span className="launcher-discover-menu-ruler-mark" />
          </span>
        ))}
      </span>
      <button
        type="button"
        className={cx(
          'launcher-discover-menu-trigger',
          isNonDefault && 'launcher-discover-menu-trigger-active',
          open && 'launcher-discover-menu-trigger-open',
        )}
        onClick={onToggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        disabled={disabled}
      >
        {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
        <span>{active?.label ?? label}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="launcher-discover-menu-popover" role="menu" aria-label={label}>
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className={cx('launcher-discover-menu-option', option.value === value && 'launcher-discover-menu-option-active')}
              role="menuitemradio"
              aria-checked={option.value === value ? 'true' : 'false'}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DiscoverRailSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: DiscoverAccordionSection
  title: string
  open: boolean
  onToggle: (id: DiscoverAccordionSection) => void
  children: ReactNode
}) {
  const bodyId = `launcher-discover-rail-body-${id}`

  return (
    <section className={cx('launcher-discover-rail-section panel-section', open && 'launcher-discover-rail-section-open')}>
      <button
        type="button"
        className="launcher-discover-rail-header"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className="panel-section-title">{title}</span>
        <ChevronDown className={cx('launcher-discover-rail-chevron h-4 w-4', open && 'launcher-discover-rail-chevron-open')} />
      </button>
      {open ? (
        <div id={bodyId} className="launcher-discover-rail-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function TagSuggestionField({
  label,
  value,
  placeholder,
  suggestionsId,
  suggestionsLabel,
  suggestions,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  suggestionsId: string
  suggestionsLabel: string
  suggestions: { name: string; count: number }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const selectedTags = parseTagTokens(value)
  const currentDraft = getCurrentTagDraft(value).toLowerCase()
  const filteredSuggestions = suggestions.filter((tag) => {
    if (selectedTags.includes(tag.name)) {
      return false
    }

    if (!currentDraft) {
      return true
    }

    return tag.name.toLowerCase().includes(currentDraft)
  })
  const updateMenuPosition = useCallback(() => {
    const rect = shellRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const rowBlockSize = 38
    const verticalPadding = 12
    const viewportPadding = 18
    const availableHeight = Math.max(220, window.innerHeight - rect.bottom - viewportPadding)
    const preferredHeight = Math.min(520, availableHeight)
    const visibleRows = Math.max(5, Math.floor((preferredHeight - verticalPadding) / rowBlockSize))

    setMenuStyle({
      left: rect.left,
      maxHeight: verticalPadding + visibleRows * rowBlockSize,
      top: rect.bottom + 6,
      width: rect.width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  return (
    <label className="launcher-discover-rail-field launcher-discover-tag-field">
      <span>{label}</span>
      <div ref={shellRef} className="launcher-discover-tag-input-shell">
        <input
          className="control-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 100)
          }}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={label}
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={open ? suggestionsId : undefined}
        />
        {open && filteredSuggestions.length && menuStyle
          ? createPortal(
              <div
                id={suggestionsId}
                className="launcher-discover-tag-suggestions"
                role="listbox"
                aria-label={suggestionsLabel}
                style={menuStyle}
              >
                {filteredSuggestions.map((tag) => (
                  <button
                    key={`${suggestionsId}:${tag.name}`}
                    type="button"
                    className="launcher-discover-tag-suggestion"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onClick={() => {
                      onChange(applyTagSuggestion(value, tag.name))
                      setOpen(false)
                    }}
                  >
                    <span>{tag.name}</span>
                    {tag.count ? <span>{formatCompactNumber(tag.count)}</span> : null}
                  </button>
                ))}
              </div>,
              document.body,
            )
          : null}
      </div>
    </label>
  )
}

function RangePresetGroup({
  label,
  minValue,
  maxValue,
  minFilter,
  maxFilter,
  presets,
  advancedOpen,
  advancedLabel,
  presetsLabel,
  noMinimumPlaceholder,
  noMaximumPlaceholder,
  onToggleAdvanced,
  onUpdateFilter,
}: {
  label: string
  minValue: string
  maxValue: string
  minFilter: keyof DiscoverFilters
  maxFilter: keyof DiscoverFilters
  presets: RangePreset[]
  advancedOpen: boolean
  advancedLabel: string
  presetsLabel: string
  noMinimumPlaceholder: string
  noMaximumPlaceholder: string
  onToggleAdvanced: () => void
  onUpdateFilter: <Key extends keyof DiscoverFilters>(key: Key, value: DiscoverFilters[Key]) => void
}) {
  const activePreset = presets.find((preset) => preset.min === minValue && preset.max === maxValue)

  return (
    <div className="launcher-discover-range-group">
      <div className="launcher-discover-range-heading">
        <span className="launcher-discover-range-label">{label}</span>
        <button type="button" className="launcher-discover-range-advanced" onClick={onToggleAdvanced}>
          {advancedLabel}
        </button>
      </div>
      <div className="launcher-discover-range-presets" role="group" aria-label={presetsLabel}>
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={cx(
              'launcher-discover-range-preset',
              activePreset?.label === preset.label && 'launcher-discover-range-preset-active',
            )}
            onClick={() => {
              onUpdateFilter(minFilter, preset.min as DiscoverFilters[typeof minFilter])
              onUpdateFilter(maxFilter, preset.max as DiscoverFilters[typeof maxFilter])
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {advancedOpen ? (
        <div className="launcher-discover-range-row">
          <input
            className="control-input"
            value={minValue}
            onChange={(event) => onUpdateFilter(minFilter, event.target.value as DiscoverFilters[typeof minFilter])}
            placeholder={noMinimumPlaceholder}
            inputMode="numeric"
          />
          <input
            className="control-input"
            value={maxValue}
            onChange={(event) => onUpdateFilter(maxFilter, event.target.value as DiscoverFilters[typeof maxFilter])}
            placeholder={noMaximumPlaceholder}
            inputMode="numeric"
          />
        </div>
      ) : null}
    </div>
  )
}

function createDiscoverRemoteDetail(item: DiscoverItem): LauncherDiscoverDetail {
  return {
    modId: item.modId,
    title: item.title,
    summary: item.summary,
    description: item.summary,
    author: item.author ?? item.uploader,
    version: null,
    modUrl: item.modUrl,
    imageUrl: item.imageUrl,
    galleryImages: item.imageUrl ? [item.imageUrl] : [],
    updatedAt: item.updatedAt,
    fileSize: item.fileSize,
    category: item.category,
    downloads: item.downloads,
    endorsements: item.endorsements,
    tags: [],
    directDownloadEnabled: null,
    supportsVortex: null,
    primaryFileId: null,
    primaryFileName: null,
    primaryFileVersion: null,
    primaryFileCategory: null,
    primaryFileSize: item.fileSize,
    primaryFileSizeBytes: item.fileSize,
    primaryFileScanned: null,
    primaryFileScanStatus: null,
    primaryFileChangelog: [],
    requiredLoader: null,
    gameVersion: null,
    archiveType: null,
    updateRisk: null,
    requirements: [],
    files: [],
  }
}

function createModIdRemoteDetail(modId: number): LauncherDiscoverDetail {
  return {
    modId,
    title: `Nexus #${modId}`,
    summary: null,
    description: null,
    author: null,
    version: null,
    modUrl: `https://www.nexusmods.com/stardewvalley/mods/${modId}`,
    imageUrl: null,
    galleryImages: [],
    updatedAt: null,
    fileSize: null,
    category: null,
    downloads: null,
    endorsements: null,
    tags: [],
    directDownloadEnabled: null,
    supportsVortex: null,
    primaryFileId: null,
    primaryFileName: null,
    primaryFileVersion: null,
    primaryFileCategory: null,
    primaryFileSize: null,
    primaryFileSizeBytes: null,
    primaryFileScanned: null,
    primaryFileScanStatus: null,
    primaryFileChangelog: [],
    requiredLoader: null,
    gameVersion: null,
    archiveType: null,
    updateRisk: null,
    requirements: [],
    files: [],
  }
}

function mergeDiscoverRemoteDetail(item: DiscoverItem, detail: LauncherDiscoverDetail): LauncherDiscoverDetail {
  return {
    ...detail,
    title: detail.title || item.title,
    summary: detail.summary ?? item.summary,
    description: detail.description ?? detail.summary ?? item.summary,
    author: detail.author ?? item.author ?? item.uploader,
    modUrl: detail.modUrl || item.modUrl,
    imageUrl: detail.imageUrl ?? item.imageUrl,
    updatedAt: detail.updatedAt ?? item.updatedAt,
    fileSize: detail.fileSize ?? item.fileSize,
    category: detail.category ?? item.category,
    downloads: detail.downloads ?? item.downloads,
    endorsements: detail.endorsements ?? item.endorsements,
  }
}

function LauncherDiscoverDetailPanel({
  item,
  modId,
  onClose,
  onQueueDownload,
  onModIdNotFound,
}: {
  item: DiscoverItem | null
  modId: number | null
  onClose: () => void
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onModIdNotFound: (modId: number) => void
}) {
  const remoteDetail = useLauncherRemoteModDetail(item?.modId ?? modId, { includeFiles: false })
  const fallbackDetail = item ? createDiscoverRemoteDetail(item) : modId ? createModIdRemoteDetail(modId) : null
  const displayedDetail = item
    ? remoteDetail.detail
      ? mergeDiscoverRemoteDetail(item, remoteDetail.detail)
      : fallbackDetail
    : (remoteDetail.detail ?? fallbackDetail)

  // Direct mod-id opens have no catalog item to fall back to: when the remote
  // lookup fails, let the page close the panel and surface a notification
  // instead of leaving the user stuck on an empty detail drawer.
  const modIdNotFound = !item && modId != null && remoteDetail.state === 'error'
  useEffect(() => {
    if (modIdNotFound && modId != null) {
      onModIdNotFound(modId)
    }
  }, [modId, modIdNotFound, onModIdNotFound])

  if (modIdNotFound) {
    return null
  }

  return (
    <LauncherModDetailPanel
      open={true}
      onClose={onClose}
      mod={null}
      remoteDetail={displayedDetail}
      remoteFilesDeferred={true}
      remoteLoading={remoteDetail.state === 'loading'}
      onToggleEnabled={() => undefined}
      onOpenFolder={() => undefined}
      onSetCover={() => undefined}
      onClearCover={() => undefined}
      onQueueDownload={onQueueDownload}
    />
  )
}

export function LauncherDiscoverPage({
  onQueueDownload,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
  searchRequest,
  routeActive = true,
}: LauncherDiscoverPageProps) {
  const desktopHost = canUseDesktopHost()
  const [hydratedToolbarState, setHydratedToolbarState] = useState<LauncherDiscoverToolbarState>(() => getInitialDiscoverToolbarState())
  const [launcherUiStateReady, setLauncherUiStateReady] = useState(() => !desktopHost)

  useEffect(() => {
    if (!desktopHost) {
      return
    }

    let disposed = false

    void initializeAppUiState()
      .then((state) => {
        if (disposed) {
          return
        }

        setHydratedToolbarState(normalizeLauncherDiscoverToolbarState(state.launcher.discoverToolbar))
        setLauncherUiStateReady(true)
      })
      .catch(() => {
        if (!disposed) {
          setLauncherUiStateReady(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [desktopHost])

  if (!launcherUiStateReady) {
    return <LoadingMotionFallback className="launcher-discover-boot-fallback" />
  }

  return (
    <LauncherDiscoverPageContent
      onQueueDownload={onQueueDownload}
      onNavigateToDiagnostics={onNavigateToDiagnostics}
      onRetryDiagnostics={onRetryDiagnostics}
      searchRequest={searchRequest}
      initialToolbarState={hydratedToolbarState}
      launcherUiStateReady={launcherUiStateReady}
      routeActive={routeActive}
    />
  )
}

function LauncherDiscoverPageContent({
  onQueueDownload,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
  searchRequest,
  initialToolbarState,
  launcherUiStateReady,
  routeActive = true,
}: {
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  searchRequest?: LauncherDiscoverSearchRequest | null
  initialToolbarState: LauncherDiscoverToolbarState
  launcherUiStateReady: boolean
  routeActive?: boolean
}) {
  const copy = useEditorCopy().launcher
  const launcherPort = useLauncherPort()
  const discover = useLauncherDiscover(initialToolbarState)
  const [filtersHidden, setFiltersHidden] = useState(initialToolbarState.filtersHidden)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<DiscoverAccordionSection>(DEFAULT_DISCOVER_OPEN_SECTION)
  const [blockedDetailsExpanded, setBlockedDetailsExpanded] = useState(false)
  const [blockedRetryPending, setBlockedRetryPending] = useState(false)
  const [jumpPageDraft, setJumpPageDraft] = useState('')
  const [jumpPageDirty, setJumpPageDirty] = useState(false)
  const [detailItem, setDetailItem] = useState<DiscoverItem | null>(null)
  const [detailModId, setDetailModId] = useState<number | null>(null)
  const [advancedLimitId, setAdvancedLimitId] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState(discover.query)
  const handledSearchRequestIdRef = useRef<number | null>(null)
  const [pageCapacity, setPageCapacity] = useState(7)
  const resultsViewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const paginationRef = useRef<HTMLDivElement | null>(null)
  const paginationPagesRef = useRef<HTMLDivElement | null>(null)
  const discoverBlocked = Boolean(discover.blockedReason && discover.state !== 'loading')
  const blockedReasonLines = getBlockedReasonLines(discover.blockedReason)
  const primaryBlockedReason = blockedReasonLines[0] ?? null
  const blockedReasonText = blockedReasonLines.join('\n')
  const discoverRequestFailed = !discoverBlocked && discover.state === 'error'
  const discoverEmpty = !discoverBlocked && discover.state !== 'error' && discover.state !== 'loading' && !discover.items.length
  const effectiveFiltersHidden = filtersHidden || discoverBlocked || discoverRequestFailed
  const effectiveOpenMenuId = discoverBlocked || discoverRequestFailed ? null : openMenuId
  const effectiveBlockedDetailsExpanded = discoverBlocked ? blockedDetailsExpanded : false
  const normalizedSearchDraft = searchDraft.trim()
  const searchDirty = normalizedSearchDraft !== discover.query
  const resultCount = discover.totalCount || discover.items.length
  const timeRangeOptions: DiscoverOption<(typeof TIME_RANGE_VALUES)[number]>[] = TIME_RANGE_VALUES.map((value) => ({
    value,
    label: copy.discover.timeRangeOptions[value],
  }))
  const sortOptions: DiscoverOption<(typeof SORT_VALUES)[number]>[] = SORT_VALUES.map((value) => ({
    value,
    label: copy.discover.sortOptions[value],
  }))
  const pageSizeOptions: DiscoverOption<number>[] = PAGE_SIZE_VALUES.map((value) => ({
    value,
    label: copy.discover.pageSizeOption(value),
  }))
  const fileSizePresets = FILE_SIZE_PRESETS.map((preset) => ({ ...preset, label: copy.discover.rangePresetLabels[preset.key] }))
  const downloadPresets = DOWNLOAD_PRESETS.map((preset) => ({ ...preset, label: copy.discover.rangePresetLabels[preset.key] }))
  const endorsementPresets = ENDORSEMENT_PRESETS.map((preset) => ({ ...preset, label: copy.discover.rangePresetLabels[preset.key] }))
  const formatCategoryLabel = (name: string) => copy.discover.categoryLabels[name] ?? name
  const formatLanguageLabel = (name: string) => copy.discover.languageLabels[name] ?? name
  const categoryOptions = discover.facets.categories.length
    ? discover.facets.categories
    : CATEGORY_OPTIONS.map((name) => ({ name, count: 0 }))
  const languageOptions = discover.facets.languages.length
    ? discover.facets.languages
    : LANGUAGE_OPTIONS.filter((name) => name !== 'Any').map((name) => ({ name, count: 0 }))
  const popularTags = discover.facets.tags
  const loadingDescription =
    discover.page > 1 || discover.items.length ? copy.discover.loadingPage(discover.page) : copy.discover.loadingResults
  const resultsRevealKey = [
    discover.query,
    discover.sort,
    discover.ascending ? 'asc' : 'desc',
    discover.timeRange,
    discover.page,
    discover.pageSize,
    discover.filters.titleQuery,
    discover.filters.descriptionQuery,
    discover.filters.authorQuery,
    discover.filters.uploaderQuery,
    discover.filters.category,
    discover.filters.language,
    discover.filters.tagsInclude,
    discover.filters.tagsExclude,
    discover.filters.includeAdult ? 'adult' : 'standard',
    discover.filters.minFileSize,
    discover.filters.maxFileSize,
    discover.filters.minDownloads,
    discover.filters.maxDownloads,
    discover.filters.minEndorsements,
    discover.filters.maxEndorsements,
    discover.items.map((item) => `${item.modId}:${item.modUrl}`).join('|'),
  ].join('\u0000')

  //Measure the pagination pages container and a single page button to compute
  //how many page slots fit the available width. Recompute on resize so the
  //page list auto-fills the middle region instead of using a fixed window.
  useLayoutEffect(() => {
    const paginationEl = paginationRef.current
    const pagesEl = paginationPagesRef.current
    if (!paginationEl || !pagesEl) {
      return undefined
    }

    const compute = () => {
      const paginationStyle = window.getComputedStyle(paginationEl)
      const paginationGap = Number.parseFloat(paginationStyle.columnGap || paginationStyle.gap) || 0
      const paginationWidth = paginationEl.clientWidth
      const leadingWidth = pagesEl.previousElementSibling?.getBoundingClientRect().width ?? 0
      const trailingWidth = pagesEl.nextElementSibling?.getBoundingClientRect().width ?? 0
      const containerWidth = Math.max(0, paginationWidth - leadingWidth - trailingWidth - paginationGap * 2)
      const pageButtons = pagesEl.querySelectorAll<HTMLButtonElement>('.launcher-discover-pagination-page')
      const buttonWidth = Math.max(...Array.from(pageButtons, (button) => button.getBoundingClientRect().width))
      if (containerWidth <= 0 || buttonWidth <= 0) {
        return
      }

      const gap = 6
      //Capacity = how many page buttons fit the container edge to edge.
      //Ellipsis overhead is handled inside getDiscoverPaginationItems, not here,
      //so the page list fills the middle region without leaving wide gutters.
      const capacity = Math.max(7, Math.floor((containerWidth + gap) / (buttonWidth + gap)) - 1)
      setPageCapacity((current) => (current === capacity ? current : capacity))
    }

    compute()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(compute)
    observer.observe(paginationEl)
    observer.observe(pagesEl)
    return () => observer.disconnect()
  }, [discover.items.length])

  useEffect(() => {
    if (discover.state === 'loading') {
      publishNotification({
        id: LAUNCHER_DISCOVER_PROGRESS_NOTIFICATION_ID,
        level: 'info',
        title: copy.discover.title,
        description: loadingDescription,
        autoDismissMs: null,
      })
      return
    }

    dismissNotification(LAUNCHER_DISCOVER_PROGRESS_NOTIFICATION_ID)
  }, [
    copy.discover.loadingPage,
    copy.discover.loadingResults,
    copy.discover.title,
    discover.items.length,
    discover.page,
    discover.state,
    loadingDescription,
  ])

  useEffect(() => {
    return () => {
      dismissNotification(LAUNCHER_DISCOVER_PROGRESS_NOTIFICATION_ID)
    }
  }, [])

  useEffect(() => {
    setSearchDraft(discover.query)
  }, [discover.query])

  useEffect(() => {
    if (!searchRequest || handledSearchRequestIdRef.current === searchRequest.id) {
      return
    }
    const query = searchRequest.query.trim()
    handledSearchRequestIdRef.current = searchRequest.id
    if (!query) {
      return
    }

    setSearchDraft(query)
    setOpenMenuId(null)
    setOpenSection(DEFAULT_DISCOVER_OPEN_SECTION)
    discover.resetFilters()
    discover.setQuery(query)

    const modId = parseLauncherModIdQuery(query)
    if (modId != null) {
      openModIdDetail(modId)
    }
  })

  useEffect(() => {
    const viewport = resultsViewportRef.current
    if (!viewport || discover.state !== 'loading') {
      return undefined
    }

    const preventWheel = (event: WheelEvent) => {
      event.preventDefault()
    }

    viewport.addEventListener('wheel', preventWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', preventWheel)
  }, [discover.state])

  useEffect(() => {
    if (!launcherUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      launcher: {
        discoverToolbar: {
          sort: discover.sort,
          ascending: discover.ascending,
          timeRange: discover.timeRange,
          pageSize: discover.pageSize,
          filtersHidden,
        },
      },
    }).catch((error) => {
      reportAppEvent({
        level: 'error',
        title: 'Failed to save launcher discover toolbar state',
        description: error instanceof Error ? error.message : String(error),
        notify: false,
      })
    })
  }, [discover.ascending, discover.pageSize, discover.sort, discover.timeRange, filtersHidden, launcherUiStateReady])

  const formattedResultCount = new Intl.NumberFormat('en-US').format(resultCount)
  const rangeStart = resultCount ? (discover.page - 1) * discover.pageSize + 1 : 0
  const rangeEnd = resultCount ? Math.min(discover.page * discover.pageSize, resultCount) : 0
  const paginationItems = getDiscoverPaginationItems(discover.page, discover.totalPages, pageCapacity)
  const jumpPageValue = jumpPageDirty ? jumpPageDraft : String(discover.page)
  const toggleSection = (section: DiscoverAccordionSection) => {
    setOpenSection(section)
  }

  const scrollResultsToTop = () => scrollDiscoverResultsViewportToTop(resultsViewportRef.current, contentRef.current)
  const setDiscoverPage = (page: number) => {
    scrollResultsToTop()
    discover.setPage(page)
  }
  const goToPreviousDiscoverPage = () => {
    scrollResultsToTop()
    discover.goToPreviousPage()
  }
  const goToNextDiscoverPage = () => {
    scrollResultsToTop()
    discover.goToNextPage()
  }

  const submitJumpPage = () => {
    const nextPage = Number(jumpPageValue)
    if (!Number.isFinite(nextPage) || nextPage < 1) {
      setJumpPageDirty(false)
      setJumpPageDraft('')
      return
    }
    setDiscoverPage(nextPage)
    setJumpPageDirty(false)
    setJumpPageDraft('')
  }

  const handleBlockedRetry = async () => {
    if (blockedRetryPending) {
      return
    }

    setBlockedRetryPending(true)
    try {
      await onRetryDiagnostics?.()
    } catch {
      // The follow-up discover revalidation will surface the latest blocked reason.
    } finally {
      discover.revalidate()
      setBlockedRetryPending(false)
    }
  }
  const submitDiscoverSearch = () => {
    if (discoverBlocked || discoverRequestFailed) {
      return
    }

    if (searchDirty) {
      discover.setQuery(normalizedSearchDraft)
    }

    const modId = parseLauncherModIdQuery(normalizedSearchDraft)
    if (modId != null) {
      openModIdDetail(modId)
    }
  }

  const notifyModIdNotFound = (modId: number) => {
    publishNotification({
      id: LAUNCHER_DISCOVER_MOD_ID_NOTIFICATION_ID,
      level: 'warning',
      title: copy.discover.modIdNotFoundTitle,
      description: copy.discover.modIdNotFoundDetail(modId),
      autoDismissMs: 5_000,
    })
  }

  const handleModIdDetailNotFound = (modId: number) => {
    setDetailModId(null)
    notifyModIdNotFound(modId)
  }

  const openModIdDetail = (modId: number) => {
    if (launcherPort.isRemoteModIdInvalid(modId)) {
      handleModIdDetailNotFound(modId)
      return
    }
    if (detailModId === modId) {
      return
    }

    setDetailItem(null)
    setDetailModId(modId)
  }

  // The downloads manager floats inside the window frame, so it cannot stack
  // above the body-portal detail drawer; pages close their drawer on request.
  useEffect(
    () =>
      listenForLauncherModDetailDismiss(() => {
        setDetailModId(null)
        setDetailItem(null)
      }),
    [],
  )

  // Cached launcher routes stay mounted while hidden; close the body-portal
  // detail drawer as soon as the discover route leaves the active page.
  useEffect(() => {
    if (routeActive === false) {
      setDetailModId(null)
      setDetailItem(null)
    }
  }, [routeActive])

  return (
    <section className="launcher-discover-page">
      <LoadingMotionReveal itemId="launcher-discover-console" index={0} as="header" className="launcher-discover-console panel-surface">
        <div className="launcher-discover-console-top">
          <div className="launcher-discover-console-heading">
            <div className="launcher-discover-console-title-row">
              <h1 className="launcher-discover-console-title">{copy.discover.consoleTitle}</h1>
            </div>
            <p className="launcher-discover-console-subtitle">{copy.discover.resultRange(rangeStart, rangeEnd, formattedResultCount)}</p>
          </div>
          <div className="launcher-discover-console-toolbar">
            <div className="launcher-discover-toolbar-group">
              <label className="launcher-discover-searchbar" data-guide="launcher-discover-search">
                <input
                  className="launcher-discover-searchbar-input"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      submitDiscoverSearch()
                    }
                  }}
                  placeholder={copy.discover.searchPlaceholder}
                  aria-label={copy.discover.searchPlaceholder}
                  spellCheck={false}
                  disabled={discoverBlocked || discoverRequestFailed}
                />
                <button
                  type="button"
                  className="launcher-discover-searchbar-button"
                  onClick={submitDiscoverSearch}
                  aria-label={copy.discover.searchAction}
                  title={copy.discover.searchAction}
                  disabled={!searchDirty || discoverBlocked || discoverRequestFailed}
                >
                  <Search className="h-4 w-4" />
                </button>
              </label>
              <button
                type="button"
                className={cx('launcher-discover-filters-toggle', !effectiveFiltersHidden && 'launcher-discover-filters-toggle-active')}
                onClick={() => setFiltersHidden((current) => !current)}
                disabled={discoverBlocked || discoverRequestFailed}
                aria-label={effectiveFiltersHidden ? copy.discover.showFilters : copy.discover.hideFilters}
                title={effectiveFiltersHidden ? copy.discover.showFilters : copy.discover.hideFilters}
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>

            <span className="launcher-discover-toolbar-divider" aria-hidden="true" />

            <div className="launcher-discover-console-actions launcher-discover-toolbar-group" data-guide="launcher-discover-toolbar">
              <DiscoverMenu
                label={copy.discover.timeRangeLabel}
                value={discover.timeRange}
                options={timeRangeOptions}
                open={effectiveOpenMenuId === 'time'}
                disabled={discoverBlocked}
                icon={Clock}
                onToggle={() => setOpenMenuId((current) => (current === 'time' ? null : 'time'))}
                onSelect={(value) => {
                  discover.setTimeRange(value)
                  setOpenMenuId(null)
                }}
              />
              <DiscoverMenu
                label={copy.discover.sortLabel}
                value={discover.sort}
                options={sortOptions}
                open={effectiveOpenMenuId === 'sort'}
                disabled={discoverBlocked}
                icon={ArrowDownUp}
                onToggle={() => setOpenMenuId((current) => (current === 'sort' ? null : 'sort'))}
                onSelect={(value) => {
                  discover.setSort(value)
                  setOpenMenuId(null)
                }}
              />
              <DiscoverMenu
                label={copy.discover.pageSizeLabel}
                value={discover.pageSize}
                options={pageSizeOptions}
                open={effectiveOpenMenuId === 'size'}
                disabled={discoverBlocked}
                icon={LayoutGrid}
                onToggle={() => setOpenMenuId((current) => (current === 'size' ? null : 'size'))}
                onSelect={(value) => {
                  discover.setPageSize(value)
                  setOpenMenuId(null)
                }}
              />
            </div>

            <button
              type="button"
              className="launcher-discover-icon-button launcher-discover-order-button"
              onClick={() => discover.setAscending(!discover.ascending)}
              aria-label={discover.ascending ? copy.discover.ascendingShort : copy.discover.descendingShort}
              title={discover.ascending ? copy.discover.ascendingShort : copy.discover.descendingShort}
              disabled={discoverBlocked}
            >
              {discover.ascending ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </button>

            <span className="launcher-discover-toolbar-divider" aria-hidden="true" />

            <div className="launcher-discover-toolbar-group">
              <button
                type="button"
                className="launcher-discover-icon-button"
                aria-label={copy.discover.gridViewLabel}
                title={copy.discover.gridViewLabel}
                disabled={discoverBlocked}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="launcher-discover-icon-button"
                onClick={discover.refresh}
                aria-label={copy.actions.refresh}
                title={copy.actions.refresh}
                disabled={discoverBlocked}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </LoadingMotionReveal>

      <LoadingMotionReveal
        itemId="launcher-discover-shell"
        index={1}
        className={cx('launcher-discover-shell', effectiveFiltersHidden && 'launcher-discover-shell-filters-hidden')}
      >
        {!effectiveFiltersHidden ? (
          <aside
            className={cx(
              'launcher-discover-sidebar panel-surface panel-surface-muted',
              discoverBlocked && 'launcher-discover-sidebar-disabled',
            )}
            aria-disabled={discoverBlocked ? 'true' : undefined}
          >
            <fieldset className="launcher-discover-sidebar-fieldset" disabled={discoverBlocked}>
              <div className="launcher-discover-sidebar-accordion">
                <DiscoverRailSection
                  id="category"
                  title={copy.discover.categorySection}
                  open={openSection === 'category'}
                  onToggle={toggleSection}
                >
                  <div className="launcher-discover-category-list">
                    {categoryOptions.map((category) => (
                      <label
                        key={category.name}
                        className={cx(
                          'launcher-discover-category-item',
                          discover.filters.category === category.name && 'launcher-discover-category-item-active',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={discover.filters.category === category.name}
                          onChange={() =>
                            discover.updateFilter('category', discover.filters.category === category.name ? '' : category.name)
                          }
                        />
                        <span>
                          {formatCategoryLabel(category.name)}
                          {category.count ? ` (${formatCompactNumber(category.count)})` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </DiscoverRailSection>

                <DiscoverRailSection id="tags" title={copy.discover.tagsSection} open={openSection === 'tags'} onToggle={toggleSection}>
                  <TagSuggestionField
                    label={copy.discover.tagsIncludeLabel}
                    value={discover.filters.tagsInclude}
                    placeholder={copy.discover.tagsIncludePlaceholder}
                    suggestionsId="launcher-discover-include-suggestions"
                    suggestionsLabel={copy.discover.tagsIncludeSuggestionsLabel}
                    suggestions={popularTags}
                    onChange={(value) => discover.updateFilter('tagsInclude', value)}
                  />
                  <TagSuggestionField
                    label={copy.discover.tagsExcludeLabel}
                    value={discover.filters.tagsExclude}
                    placeholder={copy.discover.tagsExcludePlaceholder}
                    suggestionsId="launcher-discover-exclude-suggestions"
                    suggestionsLabel={copy.discover.tagsExcludeSuggestionsLabel}
                    suggestions={popularTags}
                    onChange={(value) => discover.updateFilter('tagsExclude', value)}
                  />
                </DiscoverRailSection>

                <DiscoverRailSection
                  id="search"
                  title={copy.discover.searchParametersSection}
                  open={openSection === 'search'}
                  onToggle={toggleSection}
                >
                  <label className="launcher-discover-rail-field">
                    <span>{copy.discover.titleContainsLabel}</span>
                    <input
                      className="control-input"
                      value={discover.filters.titleQuery}
                      onChange={(event) => discover.updateFilter('titleQuery', event.target.value)}
                      placeholder={copy.discover.titleSearchPlaceholder}
                      spellCheck={false}
                    />
                  </label>
                  <label className="launcher-discover-rail-field">
                    <span>{copy.discover.descriptionContainsLabel}</span>
                    <input
                      className="control-input"
                      value={discover.filters.descriptionQuery}
                      onChange={(event) => discover.updateFilter('descriptionQuery', event.target.value)}
                      placeholder={copy.discover.descriptionSearchPlaceholder}
                      spellCheck={false}
                    />
                  </label>
                  <label className="launcher-discover-rail-field">
                    <span>{copy.discover.authorContainsLabel}</span>
                    <input
                      className="control-input"
                      value={discover.filters.authorQuery}
                      onChange={(event) => discover.updateFilter('authorQuery', event.target.value)}
                      placeholder={copy.discover.authorSearchPlaceholder}
                      spellCheck={false}
                    />
                  </label>
                  <label className="launcher-discover-rail-field">
                    <span>{copy.discover.uploaderContainsLabel}</span>
                    <input
                      className="control-input"
                      value={discover.filters.uploaderQuery}
                      onChange={(event) => discover.updateFilter('uploaderQuery', event.target.value)}
                      placeholder={copy.discover.uploaderSearchPlaceholder}
                      spellCheck={false}
                    />
                  </label>
                </DiscoverRailSection>

                <DiscoverRailSection
                  id="language"
                  title={copy.discover.languageSection}
                  open={openSection === 'language'}
                  onToggle={toggleSection}
                >
                  <div className="launcher-discover-category-list">
                    <label
                      className={cx(
                        'launcher-discover-category-item',
                        !discover.filters.language && 'launcher-discover-category-item-active',
                      )}
                    >
                      <input type="checkbox" checked={!discover.filters.language} onChange={() => discover.updateFilter('language', '')} />
                      <span>{copy.discover.anyLabel}</span>
                    </label>
                    {languageOptions.map((language) => (
                      <label
                        key={language.name}
                        className={cx(
                          'launcher-discover-category-item',
                          discover.filters.language === language.name && 'launcher-discover-category-item-active',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={discover.filters.language === language.name}
                          onChange={() =>
                            discover.updateFilter('language', discover.filters.language === language.name ? '' : language.name)
                          }
                        />
                        <span>
                          {formatLanguageLabel(language.name)}
                          {language.count ? ` (${formatCompactNumber(language.count)})` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </DiscoverRailSection>

                <DiscoverRailSection
                  id="limits"
                  title={copy.discover.limitsSection}
                  open={openSection === 'limits'}
                  onToggle={toggleSection}
                >
                  <label className="launcher-discover-toggle-row">
                    <input
                      type="checkbox"
                      checked={discover.filters.includeAdult}
                      onChange={(event) => discover.updateFilter('includeAdult', event.target.checked)}
                    />
                    <span>{copy.discover.includeAdultContent}</span>
                  </label>
                  <RangePresetGroup
                    label={copy.discover.fileSizeLabel}
                    minValue={discover.filters.minFileSize}
                    maxValue={discover.filters.maxFileSize}
                    minFilter="minFileSize"
                    maxFilter="maxFileSize"
                    presets={fileSizePresets}
                    advancedOpen={advancedLimitId === 'fileSize'}
                    advancedLabel={copy.discover.advancedAction}
                    presetsLabel={copy.discover.rangePresetsLabel(copy.discover.fileSizeLabel)}
                    noMinimumPlaceholder={copy.discover.noMinimumPlaceholder}
                    noMaximumPlaceholder={copy.discover.noMaximumPlaceholder}
                    onToggleAdvanced={() => setAdvancedLimitId((current) => (current === 'fileSize' ? null : 'fileSize'))}
                    onUpdateFilter={discover.updateFilter}
                  />
                  <RangePresetGroup
                    label={copy.discover.downloadsLabel}
                    minValue={discover.filters.minDownloads}
                    maxValue={discover.filters.maxDownloads}
                    minFilter="minDownloads"
                    maxFilter="maxDownloads"
                    presets={downloadPresets}
                    advancedOpen={advancedLimitId === 'downloads'}
                    advancedLabel={copy.discover.advancedAction}
                    presetsLabel={copy.discover.rangePresetsLabel(copy.discover.downloadsLabel)}
                    noMinimumPlaceholder={copy.discover.noMinimumPlaceholder}
                    noMaximumPlaceholder={copy.discover.noMaximumPlaceholder}
                    onToggleAdvanced={() => setAdvancedLimitId((current) => (current === 'downloads' ? null : 'downloads'))}
                    onUpdateFilter={discover.updateFilter}
                  />
                  <RangePresetGroup
                    label={copy.discover.endorsementsLabel}
                    minValue={discover.filters.minEndorsements}
                    maxValue={discover.filters.maxEndorsements}
                    minFilter="minEndorsements"
                    maxFilter="maxEndorsements"
                    presets={endorsementPresets}
                    advancedOpen={advancedLimitId === 'endorsements'}
                    advancedLabel={copy.discover.advancedAction}
                    presetsLabel={copy.discover.rangePresetsLabel(copy.discover.endorsementsLabel)}
                    noMinimumPlaceholder={copy.discover.noMinimumPlaceholder}
                    noMaximumPlaceholder={copy.discover.noMaximumPlaceholder}
                    onToggleAdvanced={() => setAdvancedLimitId((current) => (current === 'endorsements' ? null : 'endorsements'))}
                    onUpdateFilter={discover.updateFilter}
                  />
                </DiscoverRailSection>
              </div>
            </fieldset>
            {discoverBlocked ? (
              <div className="launcher-discover-sidebar-scrim" aria-hidden="true">
                <AlertTriangle className="h-4 w-4" />
              </div>
            ) : null}
          </aside>
        ) : null}

        <div
          ref={contentRef}
          className={cx(
            'launcher-discover-content',
            discoverBlocked && 'launcher-discover-content-blocked',
            discoverRequestFailed && 'launcher-discover-content-error',
            discoverEmpty && 'launcher-discover-content-empty',
          )}
        >
          {discoverBlocked ? (
            <LauncherBlockedState
              className="launcher-discover-blocked-state"
              eyebrow={copy.discover.title}
              title={copy.discover.blockedTitle}
              detail={copy.discover.blockedDetail}
              issueLabel={copy.discover.blockedIssueLabel}
              issueSummary={primaryBlockedReason}
              detailsText={blockedReasonText}
              detailsExpanded={effectiveBlockedDetailsExpanded}
              detailsToggleLabel={
                effectiveBlockedDetailsExpanded ? copy.discover.blockedDetailsCollapseAction : copy.discover.blockedDetailsExpandAction
              }
              copyLabel={copy.discover.blockedCopyLogsAction}
              onToggleDetails={() => setBlockedDetailsExpanded((current) => !current)}
              onCopyDetails={() => {
                if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
                  return
                }

                void navigator.clipboard.writeText(blockedReasonText)
              }}
              illustrationAccent={<Search className="h-4 w-4" />}
              primaryAction={
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={() => void handleBlockedRetry()}
                  disabled={blockedRetryPending}
                  aria-busy={blockedRetryPending ? 'true' : undefined}
                >
                  <RefreshCw className={cx('h-4 w-4', blockedRetryPending && 'animate-spin')} />
                  <span>{copy.discover.blockedRetryAction}</span>
                </button>
              }
              secondaryAction={
                onNavigateToDiagnostics ? (
                  <button type="button" className="control-button" onClick={onNavigateToDiagnostics}>
                    <ArrowRight className="h-4 w-4" />
                    <span>{copy.discover.blockedDiagnosticsAction}</span>
                  </button>
                ) : null
              }
            />
          ) : null}

          {discoverRequestFailed ? (
            <LauncherBlockedState
              className="launcher-discover-blocked-state"
              eyebrow={copy.discover.title}
              title={copy.discover.errorTitle}
              detail={copy.discover.errorDetail}
              issueLabel={copy.discover.blockedIssueLabel}
              issueSummary={discover.error ?? copy.discover.empty}
              tone="error"
              primaryAction={
                <button type="button" className="control-button control-button-primary" onClick={() => discover.refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  <span>{copy.actions.refresh}</span>
                </button>
              }
            />
          ) : null}

          {discoverEmpty ? (
            <LauncherEmptyState
              eyebrow={copy.discover.title}
              title={copy.discover.emptyTitle}
              detail={copy.discover.emptyDetail}
              illustrationAccent={<Filter className="h-4 w-4" />}
              primaryAction={
                hasActiveDiscoverFilters(discover.query, discover.filters) ? (
                  <button type="button" className="control-button control-button-primary" onClick={discover.resetFilters}>
                    <Filter className="h-4 w-4" />
                    <span>{copy.discover.emptyClearFiltersAction}</span>
                  </button>
                ) : (
                  <button type="button" className="control-button control-button-primary" onClick={discover.refresh}>
                    <RefreshCw className="h-4 w-4" />
                    <span>{copy.actions.refresh}</span>
                  </button>
                )
              }
            />
          ) : null}

          {!discoverBlocked && discover.state !== 'error' && (discover.items.length > 0 || discover.state === 'loading') ? (
            <div className="launcher-discover-results-shell" data-guide="launcher-discover-results">
              <div
                ref={resultsViewportRef}
                className={cx(
                  'launcher-discover-results-viewport',
                  discover.state === 'loading' && 'launcher-discover-results-viewport-loading',
                )}
                aria-busy={discover.state === 'loading' ? 'true' : undefined}
                onWheelCapture={discover.state === 'loading' ? (event) => event.preventDefault() : undefined}
              >
                <div className="launcher-discover-wall-shell">
                  <div key={resultsRevealKey} className="launcher-discover-wall">
                    {discover.items.map((item, index) => (
                      <LoadingMotionRevealItem
                        key={`${item.modId}:${item.modUrl}`}
                        index={Math.floor(index / 4) + 1}
                        as="div"
                        className="launcher-discover-wall-reveal"
                      >
                        <LauncherDiscoverCard
                          item={item}
                          onOpenDetails={() => {
                            setDetailModId(null)
                            setDetailItem(item)
                          }}
                          onQueueDownload={() =>
                            onQueueDownload({
                              modId: item.modId,
                              title: item.title,
                              imageUrl: item.imageUrl,
                              version: null,
                              source: 'discover',
                            })
                          }
                        />
                      </LoadingMotionRevealItem>
                    ))}
                  </div>
                  {discover.state === 'loading' ? (
                    <div
                      className="launcher-discover-loading-overlay"
                      role="status"
                      aria-label={copy.discover.loadingResultsLabel}
                      onWheel={(event) => event.preventDefault()}
                      onWheelCapture={(event) => event.preventDefault()}
                    >
                      <span className="launcher-discover-loading-spinner" aria-hidden="true" />
                    </div>
                  ) : null}
                </div>
              </div>

              {discover.items.length ? (
                <div ref={paginationRef} className="launcher-discover-pagination">
                  <button
                    type="button"
                    className="launcher-discover-pagination-button"
                    aria-label={copy.discover.previousPage}
                    disabled={discover.page <= 1}
                    onClick={goToPreviousDiscoverPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>{copy.discover.previousPage}</span>
                  </button>

                  <div ref={paginationPagesRef} className="launcher-discover-pagination-pages">
                    {paginationItems.map((item, index) =>
                      item === 'ellipsis' ? (
                        <span key={`ellipsis:${index}`} className="launcher-discover-pagination-ellipsis">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          className={cx(
                            'launcher-discover-pagination-page',
                            item === discover.page && 'launcher-discover-pagination-page-active',
                          )}
                          aria-label={copy.discover.pageLabel(item)}
                          aria-current={item === discover.page ? 'page' : undefined}
                          onClick={() => setDiscoverPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="launcher-discover-pagination-trailing">
                    <button
                      type="button"
                      className="launcher-discover-pagination-button"
                      aria-label={copy.discover.nextPage}
                      disabled={discover.totalPages > 0 && discover.page >= discover.totalPages}
                      onClick={goToNextDiscoverPage}
                    >
                      <span>{copy.discover.nextPage}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    <label className="launcher-discover-pagination-jump">
                      <span>{copy.discover.jumpToPage}</span>
                      <input
                        aria-label={copy.discover.jumpToPage}
                        className="control-input"
                        value={jumpPageValue}
                        onChange={(event) => {
                          setJumpPageDirty(true)
                          setJumpPageDraft(event.target.value)
                        }}
                        onBlur={() => {
                          setJumpPageDirty(false)
                          setJumpPageDraft('')
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            submitJumpPage()
                          }
                        }}
                        inputMode="numeric"
                      />
                      <span>{copy.discover.pageUnit}</span>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {detailModId != null ? (
            <LauncherDiscoverDetailPanel
              item={null}
              modId={detailModId}
              onClose={() => setDetailModId(null)}
              onQueueDownload={onQueueDownload}
              onModIdNotFound={handleModIdDetailNotFound}
            />
          ) : detailItem ? (
            <LauncherDiscoverDetailPanel
              item={detailItem}
              modId={null}
              onClose={() => setDetailItem(null)}
              onQueueDownload={onQueueDownload}
              onModIdNotFound={handleModIdDetailNotFound}
            />
          ) : null}
        </div>
      </LoadingMotionReveal>
    </section>
  )
}
