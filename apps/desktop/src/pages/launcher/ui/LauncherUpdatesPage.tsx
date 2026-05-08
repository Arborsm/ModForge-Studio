import { ChevronDown, ChevronUp, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useEditorCopy, useLocale, useSettingsMenuCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import {
  loadLauncherRemoteModDetail,
  loadLauncherUpdateChangelog,
  openLauncherUrl,
  type LauncherRemoteModDetail,
  type LauncherUpdateChangelogResult,
} from '@platform/desktop'
import { useLauncherImage } from '@features/launcher'
import { useLauncherUpdates } from '@features/launcher'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '@features/launcher'
import { getLauncherCardMonogram, LauncherBlockedState, LauncherStateBlock } from '@features/launcher'

type LauncherUpdatesPageProps = {
  settings: LauncherSettingsDraft
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function getUpdateKey(modId: number, absolutePath: string) {
  return `${modId}:${absolutePath}`
}

function getUpdateRequestNotificationId(kind: 'detail' | 'changelog', key: string) {
  return `launcher-update-request:${kind}:${key}`
}

function formatVersionLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return 'v?'
  }

  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
}

function formatFileSize(bytes: number | null | undefined, fallback: string) {
  if (!bytes || bytes <= 0) {
    return fallback
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let current = bytes
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  const precision = current >= 100 || unitIndex === 0 ? 0 : 1
  return `${current.toFixed(precision)} ${units[unitIndex]}`
}

function formatRelativeUpdateDate(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const hours = Math.max(1, Math.round(diffMs / 3_600_000))
  const days = Math.max(1, Math.round(diffMs / 86_400_000))

  if (diffMs < 86_400_000) {
    return locale === 'zh-CN' ? `${hours}小时前发布` : `Released ${hours}h ago`
  }

  if (diffMs < 31 * 86_400_000) {
    return locale === 'zh-CN' ? `${days}天前发布` : `Released ${days} days ago`
  }

  return locale === 'zh-CN'
    ? date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      })
    : date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

