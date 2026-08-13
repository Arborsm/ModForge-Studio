/** Sprite geometry of one letter background frame inside `LooseSprites/letterBG`. */
export const LETTER_BG_FRAME_WIDTH = 320
export const LETTER_BG_FRAME_HEIGHT = 180

/** Game asset name of the vanilla letter background sheet. */
export const LETTER_BG_ASSET_NAME = 'LooseSprites/letterBG'

export type VanillaLetterBackgroundId = 'default' | 'sandy' | 'wizard' | 'krobus' | 'joja'

export type MailTextColorId = 'black' | 'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'purple' | 'red' | 'white'

export type VanillaLetterBackground = {
  index: number
  id: VanillaLetterBackgroundId
  /** Ink color this background applies by default unless the letter overrides it via `[textcolor]`. */
  defaultTextColorId: MailTextColorId | null
}

/** Documented vanilla `[letterbg <index>]` values (wiki: Modding:Mail data, 1.6). */
export const VANILLA_LETTER_BACKGROUNDS: readonly VanillaLetterBackground[] = [
  { index: 0, id: 'default', defaultTextColorId: null },
  { index: 1, id: 'sandy', defaultTextColorId: null },
  { index: 2, id: 'wizard', defaultTextColorId: 'white' },
  { index: 3, id: 'krobus', defaultTextColorId: 'white' },
  { index: 4, id: 'joja', defaultTextColorId: null },
]

/** Highest `[letterbg]` index documented for the vanilla sheet. */
export const MAX_VANILLA_LETTER_BG_INDEX = VANILLA_LETTER_BACKGROUNDS.length - 1

/** Valid `[textcolor <color>]` values (wiki: Modding:Mail data). */
export const MAIL_TEXT_COLOR_IDS: readonly MailTextColorId[] = [
  'black',
  'blue',
  'cyan',
  'gray',
  'green',
  'orange',
  'purple',
  'red',
  'white',
]

/**
 * Resolves the effective letter ink for the preview: an explicit `[textcolor]`, else the
 * background's default ink, else the vanilla parchment ink. The returned id maps to a
 * `mail-editor-ink-<id>` css class holding the decorative game-content color.
 */
export function resolveLetterInkColorId(textColorId: string | null, vanillaBackgroundIndex: number | null): MailTextColorId | 'default' {
  const explicit = MAIL_TEXT_COLOR_IDS.find((id) => id === textColorId)
  if (explicit) {
    return explicit
  }
  const background = VANILLA_LETTER_BACKGROUNDS.find((entry) => entry.index === vanillaBackgroundIndex)
  return background?.defaultTextColorId ?? 'default'
}

export type LetterBgSheetGeometry = {
  columns: number
  rows: number
  frameCount: number
  /** Measured pixel size of the full sheet, used to scale sprite crops. */
  sheetWidth: number
  sheetHeight: number
}

/**
 * Derives the letter background grid from the measured sheet size. The vanilla 1.6 sheet is
 * 1280x512 (4 columns, index wraps to the next 180px row), so both axes are measured.
 */
export function getLetterBgSheetGeometry(imageWidth: number, imageHeight: number): LetterBgSheetGeometry {
  const columns = Math.max(1, Math.floor(imageWidth / LETTER_BG_FRAME_WIDTH))
  const rows = Math.max(1, Math.floor(imageHeight / LETTER_BG_FRAME_HEIGHT))
  return { columns, rows, frameCount: columns * rows, sheetWidth: imageWidth, sheetHeight: imageHeight }
}

/** Clamps a `[letterbg]` index into the measured sheet and returns its grid cell. */
export function getLetterBgFrame(index: number, geometry: LetterBgSheetGeometry): { clampedIndex: number; column: number; row: number } {
  const clampedIndex = Math.min(Math.max(Math.trunc(index), 0), geometry.frameCount - 1)
  return {
    clampedIndex,
    column: clampedIndex % geometry.columns,
    row: Math.floor(clampedIndex / geometry.columns),
  }
}
