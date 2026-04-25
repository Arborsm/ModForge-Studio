import type { KeyboardEvent } from 'react'
import type { EditorCopy } from '../../locales'
import type { StudioDeskInspiration, StudioDeskModel } from '../../lib/app/studioDeskModel'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { cx } from '../../lib/cx'

type StudioDeskMainStageProps = {
  copy: EditorCopy
  model: StudioDeskModel
  previewFocus: StudioDeskInspiration | null
  onCreateDraft: () => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
}

function entryCount(model: StudioDeskModel, workspaceId: WorkspaceId) {
  return model.workspaceEntrypoints.find((entry) => entry.workspaceId === workspaceId)?.patchCount ?? 0
}

function getMapSeed(title: string) {
  return Array.from(title).reduce((total, char) => total + char.charCodeAt(0), 0)
}

function handleWorkspaceCardKeyDown(event: KeyboardEvent<HTMLElement>, callback: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  callback()
}

export function StudioDeskMainStage({
  copy,
  model,
  previewFocus,
  onCreateDraft,
  onOpenWorkspace,
}: StudioDeskMainStageProps) {
  const desk = copy.studioDesk
  const hasActiveDraft = model.hasActiveDraft
  const mapPreview = model.recentInspirations.find((item) => item.kind === 'map')
  const activeMapPreview = previewFocus?.kind === 'map' ? previewFocus : mapPreview
  const previewKind = previewFocus?.kind ?? null
  const mapPreviewTitle = activeMapPreview?.title ?? desk.openWorkspace
  const mapSeed = getMapSeed(mapPreviewTitle)
  const assetCount = entryCount(model, 'characters') + entryCount(model, 'buildings') + entryCount(model, 'items')
  const pulseItems = model.recentInspirations.slice(0, 4)
  const avatarInitials = desk.avatarInitials.slice(0, 3)
  const avatarOverflow = Math.max(0, assetCount - avatarInitials.length)
  const projectDescription = hasActiveDraft
    ? model.projectDescription.trim() || desk.heroSubtitle
    : desk.noActiveDraftSubtitle
  const openAssetWorkspace = () => {
    if (hasActiveDraft) {
      onOpenWorkspace('characters')
    }
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

          <span className="studio-mode-pill">
            <span className="studio-dot" />
            {hasActiveDraft ? desk.creativeMode : desk.createDraft}
          </span>
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
          <span className={model.stats.conflictCount > 0 ? 'studio-stat-alert' : undefined}>
            <strong>{model.stats.conflictCount}</strong> {desk.stats.conflicts}
          </span>
        </div>
      </header>

      <div className="studio-workspace-grid">
        <article className={cx('studio-workspace-card studio-script-card', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'event' && 'studio-preview-active')}>
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.scriptwriter}</div>
              <h2>{desk.scriptwriter}</h2>
            </div>
            <span className="studio-card-pill">{desk.mostActive}</span>
          </div>
          <div className="studio-script-preview">
            <div className="studio-dialogue-line">
              <div className="studio-speaker-row">
                <span className="studio-speaker-avatar">{desk.scriptPreview.firstSpeakerInitial}</span>
                <span className="studio-speaker">{desk.scriptPreview.firstSpeakerName}</span>
              </div>
              <span className="studio-line-text">{desk.scriptPreview.firstLine}</span>
            </div>
            <div className="studio-dialogue-line">
              <div className="studio-speaker-row">
                <span className="studio-speaker-avatar">{desk.scriptPreview.secondSpeakerInitial}</span>
                <span className="studio-speaker">{desk.scriptPreview.secondSpeakerName}</span>
              </div>
              <span className="studio-line-text">{desk.scriptPreview.choicesLine}</span>
            </div>
          </div>
          <button
            type="button"
            className="studio-primary-action"
            onClick={hasActiveDraft ? () => onOpenWorkspace('events') : onCreateDraft}
          >
            {hasActiveDraft ? desk.continueScript : desk.createDraft}
          </button>
        </article>

        <article className={cx('studio-workspace-card studio-map-card', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'map' && 'studio-preview-active')}>
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.cartographer}</div>
              <h2>{desk.cartographer}</h2>
            </div>
            <span className="studio-card-pill">{`${entryCount(model, 'map')} ${desk.stats.maps}`}</span>
          </div>
          <button type="button" className="studio-map-thumbnail-button" disabled={!hasActiveDraft} onClick={() => onOpenWorkspace('map')}>
            <span data-testid="studio-map-preview-title" className="sr-only">{mapPreviewTitle}</span>
            <span className="studio-map-thumbnail" aria-hidden="true">
              {Array.from({ length: 36 }).map((_, index) => (
                <span key={index} className={(index + mapSeed) % 7 === 0 ? 'studio-map-tile-accent' : undefined} />
              ))}
            </span>
          </button>
        </article>

        <article
          className={cx('studio-workspace-card studio-assets-card', !hasActiveDraft && 'studio-workspace-disabled', previewKind === 'asset' && 'studio-preview-active')}
          role="button"
          tabIndex={hasActiveDraft ? 0 : -1}
          aria-disabled={!hasActiveDraft}
          onClick={openAssetWorkspace}
          onKeyDown={(event) => handleWorkspaceCardKeyDown(event, openAssetWorkspace)}
        >
          <div className="studio-card-header">
            <div>
              <div className="studio-card-kicker">{desk.cardKickers.castAndProps}</div>
              <h2>{desk.castAndProps}</h2>
            </div>
            <span className="studio-card-pill">{desk.castCount(assetCount)}</span>
          </div>
          <div className="studio-avatar-stack" aria-hidden="true">
            {avatarInitials.map((initials) => (
              <span key={initials}>{initials}</span>
            ))}
            {avatarOverflow > 0 ? <span>{desk.avatarOverflow(avatarOverflow)}</span> : null}
          </div>
        </article>
      </div>

      <section className="studio-pulse" aria-label={desk.projectPulse}>
        <div className="studio-pulse-head">
          <span>{desk.cardKickers.projectPulse}</span>
          <span>{desk.recentChanges}</span>
        </div>
        <div className="studio-pulse-line">
          {pulseItems.length ? (
            pulseItems.map((item) => (
              <button key={item.patchId} type="button" className="studio-pulse-item" onClick={() => onOpenWorkspace(item.workspaceId)}>
                <strong>{item.title}</strong>
                <span>{item.target || item.action}</span>
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
