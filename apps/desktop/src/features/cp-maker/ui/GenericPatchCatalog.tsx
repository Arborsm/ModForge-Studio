import { Copy, PencilLine, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { DraftPatch } from '@features/cp-maker'
import { useEditorCopy } from '@locales/provider'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

type GenericPatchCatalogProps = {
  patches: DraftPatch[]
  onEditPatch: (patchId: string) => void
  onAddPatchRequest: () => void
  onRemovePatch: (patchId: string) => void
  onTogglePatch: (patchId: string, enabled: boolean) => void
  onDuplicatePatch?: (patch: DraftPatch) => void
}

/** CRUD catalog shared by non-event CP Maker authoring modules. */
export function GenericPatchCatalog({
  patches,
  onEditPatch,
  onAddPatchRequest,
  onRemovePatch,
  onTogglePatch,
  onDuplicatePatch,
}: GenericPatchCatalogProps) {
  const desk = useEditorCopy().studioDesk
  const copy = desk.patchCatalog
  const [query, setQuery] = useState('')
  const [deletePatch, setDeletePatch] = useState<DraftPatch | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const visible = patches.filter(
    (patch) =>
      !normalizedQuery ||
      [patch.logName, patch.action, patch.target, patch.fromFile ?? ''].join(' ').toLowerCase().includes(normalizedQuery),
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-(--bg-app)" aria-label={copy.title}>
      <div className="flex items-center gap-3 border-b border-(--border-color) p-4">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)"
            aria-hidden="true"
          />
          <input
            className="control-input pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </div>
        <span className="dock-chip">{copy.shown(visible.length)}</span>
        <button type="button" className="control-button control-button-primary" onClick={onAddPatchRequest}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{copy.addPatch}</span>
        </button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-4">
        {visible.length ? (
          <div className="grid gap-3">
            {visible.map((patch) => (
              <article key={patch.id} className="panel-surface flex items-center gap-4 p-4">
                <input
                  type="checkbox"
                  checked={patch.enabled === true || patch.enabled === 'true'}
                  aria-label={patch.enabled ? copy.disablePatch : copy.enablePatch}
                  onChange={(event) => onTogglePatch(patch.id, event.target.checked)}
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEditPatch(patch.id)}>
                  <p className="truncate text-sm font-semibold text-(--text-primary)">{patch.logName || patch.target || patch.id}</p>
                  <p className="mt-1 truncate text-xs text-(--text-secondary)">
                    {patch.action} · {patch.target}
                  </p>
                  {patch.fromFile ? (
                    <p className="mt-1 truncate text-[11px] text-(--text-tertiary)">
                      {copy.fromFile}: {patch.fromFile}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.editPatch}
                  title={copy.editPatch}
                  onClick={() => onEditPatch(patch.id)}
                >
                  <PencilLine className="h-4 w-4" aria-hidden="true" />
                </button>
                {onDuplicatePatch ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={desk.eventPatchHub.duplicatePatchAction}
                    title={desk.eventPatchHub.duplicatePatchAction}
                    onClick={() => onDuplicatePatch(patch)}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.deleteAction}
                  title={copy.deleteAction}
                  onClick={() => setDeletePatch(patch)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty-state flex h-full min-h-48 items-center justify-center text-center">
            <div>
              <p className="font-semibold text-(--text-primary)">{copy.emptyTitle}</p>
              <p className="mt-2 text-sm text-(--text-secondary)">{copy.emptySubtitle}</p>
            </div>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={Boolean(deletePatch)}
        title={copy.deleteTitle}
        message={copy.deleteMessage(deletePatch?.logName || deletePatch?.target || deletePatch?.id || '')}
        cancelLabel={desk.configSchemaDialog.cancel}
        confirmLabel={copy.deleteAction}
        onClose={() => setDeletePatch(null)}
        onConfirm={() => {
          if (deletePatch) onRemovePatch(deletePatch.id)
        }}
      />
    </section>
  )
}
