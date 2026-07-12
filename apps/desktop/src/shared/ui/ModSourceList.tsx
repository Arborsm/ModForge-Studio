type ModSourceEntry = {
  modId: string
  modName: string
  modPath: string
  key: string
  targets: string[]
  patchIds: string[]
}

type ModSourceListProps = {
  sources: ModSourceEntry[]
  emptyLabel?: string
  variant?: 'card' | 'flat'
}

export function ModSourceList({ sources, emptyLabel = 'No mod source recorded.', variant = 'card' }: ModSourceListProps) {
  if (!sources.length) {
    return <p className="text-sm text-(--text-secondary)">{emptyLabel}</p>
  }

  if (variant === 'flat') {
    return (
      <div className="flex flex-col">
        {sources.map((source) => (
          <div
            key={`${source.modId}:${source.key}:${source.patchIds.join(',')}`}
            className="flex flex-col gap-1 border-b border-(--border-color)/50 py-2.5 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-bold text-(--text-primary)">{source.modName}</p>
              <span className="dock-chip shrink-0">{source.patchIds.length}</span>
            </div>
            <p className="truncate text-xs text-(--text-secondary)">{source.modPath}</p>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-(--text-tertiary)">
              <p className="truncate">Target: {source.targets.join(' / ') || source.key}</p>
              <p className="truncate">Patch: {source.patchIds.join(', ') || 'n/a'}</p>
            </div>
          </div>
        ))}
      </div>
    )
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
