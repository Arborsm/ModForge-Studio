import { X } from 'lucide-react'
import type { PointerEvent } from 'react'
import { cx } from '@shared/lib/cx'
import { compactLabelForChip, type ChipDragState, type ConditionChip } from './eventConditionBuilderModel'
import { iconForConditionChip } from './eventConditionBuilderChipIcon'
import type { ConditionBuilderCopy, HubCopy } from './eventConditionBuilderTypes'

type EventConditionBuilderLogicChainProps = {
  chips: ConditionChip[]
  chipDrag: ChipDragState | null
  compact: boolean
  hasWeatherConflict: boolean
  copy: ConditionBuilderCopy
  hubCopy: HubCopy
  onToggleNegation: (id: string) => void
  onRemoveChip: (id: string) => void
  onChipPointerDown: (event: PointerEvent<HTMLDivElement>, chipId: string) => void
  onChipPointerMove: (event: PointerEvent<HTMLDivElement>, chipId: string) => void
  onChipPointerEnd: (event: PointerEvent<HTMLDivElement>, chipId: string) => void
}

/** Renders the draggable condition-chip chain used by the condition builder modal. */
export function EventConditionBuilderLogicChain({
  chips,
  chipDrag,
  compact,
  hasWeatherConflict,
  copy,
  hubCopy,
  onToggleNegation,
  onRemoveChip,
  onChipPointerDown,
  onChipPointerMove,
  onChipPointerEnd,
}: EventConditionBuilderLogicChainProps) {
  const draggedChipId = chipDrag?.chipId ?? null

  return (
    <div className={cx('condition-chip-scroll', compact && 'compact')}>
      {chips.length === 0 ? (
        <span className="condition-chip-empty">{copy.logicChainEmpty}</span>
      ) : (
        chips.map((chip) => {
          const CategoryIcon = iconForConditionChip(chip)
          const conflict = chip.id === 'weather:sunny' || chip.id === 'weather:rainy' ? hasWeatherConflict : false
          const compactLabel = compactLabelForChip(chip, hubCopy)
          const dragOffset =
            draggedChipId === chip.id && chipDrag
              ? {
                  x: chipDrag.currentX - chipDrag.startX,
                  y: chipDrag.currentY - chipDrag.startY,
                }
              : null

          return (
            <div
              key={chip.id}
              className={cx(
                'condition-chip',
                chip.negated && 'negated',
                conflict && 'conflict',
                draggedChipId === chip.id && 'dragging',
                chipDrag?.overChipId === chip.id && 'drop-target',
              )}
              data-condition-chip-id={chip.id}
              style={dragOffset ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.035)` } : undefined}
              onPointerDown={(pointerEvent) => onChipPointerDown(pointerEvent, chip.id)}
              onPointerMove={(pointerEvent) => onChipPointerMove(pointerEvent, chip.id)}
              onPointerUp={(pointerEvent) => onChipPointerEnd(pointerEvent, chip.id)}
              onPointerCancel={(pointerEvent) => onChipPointerEnd(pointerEvent, chip.id)}
            >
              <button
                type="button"
                className="condition-chip-negate"
                aria-label={copy.negateLabel(chip.label)}
                onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                onClick={() => onToggleNegation(chip.id)}
              >
                !
              </button>
              <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="condition-chip-compact">{compactLabel}</span>
              <span className="condition-chip-full">{chip.label}</span>
              <button
                type="button"
                aria-label={copy.removeChipLabel(chip.label)}
                onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                onClick={() => onRemoveChip(chip.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
