/**
 * @file Generated host→plugin component wiring — do not edit by hand.
 *
 * Regenerate with `vp run --filter @modforge/desktop gen:plugin-docs`. Source of truth:
 * `apps/desktop/scripts/gen/generate-plugin-docs.mjs` and `apps/desktop/src/shared/ui/*.tsx`.
 * The explicit `PluginComponents` annotation is the drift guard: host tsc fails when a
 * real component props no longer satisfy the SDK's plugin-facing declarations.
 */

import type { PluginComponents } from '@modforge/plugin-sdk'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelSection } from '@shared/ui/PanelSection'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Disclosure } from '@shared/ui/Disclosure'
import { ProgressRing } from '@shared/ui/ProgressRing'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { ItemGroupPopover } from '@shared/ui/ItemGroupPopover'
import { SheetRegionPicker } from '@shared/ui/SheetRegionPicker'
import { Tooltip } from '@shared/ui/Tooltip'

/** Real design-system components handed to plugins via `PluginContext.components`. */
export const pluginHostComponents: PluginComponents = {
  PanelFrame,
  PanelSection,
  EmptyStateCard,
  WorkspaceSplitView,
  CompactSelect,
  Disclosure,
  ProgressRing,
  ImageSkeleton,
  ItemGroupPopover,
  SheetRegionPicker,
  Tooltip,
}
