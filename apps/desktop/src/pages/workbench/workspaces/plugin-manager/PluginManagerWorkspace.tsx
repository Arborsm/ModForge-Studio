/**
 * @file Plugin manager workspace: lists installed compat plugins with
 * search/filter, enable/disable toggles, delete, and expandable detail panels.
 * Uses a full-bleed panel layout (no PanelFrame card wrapper) to match other
 * workspaces.
 *
 * The reload is requested through the typed shared event bridge so the app
 * shell (which owns the workbench registry store) can rebuild the registry in
 * place. Toggle and delete operations call the backend command, then trigger
 * the same reload event so the runtime is rebuilt with the new plugin set.
 * @module pages/workbench/workspaces/plugin-manager
 */
import { useEffect, useRef, useState } from 'react'
import {
  Package,
  Code,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  Layers,
  Braces,
  Languages,
  ShieldAlert,
  Trash2,
  ChevronRight,
  Search,
  ArrowDownUp,
} from 'lucide-react'
import { usePluginManagerCopy } from '@locales/provider'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { Dialog, DialogHeader, DialogBody, DialogFooter, DialogAction, useDialog } from '@shared/ui/Dialog'
import { CompactSelect, type CompactSelectOption } from '@shared/ui/CompactSelect'
import { publishNotification } from '@shared/ui/notifications'
import { getCompatPluginRoots, useCompatPluginStore, toggleCompatPlugin, deleteCompatPlugin } from '@features/compat-plugins'
import type { CompatPluginSummary } from '@features/compat-plugins'
import { requestCompatPluginReload } from '@shared/lib/compat-plugin-reload-events'
import { openLauncherPath } from '@features/launcher/api'
import { cx } from '@shared/lib/helper'

/** Notification id for reload results; a new result replaces the previous toast. */
const RELOAD_RESULT_NOTIFICATION_ID = 'plugin-manager-reload-result'
/** Notification id for toggle results. */
const TOGGLE_RESULT_NOTIFICATION_ID = 'plugin-manager-toggle-result'
/** Notification id for delete results. */
const DELETE_RESULT_NOTIFICATION_ID = 'plugin-manager-delete-result'

type TypeFilter = 'all' | 'data' | 'code'
type StatusFilter = 'all' | 'enabled' | 'disabled' | 'errors'
type SortKey = 'name' | 'id' | 'status' | 'target'

