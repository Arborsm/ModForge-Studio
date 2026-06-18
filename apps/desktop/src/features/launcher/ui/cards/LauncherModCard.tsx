import { memo, useCallback, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowUp, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'

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
  imageModKey?: string | null
  enabled?: boolean
  onSelect?: () => void
  onOpenDetails?: () => void
  onOpenDirectTarget?: () => void
  contextActions?: LauncherModCardAction[]
  getContextActions?: () => LauncherModCardAction[] | undefined
  dragging?: boolean
  childCount?: number
  childCountLabel?: string
  expanded?: boolean
  expandLabel?: string
  collapseLabel?: string
  onToggleExpanded?: (event: MouseEvent<HTMLElement>) => void
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
  imageModKey = null,
  enabled = true,
  onSelect,
  onOpenDetails,
  onOpenDirectTarget,
  contextActions,
  getContextActions,
  dragging = false,
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
  const [resolvedContextActions, setResolvedContextActions] = useState<LauncherModCardAction[] | null>(null)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

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

    onOpenDetails?.()
  }

  const handleOpenDirectTargetDoubleClick = () => {
    onOpenDirectTarget?.()
  }
  const resolveContextActions = useCallback(() => getContextActions?.() ?? contextActions ?? [], [contextActions, getContextActions])
  const handleContextMenuCapture = useCallback(() => {
    if (!getContextActions && !contextActions?.length) {
      return
    }
    setResolvedContextActions(resolveContextActions())
  }, [contextActions?.length, getContextActions, resolveContextActions])
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      setResolvedContextActions(open ? resolveContextActions() : null)
    },
    [resolveContextActions],
  )

  const card = (
    <article
      aria-label={title}
      onClick={selectionMode ? onSelect : undefined}
      onContextMenuCapture={handleContextMenuCapture}
      className={cx(
        'panel-list-card panel-list-card-interactive launcher-mod-card',
        !enabled && 'launcher-mod-card-disabled',
        dragging && 'launcher-mod-card-dragging',
        selectionMode && 'launcher-mod-card-selection-mode',
        selectionMode && selected && 'launcher-mod-card-selected',
        selectionMode && !selected && 'launcher-mod-card-unselected',
        childCount > 0 && onToggleExpanded && 'launcher-mod-card-has-modules',
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
            {onToggleExpanded ? (
              <button
                type="button"
                className="launcher-mod-card-child-count"
                aria-label={expanded ? collapseLabel : expandLabel}
                aria-expanded={expanded}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onToggleExpanded(event)
                }}
              >
                <span className="launcher-mod-card-child-count-label">{childCountLabel ?? String(childCount)}</span>
                {expanded ? (
                  <ChevronUp className="launcher-mod-card-child-count-icon" aria-hidden="true" />
                ) : (
                  <ChevronDown className="launcher-mod-card-child-count-icon" aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="launcher-mod-card-child-count">
                <span className="launcher-mod-card-child-count-label">{childCountLabel ?? String(childCount)}</span>
              </span>
            )}
          </div>
        ) : null}

        <button
          type="button"
          className="launcher-mod-card-main"
          onClick={handleSelectClick}
          onDoubleClick={handleOpenDirectTargetDoubleClick}
        >
          <LauncherArtworkCover title={title} imageUrl={imageUrl} imageModKey={imageModKey} coverStyle={coverStyle} coverWord={coverWord} />

          <div className="launcher-mod-card-copy">
            <p className="launcher-mod-card-title">{title}</p>
            {normalizedAuthor || versionLabel ? (
              <p className="launcher-mod-card-meta">
                <span className="launcher-mod-card-author" data-tooltip={normalizedAuthor || undefined}>
                  {normalizedAuthor || copy.common.none}
                </span>
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
                    <span className="launcher-mod-card-version" data-tooltip={versionLabel}>
                      {versionLabel}
                    </span>
                  )
                ) : (
                  <span className="launcher-mod-card-version" data-tooltip={copy.common.none}>
                    {copy.common.none}
                  </span>
                )}
              </p>
            ) : (
              <p className="launcher-mod-card-meta">{meta || copy.common.none}</p>
            )}
          </div>
        </button>
      </div>
    </article>
  )

  if (!getContextActions && !contextActions?.length) {
    return card
  }

  const menuActions = resolvedContextActions ?? (getContextActions ? [] : (contextActions ?? []))

  return (
    <ContextMenu.Root onOpenChange={handleContextMenuOpenChange}>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      {menuActions.length ? (
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
            {menuActions.map((action) => (
              <LauncherModCardContextMenuItem key={action.label} action={action} />
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  )
}

function LauncherModCardContextMenuItem({ action }: { action: LauncherModCardAction }) {
  const runAction = () => {
    action.onSelect()
  }

  return (
    <ContextMenu.Item className="context-menu-item" onSelect={runAction}>
      {action.label}
    </ContextMenu.Item>
  )
}

export const LauncherModCard = memo(LauncherModCardContent)
