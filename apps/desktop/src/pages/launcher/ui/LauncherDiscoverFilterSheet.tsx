/**
 * @file Discover filter bottom sheet (Android host): time / sort / category /
 * language / file-size chips plus a recheck action. Replaces the retired
 * desktop filter rail; state maps onto the existing discover toolbar state.
 */
import { RefreshCw } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { useLauncherDiscover } from '@features/launcher'
import { MobileSheet } from './mobile/MobileSheet'
import { CATEGORY_OPTIONS, FILE_SIZE_PRESETS, LANGUAGE_OPTIONS, SORT_VALUES, TIME_RANGE_VALUES } from '../model/launcherDiscoverOptions'

type DiscoverState = ReturnType<typeof useLauncherDiscover>

type LauncherDiscoverFilterSheetProps = {
  open: boolean
  onClose: () => void
  discover: DiscoverState
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={cx('mobile-chip', pressed && 'is-active')} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/** Bottom sheet with the discover page's filter and sort controls. */
export function LauncherDiscoverFilterSheet({ open, onClose, discover }: LauncherDiscoverFilterSheetProps) {
  const copy = useEditorCopy().launcher
  const mobileCopy = copy.discover.mobile

  const categoryOptions = discover.facets.categories.length
    ? discover.facets.categories
    : CATEGORY_OPTIONS.map((name) => ({ name, count: 0 }))
  const languageOptions = discover.facets.languages.length
    ? discover.facets.languages
    : LANGUAGE_OPTIONS.filter((name) => name !== 'Any').map((name) => ({ name, count: 0 }))

  const sizePresetActive = (min: string, max: string) => discover.filters.minFileSize === min && discover.filters.maxFileSize === max

  return (
    <MobileSheet open={open} onClose={onClose} title={mobileCopy.sheetTitle}>
      <div className="mobile-sheet-group">
        <div className="mobile-chip-row">
          <button
            type="button"
            className="mobile-chip mobile-chip-action"
            onClick={() => {
              onClose()
              discover.refresh()
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {mobileCopy.recheckAction}
          </button>
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.timeGroupLabel}</p>
        <div className="mobile-chip-row">
          {TIME_RANGE_VALUES.map((value) => (
            <Chip key={value} pressed={discover.timeRange === value} onClick={() => discover.setTimeRange(value)}>
              {copy.discover.timeRangeOptions[value]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.sortGroupLabel}</p>
        <div className="mobile-chip-row">
          {SORT_VALUES.map((value) => (
            <Chip key={value} pressed={discover.sort === value} onClick={() => discover.setSort(value)}>
              {copy.discover.sortOptions[value]}
            </Chip>
          ))}
          <Chip pressed={discover.ascending} onClick={() => discover.setAscending(!discover.ascending)}>
            {discover.ascending ? mobileCopy.ascendingChip : mobileCopy.descendingChip}
          </Chip>
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.categoryGroupLabel}</p>
        <div className="mobile-chip-row">
          {categoryOptions.map((category) => (
            <Chip
              key={category.name}
              pressed={discover.filters.category === category.name}
              onClick={() => discover.updateFilter('category', discover.filters.category === category.name ? '' : category.name)}
            >
              {copy.discover.categoryLabels[category.name] ?? category.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.languageGroupLabel}</p>
        <div className="mobile-chip-row">
          <Chip pressed={!discover.filters.language} onClick={() => discover.updateFilter('language', '')}>
            {mobileCopy.anyLanguage}
          </Chip>
          {languageOptions.map((language) => (
            <Chip
              key={language.name}
              pressed={discover.filters.language === language.name}
              onClick={() => discover.updateFilter('language', discover.filters.language === language.name ? '' : language.name)}
            >
              {copy.discover.languageLabels[language.name] ?? language.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.sizeGroupLabel}</p>
        <div className="mobile-chip-row">
          {FILE_SIZE_PRESETS.filter((preset) => preset.key !== 'any').map((preset) => (
            <Chip
              key={preset.key}
              pressed={sizePresetActive(preset.min, preset.max)}
              onClick={() => {
                if (sizePresetActive(preset.min, preset.max)) {
                  discover.updateFilter('minFileSize', '')
                  discover.updateFilter('maxFileSize', '')
                  return
                }
                discover.updateFilter('minFileSize', preset.min)
                discover.updateFilter('maxFileSize', preset.max)
              }}
            >
              {preset.label}
            </Chip>
          ))}
        </div>
      </div>

      <button type="button" className="mobile-sheet-apply" onClick={onClose}>
        {mobileCopy.apply}
      </button>
    </MobileSheet>
  )
}
