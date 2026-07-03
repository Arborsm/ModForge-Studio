import { AlertTriangle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Filter, LayoutGrid, RefreshCw, Search } from 'lucide-react'
import { createPortal } from 'react-dom'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import type { LauncherSettings } from '@features/launcher/api'
import { canUseDesktopHost } from '@shared/lib/desktop'
import { normalizeLauncherDiscoverToolbarState, type LauncherDiscoverToolbarState } from '@features/launcher'
import { useLauncherDiscover, useLauncherRemoteModDetail } from '@features/launcher'
import type { LauncherDiscoverDetail, QueueLauncherDownloadInput } from '@features/launcher'
import { LauncherBlockedState, LauncherModDetailPanel, LauncherStateBlock } from '@features/launcher'
import { applyAppUiStatePatch, getAppUiStateSnapshot, initializeAppUiState } from '@shared/lib/app-state'
import { LauncherDiscoverCard } from './LauncherDiscoverCard'
import { formatCompactNumber } from './launcherDiscoverFormat'

type LauncherDiscoverPageProps = {
  settings: LauncherSettings
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
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

function getDiscoverPaginationItems(page: number, totalPages: number) {
  if (totalPages <= 0) {
    return []
  }

  const items: Array<number | 'ellipsis'> = []
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1])
  const normalizedPages = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)

  for (const value of normalizedPages) {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && value - previous > 1) {
      items.push('ellipsis')
    }
    items.push(value)
  }

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

