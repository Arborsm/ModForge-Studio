/**
 * Browser over the game's shipped `Strings/*` tables.
 *
 * Authors writing a `DisplayName` or `Description` usually want the string the
 * game already ships, referenced as `[LocalizedText Strings\Objects:Key]` so it
 * stays translated in every language. This dialog is how they find it: pick a
 * category, search, then insert either the reference token (translated) or the
 * literal text (frozen in one language).
 *
 * Tables are loaded one category at a time — the full set is tens of thousands
 * of rows — and the underlying loader caches per (root, locale, asset), so
 * revisiting a category costs nothing.
 */

import { useEffect, useMemo, useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import {
  STRING_CATALOG_CATEGORIES,
  loadStringCatalogCategory,
  searchStringCatalog,
  type StringCatalogCategory,
  type StringCatalogEntry,
} from '@entities/game/api'
import type { LocaleCode } from '@locales/api'
import { useAssetAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

export type GameTextLibraryDialogProps = {
  open: boolean
  /** Game root used to read the string tables. */
  gameRootPath: string
  locale: LocaleCode
  /** Commits the `[LocalizedText ...]` reference token. */
  onInsertToken: (token: string) => void
  /** Commits the resolved literal text instead of the reference. */
  onInsertText: (text: string) => void
  onClose: () => void
}

type CategoryState = {
  entries: readonly StringCatalogEntry[]
  failedAssets: readonly string[]
}

const RESULT_LIMIT = 200

export function GameTextLibraryDialog({ open, gameRootPath, locale, onInsertToken, onInsertText, onClose }: GameTextLibraryDialogProps) {
  const copy = useAssetAuthoringCopy().textLibrary
  const [category, setCategory] = useState<StringCatalogCategory>('items')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState<CategoryState>({ entries: [], failedAssets: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || gameRootPath === '') {
      return
    }

    let cancelled = false
    setLoading(true)
    loadStringCatalogCategory(gameRootPath, category, locale)
      .then((assets) => {
        if (cancelled) {
          return
        }
        setState({
          entries: assets.flatMap((asset) => asset.entries),
          failedAssets: assets.filter((asset) => !asset.loaded).map((asset) => asset.asset.name),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ entries: [], failedAssets: [] })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, gameRootPath, category, locale])

  useEffect(() => {
    if (open) {
      return
    }
    setQuery('')
    setSelectedId(null)
  }, [open])

  const { results, total } = useMemo(() => searchStringCatalog(state.entries, query, RESULT_LIMIT), [state.entries, query])
  const selected = results.find((entry) => entry.id === selectedId) ?? null

  return (
    <Dialog open={open} onClose={onClose} size="xl" stack ariaLabel={copy.dialogTitle}>
      <DialogHeader
        title={copy.dialogTitle}
        subtitle={loading ? copy.loading : copy.resultCount(results.length, total)}
        icon={<Languages className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.cancel}
      />
      <DialogBody className="text-library">
        <div className="text-library-toolbar">
          <input
            type="search"
            className="control-input"
            value={query}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            data-autofocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="text-library-categories" role="tablist" aria-label={copy.dialogTitle}>
          {STRING_CATALOG_CATEGORIES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === category}
              className={cx('text-library-category', entry === category && 'is-active')}
              onClick={() => {
                setCategory(entry)
                setSelectedId(null)
              }}
            >
              {copy.categoryLabels[entry]}
            </button>
          ))}
        </div>

        {state.failedAssets.length > 0 ? <p className="text-library-warning">{copy.loadFailed(state.failedAssets.join(', '))}</p> : null}

        <div className="text-library-results">
          {loading ? (
            <p className="text-library-status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {copy.loading}
            </p>
          ) : results.length === 0 ? (
            <p className="text-library-status">{copy.empty}</p>
          ) : (
            <table className="text-library-table">
              <thead>
                <tr>
                  <th scope="col">{copy.assetHeader}</th>
                  <th scope="col">{copy.keyHeader}</th>
                  <th scope="col">{copy.textHeader}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((entry) => (
                  <tr key={entry.id} className={cx(entry.id === selectedId && 'is-selected')}>
                    <td>
                      <button type="button" className="text-library-row" onClick={() => setSelectedId(entry.id)}>
                        {entry.assetName}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="text-library-row is-key" onClick={() => setSelectedId(entry.id)}>
                        {entry.key}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="text-library-row" onClick={() => setSelectedId(entry.id)}>
                        {entry.value}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && total > results.length ? <p className="text-library-status">{copy.minQueryHint}</p> : null}
        </div>
      </DialogBody>
      <DialogFooter align="between">
        <span className="text-library-token">{selected ? copy.tokenPreview(selected.token) : ''}</span>
        <span className="text-library-actions">
          <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
          <DialogAction
            disabled={selected === null}
            onClick={() => {
              if (selected) {
                onInsertText(selected.value)
              }
            }}
          >
            {copy.insertPlainText}
          </DialogAction>
          <DialogAction
            tone="primary"
            disabled={selected === null}
            onClick={() => {
              if (selected) {
                onInsertToken(selected.token)
              }
            }}
          >
            {copy.insertToken}
          </DialogAction>
        </span>
      </DialogFooter>
    </Dialog>
  )
}
