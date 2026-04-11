import { ChevronDown, ChevronUp, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy, useLocale, useSettingsMenuCopy } from '../../../lib/app/localeContext'
import { cx } from '../../../lib/cx'
import {
  loadLauncherRemoteModDetail,
  loadLauncherUpdateChangelog,
  openLauncherUrl,
  type LauncherRemoteModDetail,
  type LauncherUpdateChangelogResult,
} from '../../../lib/desktop'
import { useLauncherImage } from '../../../lib/launcher/imageLoader'
import { useLauncherUpdates } from '../../../lib/launcher/useLauncherUpdates'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '../../../lib/launcher/types'
import { getLauncherCardMonogram } from '../cards/launcherCardPresentation'
import { LauncherStateBlock } from '../shared/LauncherStateBlock'

type LauncherUpdatesPageProps = {
  settings: LauncherSettingsDraft
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

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
}: LauncherUpdatesPageProps) {
  const copy = useEditorCopy().launcher
  const locale = useLocale()
  const settingsMenuCopy = useSettingsMenuCopy()
  const updates = useLauncherUpdates(settings)
  const mountedRef = useRef(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [detailByKey, setDetailByKey] = useState<Record<string, LauncherRemoteModDetail | null>>({})
  const [detailStateByKey, setDetailStateByKey] = useState<Record<string, LoadState>>({})
  const [detailErrorByKey, setDetailErrorByKey] = useState<Record<string, string | null>>({})
  const [changelogByKey, setChangelogByKey] = useState<Record<string, LauncherUpdateChangelogResult | null>>({})
  const [changelogStateByKey, setChangelogStateByKey] = useState<Record<string, LoadState>>({})
  const [changelogErrorByKey, setChangelogErrorByKey] = useState<Record<string, string | null>>({})

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const queueItem = (item: (typeof updates.items)[number]) =>
    onQueueDownload({
      modId: item.modId,
      title: item.name,
      imageUrl: item.imageUrl,
      version: item.latestVersion,
      source: 'updates',
    })

  const expandedItem = useMemo(
    () => updates.items.find((item) => getUpdateKey(item.modId, item.absolutePath) === expandedKey) ?? null,
    [expandedKey, updates.items],
  )

  const loadExpandedContent = async (item: (typeof updates.items)[number]) => {
    const key = getUpdateKey(item.modId, item.absolutePath)
    setExpandedKey(key)

    if (detailStateByKey[key] !== 'loading' && !detailByKey[key]) {
      setDetailStateByKey((current) => ({ ...current, [key]: 'loading' }))
      setDetailErrorByKey((current) => ({ ...current, [key]: null }))
      void loadLauncherRemoteModDetail({ modId: item.modId })
        .then((detail) => {
          if (!mountedRef.current) {
            return
          }
          setDetailByKey((current) => ({ ...current, [key]: detail }))
          setDetailStateByKey((current) => ({ ...current, [key]: 'ready' }))
        })
        .catch((error) => {
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

    if (changelogStateByKey[key] !== 'loading' && !changelogByKey[key]) {
      setChangelogStateByKey((current) => ({ ...current, [key]: 'loading' }))
      setChangelogErrorByKey((current) => ({ ...current, [key]: null }))
      void loadLauncherUpdateChangelog({ modId: item.modId })
        .then((result) => {
          if (!mountedRef.current) {
            return
          }
          setChangelogByKey((current) => ({ ...current, [key]: result }))
          setChangelogStateByKey((current) => ({ ...current, [key]: 'ready' }))
        })
        .catch((error) => {
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
  }

  const detail = expandedItem ? detailByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? null : null
  const detailState = expandedItem ? detailStateByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? 'idle' : 'idle'
  const detailError = expandedItem ? detailErrorByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? null : null
  const changelog = expandedItem
    ? changelogByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? null
    : null
  const changelogState = expandedItem
    ? changelogStateByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? 'idle'
    : 'idle'
  const changelogError = expandedItem
    ? changelogErrorByKey[getUpdateKey(expandedItem.modId, expandedItem.absolutePath)] ?? null
    : null

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

  if (updates.state === 'error') {
    return <LauncherStateBlock title={copy.updates.title} detail={updates.error ?? copy.updates.empty} tone="warning" />
  }

  if (!updates.items.length && updates.state !== 'loading') {
    return <LauncherStateBlock title={copy.updates.empty} detail={copy.updates.subtitle} />
  }

  return (
    <section className="launcher-updates-page">
      <header className="launcher-updates-console panel-surface">
        <div className="launcher-updates-console-copy">
          <div className="launcher-updates-console-title-row">
            <h1 className="launcher-updates-console-title">{copy.updates.title}</h1>
            <span className="launcher-updates-console-count">{copy.updates.availableCount(updates.items.length)}</span>
          </div>
          <p className="launcher-updates-console-subtitle">{copy.updates.selectionSummary(updates.selectedCount, updates.items.length)}</p>
        </div>
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
      </header>

      <div className="launcher-updates-shell panel-surface">
        <div className="launcher-updates-list" aria-busy={updates.state === 'loading' ? 'true' : undefined}>
          {updates.items.map((item) => {
            const key = getUpdateKey(item.modId, item.absolutePath)
            const isExpanded = expandedKey === key
            const changelogLoaded = Boolean(changelogByKey[key])
            const rowDate = formatRelativeUpdateDate(item.updatedAt ?? null, locale, copy.updates.releaseUnknown)
            const rowSize = formatFileSize(item.fileSize ?? null, copy.updates.sizeUnknown)

            return (
              <article key={key} className={cx('launcher-updates-item', isExpanded && 'launcher-updates-item-expanded')}>
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

                  <div className="launcher-updates-row-meta">
                    <span>{rowDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{rowSize}</span>
                  </div>

                  <div className="launcher-updates-row-actions">
                    <button
                      type="button"
                      className="launcher-updates-inline-action"
                      aria-expanded={isExpanded ? 'true' : 'false'}
                      onClick={() => {
                        if (isExpanded && changelogLoaded) {
                          setExpandedKey(null)
                          return
                        }
                        void loadExpandedContent(item)
                      }}
                    >
                      <span>{copy.updates.viewChangelog}</span>
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
                            {changelogState === 'ready' && !changelog?.changelog ? (
                              <p>{copy.updates.changelogEmpty}</p>
                            ) : null}
                            {detailState === 'error' && detailError ? (
                              <p className="launcher-updates-detail-error">{detailError}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="launcher-updates-detail-links">
                          <button
                            type="button"
                            className="control-button"
                            onClick={() => {
                              void openLauncherUrl({ url: item.modUrl })
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span>{copy.updates.openHomepage}</span>
                          </button>
                          <button
                            type="button"
                            className="control-button"
                            onClick={() => {
                              void openLauncherUrl({ url: `${item.modUrl}?tab=posts` })
                            }}
                          >
                            <span>{copy.updates.openComments}</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
