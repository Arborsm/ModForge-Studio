import { useId } from 'react'
import { findModelsDevEntry, searchModelsDevCatalog } from '@entities/ai'
import { useSettingsMenuCopy } from '@locales/provider'
import type { ModelsDevCatalog, ModelsDevModelEntry } from '@shared/contracts'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

/** models.dev catalog picker: filters the public catalog and applies a selected model to the active profile. */
export function ModelsDevImportDialog({
  open,
  catalog,
  loading,
  loadFailed,
  query,
  selectedKey,
  providerPresetId,
  onQueryChange,
  onSelect,
  onRetry,
  onClose,
  onApply,
}: {
  open: boolean
  catalog: ModelsDevCatalog | null
  loading: boolean
  loadFailed: boolean
  query: string
  selectedKey: string | null
  providerPresetId: string
  onQueryChange: (query: string) => void
  onSelect: (key: string) => void
  onRetry: () => void
  onClose: () => void
  onApply: (model: ModelsDevModelEntry) => void
}) {
  const copy = useSettingsMenuCopy().ai
  const dialogTitleId = useId()
  const entries = catalog ? searchModelsDevCatalog(catalog, providerPresetId, query) : []

  return (
    <Dialog open={open} onClose={onClose} labelledBy={dialogTitleId} stack size="lg">
      <DialogHeader
        id={dialogTitleId}
        title={copy.modelsDevDialogTitle}
        subtitle={copy.modelsDevDialogDescription}
        onClose={onClose}
        closeLabel={copy.modelsDevCancel}
      />
      <DialogBody>
        {loading ? (
          <div className="settings-ai-modelsdev-status">
            <span>{copy.modelsDevLoading}</span>
          </div>
        ) : loadFailed ? (
          <div className="settings-ai-modelsdev-status is-error">
            <span>{copy.modelsDevLoadError}</span>
            <button type="button" className="settings-window-btn" onClick={onRetry}>
              {copy.modelsDevRetry}
            </button>
          </div>
        ) : catalog ? (
          <div className="settings-ai-modelsdev">
            <label className="settings-ai-modelsdev-search">
              <span className="sr-only">{copy.modelsDevSearchPlaceholder}</span>
              <input
                className="control-input"
                type="search"
                value={query}
                placeholder={copy.modelsDevSearchPlaceholder}
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </label>
            {entries.length === 0 ? (
              <p className="settings-ai-modelsdev-empty">{query.trim() ? copy.modelsDevNoMatch : copy.modelsDevEmpty}</p>
            ) : (
              <ul className="settings-ai-modelsdev-list">
                {entries.map((entry) => {
                  const key = `${entry.providerId}/${entry.model.id}`
                  const selected = key === selectedKey
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={cx('settings-ai-modelsdev-item', selected && 'is-selected')}
                        aria-pressed={selected}
                        onClick={() => onSelect(key)}
                      >
                        <span className="settings-ai-modelsdev-model">
                          <strong>{entry.model.name ?? entry.model.id}</strong>
                          <code>{entry.model.id}</code>
                        </span>
                        <span className="settings-ai-modelsdev-meta">
                          <em>{entry.providerName}</em>
                          {entry.model.contextWindowTokens ? <small>{copy.modelsDevContext(entry.model.contextWindowTokens)}</small> : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.modelsDevCancel}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={!selectedKey || !catalog}
          onClick={() => {
            if (!selectedKey || !catalog) return
            const [providerId, modelId] = selectedKey.split('/')
            const model = findModelsDevEntry(catalog, providerId, modelId)
            if (model) onApply(model)
          }}
        >
          {copy.modelsDevApply}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