function DiscoverMenu<T extends string | number>({
  label,
  value,
  options,
  open,
  disabled = false,
  onToggle,
  onSelect,
}: {
  label: string
  value: T
  options: DiscoverOption<T>[]
  open: boolean
  disabled?: boolean
  onToggle: () => void
  onSelect: (value: T) => void
}) {
  const active = options.find((option) => option.value === value) ?? options[0]

  return (
    <div className="launcher-discover-menu">
      <button
        type="button"
        className="launcher-discover-menu-trigger control-button"
        onClick={onToggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        disabled={disabled}
      >
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
  detailLabels,
  onClose,
  onQueueDownload,
}: {
  item: DiscoverItem
  detailLabels: {
    currentVersion: string
    uniqueId: string
    path: string
    dependencies: string
    updateKeys: string
    pack: string
  }
  onClose: () => void
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
}) {
  const copy = useEditorCopy().launcher
  const remoteDetail = useLauncherRemoteModDetail(item.modId, { includeFiles: false })
  const fallbackDetail = createDiscoverRemoteDetail(item)
  const displayedDetail = remoteDetail.detail ? mergeDiscoverRemoteDetail(item, remoteDetail.detail) : fallbackDetail

  return (
    <LauncherModDetailPanel
      open={true}
      onClose={onClose}
      closeLabel={copy.actions.closeDialog}
      title={copy.library.detailsTitle}
      subtitle={copy.library.detailsSubtitle}
      empty={copy.library.selectionEmpty}
      mod={null}
      remoteDetail={displayedDetail}
      remoteFilesDeferred={true}
      remoteLoading={remoteDetail.state === 'loading'}
      labels={detailLabels}
      noSummary={copy.states.noSummary}
      onToggleEnabled={() => undefined}
      enableLabel={copy.actions.enable}
      disableLabel={copy.actions.disable}
      enabledStateLabel={copy.overview.enabledMods}
      disabledStateLabel={copy.overview.disabledMods}
      openFolderLabel={copy.actions.openFolder}
      setCoverLabel={copy.actions.setCover}
      clearCoverLabel={copy.actions.clearCover}
      onOpenFolder={() => undefined}
      onSetCover={() => undefined}
      onClearCover={() => undefined}
      openModPageLabel={copy.actions.openModPage}
      onQueueDownload={onQueueDownload}
    />
  )
}

export function LauncherDiscoverPage({ onQueueDownload, onNavigateToDiagnostics, onRetryDiagnostics }: LauncherDiscoverPageProps) {
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

  return (
    <LauncherDiscoverPageContent
      key={launcherUiStateReady ? 'discover:ready' : 'discover:boot'}
      onQueueDownload={onQueueDownload}
      onNavigateToDiagnostics={onNavigateToDiagnostics}
      onRetryDiagnostics={onRetryDiagnostics}
      initialToolbarState={hydratedToolbarState}
      launcherUiStateReady={launcherUiStateReady}
    />
  )
}

function LauncherDiscoverPageContent({
  onQueueDownload,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
  initialToolbarState,
  launcherUiStateReady,
}: {
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  initialToolbarState: LauncherDiscoverToolbarState
  launcherUiStateReady: boolean
}) {
  const copy = useEditorCopy().launcher
  const discover = useLauncherDiscover(initialToolbarState)
  const [filtersHidden, setFiltersHidden] = useState(initialToolbarState.filtersHidden)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<DiscoverAccordionSection>(DEFAULT_DISCOVER_OPEN_SECTION)
  const [blockedDetailsExpanded, setBlockedDetailsExpanded] = useState(false)
  const [blockedRetryPending, setBlockedRetryPending] = useState(false)
  const [jumpPageDraft, setJumpPageDraft] = useState('')
  const [jumpPageDirty, setJumpPageDirty] = useState(false)
  const [detailItem, setDetailItem] = useState<DiscoverItem | null>(null)
  const [advancedLimitId, setAdvancedLimitId] = useState<string | null>(null)
  const resultsViewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const discoverBlocked = Boolean(discover.blockedReason && discover.state !== 'loading')
  const blockedReasonLines = getBlockedReasonLines(discover.blockedReason)
  const primaryBlockedReason = blockedReasonLines[0] ?? null
  const blockedReasonText = blockedReasonLines.join('\n')
  const discoverRequestFailed = !discoverBlocked && discover.state === 'error'
  const effectiveFiltersHidden = filtersHidden || discoverBlocked || discoverRequestFailed
  const effectiveOpenMenuId = discoverBlocked || discoverRequestFailed ? null : openMenuId
  const effectiveBlockedDetailsExpanded = discoverBlocked ? blockedDetailsExpanded : false
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
    })
  }, [discover.ascending, discover.pageSize, discover.sort, discover.timeRange, filtersHidden, launcherUiStateReady])

  const formattedResultCount = new Intl.NumberFormat('en-US').format(resultCount)
  const rangeStart = resultCount ? (discover.page - 1) * discover.pageSize + 1 : 0
  const rangeEnd = resultCount ? Math.min(discover.page * discover.pageSize, resultCount) : 0
  const paginationItems = getDiscoverPaginationItems(discover.page, discover.totalPages)
  const jumpPageValue = jumpPageDirty ? jumpPageDraft : String(discover.page)
  const detailLabels = useMemo(
    () => ({
      currentVersion: copy.fields.currentVersion,
      uniqueId: copy.fields.uniqueId,
      path: copy.fields.path,
      dependencies: copy.fields.dependencies,
      updateKeys: copy.fields.updateKeys,
      pack: copy.library.modDetail.file,
    }),
    [
      copy.fields.currentVersion,
      copy.fields.dependencies,
      copy.fields.path,
      copy.fields.uniqueId,
      copy.fields.updateKeys,
      copy.library.modDetail.file,
    ],
  )

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

  return (
    <section className="launcher-discover-page">
      <header className="launcher-discover-console panel-surface">
        <div className="launcher-discover-console-top">
          <div className="launcher-discover-console-heading">
            <div className="launcher-discover-console-title-row">
              <h1 className="launcher-discover-console-title">{copy.discover.consoleTitle}</h1>
            </div>
            <p className="launcher-discover-console-subtitle">{copy.discover.resultRange(rangeStart, rangeEnd, formattedResultCount)}</p>
          </div>
          <div className="launcher-discover-console-toolbar">
            <label className="launcher-discover-searchbar">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                className="launcher-discover-searchbar-input"
                value={discover.query}
                onChange={(event) => discover.setQuery(event.target.value)}
                placeholder={copy.discover.searchPlaceholder}
                aria-label={copy.discover.searchPlaceholder}
                spellCheck={false}
                disabled={discoverBlocked || discoverRequestFailed}
              />
            </label>
            <button
              type="button"
              className="launcher-discover-filters-toggle control-button"
              onClick={() => setFiltersHidden((current) => !current)}
              disabled={discoverBlocked || discoverRequestFailed}
            >
              <Filter className="h-4 w-4" />
              <span>{effectiveFiltersHidden ? copy.discover.showFilters : copy.discover.hideFilters}</span>
            </button>
            <div className="launcher-discover-console-actions">
              <DiscoverMenu
                label={copy.discover.timeRangeLabel}
                value={discover.timeRange}
                options={timeRangeOptions}
                open={effectiveOpenMenuId === 'time'}
                disabled={discoverBlocked}
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
                onToggle={() => setOpenMenuId((current) => (current === 'sort' ? null : 'sort'))}
                onSelect={(value) => {
                  discover.setSort(value)
                  setOpenMenuId(null)
                }}
              />
              <button
                type="button"
                className="launcher-discover-order-button control-button"
                onClick={() => discover.setAscending(!discover.ascending)}
                disabled={discoverBlocked}
              >
                {discover.ascending ? copy.discover.ascendingShort : copy.discover.descendingShort}
              </button>
              <DiscoverMenu
                label={copy.discover.pageSizeLabel}
                value={discover.pageSize}
                options={pageSizeOptions}
                open={effectiveOpenMenuId === 'size'}
                disabled={discoverBlocked}
                onToggle={() => setOpenMenuId((current) => (current === 'size' ? null : 'size'))}
                onSelect={(value) => {
                  discover.setPageSize(value)
                  setOpenMenuId(null)
                }}
              />
              <button
                type="button"
                className="launcher-discover-icon-button control-button"
                aria-label={copy.discover.gridViewLabel}
                disabled={discoverBlocked}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="launcher-discover-icon-button control-button"
                onClick={discover.refresh}
                aria-label={copy.actions.refresh}
                disabled={discoverBlocked}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={cx('launcher-discover-shell', effectiveFiltersHidden && 'launcher-discover-shell-filters-hidden')}>
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
                <button type="button" className="control-button control-button-primary" onClick={() => void discover.refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  <span>{copy.actions.refresh}</span>
                </button>
              }
            />
          ) : null}

          {!discoverBlocked && discover.state !== 'error' && discover.state !== 'loading' && !discover.items.length ? (
            <LauncherStateBlock title={copy.discover.empty} detail={copy.discover.subtitle} />
          ) : null}

          {!discoverBlocked && discover.state !== 'error' && (discover.items.length > 0 || discover.state === 'loading') ? (
            <div className="launcher-discover-results-shell">
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
                  <div className="launcher-discover-wall">
                    {discover.items.map((item) => (
                      <LauncherDiscoverCard
                        key={`${item.modId}:${item.modUrl}`}
                        item={item}
                        onOpenDetails={() => setDetailItem(item)}
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
                <div className="launcher-discover-pagination">
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

                  <div className="launcher-discover-pagination-pages">
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
              ) : null}
            </div>
          ) : null}

          {detailItem ? (
            <LauncherDiscoverDetailPanel
              item={detailItem}
              detailLabels={detailLabels}
              onClose={() => setDetailItem(null)}
              onQueueDownload={onQueueDownload}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
