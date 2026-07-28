/**
 * Portrait frame math shared by every surface that renders a Stardew portrait
 * sheet (dialogue canvas, event stage, event `speak` cards).
 *
 * Sheets are grids of 64x64 frames laid out row-major; a portrait token
 * (`$h`, `$12`, ...) resolves to a frame index, and the index resolves to a
 * crop rectangle. Both steps live here so no caller re-derives them.
 */

export type DialogueEmotion = 'neutral' | 'h' | 's' | 'u' | 'l' | 'a'

export type DialoguePortrait = { kind: 'none' } | { kind: 'emotion'; emotion: DialogueEmotion } | { kind: 'index'; index: number }

/** Edge length of one portrait frame on a sheet. */
export const DIALOGUE_PORTRAIT_FRAME_SIZE = 64

/** Maps an emotion command to its portrait sheet frame index (vanilla convention). */
export const DIALOGUE_EMOTION_FRAME_INDEX: Record<DialogueEmotion, number> = {
  neutral: 0,
  h: 1,
  s: 2,
  u: 3,
  l: 4,
  a: 5,
}

/** Emotions offered by the structured portrait picker, in vanilla frame order. */
export const DIALOGUE_EMOTIONS: readonly DialogueEmotion[] = ['neutral', 'h', 's', 'u', 'l', 'a']

export type DialoguePortraitFrameBounds = {
  frameSize: number
  frameX: number
  frameY: number
  columns: number
  rows: number
}

/** Parses a trailing portrait command token (`$h`, `$neutral`, `$12`) into a portrait choice. */
export function parsePortraitToken(token: string): DialoguePortrait {
  const normalized = token.replace(/^\$/u, '').toLowerCase()
  if (/^\d+$/u.test(normalized)) {
    return { kind: 'index', index: Number.parseInt(normalized, 10) }
  }
  if (normalized === 'neutral') {
    return { kind: 'emotion', emotion: 'neutral' }
  }
  if (normalized === 'h' || normalized === 's' || normalized === 'u' || normalized === 'l' || normalized === 'a') {
    return { kind: 'emotion', emotion: normalized }
  }
  return { kind: 'none' }
}

/** Returns the canonical command suffix for a portrait choice ('' for none). */
export function buildPortraitToken(portrait: DialoguePortrait): string {
  if (portrait.kind === 'emotion') {
    return portrait.emotion === 'neutral' ? '$neutral' : `$${portrait.emotion}`
  }
  if (portrait.kind === 'index') {
    return `$${Math.max(0, Math.trunc(portrait.index))}`
  }
  return ''
}

/** Resolves the portrait sheet frame index a portrait choice displays (0 when unspecified). */
export function getPortraitFrameIndex(portrait: DialoguePortrait): number {
  if (portrait.kind === 'index') {
    return Math.max(0, portrait.index)
  }
  if (portrait.kind === 'emotion') {
    return DIALOGUE_EMOTION_FRAME_INDEX[portrait.emotion]
  }
  return 0
}

/**
 * Computes the crop for one portrait frame on a sheet. Columns/rows come from
 * the sheet size and the index is clamped into the grid, so an out-of-range
 * frame degrades to the last real frame instead of cropping past the sheet.
 */
export function getDialoguePortraitFrame(sheetWidth: number, sheetHeight: number, frameIndex: number): DialoguePortraitFrameBounds {
  const frameSize = DIALOGUE_PORTRAIT_FRAME_SIZE
  if (sheetWidth < frameSize || sheetHeight < frameSize) {
    return { frameSize, frameX: 0, frameY: 0, columns: 1, rows: 1 }
  }

  const columns = Math.max(1, Math.floor(sheetWidth / frameSize))
  const rows = Math.max(1, Math.floor(sheetHeight / frameSize))
  const clamped = Math.max(0, Math.min(columns * rows - 1, frameIndex))
  return {
    frameSize,
    frameX: (clamped % columns) * frameSize,
    frameY: Math.floor(clamped / columns) * frameSize,
    columns,
    rows,
  }
}
