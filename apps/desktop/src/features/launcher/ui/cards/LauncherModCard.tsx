import { memo, useEffect, useRef } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowUp, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useEditorCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'

const DETAIL_DOUBLE_CLICK_DELAY_MS = 180

type LauncherModCardAction = {
  label: string
  onSelect: () => void
}

type LauncherModCardProps = {
  title: string
  titleTooltip?: string
  meta: string
  author?: string | null
  version?: string | null
  latestVersion?: string | null
  imageUrl: string | null
  enabled?: boolean
  onSelect?: () => void
  onOpenDetails?: () => void
  onOpenDirectTarget?: () => void
  contextActions?: LauncherModCardAction[]
  dragging?: boolean
  dropTarget?: boolean
  childCount?: number
  childCountLabel?: string
  expanded?: boolean
  expandLabel?: string
  collapseLabel?: string
  onToggleExpanded?: () => void
  selectionMode?: boolean
  selected?: boolean
}

function LauncherModCardContent({
  title,
  meta,
  author,
  version,
  latestVersion,
  imageUrl,
  enabled = true,
  onSelect,
  onOpenDetails,
  onOpenDirectTarget,
  contextActions,
  dragging = false,
  dropTarget = false,
  childCount = 0,
  childCountLabel,
  expanded = false,
  expandLabel,
  collapseLabel,
  onToggleExpanded,
  selectionMode = false,
  selected = false,
}: LauncherModCardProps) {
  const copy = useEditorCopy()
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackPalette = getLauncherCardFallbackPalette(title)
  const coverWord = getLauncherCardCoverWord(title)
  const normalizedAuthor = author?.trim() ?? ''
  const normalizedVersion = version?.trim() ?? ''
  const normalizedLatestVersion = latestVersion?.trim() ?? ''
  const versionLabel = normalizedVersion ? (normalizedVersion.startsWith('v') ? normalizedVersion : `v${normalizedVersion}`) : ''
  const latestVersionLabel = normalizedLatestVersion
    ? normalizedLatestVersion.startsWith('v')
      ? normalizedLatestVersion
      : `v${normalizedLatestVersion}`
    : ''
  const updateTooltip = latestVersionLabel ? copy.launcher.library.updateAvailableTooltip(latestVersionLabel) : null
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
    }
  }, [])

  const handleSelectClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (selectionMode) {
      event.stopPropagation()
      onSelect?.()
      return
    }

    if (onSelect) {
      onSelect()
      return
    }

    if (!onOpenDetails) {
      return
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null
      onOpenDetails()
    }, DETAIL_DOUBLE_CLICK_DELAY_MS)
  }

  const handleOpenDirectTargetDoubleClick = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    onOpenDirectTarget?.()
  }

  const card = (
    <article
      aria-label={title}
      onClick={selectionMode ? onSelect : undefined}
      className={cx(
        'panel-list-card panel-list-card-interactive launcher-mod-card',
        !enabled && 'launcher-mod-card-disabled',
        dragging && 'launcher-mod-card-dragging',
        dropTarget && 'launcher-mod-card-drop-target',
        selectionMode && 'launcher-mod-card-selection-mode',
        selectionMode && selected && 'launcher-mod-card-selected',
        selectionMode && !selected && 'launcher-mod-card-unselected',
      )}
    >
      <div className="launcher-mod-card-stack">
        {selectionMode ? (
          <span
            className={cx('launcher-mod-card-selection-toggle', selected && 'launcher-mod-card-selection-toggle-active')}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}

        {childCount > 0 ? (
          <div className="launcher-mod-card-child-tools">
            <span className="launcher-mod-card-child-count">{childCountLabel ?? String(childCount)}</span>
            {onToggleExpanded ? (
              <button
                type="button"
                className="launcher-mod-card-child-toggle"
                aria-label={expanded ? collapseLabel : expandLabel}
                aria-expanded={expanded}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleExpanded()
                }}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="launcher-mod-card-main"
          onClick={handleSelectClick}
          onDoubleClick={handleOpenDirectTargetDoubleClick}
        >
          <LauncherArtworkCover title={title} imageUrl={imageUrl} coverStyle={coverStyle} coverWord={coverWord} />

          <div className="launcher-mod-card-copy">
            <p className="launcher-mod-card-title">{title}</p>
            {normalizedAuthor || versionLabel ? (
              <p className="launcher-mod-card-meta">
                {normalizedAuthor ? <span className="launcher-mod-card-author">{normalizedAuthor}</span> : null}
                {normalizedAuthor && versionLabel ? <span aria-hidden="true">·</span> : null}
                {versionLabel ? (
                  updateTooltip ? (
                    <span
                      className="launcher-mod-card-version launcher-mod-card-version-update"
                      aria-label={updateTooltip}
                      data-tooltip={updateTooltip}
                    >
                      {versionLabel}
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="launcher-mod-card-version">{versionLabel}</span>
                  )
                ) : null}
              </p>
            ) : (
              <p className="launcher-mod-card-meta">{meta || copy.common.none}</p>
            )}
          </div>
        </button>
      </div>
    </article>
  )

  if (!contextActions?.length) {
    return card
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          {contextActions.map((action) => (
            <ContextMenu.Item key={action.label} className="context-menu-item" onSelect={action.onSelect}>
              {action.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export const LauncherModCard = memo(LauncherModCardContent)
