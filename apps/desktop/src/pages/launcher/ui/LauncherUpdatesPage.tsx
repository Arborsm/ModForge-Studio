import { CheckSquare, Download, ExternalLink, RefreshCw, Square } from 'lucide-react'
import { useState } from 'react'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { openLauncherPath } from '@features/launcher/api'
import { useLauncherImage } from '@features/launcher'
import { useLauncherUpdates } from '@features/launcher'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'
import type { LauncherDetailMod } from '@features/launcher/ui/cards/dependency-tree/dependencyTreeTypes'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '@features/launcher'
import { getLauncherCardMonogram, LauncherBlockedState, LauncherStateBlock } from '@features/launcher'

type LauncherUpdatesPageProps = {
  settings: LauncherSettingsDraft
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onQueueDownloads?: (inputs: QueueLauncherDownloadInput[]) => void
  onNavigateToSettings?: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
}

function getUpdateKey(modId: number, absolutePath: string) {
  return `${modId}:${absolutePath}`
}

function formatVersionLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return 'v?'
  }

  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
}

function getStatusReasonLines(reason: string | null | undefined) {
  return (reason ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function UpdateArtwork({ title, imageUrl, className }: { title: string; imageUrl: string | null; className?: string }) {
  const image = useLauncherImage(imageUrl)
  const monogram = getLauncherCardMonogram(title)

  return (
    <div className={cx('launcher-updates-artwork', className)} aria-busy={image.loading ? 'true' : undefined}>
      {image.loading ? <ImageSkeleton overlay rounded={false} className="launcher-updates-artwork-skeleton" /> : null}
      {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-updates-artwork-image" /> : null}
      {!image.imageUrl && !image.loading ? <span className="launcher-updates-artwork-fallback">{monogram}</span> : null}
    </div>
  )
}

export function LauncherUpdatesPage({
  settings,
  onQueueDownload,
  onQueueDownloads,
  onNavigateToSettings,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
}: LauncherUpdatesPageProps) {
  const copy = useEditorCopy().launcher
  const settingsMenuCopy = useSettingsMenuCopy()
  const updates = useLauncherUpdates(settings)
  const [detailMod, setDetailMod] = useState<LauncherDetailMod | null>(null)
  const [statusDetailsExpanded, setStatusDetailsExpanded] = useState(false)
  const [statusRetryPending, setStatusRetryPending] = useState(false)

  const queueItem = (item: (typeof updates.items)[number]) =>
    onQueueDownload({
      modId: item.modId,
      title: item.name,
      imageUrl: item.imageUrl,
      version: item.latestVersion,
      source: 'updates',
    })
  const queueItems = (items: (typeof updates.items)[number][]) => {
    const inputs = items.map((item) => ({
      modId: item.modId,
      title: item.name,
      imageUrl: item.imageUrl,
      version: item.latestVersion,
      source: 'updates' as const,
    }))

    if (onQueueDownloads) {
      onQueueDownloads(inputs)
      return
    }

    inputs.forEach(onQueueDownload)
  }

  const openDetail = (item: (typeof updates.items)[number]) => {
    setDetailMod({
      id: String(item.modId),
      labelKey: String(item.modId),
      name: item.name,
      author: item.author ?? null,
      version: item.currentVersion,
      description: null,
      uniqueId: null,
      folderName: item.absolutePath.split(/[/\\]/).pop() ?? '',
      absolutePath: item.absolutePath,
      enabled: true,
      nexusModId: item.modId,
      updateKeys: [],
      modUrl: item.modUrl,
      imageUrl: item.imageUrl,
      dependencies: [],
      requiredDependencies: [],
      missingRequiredDependencies: [],
    })
  }

  if (!settings.modsPath) {
    return (
      <LauncherStateBlock
        title={copy.states.missingModsPath}
        detail={copy.updates.subtitle}
        tone="warning"
        action={
          onNavigateToSettings ? (
            <button type="button" className="control-button control-button-primary" onClick={onNavigateToSettings}>
              {settingsMenuCopy.title}
            </button>
          ) : null
        }
      />
    )
  }

  const updatesBlocked = Boolean(updates.blockedReason && !updates.items.length && updates.state !== 'loading')
  const updatesCheckFailed = updates.state === 'error'
  const emptyState = !updates.items.length && updates.state !== 'loading' && !updatesBlocked && !updatesCheckFailed
  const stateCardVisible = updatesBlocked || updatesCheckFailed || emptyState
  const blockedReasonLines = getStatusReasonLines(updates.blockedReason)
  const blockedIssueSummary = blockedReasonLines[0] ?? null
  const blockedReasonText = blockedReasonLines.join('\n')
  const effectiveStatusDetailsExpanded = updatesBlocked ? statusDetailsExpanded : false
  const handleStatusRetry = async () => {
    if (statusRetryPending) {
      return
    }

    setStatusRetryPending(true)
    try {
      await onRetryDiagnostics?.()
    } catch {
      // The follow-up updates revalidation will surface the latest failure reason.
    } finally {
      await updates.revalidate()
      setStatusRetryPending(false)
    }
  }

  return (
    <section className="launcher-updates-page">
      <LoadingMotionReveal itemId="launcher-updates-console" index={0} className="launcher-updates-console">
        <header className="launcher-updates-console-top">
          <div className="launcher-updates-console-heading">
            <div className="launcher-updates-console-copy">
              <div className="launcher-updates-console-title-row">
                <h1 className="launcher-updates-console-title">{copy.updates.title}</h1>
                {!updatesBlocked && !updatesCheckFailed && updates.items.length ? (
                  <span className="launcher-updates-console-count">{copy.updates.availableCount(updates.items.length)}</span>
                ) : null}
              </div>
            </div>
          </div>
          {!updatesBlocked && !updatesCheckFailed ? (
            <div className="launcher-updates-console-actions">
              <button
                type="button"
                className="launcher-updates-icon-button"
                aria-label={copy.updates.recheck}
                title={copy.updates.recheck}
                onClick={() => void updates.refresh()}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="launcher-updates-icon-button"
                aria-label={copy.updates.toggleSelection(updates.allSelected)}
                title={copy.updates.toggleSelection(updates.allSelected)}
                onClick={updates.allSelected ? updates.clearSelection : updates.selectAll}
                disabled={!updates.items.length}
              >
                {updates.allSelected ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              </button>
              <span className="launcher-updates-toolbar-divider" aria-hidden="true" />
              <button
                type="button"
                className="control-button control-button-primary launcher-updates-primary-action"
                disabled={!updates.hasSelection}
                onClick={() => {
                  queueItems(updates.selectedItems)
                }}
              >
                <Download className="h-4 w-4" />
                <span>{copy.updates.updateSelected}</span>
              </button>
            </div>
          ) : null}
        </header>
      </LoadingMotionReveal>

      <LoadingMotionReveal
        itemId="launcher-updates-content"
        index={1}
        className={cx('launcher-updates-shell panel-surface', stateCardVisible && 'launcher-updates-shell-state')}
      >
        <div>
          {updatesBlocked ? (
            <div className="launcher-updates-content launcher-updates-content-blocked">
              <LauncherBlockedState
                className="launcher-updates-blocked-state"
                eyebrow={copy.updates.title}
                title={copy.updates.blockedTitle}
                detail={copy.updates.blockedDetail}
                issueLabel={copy.updates.issueLabel}
                issueSummary={blockedIssueSummary}
                detailsText={blockedReasonText}
                detailsExpanded={effectiveStatusDetailsExpanded}
                detailsToggleLabel={effectiveStatusDetailsExpanded ? copy.updates.detailsCollapseAction : copy.updates.detailsExpandAction}
                copyLabel={copy.updates.copyLogsAction}
                onToggleDetails={() => setStatusDetailsExpanded((current) => !current)}
                onCopyDetails={() => {
                  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
                    return
                  }

                  void navigator.clipboard.writeText(blockedReasonText)
                }}
                illustrationAccent={<RefreshCw className="h-4 w-4" />}
                primaryAction={
                  <button
                    type="button"
                    className="control-button control-button-primary"
                    onClick={() => void handleStatusRetry()}
                    disabled={statusRetryPending}
                    aria-busy={statusRetryPending ? 'true' : undefined}
                  >
                    <RefreshCw className={cx('h-4 w-4', statusRetryPending && 'animate-spin')} />
                    <span>{copy.updates.recheck}</span>
                  </button>
                }
                secondaryAction={
                  onNavigateToDiagnostics ? (
                    <button type="button" className="control-button" onClick={onNavigateToDiagnostics}>
                      <ExternalLink className="h-4 w-4" />
                      <span>{copy.updates.diagnosticsAction}</span>
                    </button>
                  ) : null
                }
              />
            </div>
          ) : null}

          {updatesCheckFailed ? (
            <div className="launcher-updates-content launcher-updates-content-error">
              <LauncherBlockedState
                className="launcher-updates-blocked-state"
                eyebrow={copy.updates.title}
                title={copy.updates.checkFailedTitle}
                detail={copy.updates.checkFailedDetail}
                issueLabel={copy.updates.issueLabel}
                issueSummary={null}
                detailsText={null}
                detailsExpanded={false}
                detailsToggleLabel={null}
                copyLabel={null}
                onToggleDetails={null}
                onCopyDetails={null}
                illustrationAccent={<RefreshCw className="h-4 w-4" />}
                tone="error"
                primaryAction={
                  <button
                    type="button"
                    className="control-button control-button-primary"
                    onClick={() => void handleStatusRetry()}
                    disabled={statusRetryPending}
                    aria-busy={statusRetryPending ? 'true' : undefined}
                  >
                    <RefreshCw className={cx('h-4 w-4', statusRetryPending && 'animate-spin')} />
                    <span>{copy.updates.recheck}</span>
                  </button>
                }
                secondaryAction={
                  onNavigateToDiagnostics ? (
                    <button type="button" className="control-button" onClick={onNavigateToDiagnostics}>
                      <ExternalLink className="h-4 w-4" />
                      <span>{copy.updates.diagnosticsAction}</span>
                    </button>
                  ) : null
                }
              />
            </div>
          ) : null}

          {emptyState ? (
            <div className="launcher-updates-content launcher-updates-content-empty">
              <LauncherStateBlock title={copy.updates.empty} detail={copy.updates.subtitle} />
            </div>
          ) : null}

          {!stateCardVisible ? (
            <div className="launcher-updates-list" aria-busy={updates.state === 'loading' ? 'true' : undefined}>
              {updates.items.map((item, index) => {
                const key = getUpdateKey(item.modId, item.absolutePath)

                return (
                  <LoadingMotionRevealItem key={key} index={index + 2} as="article" className="launcher-updates-item">
                    <div className="launcher-updates-row">
                      <label className="launcher-updates-row-check">
                        <input
                          type="checkbox"
                          aria-label={item.name}
                          checked={updates.isSelected(item)}
                          onChange={() => updates.toggleSelected(item)}
                        />
                      </label>

                      <UpdateArtwork title={item.name} imageUrl={item.imageUrl} className="launcher-updates-row-artwork" />

                      <div className="launcher-updates-row-copy">
                        <p className="launcher-updates-row-title">{item.name}</p>
                        <p className="launcher-updates-row-author">{item.author?.trim() || `Nexus #${item.modId}`}</p>
                      </div>

                      <div className="launcher-updates-row-version">
                        <span className="launcher-updates-row-version-current">{formatVersionLabel(item.currentVersion)}</span>
                        <span className="launcher-updates-row-version-arrow" aria-hidden="true">
                          →
                        </span>
                        <strong className="launcher-updates-row-version-next">{formatVersionLabel(item.latestVersion)}</strong>
                      </div>

                      <div className="launcher-updates-row-actions">
                        <button type="button" className="launcher-updates-inline-action" onClick={() => openDetail(item)}>
                          <span>{copy.updates.viewDetails}</span>
                        </button>
                        <button type="button" className="control-button" onClick={() => queueItem(item)}>
                          {copy.updates.updateOne}
                        </button>
                      </div>
                    </div>
                  </LoadingMotionRevealItem>
                )
              })}
            </div>
          ) : null}
        </div>
      </LoadingMotionReveal>

      <LauncherModDetailPanel
        open={Boolean(detailMod)}
        onClose={() => setDetailMod(null)}
        mod={detailMod}
        libraryMods={[]}
        remoteFilesDeferred={Boolean(onQueueDownload)}
        onToggleEnabled={() => {}}
        onOpenFolder={() => {
          if (detailMod?.absolutePath) {
            void openLauncherPath({ path: detailMod.absolutePath })
          }
        }}
        onSetCover={() => {}}
        onClearCover={() => {}}
        onQueueDownload={onQueueDownload}
      />
    </section>
  )
}
