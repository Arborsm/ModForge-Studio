import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  HardDrive,
  LayoutGrid,
  RefreshCw,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { dismissNotification, publishNotification } from '../../../lib/app/notifications'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { cx } from '../../../lib/cx'
import type { LauncherSettings } from '../../../lib/desktop'
import { useLauncherImage } from '../../../lib/launcher/imageLoader'
import {
  persistLauncherDiscoverToolbarState,
  readStoredLauncherDiscoverToolbarState,
} from '../../../lib/launcher/launcherDiscoverToolbarState'
import { useLauncherDiscover } from '../../../lib/launcher/useLauncherDiscover'
import type { QueueLauncherDownloadInput } from '../../../lib/launcher/types'
import { LauncherStateBlock } from '../shared/LauncherStateBlock'

type LauncherDiscoverPageProps = {
  settings: LauncherSettings
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
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

const TIME_RANGE_OPTIONS: DiscoverOption<'all' | 'day' | 'week' | 'month' | 'year'>[] = [
  { value: 'all', label: 'All time' },
  { value: 'day', label: '24 hours' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: 'year', label: '1 year' },
]

const SORT_OPTIONS: DiscoverOption<'newest' | 'updated' | 'trending' | 'downloads' | 'endorsements' | 'name'>[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Updated' },
  { value: 'trending', label: 'Trending' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'endorsements', label: 'Endorsements' },
  { value: 'name', label: 'Name' },
]

const PAGE_SIZE_OPTIONS: DiscoverOption<number>[] = [
  { value: 20, label: '20 items' },
  { value: 40, label: '40 items' },
  { value: 80, label: '80 items' },
]

type DiscoverAccordionSection =
  | 'category'
  | 'tags'
  | 'search'
  | 'language'
  | 'content'
  | 'fileSize'
  | 'downloads'
  | 'endorsements'

const DEFAULT_DISCOVER_OPEN_SECTION: DiscoverAccordionSection = 'category'

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
  const committed = currentDraft ? parts.slice(0, -1).map((item) => item.trim()).filter(Boolean) : tokens
  return [...committed, tag].join(', ')
}

const LAUNCHER_DISCOVER_PROGRESS_NOTIFICATION_ID = 'launcher-discover-progress'

