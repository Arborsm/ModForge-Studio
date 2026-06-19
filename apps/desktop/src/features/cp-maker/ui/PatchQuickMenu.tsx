import { ChevronDown, FileCode, Search } from 'lucide-react'
import { startTransition, useDeferredValue, useEffect, useRef, useState, type UIEvent } from 'react'
import type { DraftPatch } from '@shared/contracts'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { PatchSummaryCard } from './PatchSummaryCard'

type PatchQuickMenuProps = {
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
}

const INITIAL_VISIBLE_PATCHES = 72
const VISIBLE_PATCH_INCREMENT = 72

function groupPatches(patches: DraftPatch[]) {
  const groups = new Map<string, DraftPatch[]>()
  for (const patch of patches) {
    const current = groups.get(patch.action) ?? []
    current.push(patch)
    groups.set(patch.action, current)
  }
  return Array.from(groups.entries())
}

function limitPatchGroups(groups: Array<[string, DraftPatch[]]>, visiblePatchCount: number) {
  let remaining = visiblePatchCount
  const visibleGroups: Array<[string, DraftPatch[]]> = []

  for (const [action, items] of groups) {
    if (remaining <= 0) {
      break
    }

    const visibleItems = items.slice(0, remaining)
    if (visibleItems.length) {
      visibleGroups.push([action, visibleItems])
      remaining -= visibleItems.length
    }
  }

  return visibleGroups
}

export function PatchQuickMenu({ patches, activePatchId, onSelectPatch }: PatchQuickMenuProps) {
  const copy = useEditorCopy().studioDesk.patchCatalog
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [visiblePatchCount, setVisiblePatchCount] = useState(INITIAL_VISIBLE_PATCHES)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activePatch = activePatchId ? (patches.find((patch) => patch.id === activePatchId) ?? null) : null

  const filteredPatches = (() => {
    const normalized = deferredQuery.trim().toLowerCase()
    if (!normalized) {
      return patches
    }
    return patches.filter((patch) =>
      `${patch.logName} ${patch.action} ${patch.target} ${patch.fromFile ?? ''}`.toLowerCase().includes(normalized),
    )
  })()

  const patchGroups = groupPatches(filteredPatches)
  const visiblePatchGroups = limitPatchGroups(patchGroups, visiblePatchCount)
  const hasMorePatches = filteredPatches.length > visiblePatchCount

  function handlePatchScroll(event: UIEvent<HTMLDivElement>) {
    if (!hasMorePatches) {
      return
    }

    const target = event.currentTarget
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight
    if (remainingScroll > 180) {
      return
    }

    startTransition(() => {
      setVisiblePatchCount((current) => Math.min(current + VISIBLE_PATCH_INCREMENT, filteredPatches.length))
    })
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'p')) {
        event.preventDefault()
        setOpen(true)
      }
    }

    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    startTransition(() => setVisiblePatchCount(INITIAL_VISIBLE_PATCHES))
  }, [deferredQuery, patches])

  return (
    <div ref={rootRef} className="edit-patch-menu">
      <button
        type="button"
        className={cx('control-button edit-patch-menu-trigger', open && 'edit-patch-menu-trigger-open')}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FileCode className="h-4 w-4" />
        <span className="truncate">{activePatch?.logName || activePatch?.target || copy.allPatches}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open ? (
        <div className="edit-patch-menu-popover" role="menu">
          <button
            type="button"
            className={cx('asset-row edit-patch-menu-all', activePatchId === null && 'asset-row-active')}
            onClick={() => {
              onSelectPatch(null)
              setOpen(false)
            }}
          >
            <span className="font-semibold text-(--text-primary)">{copy.allPatches}</span>
            <span className="dock-chip">{patches.length}</span>
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
            <input
              className="control-input h-9 pl-9 text-xs"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                startTransition(() => setVisiblePatchCount(INITIAL_VISIBLE_PATCHES))
              }}
              placeholder={copy.quickSearchPlaceholder}
              spellCheck={false}
              autoFocus
            />
          </div>

          <div className="edit-patch-menu-scroll" onScroll={handlePatchScroll}>
            {visiblePatchGroups.length ? (
              visiblePatchGroups.map(([action, items]) => (
                <section key={action} className="edit-patch-menu-group">
                  <div className="edit-patch-menu-group-header">
                    <span>{action}</span>
                    <span>{patchGroups.find(([groupAction]) => groupAction === action)?.[1].length ?? items.length}</span>
                  </div>
                  <div className="grid gap-2">
                    {items.map((patch) => (
                      <PatchSummaryCard
                        key={patch.id}
                        patch={patch}
                        active={patch.id === activePatchId}
                        compact
                        onSelect={() => {
                          onSelectPatch(patch.id)
                          setOpen(false)
                        }}
                        onEdit={() => {
                          onSelectPatch(patch.id)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="panel-empty-state text-center text-xs">{copy.noSearchMatches}</div>
            )}
            {hasMorePatches ? (
              <button
                type="button"
                className="control-button edit-patch-menu-more"
                onClick={() =>
                  startTransition(() => {
                    setVisiblePatchCount((current) => Math.min(current + VISIBLE_PATCH_INCREMENT, filteredPatches.length))
                  })
                }
              >
                {Math.min(visiblePatchCount, filteredPatches.length)} / {filteredPatches.length} {copy.patches}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
