import { Filter, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { cx } from '../../lib/cx'
import { useEditorCopy } from '../../lib/app/localeContext'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { PatchSummaryCard } from './PatchSummaryCard'

type PatchFilter = 'all' | 'enabled' | 'disabled'

interface PatchListPageProps {
  patches: DraftPatch[]
  onEditPatch: (patchId: string) => void
  onAddPatchRequest: () => void
  onRemovePatch: (patchId: string) => void
  onTogglePatch: (patchId: string, enabled: boolean) => void
  workspaceId: WorkspaceId
  draft: GeneratedProjectDraft | null
  isDirty: boolean
}

function getPatchSearchText(patch: DraftPatch) {
  return `${patch.logName} ${patch.action} ${patch.target} ${patch.fromFile ?? ''}`.toLowerCase()
}

function getActionOptions(patches: DraftPatch[]) {
  return Array.from(new Set(patches.map((patch) => patch.action))).sort()
}

export function PatchListPage({
  patches,
  onEditPatch,
  onAddPatchRequest,
  onRemovePatch,
  onTogglePatch,
  workspaceId,
  draft,
  isDirty,
}: PatchListPageProps) {
  const copy = useEditorCopy().studioDesk
  const catalog = copy.patchCatalog
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PatchFilter>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(patches[0]?.id ?? null)
  const [pendingDeletePatch, setPendingDeletePatch] = useState<DraftPatch | null>(null)

  const enabledCount = patches.filter((patch) => patch.enabled).length
  const actionOptions = useMemo(() => getActionOptions(patches), [patches])
  const activeSelectedPatchId =
    selectedPatchId && patches.some((patch) => patch.id === selectedPatchId)
      ? selectedPatchId
      : patches[0]?.id ?? null
  const selectedPatch = activeSelectedPatchId ? patches.find((patch) => patch.id === activeSelectedPatchId) ?? null : null

  const filteredPatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return patches.filter((patch) => {
      if (statusFilter === 'enabled' && !patch.enabled) {
        return false
      }
      if (statusFilter === 'disabled' && patch.enabled) {
        return false
      }
      if (actionFilter !== 'all' && patch.action !== actionFilter) {
        return false
      }
      if (normalizedQuery && !getPatchSearchText(patch).includes(normalizedQuery)) {
        return false
      }
      return true
    })
  }, [actionFilter, patches, query, statusFilter])

  return (
    <div className="edit-patch-catalog">
      <section className="panel-surface edit-patch-catalog-summary">
        <div className="edit-patch-catalog-summary-main">
          <div>
            <p className="panel-title">{catalog.title}</p>
            <p className="panel-subtitle">{draft?.projectMetadata.projectName ?? workspaceId}</p>
          </div>
          <div className="edit-patch-catalog-metrics">
            <div className="metric-card compact-metric-card">
              <span className="metric-label">{catalog.patches}</span>
              <span className="metric-value">{patches.length}</span>
            </div>
            <div className="metric-card compact-metric-card">
              <span className="metric-label">{catalog.enabled}</span>
              <span className="metric-value">{enabledCount}</span>
            </div>
            <div className="metric-card compact-metric-card">
              <span className="metric-label">{catalog.draft}</span>
              <span className="metric-value">{isDirty ? catalog.dirty : catalog.clean}</span>
            </div>
          </div>
        </div>

        <div className="edit-patch-catalog-controls">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="control-input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={catalog.searchPlaceholder}
              spellCheck={false}
            />
          </div>

          <div className="edit-patch-catalog-filter-row">
            {(['all', 'enabled', 'disabled'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={cx('control-button h-10 capitalize', statusFilter === filter && 'edit-mode-button-active')}
                onClick={() => setStatusFilter(filter)}
                aria-pressed={statusFilter === filter}
              >
                <Filter className="h-4 w-4" />
                <span>{catalog.filters[filter]}</span>
              </button>
            ))}
            <select
              className="control-input h-10 w-auto min-w-32 text-xs"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              aria-label={catalog.actionFilterLabel}
            >
              <option value="all">{catalog.allActions}</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="edit-patch-catalog-body">
        <section className="panel-surface edit-patch-catalog-list">
          <header className="panel-header">
            <div>
              <p className="panel-title">{catalog.patches}</p>
              <p className="panel-subtitle">{catalog.shown(filteredPatches.length)}</p>
            </div>
            <button type="button" className="control-button control-button-primary" onClick={onAddPatchRequest}>
              <Plus className="h-4 w-4" />
              <span>{catalog.addPatch}</span>
            </button>
          </header>

          <div className="panel-body edit-patch-catalog-scroll">
            {filteredPatches.length ? (
              filteredPatches.map((patch) => (
                <PatchSummaryCard
                  key={patch.id}
                  patch={patch}
                  active={patch.id === activeSelectedPatchId}
                  onSelect={() => setSelectedPatchId(patch.id)}
                  onEdit={() => onEditPatch(patch.id)}
                  onToggle={(enabled) => onTogglePatch(patch.id, enabled)}
                  onRemove={() => setPendingDeletePatch(patch)}
                />
              ))
            ) : (
              <div className="panel-empty-state flex min-h-52 items-center justify-center text-center">
                <div>
                  <p className="text-base font-semibold text-[var(--text-primary)]">{catalog.emptyTitle}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {catalog.emptySubtitle}
                  </p>
                  <button type="button" className="control-button control-button-primary mt-4" onClick={onAddPatchRequest}>
                    <Plus className="h-4 w-4" />
                    <span>{catalog.addPatch}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel-surface edit-patch-catalog-detail">
          {selectedPatch ? (
            <>
              <header className="panel-header">
                <div className="min-w-0">
                  <p className="panel-title">{catalog.selectedPatch}</p>
                  <p className="panel-subtitle truncate">{selectedPatch.logName || selectedPatch.target}</p>
                </div>
                <button type="button" className="control-button control-button-primary" onClick={() => onEditPatch(selectedPatch.id)}>
                  {catalog.editPatch}
                </button>
              </header>
              <div className="panel-body p-4">
                <div className="space-y-3">
                  <div className="kv-row compact-kv-row">
                    <span>{catalog.action}</span>
                    <span>{selectedPatch.action}</span>
                  </div>
                  <div className="kv-row compact-kv-row">
                    <span>{catalog.target}</span>
                    <span>{selectedPatch.target}</span>
                  </div>
                  {selectedPatch.fromFile ? (
                    <div className="kv-row compact-kv-row">
                      <span>{catalog.fromFile}</span>
                      <span>{selectedPatch.fromFile}</span>
                    </div>
                  ) : null}
                  {selectedPatch.targetField?.length ? (
                    <div className="kv-row compact-kv-row">
                      <span>{catalog.targetField}</span>
                      <span>{selectedPatch.targetField.join(' / ')}</span>
                    </div>
                  ) : null}
                  <div className="kv-row compact-kv-row">
                    <span>{catalog.status}</span>
                    <span>{selectedPatch.enabled ? catalog.enabled : catalog.disabled}</span>
                  </div>
                  {selectedPatch.when && Object.keys(selectedPatch.when).length ? (
                    <div className="kv-row compact-kv-row">
                      <span>{catalog.when}</span>
                      <span>{catalog.conditions(Object.keys(selectedPatch.when).length)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="panel-empty-state m-4 text-center">
              {catalog.selectPrompt}
            </div>
          )}
        </section>
      </div>
      <DeleteConfirmDialog
        open={Boolean(pendingDeletePatch)}
        title={catalog.deleteTitle}
        message={catalog.deleteMessage(pendingDeletePatch?.logName || pendingDeletePatch?.target || '')}
        cancelLabel={copy.createDialog.cancel}
        confirmLabel={catalog.deleteAction}
        onClose={() => setPendingDeletePatch(null)}
        onConfirm={() => {
          if (!pendingDeletePatch) {
            return
          }
          onRemovePatch(pendingDeletePatch.id)
          if (activeSelectedPatchId === pendingDeletePatch.id) {
            setSelectedPatchId(null)
          }
        }}
      />
    </div>
  )
}
