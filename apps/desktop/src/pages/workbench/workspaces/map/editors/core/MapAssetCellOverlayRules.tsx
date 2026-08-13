import { CELL_OVERLAY_RULES, type CellOverlayRule } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

/**
 * Floating rule bar for the cell-rule overlay mode (bottom-left of the canvas).
 * Picks which rule the next drag paints; "walkable" erases the rules. Each rule
 * button carries a color swatch matching the canvas overlay hues (tokens.css
 * `--cell-overlay-*`), so the bar reads as a legend for the painted regions.
 */
export function MapAssetCellOverlayRules({
  activeRule,
  onRuleChange,
}: {
  activeRule: CellOverlayRule
  onRuleChange: (rule: CellOverlayRule) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  return (
    <div className="map-asset-paint-rules" role="group" aria-label={copy.paintRulesLabel} data-map-paint-rules="true">
      <span className="map-asset-paint-rules-label">{copy.paintRulesLabel}</span>
      {CELL_OVERLAY_RULES.map((rule) => (
        <button
          key={rule}
          type="button"
          className={cx('map-asset-paint-rule', rule, activeRule === rule && 'is-active')}
          data-rule={rule}
          data-map-paint-rule={rule}
          aria-pressed={activeRule === rule}
          title={copy.overlayRuleTitles[rule]}
          onClick={() => onRuleChange(rule)}
        >
          <span className="map-asset-paint-rule-swatch" aria-hidden="true" />
          {copy.overlayRules[rule]}
        </button>
      ))}
    </div>
  )
}
