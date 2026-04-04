import type { ContentPatcherPatchStatus, ContentPatcherPlannedPatch, ContentPatcherTargetSummary } from '../../../lib/desktop'
import { contentPatcherStatusClass } from './presentation'

type ContentPatcherNavigatorProps = {
  mode: 'patches' | 'targets'
  onModeChange: (mode: 'patches' | 'targets') => void
  patches: ContentPatcherPlannedPatch[]
  patchStatuses: ContentPatcherPatchStatus[]
  targets: ContentPatcherTargetSummary[]
  selectedPatchId: string | null
  selectedTargetPath: string | null
  onSelectPatch: (patchId: string) => void
  onSelectTarget: (path: string) => void
}

type TargetGroup = {
  key: string
  title: string
  targets: ContentPatcherTargetSummary[]
}

function groupTargets(targets: ContentPatcherTargetSummary[]): TargetGroup[] {
  const orderedGroups = new Map<string, TargetGroup>()
  const preferredGroups = [
    { key: 'json', title: 'JSON Targets' },
    { key: 'image', title: 'Image Targets' },
    { key: 'map', title: 'Map Targets' },
  ]

  for (const { key, title } of preferredGroups) {
    orderedGroups.set(key, {
      key,
      title,
      targets: [],
    })
  }

  for (const target of targets) {
    const key = target.assetKind.trim().toLowerCase() || 'other'
    if (!orderedGroups.has(key)) {
      orderedGroups.set(key, {
        key,
        title: `${key.charAt(0).toUpperCase()}${key.slice(1)} Targets`,
        targets: [],
      })
    }
    orderedGroups.get(key)?.targets.push(target)
  }

  return [...orderedGroups.values()].filter((group) => group.targets.length > 0)
}

export function ContentPatcherNavigator({
  mode,
  onModeChange,
  patches,
  patchStatuses,
  targets,
  selectedPatchId,
  selectedTargetPath,
  onSelectPatch,
  onSelectTarget,
}: ContentPatcherNavigatorProps) {
  const statusByPatchId = new Map(
    patchStatuses
      .filter((entry): entry is ContentPatcherPatchStatus & { patchId: string } => Boolean(entry.patchId))
      .map((entry) => [entry.patchId, entry]),
  )
  const targetGroups = groupTargets(targets)

  return (
    <section className="cp-debugger-nav">
      <div className="cp-debugger-tabs">
        <button
          type="button"
          className={mode === 'patches' ? 'cp-debugger-tab cp-debugger-tab-active' : 'cp-debugger-tab'}
          onClick={() => onModeChange('patches')}
        >
          Patches
        </button>
        <button
          type="button"
          className={mode === 'targets' ? 'cp-debugger-tab cp-debugger-tab-active' : 'cp-debugger-tab'}
          onClick={() => onModeChange('targets')}
        >
          Targets
        </button>
      </div>

      <div className="cp-debugger-nav-scroll">
        {mode === 'patches' ? (
          <ul className="cp-debugger-list">
            {patches.map((patch) => {
              const status = statusByPatchId.get(patch.id)?.status ?? 'indeterminate'
              return (
                <li key={patch.id}>
                  <button
                    type="button"
                    className={selectedPatchId === patch.id ? 'cp-debugger-list-item cp-debugger-list-item-active' : 'cp-debugger-list-item'}
                    onClick={() => onSelectPatch(patch.id)}
                  >
                    <div className="cp-debugger-list-row">
                      <span className="cp-debugger-list-title">{patch.logName || patch.id}</span>
                      <span className={contentPatcherStatusClass(status)}>{status}</span>
                    </div>
                    <p className="cp-debugger-list-meta">{patch.action}{patch.target ? ` -> ${patch.target}` : ''}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="cp-debugger-target-groups">
            {targetGroups.length ? (
              targetGroups.map((group) => (
                <section key={group.key} className="cp-debugger-target-group">
                  <header className="cp-debugger-target-group-header">
                    <div>
                      <h3 className="cp-debugger-target-group-title">{group.title}</h3>
                      <p className="cp-debugger-target-group-meta">{`${group.targets.length} targets`}</p>
                    </div>
                    <span className="cp-debugger-pill cp-debugger-pill-muted">{group.targets.length}</span>
                  </header>

                  <div className="cp-debugger-target-group-body">
                    {group.targets.map((target) => (
                      <button
                        key={target.path}
                        type="button"
                        className={
                          selectedTargetPath === target.path
                            ? 'cp-debugger-list-item cp-debugger-list-item-active'
                            : 'cp-debugger-list-item'
                        }
                        onClick={() => onSelectTarget(target.path)}
                      >
                        <div className="cp-debugger-list-row">
                          <span className="cp-debugger-list-title">{target.path}</span>
                          <span className={contentPatcherStatusClass(target.resultState)}>{target.resultState}</span>
                        </div>
                        <p className="cp-debugger-list-meta">{`${target.touchedPatchCount} patches`}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p className="panel-empty-state">No targets in the current simulation.</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
