import type { SlotId } from '@shared/contracts'

export const SLOT_IDS = [
  'left-top',
  'left-bottom',
  'right-top',
  'right-bottom',
  'bottom-left',
  'bottom-right',
] as const satisfies readonly SlotId[]
export const LEFT_SLOTS = ['left-top', 'left-bottom'] as const satisfies readonly SlotId[]
export const RIGHT_SLOTS = ['right-top', 'right-bottom'] as const satisfies readonly SlotId[]
export const BOTTOM_SLOTS = ['bottom-left', 'bottom-right'] as const satisfies readonly SlotId[]

export const STORAGE_VERSION = 11
export const ROOT_PADDING = 12
export const COLUMN_GAP = 12
export const TOOL_WINDOW_RAIL_WIDTH = 42
export const TOOL_WINDOW_RAIL_HEIGHT = 38
export const TOOL_WINDOW_RAIL_GAP = 10
export const SPLIT_GAP = 12
export const RESIZER_THICKNESS = 8
export const MIN_CENTER_WIDTH = 520
export const MIN_CENTER_HEIGHT = 300
export const RAIL_DRAG_THRESHOLD = 6
