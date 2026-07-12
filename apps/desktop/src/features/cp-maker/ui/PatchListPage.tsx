import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  Clock,
  CloudRain,
  Code2,
  Copy,
  Eye,
  FileJson,
  Flag,
  FolderOpen,
  GripVertical,
  Heart,
  ListTree,
  Package,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import type { WorkspaceId } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'
import { buildEventPatchHubPatches, type EventPatchHubEvent, type EventPatchHubPatch } from '@entities/event'
import type { EventConditionBuilderResult } from './EventConditionBuilderModal'
import { formatEventPreconditionForHub, type ParsedEventPrecondition } from '@entities/event'

const EventConditionBuilderModal = lazy(() =>
  import('./EventConditionBuilderModal').then((module) => ({ default: module.EventConditionBuilderModal })),
)

type EventFilter = 'all' | 'withTriggers' | 'withoutTriggers' | 'disabled'
type ContextMenuState =
  | { kind: 'patch'; patchId: string; x: number; y: number }
  | { kind: 'event'; patchId: string; eventKey: string; x: number; y: number }

interface PatchListPageProps {
  patches: DraftPatch[]
  onEditPatch: (patchId: string, eventKey?: string) => void
  onAddPatchRequest: () => void
  onRemovePatch: (patchId: string) => void
  onTogglePatch: (patchId: string, enabled: boolean) => void
  onPatchUpdate?: (patchId: string, patch: Partial<DraftPatch>) => void
  onDuplicatePatch?: (patch: DraftPatch) => void
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  onOpenConfig: () => void
  onSaveDraft: () => void
  onReloadDraft?: () => void
  workspaceId: WorkspaceId
  draft: CpMakerDraft | null
  isDirty: boolean
}

function getDefaultEventKey(patch: EventPatchHubPatch | null) {
  return patch?.events[0]?.key ?? null
}

function filterEvents(events: EventPatchHubEvent[], filter: EventFilter) {
  switch (filter) {
    case 'withTriggers':
      return events.filter((event) => event.triggers.length > 0)
    case 'withoutTriggers':
      return events.filter((event) => event.triggers.length === 0)
    case 'disabled':
      return events.filter((event) => event.status === 'disabled')
    case 'all':
    default:
      return events
  }
}

function formatStepIndex(index: number) {
  return String(index).padStart(2, '0')
}

function formatActorAvatar(name: string) {
  const trimmed = name.trim()
  return trimmed.length <= 3 ? trimmed : trimmed.slice(0, 3)
}

function patchEditorState(patch: DraftPatch): Record<string, unknown> {
  return typeof patch.editorState === 'object' && patch.editorState !== null && !Array.isArray(patch.editorState)
    ? (patch.editorState as Record<string, unknown>)
    : {}
}

function eventEntriesFromState(state: Record<string, unknown>): Record<string, unknown> {
  return typeof state['entries'] === 'object' && state['entries'] !== null && !Array.isArray(state['entries'])
    ? (state['entries'] as Record<string, unknown>)
    : {}
}

function disabledEventKeysFromState(state: Record<string, unknown>): string[] {
  return Array.isArray(state['disabledEventKeys']) ? state['disabledEventKeys'].filter((key): key is string => typeof key === 'string') : []
}

function eventAliasesFromState(state: Record<string, unknown>): Record<string, string> {
  if (typeof state['eventAliases'] !== 'object' || state['eventAliases'] === null || Array.isArray(state['eventAliases'])) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(state['eventAliases'] as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function nextDuplicateEventKey(entries: Record<string, unknown>, eventKey: string) {
  const baseKey = `${eventKey}_copy`
  if (entries[baseKey] == null) {
    return baseKey
  }
  let index = 2
  while (entries[`${baseKey}_${index}`] != null) {
    index += 1
  }
  return `${baseKey}_${index}`
}

function clampContextMenuPoint(x: number, y: number) {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 210)),
    y: Math.max(8, Math.min(y, window.innerHeight - 190)),
  }
}

