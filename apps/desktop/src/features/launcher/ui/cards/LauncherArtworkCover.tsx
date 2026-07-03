import type { CSSProperties } from 'react'
import { cx } from '@shared/lib/cx'
import { useLauncherImage } from '../../model/imageLoader'

type LauncherArtworkCoverProps = {
  title: string
  imageUrl: string | null
  imageModKey?: string | null
  coverStyle: CSSProperties
  coverWord: string
  className?: string
}

export function LauncherArtworkCover({ title, imageUrl, imageModKey = null, coverStyle, coverWord, className }: LauncherArtworkCoverProps) {
  const cover = useLauncherImage(imageUrl, imageModKey)
  const fallbackWord = coverWord.trim() || title.trim().slice(0, 3).toUpperCase() || 'MOD'

  return (
    <div className={cx('launcher-mod-card-cover', cover.imageUrl && 'launcher-mod-card-cover-has-image', className)} style={coverStyle}>
      <span className="launcher-mod-card-cover-meta" />
      {cover.imageUrl ? (
        <span className="launcher-mod-card-cover-image-blur-strip" aria-hidden="true">
          <img src={cover.imageUrl} alt="" className="launcher-mod-card-cover-image-blur" draggable={false} />
          <img src={cover.imageUrl} alt="" className="launcher-mod-card-cover-image-blur-clone" draggable={false} />
        </span>
      ) : null}
      <span className="launcher-mod-card-cover-aura" aria-hidden="true" />
      {cover.imageUrl ? <img src={cover.imageUrl} alt="" className="launcher-mod-card-cover-image" draggable={false} /> : null}
      {!cover.imageUrl ? (
        <span className="launcher-mod-card-cover-fallback">
          <span className="launcher-mod-card-cover-word">{fallbackWord}</span>
        </span>
      ) : null}
      <span className="launcher-mod-card-cover-noise" aria-hidden="true" />
      <span className="launcher-mod-card-cover-gradient" aria-hidden="true" />
    </div>
  )
}
