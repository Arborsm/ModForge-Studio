import { ChevronDown, FileCode, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DraftPatch } from '@shared/contracts'
import { cx } from '@shared/lib/cx'
import { PatchSummaryCard } from './PatchSummaryCard'

type PatchQuickMenuProps = {
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
}

function groupPatches(patches: DraftPatch[]) {
  const groups = new Map<string, DraftPatch[]>()
  for (const patch of patches) {
    const current = groups.get(patch.action) ?? []
    current.push(patch)
    groups.set(patch.action, current)
  }
  return Array.from(groups.entries())
}

export function PatchQuickMenu({ patches, activePatchId, onSelectPatch }: PatchQuickMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activePatch = activePatchId ? patches.find((patch) => patch.id === activePatchId) ?? null : null

  const filteredPatches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return patches
    }
    return patches.filter((patch) =>
      `${patch.logName} ${patch.action} ${patch.target} ${patch.fromFile ?? ''}`.toLowerCase().includes(normalized),
    )
  }, [patches, query])

  const patchGroups = useMemo(() => groupPatches(filteredPatches), [filteredPatches])

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
        <span className="truncate">{activePatch?.logName || activePatch?.target || 'All Patches'}</span>
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
            <span className="font-semibold text-[var(--text-primary)]">All Patches</span>
            <span className="dock-chip">{patches.length}</span>
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="control-input h-9 pl-9 text-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search patches"
              spellCheck={false}
              autoFocus
            />
          </div>

          <div className="edit-patch-menu-scroll">
            {patchGroups.length ? (
              patchGroups.map(([action, items]) => (
                <section key={action} className="edit-patch-menu-group">
                  <div className="edit-patch-menu-group-header">
                    <span>{action}</span>
                    <span>{items.length}</span>
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
              <div className="panel-empty-state text-center text-xs">No patches match the current search.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