export function PatchListPage({
  patches,
  onEditPatch,
  onAddPatchRequest,
  onRemovePatch,
  onPatchUpdate,
  onDuplicatePatch,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onOpenConfig,
  onSaveDraft,
  onReloadDraft,
  workspaceId,
  draft,
  isDirty,
}: PatchListPageProps) {
  const copy = useEditorCopy().studioDesk
  const catalog = copy.patchCatalog
  const hub = copy.eventPatchHub
  const [query, setQuery] = useState('')
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(patches[0]?.id ?? null)
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedEventKeys, setSelectedEventKeys] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [conditionBuilder, setConditionBuilder] = useState<{ patchId: string; eventKey: string } | null>(null)
  const nextEventIdRef = useRef(0)

  const hubPatches = useMemo(() => buildEventPatchHubPatches(patches), [patches])
  const normalizedQuery = query.trim().toLowerCase()
  const visiblePatches = useMemo(
    () => hubPatches.filter((patch) => !normalizedQuery || patch.searchText.includes(normalizedQuery)),
    [hubPatches, normalizedQuery],
  )

  const activePatch =
    (selectedPatchId ? hubPatches.find((patch) => patch.id === selectedPatchId) : null) ?? visiblePatches[0] ?? hubPatches[0] ?? null
  const sourcePatch = activePatch?.sourcePatch ?? null
  const selectedEvent =
    activePatch && selectedEventKey ? (activePatch.events.find((event) => event.key === selectedEventKey) ?? null) : null
  const activeEvent = selectedEvent ?? activePatch?.events[0] ?? null
  const shownEvents = activePatch ? filterEvents(activePatch.events, eventFilter) : []
  const openEventKey = selectedEventKey === null ? (activeEvent?.key ?? null) : expandedEventKey
  const conditionBuilderPatch = conditionBuilder ? (hubPatches.find((patch) => patch.id === conditionBuilder.patchId) ?? null) : null
  const conditionBuilderEvent = conditionBuilderPatch?.events.find((event) => event.key === conditionBuilder?.eventKey) ?? null
  const conditionBuilderAlias =
    conditionBuilderPatch && conditionBuilderEvent
      ? (eventAliasesFromState(patchEditorState(conditionBuilderPatch.sourcePatch))[conditionBuilderEvent.key] ?? '')
      : ''

  const filterOptions: Array<{ id: EventFilter; label: string; count: number; icon: typeof ListTree }> = activePatch
    ? [
        { id: 'all', label: hub.filters.all, count: activePatch.events.length, icon: ListTree },
        {
          id: 'withTriggers',
          label: hub.filters.withTriggers,
          count: activePatch.events.filter((event) => event.triggers.length > 0).length,
          icon: Flag,
        },
        {
          id: 'withoutTriggers',
          label: hub.filters.withoutTriggers,
          count: activePatch.events.filter((event) => event.triggers.length === 0).length,
          icon: Eye,
        },
        {
          id: 'disabled',
          label: hub.filters.disabled,
          count: activePatch.events.filter((event) => event.status === 'disabled').length,
          icon: AlertTriangle,
        },
      ]
    : []

  function handleSelectPatch(patch: EventPatchHubPatch) {
    const nextEventKey = getDefaultEventKey(patch)
    setSelectedPatchId(patch.id)
    setSelectedEventKey(nextEventKey)
    setExpandedEventKey(nextEventKey)
    setEventFilter('all')
  }

  function handleSelectEvent(event: EventPatchHubEvent) {
    if (multiSelect) {
      setSelectedEventKey(event.key)
      setSelectedEventKeys((current) => {
        const next = new Set(current)
        if (next.has(event.key)) {
          next.delete(event.key)
        } else {
          next.add(event.key)
        }
        return next
      })
      return
    }

    setSelectedEventKey(event.key)
    setExpandedEventKey((current) => (current === event.key ? null : event.key))
  }

  function handleToggleMultiSelect() {
    if (multiSelect) {
      setSelectedEventKeys(new Set())
    }
    setMultiSelect((current) => !current)
  }

  function addEventToSourcePatch(patch: DraftPatch | null) {
    if (!patch || !onPatchUpdate) {
      return null
    }

    const state = patchEditorState(patch)
    const entries = eventEntriesFromState(state)
    let key: string
    do {
      nextEventIdRef.current += 1
      key = `event_${nextEventIdRef.current}`
    } while (entries[key] != null)
    const nextEntries = {
      ...entries,
      [key]: `none/0 0/Farmer 0 0 2/message "${hub.defaultEventTitle}"`,
    }
    onPatchUpdate(patch.id, { editorState: { ...state, entries: nextEntries } })
    setSelectedEventKey(key)
    setExpandedEventKey(key)
    return key
  }

  function handleAddEvent() {
    if (!activePatch) {
      return
    }
    const eventKey = addEventToSourcePatch(sourcePatch)
    if (eventKey) {
      onEditPatch(activePatch.id, eventKey)
    }
  }

  function openEditor(event: EventPatchHubEvent | null) {
    if (!activePatch || !event) {
      return
    }
    onEditPatch(activePatch.id, event.key)
  }

  function openPatchContextMenu(pointerEvent: MouseEvent, patch: EventPatchHubPatch) {
    pointerEvent.preventDefault()
    const point = clampContextMenuPoint(pointerEvent.clientX, pointerEvent.clientY)
    setSelectedPatchId(patch.id)
    setContextMenu({ kind: 'patch', patchId: patch.id, x: point.x, y: point.y })
  }

  function openEventContextMenu(pointerEvent: MouseEvent, event: EventPatchHubEvent) {
    pointerEvent.preventDefault()
    pointerEvent.stopPropagation()
    if (!activePatch) {
      return
    }
    const point = clampContextMenuPoint(pointerEvent.clientX, pointerEvent.clientY)
    setSelectedEventKey(event.key)
    setContextMenu({ kind: 'event', patchId: activePatch.id, eventKey: event.key, x: point.x, y: point.y })
  }

  function duplicateEvent(patch: DraftPatch, event: EventPatchHubEvent) {
    if (!onPatchUpdate) {
      return
    }
    const state = patchEditorState(patch)
    const entries = eventEntriesFromState(state)
    const rawScript = entries[event.key]
    if (typeof rawScript !== 'string') {
      return
    }
    const nextKey = nextDuplicateEventKey(entries, event.key)
    onPatchUpdate(patch.id, {
      editorState: {
        ...state,
        entries: {
          ...entries,
          [nextKey]: rawScript,
        },
      },
    })
    setSelectedEventKey(nextKey)
    setExpandedEventKey(nextKey)
  }

  function toggleEventEnabled(patch: DraftPatch, event: EventPatchHubEvent) {
    if (!onPatchUpdate) {
      return
    }
    const state = patchEditorState(patch)
    const disabledKeys = new Set(disabledEventKeysFromState(state))
    if (disabledKeys.has(event.key)) {
      disabledKeys.delete(event.key)
    } else {
      disabledKeys.add(event.key)
    }
    onPatchUpdate(patch.id, { editorState: { ...state, disabledEventKeys: Array.from(disabledKeys) } })
  }

  function deleteEvent(patch: DraftPatch, event: EventPatchHubEvent) {
    if (!onPatchUpdate) {
      return
    }

    const state = patchEditorState(patch)
    const entries = eventEntriesFromState(state)
    const nextEntries = { ...entries }
    delete nextEntries[event.key]
    const disabledKeys = disabledEventKeysFromState(state).filter((key) => key !== event.key)
    onPatchUpdate(patch.id, {
      editorState: {
        ...state,
        entries: nextEntries,
        disabledEventKeys: disabledKeys,
      },
    })
    setSelectedEventKeys((current) => {
      const next = new Set(current)
      next.delete(event.key)
      return next
    })
    if (selectedEventKey === event.key) {
      setSelectedEventKey(null)
      setExpandedEventKey(null)
    }
  }

  function handlePatchMenuAction(action: 'configure' | 'addEvent' | 'duplicatePatch' | 'deletePatch') {
    const patch = contextMenu?.kind === 'patch' ? hubPatches.find((item) => item.id === contextMenu.patchId) : null
    setContextMenu(null)
    if (!patch) {
      return
    }
    if (action === 'configure') {
      setSelectedPatchId(patch.id)
      onOpenConfig()
      return
    }
    if (action === 'addEvent') {
      setSelectedPatchId(patch.id)
      const eventKey = addEventToSourcePatch(patch.sourcePatch)
      if (eventKey) {
        onEditPatch(patch.id, eventKey)
      }
      return
    }
    if (action === 'duplicatePatch') {
      onDuplicatePatch?.(patch.sourcePatch)
      return
    }
    onRemovePatch(patch.id)
    setSelectedPatchId(null)
  }

  function handleEventMenuAction(action: 'edit' | 'conditionBuilder' | 'duplicate' | 'toggle' | 'delete') {
    const menu = contextMenu?.kind === 'event' ? contextMenu : null
    const patch = menu ? (hubPatches.find((item) => item.id === menu.patchId) ?? null) : null
    const event = patch?.events.find((item) => item.key === menu?.eventKey) ?? null
    setContextMenu(null)
    if (!patch || !event) {
      return
    }
    if (action === 'edit') {
      openEditor(event)
      return
    }
    if (action === 'conditionBuilder') {
      setSelectedPatchId(patch.id)
      setSelectedEventKey(event.key)
      setExpandedEventKey(event.key)
      setConditionBuilder({ patchId: patch.id, eventKey: event.key })
      return
    }
    if (action === 'duplicate') {
      duplicateEvent(patch.sourcePatch, event)
      return
    }
    if (action === 'toggle') {
      toggleEventEnabled(patch.sourcePatch, event)
      return
    }
    deleteEvent(patch.sourcePatch, event)
  }

  function applyConditionBuilder(result: EventConditionBuilderResult) {
    const builder = conditionBuilder
    const patch = builder ? (hubPatches.find((item) => item.id === builder.patchId) ?? null) : null
    if (!builder || !patch || !onPatchUpdate) {
      setConditionBuilder(null)
      return
    }

    const state = patchEditorState(patch.sourcePatch)
    const entries = eventEntriesFromState(state)
    const rawScript = entries[builder.eventKey]
    if (typeof rawScript !== 'string') {
      setConditionBuilder(null)
      return
    }

    const nextEntries = { ...entries }
    if (result.eventKey !== builder.eventKey) {
      delete nextEntries[builder.eventKey]
    }
    nextEntries[result.eventKey] = rawScript

    const nextAliases = eventAliasesFromState(state)
    delete nextAliases[builder.eventKey]
    if (result.alias) {
      nextAliases[result.eventKey] = result.alias
    }

    const disabledKeys = disabledEventKeysFromState(state).map((key) => (key === builder.eventKey ? result.eventKey : key))
    onPatchUpdate(patch.id, {
      editorState: {
        ...state,
        entries: nextEntries,
        disabledEventKeys: disabledKeys,
        eventAliases: nextAliases,
      },
    })
    setSelectedEventKey(result.eventKey)
    setExpandedEventKey(result.eventKey)
    setConditionBuilder(null)
  }

  function renderPreconditionRows(preconditions: ParsedEventPrecondition[]) {
    if (preconditions.length === 0) {
      return (
        <span className="event-scene-detail-row">
          <Eye className="h-5 w-5" aria-hidden="true" />
          <span>{hub.noConditionsLabel}</span>
        </span>
      )
    }

    return preconditions.map((precondition) => (
      <span key={`${precondition.raw}:${precondition.canonicalKey}`} className="event-scene-detail-row" title={precondition.raw}>
        <Clock className="h-5 w-5" aria-hidden="true" />
        <span>{formatEventPreconditionForHub(precondition, hub)}</span>
      </span>
    ))
  }

  return (
    <div className="event-patch-hub" data-workspace={workspaceId} onClick={() => setContextMenu(null)}>
      <aside className="event-patch-navigator studio-tree-sidebar" aria-label={hub.navigationLabel}>
        <label className="event-patch-search studio-tree-search">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={hub.searchPlaceholder}
            aria-label={hub.searchPlaceholder}
            spellCheck={false}
          />
        </label>

        <div className="event-patch-nav-scroll studio-tree-scroll">
          <section className="event-patch-nav-group studio-tree-group" aria-label={hub.eventTreeLabel}>
            <div className="event-patch-tree studio-tree-list">
              {visiblePatches.length === 0 ? (
                <div className="event-patch-tree-empty">{hubPatches.length === 0 ? hub.noPatchTitle : catalog.noSearchMatches}</div>
              ) : (
                visiblePatches.map((patch) => {
                  const patchActive = patch.id === activePatch?.id
                  return (
                    <div key={patch.id} className="event-patch-tree-block studio-tree-block">
                      <button
                        type="button"
                        className={cx('event-patch-tree-item studio-tree-item', patchActive && 'active')}
                        onClick={() => handleSelectPatch(patch)}
                        onContextMenu={(event) => openPatchContextMenu(event, patch)}
                        aria-expanded={patchActive}
                        title={`${patch.displayName} · ${hub.eventCount(patch.events.length)}`}
                      >
                        <FileJson className="studio-tree-file-icon h-4 w-4" aria-hidden="true" />
                        <span className="event-patch-tree-copy studio-tree-item-copy">
                          <strong>{patch.displayName}</strong>
                        </span>
                        <span className="event-patch-tree-count studio-tree-count">{patch.events.length}</span>
                      </button>

                      {patchActive ? (
                        <div className="event-patch-tree-events studio-tree-child-list">
                          {patch.events.map((event, index) => (
                            <button
                              key={event.key}
                              type="button"
                              className={cx(
                                'event-patch-tree-event studio-tree-child-item',
                                event.key === activeEvent?.key && 'active',
                                event.status === 'disabled' && 'disabled',
                              )}
                              onClick={() => handleSelectEvent(event)}
                              onContextMenu={(contextEvent) => openEventContextMenu(contextEvent, event)}
                            >
                              <span>#{formatStepIndex(index + 1)}</span>
                              <strong>{event.title}</strong>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {activePatch ? (
            <section className="event-patch-nav-group studio-tree-group">
              <div className="event-patch-nav-title studio-tree-group-title">{hub.filtersTitle}</div>
              <div className="event-patch-filter-list studio-tree-filter-list">
                {filterOptions.map((filter) => {
                  const FilterIcon = filter.icon
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={cx('event-patch-filter-row studio-tree-filter-row', eventFilter === filter.id && 'active')}
                      aria-pressed={eventFilter === filter.id}
                      onClick={() => setEventFilter(filter.id)}
                    >
                      <FilterIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{filter.label}</span>
                      <strong className="studio-tree-count">{filter.count}</strong>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="event-patch-sidebar-footer studio-tree-footer">
          <button
            type="button"
            className="control-button control-button-primary studio-tree-footer-button w-full"
            onClick={onAddPatchRequest}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{catalog.addPatch}</span>
          </button>
        </div>
      </aside>

      <section className="event-patch-main" aria-label={hub.hubLabel}>
        <header className="event-patch-workspace-header">
          <div className="event-patch-workspace-nav">
            <button type="button" className="icon-button h-8 w-8" aria-label={hub.backLabel} onClick={onGoBack} disabled={!canGoBack}>
              <ChevronRight className={cx('h-4 w-4 rotate-180', !canGoBack && 'opacity-35')} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button h-8 w-8"
              aria-label={hub.forwardLabel}
              onClick={onGoForward}
              disabled={!canGoForward}
            >
              <ChevronRight className={cx('h-4 w-4', !canGoForward && 'opacity-35')} aria-hidden="true" />
            </button>
            <nav className="event-patch-breadcrumbs" aria-label={hub.breadcrumbLabel}>
              <span>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {draft?.projectMetadata.projectName ?? hub.projectFallback}
              </span>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <span>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {hub.eventsLabel}
              </span>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <strong>
                <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                {activePatch?.displayName ?? hub.breadcrumbNoPatch}
              </strong>
            </nav>
          </div>

          <div className="event-patch-workspace-actions">
            {onReloadDraft ? (
              <button
                type="button"
                className="icon-button h-8 w-8"
                aria-label={copy.toolbar.reload}
                title={copy.toolbar.reload}
                onClick={onReloadDraft}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className="icon-button h-8 w-8" aria-label={hub.hubLabel} title={hub.hubLabel}>
              <ListTree className="h-4 w-4" aria-hidden="true" />
            </button>
            {activePatch ? (
              <button type="button" className={cx('event-patch-save-state', isDirty && 'dirty')} onClick={onSaveDraft} disabled={!isDirty}>
                <span aria-hidden="true" />
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {isDirty ? hub.unsavedLabel : hub.savedLabel}
              </button>
            ) : null}
          </div>
        </header>

        <header className="event-patch-hub-header">
          <div className="event-patch-heading">
            <h1>{activePatch?.displayName ?? hub.noPatchTitle}</h1>
            {activePatch ? null : <span>{hub.noPatchSubtitle}</span>}
          </div>
          <div className="event-patch-hub-actions">
            {activePatch ? (
              <>
                <button
                  type="button"
                  className="icon-button h-8 w-8"
                  aria-label={hub.patchSettingsLabel}
                  title={hub.patchSettingsLabel}
                  onClick={onOpenConfig}
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={cx('control-button', multiSelect && 'edit-mode-button-active')}
                  aria-pressed={multiSelect}
                  onClick={handleToggleMultiSelect}
                  disabled={activePatch.events.length === 0}
                >
                  <CheckSquare className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {multiSelect && selectedEventKeys.size > 0 ? hub.selectedCountLabel(selectedEventKeys.size) : hub.multiSelectLabel}
                  </span>
                </button>
                <button type="button" className="control-button control-button-primary" onClick={handleAddEvent} disabled={!onPatchUpdate}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{hub.addEventLabel}</span>
                </button>
              </>
            ) : (
              <button type="button" className="control-button control-button-primary" onClick={onAddPatchRequest}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{hub.noPatchAction}</span>
              </button>
            )}
          </div>
        </header>

        <div className="event-patch-hub-body">
          <div className="event-storyboard">
            {activePatch ? (
              <>
                <div className="event-storyboard-head">
                  <div>
                    <h2>{hub.storyboardTitle}</h2>
                    <span>{hub.storyboardCaption}</span>
                  </div>
                </div>

                {shownEvents.length ? (
                  <section className="event-scene-list">
                    {shownEvents.map((event, index) => {
                      const expanded = openEventKey === event.key
                      const selected = selectedEventKeys.has(event.key)
                      return (
                        <article
                          key={event.key}
                          className={cx(
                            'event-scene-row',
                            event.status,
                            event.key === activeEvent?.key && 'active',
                            expanded && 'expanded',
                            selected && 'selected',
                          )}
                        >
                          <div
                            className="event-scene-summary"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectEvent(event)}
                            onContextMenu={(contextEvent) => openEventContextMenu(contextEvent, event)}
                            onKeyDown={(keyboardEvent) => {
                              if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                                keyboardEvent.preventDefault()
                                handleSelectEvent(event)
                              }
                            }}
                            aria-expanded={expanded}
                          >
                            {multiSelect ? (
                              <button
                                type="button"
                                className={cx('event-scene-select', selected && 'selected')}
                                aria-label={hub.selectEventAriaLabel(event.key)}
                                aria-pressed={selected}
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation()
                                  handleSelectEvent(event)
                                }}
                              >
                                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            ) : null}
                            <span className="event-scene-drag-handle" aria-hidden="true">
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="event-scene-index">#{formatStepIndex(index + 1)}</span>
                            <span className="event-scene-title">
                              <strong>{event.title}</strong>
                              {event.status === 'disabled' ? <span className="event-disabled-badge">{catalog.disabled}</span> : null}
                            </span>
                            <span className="event-scene-spacer" />
                            <span className="event-scene-actors" aria-label={hub.actorsLabel}>
                              {event.actors.slice(0, 3).map((actor) => (
                                <i key={`${event.key}:${actor.name}`} title={actor.name}>
                                  {formatActorAvatar(actor.name)}
                                </i>
                              ))}
                            </span>
                            <button
                              type="button"
                              className="control-button event-scene-edit-button"
                              aria-label={`${hub.enterEditorLabel} ${event.key}`}
                              onContextMenu={(contextEvent) => openEventContextMenu(contextEvent, event)}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                openEditor(event)
                              }}
                            >
                              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{hub.enterEditorLabel}</span>
                            </button>
                          </div>

                          {expanded ? (
                            <div className="event-scene-panel-shell" aria-hidden={!expanded}>
                              <div className="event-scene-panel">
                                <div className="event-scene-detail-column">
                                  <h3>
                                    <Sun className="h-5 w-5" aria-hidden="true" />
                                    {hub.triggerConditionsLabel}
                                  </h3>
                                  <div className="event-scene-detail-list">
                                    {renderPreconditionRows(event.preconditionGroups.environment)}
                                    <span className="event-scene-detail-row">
                                      <CloudRain className="h-5 w-5" aria-hidden="true" />
                                      <span>{event.location}</span>
                                    </span>
                                  </div>
                                </div>
                                <div className="event-scene-detail-column">
                                  <h3>
                                    <Heart className="h-5 w-5" aria-hidden="true" />
                                    {hub.involvedActorsLabel}
                                  </h3>
                                  <div className="event-scene-detail-list">{renderPreconditionRows(event.preconditionGroups.player)}</div>
                                </div>
                                <div className="event-scene-detail-column">
                                  <h3>
                                    <Flag className="h-5 w-5" aria-hidden="true" />
                                    {hub.commandMetricLabel}
                                  </h3>
                                  <div className="event-scene-detail-list">{renderPreconditionRows(event.preconditionGroups.progress)}</div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </section>
                ) : (
                  <section className="event-storyboard-empty">
                    <strong>{hub.emptyTitle}</strong>
                    <span>{hub.emptySubtitle}</span>
                  </section>
                )}
              </>
            ) : (
              <section className="event-patch-hub-empty">
                <div className="event-patch-hub-empty-icon">
                  <FileJson className="h-7 w-7" aria-hidden="true" />
                </div>
                <strong>{hub.noPatchTitle}</strong>
                <p>{hub.noPatchSubtitle}</p>
                <button type="button" className="control-button control-button-primary" onClick={onAddPatchRequest}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{hub.noPatchAction}</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </section>
      {contextMenu ? (
        <div
          className="event-patch-context-menu"
          role="menu"
          aria-label={hub.contextMenuLabel}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'patch' ? (
            <>
              <button type="button" role="menuitem" onClick={() => handlePatchMenuAction('configure')}>
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.configurePatchAction}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handlePatchMenuAction('addEvent')}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.addEventLabel}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handlePatchMenuAction('duplicatePatch')}>
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.duplicatePatchAction}</span>
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => handlePatchMenuAction('deletePatch')}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.deletePatchAction}</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => handleEventMenuAction('edit')}>
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.openEditorAction}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleEventMenuAction('conditionBuilder')} disabled={!onPatchUpdate}>
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.conditionBuilderAction}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleEventMenuAction('duplicate')}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.duplicateEventAction}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleEventMenuAction('toggle')}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {hubPatches.find((patch) => patch.id === contextMenu.patchId)?.events.find((event) => event.key === contextMenu.eventKey)
                    ?.status === 'disabled'
                    ? hub.enableEventAction
                    : hub.disableEventAction}
                </span>
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => handleEventMenuAction('delete')}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hub.deleteEventAction}</span>
              </button>
            </>
          )}
        </div>
      ) : null}
      {conditionBuilderEvent && conditionBuilderPatch ? (
        <Suspense fallback={null}>
          <EventConditionBuilderModal
            event={conditionBuilderEvent}
            allEvents={conditionBuilderPatch.events}
            alias={conditionBuilderAlias}
            hubCopy={hub}
            copy={hub.conditionBuilder}
            onApply={applyConditionBuilder}
            onCancel={() => setConditionBuilder(null)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
