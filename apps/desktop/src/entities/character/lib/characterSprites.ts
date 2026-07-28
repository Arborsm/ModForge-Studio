/**
 * Sprite-sheet frame assembly shared by every character surface.
 *
 * Both helpers turn a sheet plus a source rect into background CSS. The scaled
 * variant multiplies every value so a nearest-neighbour frame stays crisp; the
 * absolute variant keeps native pixels for layers that are scaled by an ancestor
 * transform (breathing overlay, portrait tiles).
 */

import type { CSSProperties } from 'react'

export function buildSpriteStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
  scale = 4,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
  scale?: number
}): CSSProperties {
  return {
    width: `${width * scale}px`,
    height: `${height * scale}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX * scale}px -${sourceY * scale}px`,
    backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
    imageRendering: 'pixelated',
  }
}

export function buildAbsoluteSpriteLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX}px -${sourceY}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
  }
}
