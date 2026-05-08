import type { CSSProperties, DragEvent } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Check } from 'lucide-react'
import { useEditorCopy } from '@locales/localeContext'
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
  imageUrl: string | null
  enabled?: boolean
  onSelect?: () => void
  contextActions?: LauncherModCardAction[]
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
  selectionMode?: boolean
  selected?: boolean
}

export function LauncherModCard({
  title,
  titleTooltip,
  meta,
  imageUrl,
  enabled = true,
  onSelect,
  contextActions,
  draggable,
  onDragStart,
  onDragEnd,
  selectionMode = false,
  selected = false,
}: LauncherModCardProps) {
  const copy = useEditorCopy()
  const fallbackPalette = getLauncherCardFallbackPalette(title)
  const coverWord = getLauncherCardCoverWord(title)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  const card = (
    <article
      aria-label={title}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={selectionMode ? onSelect : undefined}
      className={cx(
        'panel-list-card panel-list-card-interactive launcher-mod-card',
        !enabled && 'launcher-mod-card-disabled',
        selectionMode && 'launcher-mod-card-selection-mode',
        selectionMode && selected && 'launcher-mod-card-selected',
        selectionMode && !selected && 'launcher-mod-card-unselected',
      )}
    >
      <div className="launcher-mod-card-stack">
        {selectionMode ? (
          <span className={cx('launcher-mod-card-selection-toggle', selected && 'launcher-mod-card-selection-toggle-active')} aria-hidden="true">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}

        <button type="button" className="launcher-mod-card-main" onClick={onSelect} title={titleTooltip ?? title}>
          <LauncherArtworkCover title={title} imageUrl={imageUrl} coverStyle={coverStyle} coverWord={coverWord} />

          <div className="launcher-mod-card-copy">
            <p className="launcher-mod-card-title" title={titleTooltip ?? title}>
              {title}
            </p>
            <p className="launcher-mod-card-meta">{meta || copy.common.none}</p>
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
