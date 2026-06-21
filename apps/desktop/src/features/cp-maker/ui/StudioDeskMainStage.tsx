import { useState, type KeyboardEvent } from 'react'
import type { EditorCopy } from '@locales'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskInspiration, StudioDeskModel, StudioDeskWorldBibleEntry } from '../model/studioDeskModel'
import type { WorkspaceId } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'

type StudioDeskMainStageProps = {
  model: StudioDeskModel
  previewFocus: StudioDeskInspiration | null
  onCreateDraft: () => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
}

type StudioStagePage = 'script' | 'map' | 'actors' | 'props'
type StudioWipStagePage = Exclude<StudioStagePage, 'script'>
type StudioDeskCopy = EditorCopy['studioDesk']

function entryCount(model: StudioDeskModel, workspaceId: WorkspaceId) {
  return model.workspaceEntrypoints.find((entry) => entry.workspaceId === workspaceId)?.patchCount ?? 0
}

function handleWorkspaceCardKeyDown(event: KeyboardEvent<HTMLElement>, callback: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  callback()
}

function workspaceForStagePage(page: StudioStagePage): WorkspaceId {
  if (page === 'map') return 'map'
  if (page === 'actors') return 'characters'
  if (page === 'props') return 'items'
  return 'events'
}

function wipWorkspaceForStagePage(page: StudioWipStagePage): WorkspaceId {
  if (page === 'map') return 'map'
  if (page === 'actors') return 'characters'
  return 'items'
}

function entryCards(entries: StudioDeskWorldBibleEntry[], emptyLabel: string) {
  if (!entries.length) {
    return <div className="studio-empty-note">{emptyLabel}</div>
  }

  return entries.slice(0, 4).map((entry) => (
    <div key={`${entry.key}:${entry.value}`} className="studio-script-asset-card">
      <strong>{entry.key}</strong>
      <span>{entry.value}</span>
    </div>
  ))
}

