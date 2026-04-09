import type { CSSProperties } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { cx } from '../../../lib/cx'
import { useLauncherImage } from '../../../lib/launcher/imageLoader'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'

type LauncherModCardProps = {
  title: string
  author: string | null
  imageUrl: string | null
  enabled?: boolean
  onSelect?: () => void
  onViewDetails?: () => void
  viewDetailsLabel?: string
  packName?: string | null
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function LauncherModCard({
  title,
  author,
  imageUrl,
  enabled = true,
  onSelect,
  onViewDetails,
  viewDetailsLabel,
  packName,
  draggable,
  onDragStart,
  onDragEnd,
}: LauncherModCardProps) {
  const copy = useEditorCopy()
  const cover = useLauncherImage(imageUrl)
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
      className={cx('panel-list-card panel-list-card-interactive launcher-mod-card', !enabled && 'launcher-mod-card-disabled')}
    >
      <div className="launcher-mod-card-stack">
        <button type="button" className="launcher-mod-card-main" onClick={onSelect}>
          <div className="launcher-mod-card-cover" style={coverStyle}>
            <span className="launcher-mod-card-cover-meta">
              {packName ? <span className="dock-chip">{packName}</span> : null}
            </span>
            <span className="launcher-mod-card-cover-aura" aria-hidden="true" />
            {cover.imageUrl ? <img src={cover.imageUrl} alt="" className="launcher-mod-card-cover-image" /> : null}
            {!cover.imageUrl ? (
              <span className="launcher-mod-card-cover-fallback">
                <span className="launcher-mod-card-cover-word">{coverWord}</span>
              </span>
            ) : null}
            <span className="launcher-mod-card-cover-noise" aria-hidden="true" />
            <span className="launcher-mod-card-cover-gradient" aria-hidden="true" />
          </div>

          <div className="launcher-mod-card-copy">
            <p className="launcher-mod-card-title">{title}</p>
            <p className="launcher-mod-card-meta">{author ?? copy.common.none}</p>
          </div>
        </button>
      </div>
    </article>
  )

  if (!onViewDetails) {
    return card
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item" onSelect={onViewDetails}>
            {viewDetailsLabel ?? copy.launcher.library.detailsTitle}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
