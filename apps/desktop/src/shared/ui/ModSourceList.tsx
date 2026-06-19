import type { ModSourceEntry } from '@shared/contracts'

type ModSourceListProps = {
  sources: ModSourceEntry[]
  emptyLabel?: string
}

export function ModSourceList({ sources, emptyLabel = 'No mod source recorded.' }: ModSourceListProps) {
  if (!sources.length) {
    return <p className="text-sm text-(--text-secondary)">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div key={`${source.modId}:${source.key}:${source.patchIds.join(',')}`} className="panel-list-card px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-(--text-primary)">{source.modName}</p>
              <p className="truncate text-xs text-(--text-secondary)">{source.modPath}</p>
            </div>
            <span className="dock-chip shrink-0">{source.patchIds.length}</span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-(--text-secondary)">
            <p>Target: {source.targets.join(' / ') || source.key}</p>
            <p>Patch: {source.patchIds.join(', ') || 'n/a'}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
