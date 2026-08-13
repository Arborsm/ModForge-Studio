import { getDialoguePortraitFrame } from '../model/portrait'

/** A loaded portrait sheet: object URL plus its natural pixel dimensions. */
export type DialoguePortraitSheet = {
  url: string | null
  sheetWidth: number
  sheetHeight: number
}

export type DialoguePortraitFrameProps = {
  portrait: DialoguePortraitSheet
  frameIndex: number
  /** Integer pixel scale; 1 renders the sheet at its native 64px frame size. */
  scale: number
  className?: string
}

/** Crops one 64x64 portrait frame out of the sheet at an integer pixel scale. */
export function DialoguePortraitFrame({ portrait, frameIndex, scale, className }: DialoguePortraitFrameProps) {
  if (!portrait.url) {
    return null
  }

  const frame = getDialoguePortraitFrame(portrait.sheetWidth, portrait.sheetHeight, frameIndex)
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        width: frame.frameSize * scale,
        height: frame.frameSize * scale,
        backgroundImage: `url(${portrait.url})`,
        backgroundPosition: `${-frame.frameX * scale}px ${-frame.frameY * scale}px`,
        backgroundSize: `${portrait.sheetWidth * scale}px ${portrait.sheetHeight * scale}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}
