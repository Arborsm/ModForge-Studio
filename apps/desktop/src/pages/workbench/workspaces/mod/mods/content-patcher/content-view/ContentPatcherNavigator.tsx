import * as ContextMenu from '@radix-ui/react-context-menu'
import type { ContentPatcherPatchStatus, ContentPatcherPlannedPatch, ContentPatcherTargetSummary } from '@entities/mod/api'
import { contentPatcherStatusClass } from '../content-model/presentation'
import { useModWorkspaceCopy } from '@locales/provider'

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
  onOpenScaleUp?: (targetPath: string, focusSection: 'preview' | 'settings') => void
}

type TargetGroup = {
  key: string
  title: string
  targets: ContentPatcherTargetSummary[]
}

function groupTargets(
  targets: ContentPatcherTargetSummary[],
  copy: ReturnType<typeof useModWorkspaceCopy>['contentPatcherNavigator'],
): TargetGroup[] {
  const orderedGroups = new Map<string, TargetGroup>()
  const preferredGroups = [
    { key: 'json', title: copy.jsonTargets },
    { key: 'image', title: copy.imageTargets },
    { key: 'map', title: copy.mapTargets },
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
        title: copy.otherTargets(key),
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
  onOpenScaleUp,
}: ContentPatcherNavigatorProps) {
  const copy = useModWorkspaceCopy().contentPatcherNavigator
  const statusByPatchId = new Map(
    patchStatuses
      .filter((entry): entry is ContentPatcherPatchStatus & { patchId: string } => Boolean(entry.patchId))
      .map((entry) => [entry.patchId, entry]),
  )
  const targetGroups = groupTargets(targets, copy)

  function renderTargetButton(target: ContentPatcherTargetSummary) {
    const button = (
      <button
        type="button"
        className={selectedTargetPath === target.path ? 'cp-debugger-list-item cp-debugger-list-item-active' : 'cp-debugger-list-item'}
        onClick={() => onSelectTarget(target.path)}
      >
        <div className="cp-debugger-list-row">
          <span className="cp-debugger-list-title">{target.path}</span>
          <span className={contentPatcherStatusClass(target.resultState)}>{target.resultState}</span>
        </div>
        <p className="cp-debugger-list-meta">{copy.patchesMeta(target.touchedPatchCount)}</p>
      </button>
    )

    if (target.assetKind !== 'image' || !onOpenScaleUp) {
      return button
    }

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{button}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content" collisionPadding={12} forceMount>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="context-menu-item context-menu-subtrigger">
                {copy.scaleUp}
                <span className="context-menu-subhint">{copy.openHint}</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  className="context-menu-content context-menu-subcontent"
                  collisionPadding={12}
                  forceMount
                  sideOffset={6}
                >
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => {
                      onSelectTarget(target.path)
                      onOpenScaleUp(target.path, 'preview')
                    }}
                  >
                    {copy.renderPreview}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    onSelect={() => {
                      onSelectTarget(target.path)
                      onOpenScaleUp(target.path, 'settings')
                    }}
                  >
                    {copy.parameterSettings}
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )
  }

  return (
    <section className="cp-debugger-nav">
      <div className="cp-debugger-tabs">
        <button
          type="button"
          className={mode === 'patches' ? 'cp-debugger-tab cp-debugger-tab-active' : 'cp-debugger-tab'}
          onClick={() => onModeChange('patches')}
        >
          {copy.patchesTab}
        </button>
        <button
          type="button"
          className={mode === 'targets' ? 'cp-debugger-tab cp-debugger-tab-active' : 'cp-debugger-tab'}
          onClick={() => onModeChange('targets')}
        >
          {copy.targetsTab}
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
                    className={
                      selectedPatchId === patch.id ? 'cp-debugger-list-item cp-debugger-list-item-active' : 'cp-debugger-list-item'
                    }
                    onClick={() => onSelectPatch(patch.id)}
                  >
                    <div className="cp-debugger-list-row">
                      <span className="cp-debugger-list-title">{patch.logName || patch.id}</span>
                      <span className={contentPatcherStatusClass(status)}>{status}</span>
                    </div>
                    <p className="cp-debugger-list-meta">
                      {patch.action}
                      {patch.target ? ` -> ${patch.target}` : ''}
                    </p>
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
                      <p className="cp-debugger-target-group-meta">{copy.targetsMeta(group.targets.length)}</p>
                    </div>
                    <span className="cp-debugger-pill cp-debugger-pill-muted">{group.targets.length}</span>
                  </header>

                  <div className="cp-debugger-target-group-body">
                    {group.targets.map((target) => (
                      <div key={target.path}>{renderTargetButton(target)}</div>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p className="panel-empty-state">{copy.noTargets}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
