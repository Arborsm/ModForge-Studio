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
    return <p className="text-text-secondary text-sm">{emptyLabel}</p>
  }

  if (variant === 'flat') {
    return (
      <div className="flex flex-col">
        {sources.map((source) => (
          <div
            key={`${source.modId}:${source.key}:${source.patchIds.join(',')}`}
            className="border-border-subtle/50 flex flex-col gap-1 border-b py-2.5 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-text-primary truncate text-xs font-bold">{source.modName}</p>
              <span className="dock-chip shrink-0">{source.patchIds.length}</span>
            </div>
            <p className="text-text-secondary truncate text-xs">{source.modPath}</p>
            <div className="text-text-tertiary mt-1 flex flex-col gap-0.5 text-xs">
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
              <p className="text-text-primary truncate text-sm font-semibold">{source.modName}</p>
              <p className="text-text-secondary truncate text-xs">{source.modPath}</p>
            </div>
            <span className="dock-chip shrink-0">{source.patchIds.length}</span>
          </div>
          <div className="text-text-secondary mt-3 space-y-1.5 text-xs">
            <p>Target: {source.targets.join(' / ') || source.key}</p>
            <p>Patch: {source.patchIds.join(', ') || 'n/a'}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
