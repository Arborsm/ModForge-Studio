/** Game constants: sprite rendering, audio, difficulty presets, preferred items. */

export const SPRITE_SIZE = 16
export const RENDER_SCALE = 4
export const SHOWCASE_SCALE = 6
export const BGM_VOLUME = 0.35
export const MISMATCH_REVEAL_MS = 700
export const MAX_PAIRS = 10

export interface DifficultyPreset {
  pairs: number
  columns: number
}

export const DIFFICULTIES: Record<string, DifficultyPreset> = {
  easy: { pairs: 6, columns: 4 },
  normal: { pairs: 8, columns: 4 },
  hard: { pairs: 10, columns: 5 },
}

// Iconic items preferred as card faces; remaining slots fill from Data/Objects order.
export const PREFERRED_ITEMS = [
  'Parsnip',
  'Potato',
  'Cauliflower',
  'Pumpkin',
  'Strawberry',
  'Blueberry',
  'Melon',
  'Starfruit',
  'Ancient Fruit',
  'Sweet Gem Berry',
  'Fiddlehead Fern',
  'Red Cabbage',
]