/** Plugin manager workspace: lists plugins with search, filter, toggle, delete. */
export function PluginManagerWorkspace() {
  const copy = usePluginManagerCopy()
  const { plugins, status, error, diagnostics } = useCompatPluginStore()
  const reloading = status === 'loading'
  const reloadRequestedRef = useRef(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CompatPluginSummary | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const deleteDialog = useDialog()

  const handleReload = () => {
    reloadRequestedRef.current = true
    requestCompatPluginReload()
  }

  useEffect(() => {
    if (!reloadRequestedRef.current || status === 'loading') {
      return
    }
    reloadRequestedRef.current = false

    if (status === 'error') {
      publishNotification({
        id: RELOAD_RESULT_NOTIFICATION_ID,
        level: 'error',
        title: copy.reloadError,
        summary: error ?? null,
      })
      return
    }
    if (status === 'loaded') {
      // Count both code-package load diagnostics and manifest parse failures
      // (summaries carrying a `loadError`) so the toast reflects the true
      // failure tally instead of only code-package import errors.
      const manifestErrorCount = plugins.filter((plugin) => plugin.loadError !== null && plugin.loadError !== undefined).length
      const failedCount = diagnostics.length + manifestErrorCount
      const loadedCount = plugins.length - failedCount
      publishNotification({
        id: RELOAD_RESULT_NOTIFICATION_ID,
        level: failedCount > 0 ? 'warning' : 'success',
        title: failedCount > 0 ? copy.reloadError : copy.reloadSuccess,
        summary: failedCount > 0 ? copy.reloadResultWithFailures(loadedCount, failedCount) : copy.reloadResultSuccess(plugins.length),
      })
    }
  }, [status, error, diagnostics.length, plugins, copy])

  const handleOpenPluginDirectory = async () => {
    try {
      const roots = await getCompatPluginRoots()
      if (roots.length === 0) {
        throw new Error('No compat plugin roots resolved')
      }
      await openLauncherPath({ path: roots[0] })
    } catch {
      publishNotification({
        id: 'plugin-manager-open-directory',
        level: 'error',
        title: copy.openPluginDirectoryError,
      })
    }
  }

  const handleToggle = async (plugin: CompatPluginSummary) => {
    setActionInProgress(plugin.id)
    try {
      await toggleCompatPlugin(plugin.id, !plugin.disabled)
      requestCompatPluginReload()
      publishNotification({
        id: TOGGLE_RESULT_NOTIFICATION_ID,
        level: 'success',
        title: plugin.disabled ? copy.enableSuccess : copy.disableSuccess,
      })
    } catch (toggleError) {
      publishNotification({
        id: TOGGLE_RESULT_NOTIFICATION_ID,
        level: 'error',
        title: copy.toggleError,
        summary: toggleError instanceof Error ? toggleError.message : String(toggleError),
      })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDeleteClick = (plugin: CompatPluginSummary) => {
    setPendingDelete(plugin)
    deleteDialog.openDialog()
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) {
      return
    }
    const plugin = pendingDelete
    deleteDialog.closeDialog()
    setActionInProgress(plugin.id)
    try {
      await deleteCompatPlugin(plugin.id)
      requestCompatPluginReload()
      publishNotification({
        id: DELETE_RESULT_NOTIFICATION_ID,
        level: 'success',
        title: copy.deleteSuccess,
      })
      if (expandedId === plugin.id) {
        setExpandedId(null)
      }
    } catch (deleteError) {
      publishNotification({
        id: DELETE_RESULT_NOTIFICATION_ID,
        level: 'error',
        title: copy.deleteError,
        summary: deleteError instanceof Error ? deleteError.message : String(deleteError),
      })
    } finally {
      setActionInProgress(null)
      setPendingDelete(null)
    }
  }

  const filteredPlugins = (() => {
    const query = searchQuery.trim().toLowerCase()
    return plugins.filter((plugin) => {
      if (typeFilter === 'data' && plugin.hasCodeEntry) {
        return false
      }
      if (typeFilter === 'code' && !plugin.hasCodeEntry) {
        return false
      }
      if (statusFilter === 'enabled' && plugin.disabled) {
        return false
      }
      if (statusFilter === 'disabled' && !plugin.disabled) {
        return false
      }
      if (statusFilter === 'errors' && plugin.loadError === null) {
        return false
      }
      if (query) {
        const haystack = [plugin.name, plugin.id, ...plugin.targets, ...(plugin.tags ?? [])].join(' ').toLowerCase()
        if (!haystack.includes(query)) {
          return false
        }
      }
      return true
    })
  })()

  const sortOptions: readonly CompactSelectOption<SortKey>[] = [
    { value: 'name', label: copy.sortByName },
    { value: 'id', label: copy.sortById },
    { value: 'status', label: copy.sortByStatus },
    { value: 'target', label: copy.sortByTarget },
  ]

  /** Filters then sorts plugins by the current sort key. */
  const sortedPlugins = (() => {
    const sorted = [...filteredPlugins]
    switch (sortKey) {
      case 'id':
        sorted.sort((a, b) => a.id.localeCompare(b.id))
        break
      case 'status':
        // enabled first, then disabled, then errored
        sorted.sort((a, b) => {
          const rank = (p: CompatPluginSummary) => (p.loadError ? 2 : p.disabled ? 1 : 0)
          const diff = rank(a) - rank(b)
          return diff !== 0 ? diff : a.name.localeCompare(b.name)
        })
        break
      case 'target':
        sorted.sort((a, b) => (a.targets[0] ?? '').localeCompare(b.targets[0] ?? ''))
        break
      case 'name':
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
    }
    return sorted
  })()

  if (status === 'loading' && plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard title={copy.title} detail={copy.reloading} density="compact" />
      </div>
    )
  }

  if (status === 'error' && plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard title={copy.title} detail={error ?? copy.reloadError} density="compact" />
      </div>
    )
  }

  if (plugins.length === 0) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard
          title={copy.noPlugins}
          detail={copy.noPluginsDetail}
          illustrationIcon={<Package className="h-8 w-8" aria-hidden="true" />}
          density="compact"
        />
      </div>
    )
  }

  return (
    <div className="plugin-manager-root">
      {/* ── Toolbar ── */}
      <header className="plugin-manager-toolbar">
        <div className="plugin-manager-toolbar-title-block">
          <h1 className="plugin-manager-toolbar-title">{copy.title}</h1>
          <span className="plugin-manager-toolbar-count">{plugins.length}</span>
        </div>
        <div className="plugin-manager-actions">
          <button type="button" className="control-button" onClick={() => void handleOpenPluginDirectory()}>
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.openPluginDirectory}
          </button>
          <button type="button" className="control-button control-button-primary" disabled={reloading} onClick={handleReload}>
            <RefreshCw className={cx('h-3.5 w-3.5', reloading && 'is-spinning')} aria-hidden="true" />
            {reloading ? copy.reloading : copy.reload}
          </button>
        </div>
      </header>

      {/* ── Search + sort row ── */}
      <div className="plugin-manager-search-row">
        <div className="plugin-manager-search">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            type="text"
            className="control-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            spellCheck={false}
          />
        </div>
        <div className="plugin-manager-sort">
          <ArrowDownUp className="h-3 w-3" aria-hidden="true" />
          <CompactSelect
            value={sortKey}
            options={sortOptions}
            onChange={(value) => setSortKey(value as SortKey)}
            ariaLabel={copy.sortLabel}
            placement="bottom-end"
          />
        </div>
      </div>

      {/* ── Filter tabs + trust hint ── */}
      <div className="plugin-manager-tabs">
        <button
          type="button"
          className={cx('plugin-manager-tab', typeFilter === 'all' && 'is-active')}
          onClick={() => setTypeFilter('all')}
        >
          {copy.filterAll}
        </button>
        <button
          type="button"
          className={cx('plugin-manager-tab', typeFilter === 'data' && 'is-active')}
          onClick={() => setTypeFilter('data')}
        >
          {copy.filterDataPack}
        </button>
        <button
          type="button"
          className={cx('plugin-manager-tab', typeFilter === 'code' && 'is-active')}
          onClick={() => setTypeFilter('code')}
        >
          {copy.filterCodePack}
        </button>
        <span className="plugin-manager-tab-divider" />
        <button
          type="button"
          className={cx('plugin-manager-tab', statusFilter === 'all' && 'is-active')}
          onClick={() => setStatusFilter('all')}
        >
          {copy.filterEnabled}
        </button>
        <button
          type="button"
          className={cx('plugin-manager-tab', statusFilter === 'disabled' && 'is-active')}
          onClick={() => setStatusFilter('disabled')}
        >
          {copy.filterDisabled}
        </button>
        <button
          type="button"
          className={cx('plugin-manager-tab', statusFilter === 'errors' && 'is-active')}
          onClick={() => setStatusFilter('errors')}
        >
          {copy.filterErrors}
        </button>
        <p className="plugin-manager-trust-hint">
          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
          {copy.trustNoticeDetail}
        </p>
      </div>

      {/* ── Plugin list ── */}
      <div className="plugin-manager-scroll custom-scrollbar">
        {sortedPlugins.length === 0 ? (
          <div className="plugin-manager-no-results">
            <p>{copy.noPlugins}</p>
          </div>
        ) : (
          <div className="plugin-manager-list">
            {sortedPlugins.map((plugin) => (
              <PluginManagerRow
                key={plugin.id}
                plugin={plugin}
                expanded={expandedId === plugin.id}
                onToggleExpand={() => setExpandedId(expandedId === plugin.id ? null : plugin.id)}
                onToggle={() => void handleToggle(plugin)}
                onDelete={() => handleDeleteClick(plugin)}
                actionInProgress={actionInProgress === plugin.id}
              />
            ))}
          </div>
        )}
        {diagnostics.length > 0 && (
          <div className="plugin-manager-diagnostics">
            <div className="plugin-manager-diagnostics-title">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>{copy.loadDiagnostics}</span>
            </div>
            <ul className="plugin-manager-diagnostics-list">
              {diagnostics.map((diag, index) => (
                <li key={`${diag.pluginId}-${index}`} className="plugin-manager-diagnostic-item">
                  <span className="plugin-manager-diagnostic-plugin">{diag.pluginId}</span>
                  <span className="plugin-manager-diagnostic-phase">
                    {diag.phase === 'import'
                      ? copy.diagnosticPhaseImport
                      : diag.phase === 'sdkVersion'
                        ? copy.diagnosticPhaseSdkVersion
                        : copy.diagnosticPhaseOther}
                  </span>
                  <span className="plugin-manager-diagnostic-reason">{diag.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
      <Dialog {...deleteDialog.dialogProps} size="sm">
        <DialogHeader
          title={copy.deleteConfirmTitle}
          tone="danger"
          icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
          onClose={deleteDialog.closeDialog}
          closeLabel={copy.deleteConfirmCancel}
        />
        <DialogBody>
          <p className="plugin-manager-delete-message">{pendingDelete ? copy.deleteConfirmBody(pendingDelete.name) : ''}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={deleteDialog.closeDialog}>{copy.deleteConfirmCancel}</DialogAction>
          <DialogAction tone="danger" onClick={() => void handleDeleteConfirm()}>
            {copy.deleteConfirmAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

type PluginManagerRowProps = {
  plugin: CompatPluginSummary
  expanded: boolean
  onToggleExpand: () => void
  onToggle: () => void
  onDelete: () => void
  actionInProgress: boolean
}

function PluginManagerRow({ plugin, expanded, onToggleExpand, onToggle, onDelete, actionInProgress }: PluginManagerRowProps) {
  const copy = usePluginManagerCopy()
  const hasError = plugin.loadError !== null && plugin.loadError !== undefined
  const isDisabled = plugin.disabled === true
  const rowClass = cx(
    'plugin-manager-row',
    plugin.hasCodeEntry ? 'is-code' : 'is-data',
    hasError && 'has-error',
    isDisabled && 'is-disabled',
    expanded && 'is-expanded',
  )
  const TypeIcon = plugin.hasCodeEntry ? Code : Package
  const localeCount = Object.keys(plugin.i18n).length
  const busy = actionInProgress

  return (
    <div className={rowClass}>
      {/* Main row */}
      <div className="plugin-manager-row-main">
        {/* Expand toggle */}
        <button
          type="button"
          className="plugin-manager-row-expand"
          onClick={onToggleExpand}
          aria-label={expanded ? copy.collapseDetails : copy.expandDetails}
          aria-expanded={expanded}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Icon + name/id */}
        <div className="plugin-manager-row-id-block">
          <div className="plugin-manager-row-icon">
            <TypeIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="plugin-manager-row-name">{plugin.name}</div>
            <div className="plugin-manager-row-id">{plugin.id}</div>
          </div>
        </div>

        {/* Meta facts */}
        <div className="plugin-manager-row-meta">
          <span className="plugin-manager-meta-item">
            <span className="plugin-manager-meta-label">{copy.targets}</span>
            <span className="plugin-manager-meta-value">{plugin.targets.join(', ') || copy.notSpecified}</span>
          </span>
          <span className="plugin-manager-meta-item">
            <span className="plugin-manager-meta-label">{copy.pages}</span>
            <span className="plugin-manager-meta-value">{plugin.pageIds.length}</span>
          </span>
          {plugin.version && (
            <span className="plugin-manager-meta-item">
              <span className="plugin-manager-meta-label">{copy.version}</span>
              <span className="plugin-manager-meta-value">{plugin.version}</span>
            </span>
          )}
          {plugin.author && (
            <span className="plugin-manager-meta-item">
              <span className="plugin-manager-meta-label">{copy.author}</span>
              <span className="plugin-manager-meta-value">{plugin.author}</span>
            </span>
          )}
          {plugin.category && (
            <span className="plugin-manager-meta-item">
              <span className="plugin-manager-meta-label">{copy.category}</span>
              <span className="plugin-manager-meta-value">{plugin.category}</span>
            </span>
          )}
          {plugin.assetSchemas.length > 0 && (
            <span className="plugin-manager-meta-item">
              <Layers className="h-3 w-3" aria-hidden="true" />
              <span className="plugin-manager-meta-value">{plugin.assetSchemas.length}</span>
              <span className="plugin-manager-meta-label">{copy.assetSchemas}</span>
            </span>
          )}
          {plugin.conditionSyntax.length > 0 && (
            <span className="plugin-manager-meta-item">
              <Braces className="h-3 w-3" aria-hidden="true" />
              <span className="plugin-manager-meta-value">{plugin.conditionSyntax.length}</span>
              <span className="plugin-manager-meta-label">{copy.conditionSyntax}</span>
            </span>
          )}
          {localeCount > 0 && (
            <span className="plugin-manager-meta-item">
              <Languages className="h-3 w-3" aria-hidden="true" />
              <span className="plugin-manager-meta-value">{localeCount}</span>
              <span className="plugin-manager-meta-label">{copy.locales}</span>
            </span>
          )}
        </div>

        {/* Badges + actions */}
        <div className="plugin-manager-row-actions">
          {isDisabled && <span className="plugin-manager-disabled-badge">{copy.disabledBadge}</span>}
          <span className={cx('plugin-manager-type-badge', plugin.hasCodeEntry ? 'is-code' : 'is-data')}>
            {plugin.hasCodeEntry ? copy.typeCodePack : copy.typeDataPack}
          </span>
          <button
            type="button"
            className="plugin-manager-toggle"
            role="switch"
            aria-checked={!isDisabled}
            aria-label={isDisabled ? copy.enable : copy.disable}
            disabled={busy || hasError}
            onClick={onToggle}
          >
            <span className="plugin-manager-toggle-track">
              <span className="plugin-manager-toggle-thumb" />
            </span>
          </button>
          <button
            type="button"
            className="icon-button plugin-manager-delete-btn"
            aria-label={copy.delete}
            title={copy.delete}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Inline error */}
      {hasError && (
        <div className="plugin-manager-row-error">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {copy.loadError}: {plugin.loadError}
          </span>
        </div>
      )}

      {/* Expanded detail panel */}
      {expanded && <PluginDetailPanel plugin={plugin} />}
    </div>
  )
}

type PluginDetailPanelProps = {
  plugin: CompatPluginSummary
}

function PluginDetailPanel({ plugin }: PluginDetailPanelProps) {
  const copy = usePluginManagerCopy()
  const localeCount = Object.keys(plugin.i18n).length
  return (
    <div className="plugin-manager-detail">
      {/* Metadata grid */}
      <dl className="plugin-manager-detail-grid">
        <DetailItem label={copy.description} value={plugin.description} fallback={copy.notSpecified} />
        <DetailItem label={copy.author} value={plugin.author} fallback={copy.notSpecified} />
        <DetailItem label={copy.version} value={plugin.version} fallback={copy.notSpecified} />
        <DetailItem label={copy.category} value={plugin.category} fallback={copy.notSpecified} />
        <DetailItem label={copy.tags} value={plugin.tags?.length ? plugin.tags.join(', ') : null} fallback={copy.notSpecified} />
        <DetailItem label={copy.format} value={`v${plugin.format}`} fallback={copy.notSpecified} />
        {plugin.hasCodeEntry && (
          <>
            <DetailItem label={copy.sdkVersion} value={plugin.sdkVersion} fallback={copy.notSpecified} mono />
            <DetailItem label={copy.entryFile} value={plugin.entry} fallback={copy.notSpecified} mono />
          </>
        )}
      </dl>

      {/* Pages list */}
      {plugin.pageIds.length > 0 && (
        <div className="plugin-manager-detail-section">
          <p className="plugin-manager-detail-section-title">{copy.pagesList}</p>
          <div className="plugin-manager-detail-chips">
            {plugin.pages.map((page) => (
              <span key={page.id} className="plugin-manager-detail-chip">
                <span className="plugin-manager-detail-chip-id">{page.id}</span>
                <span className="plugin-manager-detail-chip-section">{page.section}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Asset schemas */}
      {plugin.assetSchemas.length > 0 && (
        <div className="plugin-manager-detail-section">
          <p className="plugin-manager-detail-section-title">{copy.assetSchemasList}</p>
          <div className="plugin-manager-detail-chips">
            {plugin.assetSchemas.map((schema) => (
              <span key={schema.assetPath} className="plugin-manager-detail-chip">
                <span className="plugin-manager-detail-chip-id">{schema.assetPath}</span>
                <span className="plugin-manager-detail-chip-section">{copy.fieldCount(schema.fields.length)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Condition syntax */}
      {plugin.conditionSyntax.length > 0 && (
        <div className="plugin-manager-detail-section">
          <p className="plugin-manager-detail-section-title">{copy.conditionSyntaxList}</p>
          <div className="plugin-manager-detail-chips">
            {plugin.conditionSyntax.map((syntax) => (
              <span key={syntax.namespace} className="plugin-manager-detail-chip">
                <span className="plugin-manager-detail-chip-id">{syntax.namespace}</span>
                <span className="plugin-manager-detail-chip-section">{copy.keyCount(syntax.keys.length)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Locales */}
      {localeCount > 0 && (
        <div className="plugin-manager-detail-section">
          <p className="plugin-manager-detail-section-title">{copy.localesList}</p>
          <div className="plugin-manager-detail-chips">
            {Object.keys(plugin.i18n).map((locale) => (
              <span key={locale} className="plugin-manager-detail-chip">
                <span className="plugin-manager-detail-chip-id">{locale}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type DetailItemProps = {
  label: string
  value: string | null | undefined
  fallback: string
  mono?: boolean
}

function DetailItem({ label, value, fallback, mono }: DetailItemProps) {
  return (
    <div className="plugin-manager-detail-item">
      <dt className="plugin-manager-detail-label">{label}</dt>
      <dd className={cx('plugin-manager-detail-value', mono && 'is-mono')}>{value || fallback}</dd>
    </div>
  )
}