function formatCompactNumber(value: number | null) {
  if (!value || value <= 0) {
    return '0'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return '0 KB'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let current = bytes
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  return `${current >= 10 ? current.toFixed(0) : current.toFixed(1)}${units[unitIndex]}`
}

function formatRelativeDate(value: string | null) {
  if (!value) {
    return 'Recently updated'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.round(diffMs / 86_400_000)
  if (Math.abs(diffDays) < 1) {
    return 'Today'
  }
  if (Math.abs(diffDays) < 7) {
    return `${Math.abs(diffDays)}d ago`
  }
  if (Math.abs(diffDays) < 31) {
    return `${Math.round(Math.abs(diffDays) / 7)}w ago`
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

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

function DiscoverMenu<T extends string | number>({
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
}: {
  label: string
  value: T
  options: DiscoverOption<T>[]
  open: boolean
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
              className={cx(
                'launcher-discover-menu-option',
                option.value === value && 'launcher-discover-menu-option-active',
              )}
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

function DiscoverCard({
  item,
  onQueueDownload,
}: {
  item: ReturnType<typeof useLauncherDiscover>['items'][number]
  onQueueDownload: () => void
}) {
  const copy = useEditorCopy().launcher
  const image = useLauncherImage(item.imageUrl)

  return (
    <article className="launcher-discover-wall-card panel-section">
      <a
        href={item.modUrl}
        target="_blank"
        rel="noreferrer"
        className="launcher-discover-wall-cover"
        aria-label={`${copy.actions.openModPage}: ${item.title}`}
      >
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-discover-card-image" /> : null}
        {item.updateAvailable ? <span className="launcher-discover-wall-badge">Update available</span> : null}
        <div className="launcher-discover-wall-cover-overlay">
          <ExternalLink className="h-4 w-4" />
          <span>{copy.actions.openModPage}</span>
        </div>
      </a>
      <div className="launcher-discover-wall-body">
        <a href={item.modUrl} target="_blank" rel="noreferrer" className="launcher-discover-wall-copy">
          <div className="launcher-discover-wall-title-slot">
            <p className="launcher-discover-wall-title">{item.title}</p>
          </div>
          <p className="launcher-discover-wall-author">{item.author ?? item.uploader ?? `Nexus #${item.modId}`}</p>
          <p className="launcher-discover-wall-category">{item.category ?? 'Stardew Valley Mod'}</p>
          <div className="launcher-discover-wall-summary-slot">
            <p className="launcher-discover-wall-summary">{item.summary ?? copy.states.noSummary}</p>
          </div>
        </a>
        <div className="launcher-discover-card-footer">
          <div className="launcher-discover-wall-meta">
            <span className="launcher-discover-wall-meta-chip">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{formatRelativeDate(item.updatedAt ?? item.createdAt)}</span>
            </span>
            <span className="launcher-discover-wall-meta-chip">
              <Download className="h-3.5 w-3.5" />
              <span>{formatCompactNumber(item.downloads)}</span>
            </span>
            <span className="launcher-discover-wall-meta-chip">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{formatFileSize(item.fileSize)}</span>
            </span>
          </div>
          <button
            type="button"
            className="launcher-discover-card-quick-action"
            onClick={onQueueDownload}
            aria-label={copy.actions.queueDownload}
            title={copy.actions.queueDownload}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
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
    <section className="launcher-discover-rail-section panel-section">
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

  return (
    <label className="launcher-discover-rail-field launcher-discover-tag-field">
      <span>{label}</span>
      <div className="launcher-discover-tag-input-shell">
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
        {open && filteredSuggestions.length ? (
          <div
            id={suggestionsId}
            className="launcher-discover-tag-suggestions"
            role="listbox"
            aria-label={suggestionsLabel}
          >
            {filteredSuggestions.slice(0, 8).map((tag) => (
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
          </div>
        ) : null}
      </div>
    </label>
  )
}

export function LauncherDiscoverPage({ onQueueDownload }: LauncherDiscoverPageProps) {
  const copy = useEditorCopy().launcher
  const discover = useLauncherDiscover()
  const [filtersHidden, setFiltersHidden] = useState(() => readStoredLauncherDiscoverToolbarState().filtersHidden)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<DiscoverAccordionSection>(DEFAULT_DISCOVER_OPEN_SECTION)
  const [jumpPageDraft, setJumpPageDraft] = useState('')
  const [jumpPageDirty, setJumpPageDirty] = useState(false)
  const resultsViewportRef = useRef<HTMLDivElement | null>(null)
  const resultCount = discover.totalCount || discover.items.length
  const categoryOptions = discover.facets.categories.length
    ? discover.facets.categories
    : CATEGORY_OPTIONS.map((name) => ({ name, count: 0 }))
  const languageOptions = discover.facets.languages.length
    ? discover.facets.languages
    : LANGUAGE_OPTIONS.filter((name) => name !== 'Any').map((name) => ({ name, count: 0 }))
  const popularTags = discover.facets.tags.slice(0, 12)
  const loadingDescription =
    discover.page > 1 || discover.items.length
      ? `Loading Nexus results for page ${discover.page}.`
      : copy.discover.subtitle

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
  }, [copy.discover.subtitle, copy.discover.title, discover.items.length, discover.page, discover.state, loadingDescription])

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
    persistLauncherDiscoverToolbarState({ filtersHidden })
  }, [filtersHidden])

  const formattedResultCount = new Intl.NumberFormat('en-US').format(resultCount)
  const rangeStart = resultCount ? (discover.page - 1) * discover.pageSize + 1 : 0
  const rangeEnd = resultCount ? Math.min(discover.page * discover.pageSize, resultCount) : 0
  const paginationItems = getDiscoverPaginationItems(discover.page, discover.totalPages)
  const jumpPageValue = jumpPageDirty ? jumpPageDraft : String(discover.page)

  const toggleSection = (section: DiscoverAccordionSection) => {
    setOpenSection(section)
  }

  const submitJumpPage = () => {
    const nextPage = Number(jumpPageValue)
    if (!Number.isFinite(nextPage) || nextPage < 1) {
      setJumpPageDirty(false)
      setJumpPageDraft('')
      return
    }
    discover.setPage(nextPage)
    setJumpPageDirty(false)
    setJumpPageDraft('')
  }

  return (
    <section className="launcher-discover-page">
      <header className="launcher-discover-console panel-surface">
        <div className="launcher-discover-console-top">
          <div className="launcher-discover-console-heading">
            <div className="launcher-discover-console-title-row">
              <h1 className="launcher-discover-console-title">Nexus Mods</h1>
            </div>
            <p className="launcher-discover-console-subtitle">
              {`Showing ${rangeStart} - ${rangeEnd} of ${formattedResultCount} results`}
            </p>
          </div>
          <div className="launcher-discover-console-toolbar">
            <button
              type="button"
              className="launcher-discover-filters-toggle control-button"
              onClick={() => setFiltersHidden((current) => !current)}
            >
              <Filter className="h-4 w-4" />
              <span>{filtersHidden ? 'Show filters' : 'Hide filters'}</span>
            </button>
            <div className="launcher-discover-console-actions">
              <DiscoverMenu
                label="Time range"
                value={discover.timeRange}
                options={TIME_RANGE_OPTIONS}
                open={openMenuId === 'time'}
                onToggle={() => setOpenMenuId((current) => (current === 'time' ? null : 'time'))}
                onSelect={(value) => {
                  discover.setTimeRange(value)
                  setOpenMenuId(null)
                }}
              />
              <DiscoverMenu
                label="Sort"
                value={discover.sort}
                options={SORT_OPTIONS}
                open={openMenuId === 'sort'}
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
              >
                {discover.ascending ? 'Asc.' : 'Desc.'}
              </button>
              <DiscoverMenu
                label="Page size"
                value={discover.pageSize}
                options={PAGE_SIZE_OPTIONS}
                open={openMenuId === 'size'}
                onToggle={() => setOpenMenuId((current) => (current === 'size' ? null : 'size'))}
                onSelect={(value) => {
                  discover.setPageSize(value)
                  setOpenMenuId(null)
                }}
              />
              <button type="button" className="launcher-discover-icon-button control-button" aria-label="Grid view">
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="launcher-discover-icon-button control-button"
                onClick={discover.refresh}
                aria-label={copy.actions.refresh}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={cx('launcher-discover-shell', filtersHidden && 'launcher-discover-shell-filters-hidden')}>
        {!filtersHidden ? (
          <aside className="launcher-discover-sidebar panel-surface panel-surface-muted">
            <div className="launcher-discover-sidebar-accordion">
              <DiscoverRailSection id="category" title="Category" open={openSection === 'category'} onToggle={toggleSection}>
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
                          discover.updateFilter(
                            'category',
                            discover.filters.category === category.name ? '' : category.name,
                          )
                        }
                      />
                      <span>
                        {category.name}
                        {category.count ? ` (${formatCompactNumber(category.count)})` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              </DiscoverRailSection>

              <DiscoverRailSection id="tags" title="Tags" open={openSection === 'tags'} onToggle={toggleSection}>
                <TagSuggestionField
                  label="Includes"
                  value={discover.filters.tagsInclude}
                  placeholder="e.g. expansion, ui"
                  suggestionsId="launcher-discover-include-suggestions"
                  suggestionsLabel="Includes suggestions"
                  suggestions={popularTags}
                  onChange={(value) => discover.updateFilter('tagsInclude', value)}
                />
                <TagSuggestionField
                  label="Excludes"
                  value={discover.filters.tagsExclude}
                  placeholder="e.g. nsfw, cheats"
                  suggestionsId="launcher-discover-exclude-suggestions"
                  suggestionsLabel="Excludes suggestions"
                  suggestions={popularTags}
                  onChange={(value) => discover.updateFilter('tagsExclude', value)}
                />
              </DiscoverRailSection>

              <DiscoverRailSection id="search" title="Search Parameters" open={openSection === 'search'} onToggle={toggleSection}>
                <label className="launcher-discover-rail-field">
                  <span>Title contains</span>
                  <input
                    className="control-input"
                    value={discover.filters.titleQuery}
                    onChange={(event) => discover.updateFilter('titleQuery', event.target.value)}
                    placeholder="Search titles"
                    spellCheck={false}
                  />
                </label>
                <label className="launcher-discover-rail-field">
                  <span>Description contains</span>
                  <input
                    className="control-input"
                    value={discover.filters.descriptionQuery}
                    onChange={(event) => discover.updateFilter('descriptionQuery', event.target.value)}
                    placeholder="Search descriptions"
                    spellCheck={false}
                  />
                </label>
                <label className="launcher-discover-rail-field">
                  <span>Author contains</span>
                  <input
                    className="control-input"
                    value={discover.filters.authorQuery}
                    onChange={(event) => discover.updateFilter('authorQuery', event.target.value)}
                    placeholder="Search authors"
                    spellCheck={false}
                  />
                </label>
                <label className="launcher-discover-rail-field">
                  <span>Uploader contains</span>
                  <input
                    className="control-input"
                    value={discover.filters.uploaderQuery}
                    onChange={(event) => discover.updateFilter('uploaderQuery', event.target.value)}
                    placeholder="Search uploaders"
                    spellCheck={false}
                  />
                </label>
              </DiscoverRailSection>

              <DiscoverRailSection id="language" title="Language Support" open={openSection === 'language'} onToggle={toggleSection}>
                <div className="launcher-discover-category-list">
                  <label
                    className={cx(
                      'launcher-discover-category-item',
                      !discover.filters.language && 'launcher-discover-category-item-active',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={!discover.filters.language}
                      onChange={() => discover.updateFilter('language', '')}
                    />
                    <span>Any</span>
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
                          discover.updateFilter(
                            'language',
                            discover.filters.language === language.name ? '' : language.name,
                          )
                        }
                      />
                      {language.name}
                      {language.count ? ` (${formatCompactNumber(language.count)})` : ''}
                    </label>
                  ))}
                </div>
              </DiscoverRailSection>

              <DiscoverRailSection id="content" title="Content Options" open={openSection === 'content'} onToggle={toggleSection}>
                <label className="launcher-discover-toggle-row">
                  <input
                    type="checkbox"
                    checked={discover.filters.includeAdult}
                    onChange={(event) => discover.updateFilter('includeAdult', event.target.checked)}
                  />
                  <span>Include adult content</span>
                </label>
              </DiscoverRailSection>

              <DiscoverRailSection id="fileSize" title="File Size" open={openSection === 'fileSize'} onToggle={toggleSection}>
                <div className="launcher-discover-range-row">
                  <input
                    className="control-input"
                    value={discover.filters.minFileSize}
                    onChange={(event) => discover.updateFilter('minFileSize', event.target.value)}
                    placeholder="No min"
                    inputMode="numeric"
                  />
                  <input
                    className="control-input"
                    value={discover.filters.maxFileSize}
                    onChange={(event) => discover.updateFilter('maxFileSize', event.target.value)}
                    placeholder="No max"
                    inputMode="numeric"
                  />
                </div>
              </DiscoverRailSection>

              <DiscoverRailSection id="downloads" title="Downloads" open={openSection === 'downloads'} onToggle={toggleSection}>
                <div className="launcher-discover-range-row">
                  <input
                    className="control-input"
                    value={discover.filters.minDownloads}
                    onChange={(event) => discover.updateFilter('minDownloads', event.target.value)}
                    placeholder="No min"
                    inputMode="numeric"
                  />
                  <input
                    className="control-input"
                    value={discover.filters.maxDownloads}
                    onChange={(event) => discover.updateFilter('maxDownloads', event.target.value)}
                    placeholder="No max"
                    inputMode="numeric"
                  />
                </div>
              </DiscoverRailSection>

              <DiscoverRailSection id="endorsements" title="Endorsements" open={openSection === 'endorsements'} onToggle={toggleSection}>
                <div className="launcher-discover-range-row">
                  <input
                    className="control-input"
                    value={discover.filters.minEndorsements}
                    onChange={(event) => discover.updateFilter('minEndorsements', event.target.value)}
                    placeholder="No min"
                    inputMode="numeric"
                  />
                  <input
                    className="control-input"
                    value={discover.filters.maxEndorsements}
                    onChange={(event) => discover.updateFilter('maxEndorsements', event.target.value)}
                    placeholder="No max"
                    inputMode="numeric"
                  />
                </div>
              </DiscoverRailSection>
            </div>
          </aside>
        ) : null}

        <div className="launcher-discover-content">
          {discover.state === 'error' ? (
            <LauncherStateBlock title={copy.discover.title} detail={discover.error ?? copy.discover.empty} tone="warning" />
          ) : null}

          {discover.state !== 'error' && discover.state !== 'loading' && !discover.items.length ? (
            <LauncherStateBlock title={copy.discover.empty} detail={copy.discover.subtitle} />
          ) : null}

          {discover.state !== 'error' && (discover.items.length > 0 || discover.state === 'loading') ? (
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
                      <DiscoverCard
                        key={`${item.modId}:${item.modUrl}`}
                        item={item}
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
                      aria-label="Loading discover results"
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
                    aria-label="Previous page"
                    disabled={discover.page <= 1}
                    onClick={discover.goToPreviousPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
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
                          aria-label={`Page ${item}`}
                          aria-current={item === discover.page ? 'page' : undefined}
                          onClick={() => discover.setPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    className="launcher-discover-pagination-button"
                    aria-label="Next page"
                    disabled={discover.totalPages > 0 && discover.page >= discover.totalPages}
                    onClick={discover.goToNextPage}
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <label className="launcher-discover-pagination-jump">
                    <span>Jump to</span>
                    <input
                      aria-label="Jump to page"
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
                    <span>page</span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
