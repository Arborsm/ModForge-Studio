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

export const STORAGE_VERSION = 12
/** Outer inset around the workspace root. Browse shell is edge-flush (mock ws-grid). */
export const ROOT_PADDING = 0
/** Horizontal/vertical gap between docked rails. Matches mock resizer track width. */
export const COLUMN_GAP = 5
/** Gap between stacked docked panels inside a rail. */
export const SPLIT_GAP = 5
/** Hit target thickness for edge/split resizers (visual rule is 1px via CSS). */
export const RESIZER_THICKNESS = 5
/** Center pane floor; mock uses ~360px. */
export const MIN_CENTER_WIDTH = 360
export const MIN_CENTER_HEIGHT = 300
export const RAIL_DRAG_THRESHOLD = 6