function StudioWipStagePanel({
  desk,
  page,
  hasActiveDraft,
  onOpenWorkspace,
}: {
  desk: StudioDeskCopy
  page: StudioWipStagePage
  hasActiveDraft: boolean
  onOpenWorkspace: (workspace: WorkspaceId) => void
}) {
  const title = desk.stageTabs[page]
  const workspace = wipWorkspaceForStagePage(page)

  return (
    <section className="studio-stage-page studio-stage-page-wip active" aria-label={title}>
      <div className={cx('studio-wip-panel', `studio-wip-panel-${page}`)}>
        <div className="studio-wip-blueprint" aria-hidden="true">
          <span className="studio-wip-node studio-wip-node-a" />
          <span className="studio-wip-node studio-wip-node-b" />
          <span className="studio-wip-node studio-wip-node-c" />
          <span className="studio-wip-line studio-wip-line-a" />
          <span className="studio-wip-line studio-wip-line-b" />
        </div>
        <div className="studio-wip-copy">
          <span className="studio-wip-badge">{desk.wipBadge}</span>
          <h3>{desk.wipTitle(title)}</h3>
          <p>{desk.wipDescription}</p>
        </div>
      </div>
      <aside className="studio-wip-side">
        <span>{desk.wipOpenHint(title)}</span>
        <div className="studio-wip-checklist" aria-label={desk.wipBadge}>
          {desk.wipChecklist.map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
        <button type="button" className="studio-wip-open-button" disabled={!hasActiveDraft} onClick={() => onOpenWorkspace(workspace)}>
          {desk.openWorkspace}
        </button>
      </aside>
    </section>
  )
}

function StudioWipMini({ desk, title }: { desk: StudioDeskCopy; title: string }) {
  return (
    <div className="studio-wip-mini">
      <span className="studio-wip-badge">{desk.wipBadge}</span>
      <strong>{desk.wipTitle(title)}</strong>
      <span>{desk.wipOpenHint(title)}</span>
      <div className="studio-wip-mini-grid" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
    </div>
  )
}

export function StudioDeskMainStage({ model, previewFocus, onCreateDraft, onOpenWorkspace }: StudioDeskMainStageProps) {
  const copy = useEditorCopy()
  const desk = copy.studioDesk
  const [stagePage, setStagePage] = useState<StudioStagePage>('script')
  const hasActiveDraft = model.hasActiveDraft
  const previewKind = previewFocus?.kind ?? null
  const pulseItems = model.recentInspirations.slice(0, 4)
  const scriptItems = model.recentInspirations.filter((item) => item.kind === 'event')
  const projectDescription = hasActiveDraft ? model.projectDescription.trim() || desk.heroSubtitle : desk.noActiveDraftSubtitle
  const openStageWorkspace = () => {
    if (hasActiveDraft) onOpenWorkspace(workspaceForStagePage(stagePage))
  }

  return (
    <section className={cx('studio-main-stage', !hasActiveDraft && 'studio-main-stage-empty')} aria-label={desk.mainStage}>
      <span data-testid="studio-preview-focus" className="sr-only" aria-live="polite">
        {previewFocus ? `${previewFocus.kind}:${previewFocus.title}` : 'none'}
      </span>
      <header className="studio-project-hero">
        <div className="studio-project-hero-top">
          <div className="studio-project-title-block">
            <div className="studio-project-title-row">
              <h1>{hasActiveDraft ? model.projectName : desk.title}</h1>
            </div>
            <p>{projectDescription}</p>
          </div>

          <div className="studio-live-inspector" aria-label={desk.worldBible}>
            {model.worldBible.tokens.slice(0, 2).map((entry) => (
              <span key={entry.key}>{entry.key}</span>
            ))}
            {model.worldBible.configSchema.slice(0, 2).map((entry) => (
              <span key={entry.key}>{entry.key}</span>
            ))}
            {!model.worldBible.tokens.length && !model.worldBible.configSchema.length ? (
              <span>{hasActiveDraft ? desk.creativeMode : desk.createDraft}</span>
            ) : null}
          </div>
        </div>

        <div className="studio-stat-row">
          <span>
            <strong>{model.stats.eventCount}</strong> {desk.stats.events}
          </span>
          <span>
            <strong>{model.stats.mapCount}</strong> {desk.stats.maps}
          </span>
          <span>
            <strong>{model.stats.festivalCount}</strong> {desk.stats.festivals}
          </span>
          <span>
            <strong>{model.stats.assetCount}</strong> {desk.stats.assets}
          </span>
          <span className={model.stats.conflictCount > 0 ? 'studio-stat-alert' : undefined}>
            <strong>{model.stats.conflictCount}</strong> {desk.stats.conflicts}
          </span>
        </div>
      </header>

      <div className="studio-workspace-grid studio-workspace-grid-console">
        <article
          className={cx(
            'studio-workspace-card studio-script-card studio-creation-console',
            !hasActiveDraft && 'studio-workspace-disabled',
            previewKind === 'event' && 'studio-preview-active',
          )}
        >
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.creationControls}</div>
              <h2>{desk.scriptConsole}</h2>
            </div>
            <div className="studio-stage-switch" aria-label={desk.mainStage}>
              {(['script', 'map', 'actors', 'props'] as const).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={stagePage === page ? 'active' : undefined}
                  onClick={() => setStagePage(page)}
                  onMouseEnter={() => setStagePage(page)}
                >
                  {desk.stageTabs[page]}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-script-preview studio-stage-preview">
            {stagePage === 'script' ? (
              <section className="studio-stage-page active" aria-label={desk.stageTabs.script}>
                <div className="studio-script-flow">
                  <div className="studio-script-preview-head">
                    <div>
                      <strong>{scriptItems[0]?.title ?? desk.stageEmpty}</strong>
                      <span>{scriptItems[0]?.target ?? desk.noEntries}</span>
                    </div>
                    <span>
                      {entryCount(model, 'events')} {desk.stats.events}
                    </span>
                  </div>
                  <div className="studio-script-command-list">
                    {scriptItems.slice(0, 3).map((item) => (
                      <div key={item.patchId} className="studio-script-command">
                        <span>{item.action}</span>
                        <strong>{item.target || item.title}</strong>
                      </div>
                    ))}
                    {!scriptItems.length ? <div className="studio-empty-note">{desk.stageEmpty}</div> : null}
                  </div>
                </div>
                <aside className="studio-script-assets" aria-label={desk.linkedResources}>
                  <h3>{desk.linkedResources}</h3>
                  <div className="studio-script-asset-grid">{entryCards(model.worldBible.story, desk.stageEmpty)}</div>
                </aside>
              </section>
            ) : null}

            {stagePage === 'map' ? (
              <StudioWipStagePanel desk={desk} page="map" hasActiveDraft={hasActiveDraft} onOpenWorkspace={onOpenWorkspace} />
            ) : null}

            {stagePage === 'actors' ? (
              <StudioWipStagePanel desk={desk} page="actors" hasActiveDraft={hasActiveDraft} onOpenWorkspace={onOpenWorkspace} />
            ) : null}

            {stagePage === 'props' ? (
              <StudioWipStagePanel desk={desk} page="props" hasActiveDraft={hasActiveDraft} onOpenWorkspace={onOpenWorkspace} />
            ) : null}
          </div>

          <button type="button" className="studio-primary-action" onClick={hasActiveDraft ? openStageWorkspace : onCreateDraft}>
            {hasActiveDraft ? (stagePage === 'script' ? desk.continueScript : desk.openWorkspace) : desk.createDraft}
          </button>
        </article>

        <article
          className={cx(
            'studio-workspace-card studio-assets-card studio-quick-workspace-card',
            !hasActiveDraft && 'studio-workspace-disabled',
            previewKind === 'asset' && 'studio-preview-active',
          )}
          role="button"
          tabIndex={hasActiveDraft ? 0 : -1}
          aria-disabled={!hasActiveDraft}
          onClick={() => hasActiveDraft && onOpenWorkspace('characters')}
          onKeyDown={(event) => handleWorkspaceCardKeyDown(event, () => hasActiveDraft && onOpenWorkspace('characters'))}
        >
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.castAndProps}</div>
              <h2>{desk.castAndProps}</h2>
            </div>
            <span className="studio-card-pill">{desk.wipBadge}</span>
          </div>
          <StudioWipMini desk={desk} title={desk.castAndProps} />
        </article>

        <article
          className={cx(
            'studio-workspace-card studio-map-card studio-quick-workspace-card',
            !hasActiveDraft && 'studio-workspace-disabled',
            previewKind === 'map' && 'studio-preview-active',
          )}
        >
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.cartographer}</div>
              <h2>{desk.cartographer}</h2>
            </div>
            <span className="studio-card-pill">{desk.wipBadge}</span>
          </div>
          <button type="button" className="studio-wip-mini-button" disabled={!hasActiveDraft} onClick={() => onOpenWorkspace('map')}>
            <StudioWipMini desk={desk} title={desk.cartographer} />
          </button>
        </article>
      </div>

      <section className="studio-pulse" aria-label={desk.projectPulse}>
        <div className="studio-pulse-line">
          {pulseItems.length ? (
            pulseItems.map((item) => (
              <button key={item.patchId} type="button" className="studio-pulse-item" onClick={() => onOpenWorkspace(item.workspaceId)}>
                <span className="studio-resource-popover">
                  <strong>{desk.linkedResources}</strong>
                  <span>{item.target || item.action}</span>
                </span>
                <strong>{item.title}</strong>
                <span>{item.target || item.action}</span>
                <small>{desk.pulseSummary(item.action)}</small>
              </button>
            ))
          ) : (
            <>
              <span className="studio-pulse-placeholder" />
              <span className="studio-pulse-placeholder studio-pulse-placeholder-short" />
              <span className="studio-pulse-placeholder" />
              <span className="studio-pulse-placeholder studio-pulse-placeholder-short" />
            </>
          )}
        </div>
      </section>
    </section>
  )
}
