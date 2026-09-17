/**
 * @file Discover page option constants: categories, languages, time ranges,
 * sort orders, page sizes, and the rail/sheet range presets.
 */

export const CATEGORY_OPTIONS = [
  'Gameplay Mechanics',
  'Interiors',
  'Items',
  'Livestock and Animals',
  'Locations',
  'Maps',
  'Miscellaneous',
  'Modding Tools',
  'New Characters',
  'Pets / Horses',
  'Player',
  'Portraits',
  'User Interface',
  'Visuals and Graphics',
]

export const LANGUAGE_OPTIONS = ['Any', 'English', 'Chinese', 'Japanese', 'Spanish', 'German', 'French']

export const TIME_RANGE_VALUES = ['all', 'day', 'week', 'month', 'year'] as const
export const SORT_VALUES = ['newest', 'updated', 'trending', 'downloads', 'endorsements', 'name'] as const
export const PAGE_SIZE_VALUES = [20, 40, 80] as const

export type RangePresetKey = 'any' | 'lt10kb' | '10to100kb' | 'gt100kb' | '10kPlus' | '100kPlus' | '500kPlus' | '1kPlus' | '5kPlus'

export type RangePreset = {
  key: RangePresetKey
  label: string
  min: string
  max: string
}

export const FILE_SIZE_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: 'lt10kb', label: '< 10 KB', min: '', max: '10240' },
  { key: '10to100kb', label: '10-100 KB', min: '10240', max: '102400' },
  { key: 'gt100kb', label: '> 100 KB', min: '102400', max: '' },
]

export const DOWNLOAD_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: '10kPlus', label: '10K+', min: '10000', max: '' },
  { key: '100kPlus', label: '100K+', min: '100000', max: '' },
  { key: '500kPlus', label: '500K+', min: '500000', max: '' },
]

export const ENDORSEMENT_PRESETS: RangePreset[] = [
  { key: 'any', label: 'Any', min: '', max: '' },
  { key: '1kPlus', label: '1K+', min: '1000', max: '' },
  { key: '5kPlus', label: '5K+', min: '5000', max: '' },
  { key: '10kPlus', label: '10K+', min: '10000', max: '' },
]