function getStatusReasonLines(reason: string | null | undefined) {
  return (reason ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function UpdateArtwork({
  title,
  imageUrl,
  className,
}: {
  title: string
  imageUrl: string | null
  className?: string
}) {
  const image = useLauncherImage(imageUrl)
  const monogram = getLauncherCardMonogram(title)

  return (
    <div className={cx('launcher-updates-artwork', className)}>
      {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-updates-artwork-image" /> : null}
      {!image.imageUrl ? <span className="launcher-updates-artwork-fallback">{monogram}</span> : null}
    </div>
  )
}

export function LauncherUpdatesPage({
  settings,
  onQueueDownload,
  onNavigateToSettings,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
}: LauncherUpdatesPageProps) {
  const copy = useEditorCopy().launcher
  const locale = useLocale()
  const settingsMenuCopy = useSettingsMenuCopy()
  const updates = useLauncherUpdates(settings)
  const mountedRef = useRef(true)
  const activeNotificationIdsRef = useRef(new Set<string>())
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [statusDetailsExpanded, setStatusDetailsExpanded] = useState(false)
  const [statusRetryPending, setStatusRetryPending] = useState(false)
  const [detailByKey, setDetailByKey] = useState<Record<string, LauncherRemoteModDetail | null>>({})
  const [detailStateByKey, setDetailStateByKey] = useState<Record<string, LoadState>>({})
  const [detailErrorByKey, setDetailErrorByKey] = useState<Record<string, string | null>>({})
  const [changelogByKey, setChangelogByKey] = useState<Record<string, LauncherUpdateChangelogResult | null>>({})
  const [changelogStateByKey, setChangelogStateByKey] = useState<Record<string, LoadState>>({})
  const [changelogErrorByKey, setChangelogErrorByKey] = useState<Record<string, string | null>>({})

  useEffect(() => {
    mountedRef.current = true
    const activeNotificationIds = activeNotificationIdsRef.current
    return () => {
      mountedRef.current = false
      for (const notificationId of activeNotificationIds) {
        dismissNotification(notificationId)
      }
      activeNotificationIds.clear()
    }
  }, [])

  useEffect(() => {
    setStatusDetailsExpanded(false)
  }, [updates.blockedReason, updates.error])

  const queueItem = (item: (typeof updates.items)[number]) =>
    onQueueDownload({
      modId: item.modId,
      title: item.name,
      imageUrl: item.imageUrl,
      version: item.latestVersion,
      source: 'updates',
    })

  const publishRequestNotification = (id: string, title: string, description: string) => {
    activeNotificationIdsRef.current.add(id)
    publishNotification({
      id,
      level: 'info',
      title,
      description,
      autoDismissMs: null,
      progress: 18,
    })
  }

  const clearRequestNotification = (id: string) => {
    activeNotificationIdsRef.current.delete(id)
    dismissNotification(id)
  }

  const loadExpandedContent = (item: (typeof updates.items)[number]) => {
    setExpandedKey(getUpdateKey(item.modId, item.absolutePath))
  }

  const loadExpandedDetail = (item: (typeof updates.items)[number]) => {
    const key = getUpdateKey(item.modId, item.absolutePath)
    if (detailStateByKey[key] === 'loading' || detailByKey[key]) {
      return
    }

    const notificationId = getUpdateRequestNotificationId('detail', key)
    setDetailStateByKey((current) => ({ ...current, [key]: 'loading' }))
    setDetailErrorByKey((current) => ({ ...current, [key]: null }))
    publishRequestNotification(notificationId, copy.updates.fetchDetailNotice, item.name)

    void loadLauncherRemoteModDetail({ modId: item.modId })
      .then((detail) => {
        clearRequestNotification(notificationId)
        if (!mountedRef.current) {
          return
        }
        setDetailByKey((current) => ({ ...current, [key]: detail }))
        setDetailStateByKey((current) => ({ ...current, [key]: 'ready' }))
      })
      .catch((error) => {
        clearRequestNotification(notificationId)
        if (!mountedRef.current) {
          return
        }
        setDetailStateByKey((current) => ({ ...current, [key]: 'error' }))
        setDetailErrorByKey((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : 'Failed to load launcher remote mod detail.',
        }))
      })
  }

  const loadExpandedChangelog = (item: (typeof updates.items)[number]) => {
    const key = getUpdateKey(item.modId, item.absolutePath)
    if (changelogStateByKey[key] === 'loading' || changelogByKey[key]) {
      return
    }

    const notificationId = getUpdateRequestNotificationId('changelog', key)
    setChangelogStateByKey((current) => ({ ...current, [key]: 'loading' }))
    setChangelogErrorByKey((current) => ({ ...current, [key]: null }))
    publishRequestNotification(notificationId, copy.updates.fetchChangelogNotice, item.name)

    void loadLauncherUpdateChangelog({ modId: item.modId })
      .then((result) => {
        clearRequestNotification(notificationId)
        if (!mountedRef.current) {
          return
        }
        setChangelogByKey((current) => ({ ...current, [key]: result }))
        setChangelogStateByKey((current) => ({ ...current, [key]: 'ready' }))
      })
      .catch((error) => {
        clearRequestNotification(notificationId)
        if (!mountedRef.current) {
          return
        }
        setChangelogStateByKey((current) => ({ ...current, [key]: 'error' }))
        setChangelogErrorByKey((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : 'Failed to load launcher update changelog.',
        }))
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
  const consoleSubtitle =
    !updatesBlocked && !updatesCheckFailed && updates.items.length
      ? copy.updates.selectionSummary(updates.selectedCount, updates.items.length)
      : copy.updates.subtitle
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
      <LoadingMotionReveal itemId="launcher-updates-console" index={0} className="launcher-updates-console panel-surface">
      <header>
        <div className="launcher-updates-console-copy">
          <div className="launcher-updates-console-title-row">
            <h1 className="launcher-updates-console-title">{copy.updates.title}</h1>
            {!updatesBlocked && !updatesCheckFailed && updates.items.length ? (
              <span className="launcher-updates-console-count">{copy.updates.availableCount(updates.items.length)}</span>
            ) : null}
          </div>
          <p className="launcher-updates-console-subtitle">{consoleSubtitle}</p>
        </div>
        {!updatesBlocked && !updatesCheckFailed ? (
          <div className="launcher-updates-console-actions">
            <button type="button" className="control-button" onClick={() => void updates.refresh()}>
              <RefreshCw className="h-4 w-4" />
              <span>{copy.updates.recheck}</span>
            </button>
            <button
              type="button"
              className="control-button"
              onClick={updates.allSelected ? updates.clearSelection : updates.selectAll}
              disabled={!updates.items.length}
            >
              <span>{copy.updates.toggleSelection(updates.allSelected)}</span>
            </button>
            <button
              type="button"
              className="control-button control-button-primary launcher-updates-console-primary"
              disabled={!updates.hasSelection}
              onClick={() => {
                updates.selectedItems.forEach(queueItem)
              }}
            >
              <Download className="h-4 w-4" />
              <span>{copy.updates.updateSelected}</span>
            </button>
          </div>
        ) : null}
      </header>
      </LoadingMotionReveal>

      <LoadingMotionReveal itemId="launcher-updates-content" index={1} className={cx('launcher-updates-shell panel-surface', stateCardVisible && 'launcher-updates-shell-state')}>
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
              detailsExpanded={statusDetailsExpanded}
              detailsToggleLabel={
                statusDetailsExpanded ? copy.updates.detailsCollapseAction : copy.updates.detailsExpandAction
              }
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
              const isExpanded = expandedKey === key
              const detail = detailByKey[key] ?? null
              const detailState = detailStateByKey[key] ?? 'idle'
              const detailError = detailErrorByKey[key] ?? null
              const changelog = changelogByKey[key] ?? null
              const changelogState = changelogStateByKey[key] ?? 'idle'
              const changelogError = changelogErrorByKey[key] ?? null
              const detailDate = formatRelativeUpdateDate(
                detail?.updatedAt ?? item.updatedAt ?? null,
                locale,
                copy.updates.releaseUnknown,
              )
              const detailSize = formatFileSize(detail?.fileSize ?? item.fileSize ?? null, copy.updates.sizeUnknown)

              return (
              <LoadingMotionRevealItem
                  key={key}
                  index={index + 2}
                  as="article"
                  className={cx('launcher-updates-item', isExpanded && 'launcher-updates-item-expanded')}
                >
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
                      <button
                        type="button"
                        className="launcher-updates-inline-action"
                        aria-expanded={isExpanded ? 'true' : 'false'}
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedKey(null)
                            return
                          }
                          loadExpandedContent(item)
                        }}
                      >
                        <span>{copy.updates.expandDetails}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button type="button" className="control-button" onClick={() => queueItem(item)}>
                        {copy.updates.updateOne}
                      </button>
                    </div>
                  </div>

                  <div className={cx('launcher-updates-expander', isExpanded && 'launcher-updates-expander-open')}>
                    <div className="launcher-updates-expander-inner">
                      {isExpanded ? (
                        <div className="launcher-updates-detail">
                          <UpdateArtwork
                            title={detail?.title ?? item.name}
                            imageUrl={detail?.galleryImages[0] ?? detail?.imageUrl ?? item.imageUrl}
                            className="launcher-updates-detail-artwork"
                          />

                          <div className="launcher-updates-detail-copy">
                            <div className="launcher-updates-detail-section">
                              <p className="launcher-updates-detail-heading">{copy.updates.overviewTitle}</p>
                              <div className="launcher-updates-detail-body">
                                {detailState === 'loading' ? <p>{copy.updates.detailsLoading}</p> : null}
                                {detailState !== 'loading' && detail?.summary ? <p>{detail.summary}</p> : null}
                                {detailState === 'error' ? (
                                  <p className="launcher-updates-detail-error">{detailError ?? copy.updates.detailsEmpty}</p>
                                ) : null}
                                {(detailState === 'idle' || (detailState === 'ready' && !detail?.summary)) && (
                                  <p>{copy.updates.detailsEmpty}</p>
                                )}
                              </div>
                              <div className="launcher-updates-detail-meta">
                                <p>
                                  <span>{copy.updates.releaseLabel}</span>
                                  <strong>{detailDate}</strong>
                                </p>
                                <p>
                                  <span>{copy.updates.sizeLabel}</span>
                                  <strong>{detailSize}</strong>
                                </p>
                              </div>
                            </div>

                            <div className="launcher-updates-detail-section">
                              <p className="launcher-updates-detail-heading">
                                {copy.updates.changelogTitle(changelog?.version ?? item.latestVersion)}
                              </p>
                              <div className="launcher-updates-detail-body">
                                {changelogState === 'loading' ? <p>{copy.updates.changelogLoading}</p> : null}
                                {changelogState !== 'loading' && changelog?.changelog ? (
                                  <p className="launcher-updates-detail-changelog">{changelog.changelog}</p>
                                ) : null}
                                {changelogState === 'error' ? (
                                  <p className="launcher-updates-detail-error">{changelogError ?? copy.updates.changelogEmpty}</p>
                                ) : null}
                                {changelogState === 'ready' && !changelog?.changelog ? <p>{copy.updates.changelogEmpty}</p> : null}
                              </div>
                            </div>
                          </div>

                          <div className="launcher-updates-detail-links">
                            <button
                              type="button"
                              className="control-button"
                              disabled={detailState === 'loading'}
                              onClick={() => {
                                loadExpandedDetail(item)
                              }}
                            >
                              <span>{copy.updates.fetchDetails}</span>
                            </button>
                            <button
                              type="button"
                              className="control-button"
                              disabled={changelogState === 'loading'}
                              onClick={() => {
                                loadExpandedChangelog(item)
                              }}
                            >
                              <span>{copy.updates.fetchChangelog}</span>
                            </button>
                            <button
                              type="button"
                              className="control-button"
                              onClick={() => {
                                void openLauncherUrl({ url: detail?.modUrl ?? item.modUrl })
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>{copy.updates.openHomepage}</span>
                            </button>
                            <button
                              type="button"
                              className="control-button"
                              onClick={() => {
                                void openLauncherUrl({ url: `${detail?.modUrl ?? item.modUrl}?tab=posts` })
                              }}
                            >
                              <span>{copy.updates.openComments}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </LoadingMotionRevealItem>
              )
            })}
          </div>
        ) : null}
      </div>
      </LoadingMotionReveal>
    </section>
  )
}
