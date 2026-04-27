import { useState, type KeyboardEvent } from 'react'
import type { EditorCopy } from '../../locales'
import type { StudioDeskInspiration, StudioDeskModel, StudioDeskWorldBibleEntry } from '../../lib/app/studioDeskModel'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { cx } from '../../lib/cx'

type StudioDeskMainStageProps = {
  copy: EditorCopy
  model: StudioDeskModel
  previewFocus: StudioDeskInspiration | null
  onCreateDraft: () => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
}

type StudioStagePage = 'script' | 'map' | 'actors' | 'props'

function entryCount(model: StudioDeskModel, workspaceId: WorkspaceId) {
  return model.workspaceEntrypoints.find((entry) => entry.workspaceId === workspaceId)?.patchCount ?? 0
}

function getMapSeed(title: string) {
  return Array.from(title).reduce((total, char) => total + char.charCodeAt(0), 0)
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

export function StudioDeskMainStage({
  copy,
  model,
  previewFocus,
  onCreateDraft,
  onOpenWorkspace,
}: StudioDeskMainStageProps) {
  const desk = copy.studioDesk
  const [stagePage, setStagePage] = useState<StudioStagePage>('script')
  const hasActiveDraft = model.hasActiveDraft
  const mapPreview = model.recentInspirations.find((item) => item.kind === 'map')
  const activeMapPreview = previewFocus?.kind === 'map' ? previewFocus : mapPreview
  const previewKind = previewFocus?.kind ?? null
  const mapPreviewTitle = activeMapPreview?.title ?? desk.openWorkspace
  const mapSeed = getMapSeed(mapPreviewTitle)
  const pulseItems = model.recentInspirations.slice(0, 4)
  const scriptItems = model.recentInspirations.filter((item) => item.kind === 'event')
  const mapItems = model.recentInspirations.filter((item) => item.kind === 'map')
  const propEntries = model.worldBible.items.length ? model.worldBible.items : model.worldBible.tokens
  const projectDescription = hasActiveDraft
    ? model.projectDescription.trim() || desk.heroSubtitle
    : desk.noActiveDraftSubtitle
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
            {model.worldBible.tokens.slice(0, 2).map((entry) => <span key={entry.key}>{entry.key}</span>)}
            {model.worldBible.configSchema.slice(0, 2).map((entry) => <span key={entry.key}>{entry.key}</span>)}
            {!model.worldBible.tokens.length && !model.worldBible.configSchema.length ? <span>{hasActiveDraft ? desk.creativeMode : desk.createDraft}</span> : null}
          </div>
        </div>

        <div className="studio-stat-row">
          <span><strong>{model.stats.eventCount}</strong> {desk.stats.events}</span>
          <span><strong>{model.stats.mapCount}</strong> {desk.stats.maps}</span>
          <span><strong>{model.stats.festivalCount}</strong> {desk.stats.festivals}</span>
          <span><strong>{model.stats.assetCount}</strong> {desk.stats.assets}</span>
          <span className={model.stats.conflictCount > 0 ? 'studio-stat-alert' : undefined}>
            <strong>{model.stats.conflictCount}</strong> {desk.stats.conflicts}
          </span>
        </div>
      </header>

      <div className="studio-workspace-grid studio-workspace-grid-console">
        <article className={cx('studio-workspace-card studio-script-card studio-creation-console', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'event' && 'studio-preview-active')}>
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
                    <span>{entryCount(model, 'events')} {desk.stats.events}</span>
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
                  <div className="studio-script-asset-grid">
                    {entryCards(model.worldBible.story, desk.stageEmpty)}
                  </div>
                </aside>
              </section>
            ) : null}

            {stagePage === 'map' ? (
              <section className="studio-stage-page active" aria-label={desk.stageTabs.map}>
                <button type="button" className="studio-map-thumbnail-button" disabled={!hasActiveDraft} onClick={() => onOpenWorkspace('map')}>
                  <span data-testid="studio-map-preview-title" className="sr-only">{mapPreviewTitle}</span>
                  <span className="studio-map-thumbnail" aria-hidden="true">
                    {Array.from({ length: 40 }).map((_, index) => (
                      <span key={index} className={(index + mapSeed) % 7 === 0 ? 'studio-map-tile-accent' : undefined} />
                    ))}
                  </span>
                </button>
                <aside className="studio-stage-detail-panel">
                  <h3>{desk.stageTabs.map}</h3>
                  <div className="studio-script-asset-grid">
                    {entryCards(model.worldBible.scenes.length ? model.worldBible.scenes : mapItems.map((item) => ({ key: item.title, value: item.target })), desk.stageEmpty)}
                  </div>
                </aside>
              </section>
            ) : null}

            {stagePage === 'actors' ? (
              <section className="studio-stage-page active" aria-label={desk.stageTabs.actors}>
                <div className="studio-actor-grid">
                  {model.worldBible.actors.length ? model.worldBible.actors.slice(0, 4).map((entry) => (
                    <div key={entry.key} className="studio-actor-card">
                      <span>{entry.key.slice(0, 2)}</span>
                      <strong>{entry.key}</strong>
                      <small>{entry.value}</small>
                    </div>
                  )) : <div className="studio-empty-note">{desk.stageEmpty}</div>}
                </div>
                <aside className="studio-stage-detail-panel">
                  <h3>{desk.stageTabs.actors}</h3>
                  <div className="studio-script-asset-grid">
                    {entryCards(model.worldBible.actors, desk.stageEmpty)}
                  </div>
                </aside>
              </section>
            ) : null}

            {stagePage === 'props' ? (
              <section className="studio-stage-page active" aria-label={desk.stageTabs.props}>
                <div className="studio-prop-grid">
                  {propEntries.length ? propEntries.slice(0, 4).map((entry) => (
                    <div key={entry.key} className="studio-prop-card">
                      <span>{entry.key.slice(0, 1)}</span>
                      <strong>{entry.key}</strong>
                      <small>{entry.value}</small>
                    </div>
                  )) : <div className="studio-empty-note">{desk.stageEmpty}</div>}
                </div>
                <aside className="studio-stage-detail-panel">
                  <h3>{desk.stageTabs.props}</h3>
                  <div className="studio-script-asset-grid">
                    {entryCards(propEntries, desk.stageEmpty)}
                  </div>
                </aside>
              </section>
            ) : null}
          </div>

          <button
            type="button"
            className="studio-primary-action"
            onClick={hasActiveDraft ? openStageWorkspace : onCreateDraft}
          >
            {hasActiveDraft ? desk.continueScript : desk.createDraft}
          </button>
        </article>

        <article
          className={cx('studio-workspace-card studio-assets-card studio-quick-workspace-card', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'asset' && 'studio-preview-active')}
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
            <span className="studio-card-pill">{desk.assetCount(model.stats.assetCount)}</span>
          </div>
          <div className="studio-avatar-stack" aria-hidden="true">
            {model.worldBible.actors.slice(0, 3).map((entry) => (
              <span key={entry.key}>{entry.key.slice(0, 2)}</span>
            ))}
            {model.stats.assetCount > 3 ? <span>{desk.avatarOverflow(model.stats.assetCount - 3)}</span> : null}
          </div>
        </article>

        <article className={cx('studio-workspace-card studio-map-card studio-quick-workspace-card', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'map' && 'studio-preview-active')}>
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.cartographer}</div>
              <h2>{desk.cartographer}</h2>
            </div>
            <span className="studio-card-pill">{`${entryCount(model, 'map')} ${desk.stats.maps}`}</span>
          </div>
          <button type="button" className="studio-map-thumbnail-button" disabled={!hasActiveDraft} onClick={() => onOpenWorkspace('map')}>
            <span className="studio-map-thumbnail" aria-hidden="true">
              {Array.from({ length: 36 }).map((_, index) => (
                <span key={index} className={(index + mapSeed) % 7 === 0 ? 'studio-map-tile-accent' : undefined} />
              ))}
            </span>
          </button>
        </article>
      </div>

      <section className="studio-pulse" aria-label={desk.projectPulse}>
        <div className="studio-pulse-head">
          <span>{desk.recentChanges}</span>
          <span>{desk.sortByTime}</span>
        </div>
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
