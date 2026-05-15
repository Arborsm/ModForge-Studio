import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  CloudLightning,
  CloudRain,
  Code2,
  Coins,
  Flower2,
  Flag,
  Heart,
  Mail,
  PackageSearch,
  Search,
  Snowflake,
  Sparkles,
  Sun,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useMemo, useState, type PointerEvent } from 'react'
import { cx } from '@shared/lib/cx'
import { splitEventPreconditions } from '@entities/event'
import type { EditorCopy } from '@locales'
import { EventGameStateQueryBuilderModal, type GameStateQueryBuilderResult } from './EventGameStateQueryBuilderModal'
import type { EventPatchHubEvent } from '@entities/event'
import { EventPreconditionParser, formatEventPreconditionForHub, type ParsedEventPrecondition } from '@entities/event'

type HubCopy = EditorCopy['studioDesk']['eventPatchHub']
type ConditionBuilderCopy = HubCopy['conditionBuilder']
type ConditionCategory = 'world' | 'social' | 'player' | 'story' | 'query'
type CatalogControlKind = 'choice-text' | 'choice' | 'range' | 'number' | 'text' | 'pair-tall' | 'pair' | 'none'
type SeasonId = 'spring' | 'summer' | 'fall' | 'winter'
type WeatherId = 'sunny' | 'rainy' | 'storm' | 'snow' | 'greenRain'

interface CatalogConditionDefinition {
  key: string
  category: ConditionCategory
  requiresArgs?: boolean
}

interface ConditionChip {
  id: string
  category: ConditionCategory
  label: string
  natural: string
  code: string
  negated: boolean
}

interface ChipDragState {
  chipId: string
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  overChipId: string | null
}

export interface EventConditionBuilderResult {
  eventKey: string
  alias: string
}

interface EventConditionBuilderModalProps {
  event: EventPatchHubEvent
  allEvents: EventPatchHubEvent[]
  alias: string
  hubCopy: HubCopy
  copy: ConditionBuilderCopy
  onApply: (result: EventConditionBuilderResult) => void
  onCancel: () => void
}

const CATEGORY_IDS: ConditionCategory[] = ['world', 'social', 'player', 'story', 'query']
const CATEGORY_ICONS = {
  world: Clock,
  social: UsersRound,
  player: UserRound,
  story: Flag,
  query: Code2,
} satisfies Record<ConditionCategory, typeof Clock>

const SEASON_CODES = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
} satisfies Record<SeasonId, string>

const WEATHER_CODES = {
  sunny: 'sunny',
  rainy: 'rainy',
  storm: 'storm',
  snow: 'snow',
  greenRain: 'green_rain',
} satisfies Record<WeatherId, string>

const WEATHER_ICONS = {
  sunny: Sun,
  rainy: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  greenRain: Flower2,
} satisfies Record<WeatherId, typeof Sun>

const NPC_OPTIONS = ['Abigail', 'Sam', 'Clint', 'Emily', 'Sebastian', 'Leah', 'Haley', 'Penny']
const SKILL_OPTIONS = ['Farming', 'Mining', 'Foraging', 'Fishing', 'Combat', 'Luck']
const COMPACT_CHAIN_THRESHOLD = 6
const ITEM_SUGGESTIONS = [
  { id: '24', label: 'Parsnip' },
  { id: '72', label: 'Diamond' },
  { id: '74', label: 'Prismatic Shard' },
  { id: '340', label: 'Honey' },
]

const CATALOG_CONDITIONS: CatalogConditionDefinition[] = [
  { key: 'DayOfMonth', category: 'world', requiresArgs: true },
  { key: 'DayOfWeek', category: 'world', requiresArgs: true },
  { key: 'Random', category: 'world', requiresArgs: true },
  { key: 'UpcomingFestival', category: 'world', requiresArgs: true },
  { key: 'InUpgradedHouse', category: 'world' },
  { key: 'Year', category: 'world', requiresArgs: true },
  { key: 'FestivalDay', category: 'world' },
  { key: 'NPCVisible', category: 'social', requiresArgs: true },
  { key: 'Roommate', category: 'social' },
  { key: 'Shipped', category: 'player', requiresArgs: true },
  { key: 'Tile', category: 'player', requiresArgs: true },
  { key: 'EarnedMoney', category: 'player', requiresArgs: true },
  { key: 'FreeInventorySlots', category: 'player', requiresArgs: true },
  { key: 'MissingPet', category: 'player' },
  { key: 'ReachedMineBottom', category: 'player' },
  { key: 'ChoseDialogueAnswers', category: 'player', requiresArgs: true },
  { key: 'SpouseBed', category: 'player' },
  { key: 'ActiveDialogueEvent', category: 'story', requiresArgs: true },
  { key: 'WorldState', category: 'story', requiresArgs: true },
  { key: 'HostMail', category: 'story', requiresArgs: true },
  { key: 'HostOrLocalMail', category: 'story', requiresArgs: true },
  { key: 'GoldenWalnuts', category: 'story', requiresArgs: true },
  { key: 'DaysPlayed', category: 'story', requiresArgs: true },
  { key: 'SawSecretNote', category: 'story', requiresArgs: true },
  { key: 'CommunityCenterOrWarehouseDone', category: 'story' },
  { key: 'IsHost', category: 'story' },
  { key: 'JojaBundlesDone', category: 'story' },
]

const DEFAULT_CATALOG_ARGS: Record<string, string> = {
  Random: '0.2',
  UpcomingFestival: '3',
  Year: '2',
  GoldenWalnuts: '100',
  EarnedMoney: '10000',
  FreeInventorySlots: '2',
  SawSecretNote: '10',
  Shipped: '24 1',
  Tile: '12 45',
  DaysPlayed: '28',
}

const WEEKDAY_CODES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_PRESETS = ['1', '7', '14', '21', '28'] as const

function catalogControlKind(key: string): CatalogControlKind {
  if (key === 'DayOfMonth' || key === 'NPCVisible') {
    return 'choice-text'
  }
  if (key === 'DayOfWeek' || key === 'MissingPet') {
    return 'choice'
  }
  if (key === 'Random') {
    return 'range'
  }
  if (key === 'Shipped') {
    return 'pair-tall'
  }
  if (key === 'Tile') {
    return 'pair'
  }
  if (
    [
      'GoldenWalnuts',
      'UpcomingFestival',
      'Year',
      'EarnedMoney',
      'FreeInventorySlots',
      'SawSecretNote',
      'DaysPlayed',
      'InUpgradedHouse',
      'ReachedMineBottom',
    ].includes(key)
  ) {
    return 'number'
  }
  if (['ActiveDialogueEvent', 'WorldState', 'ChoseDialogueAnswers', 'HostMail', 'HostOrLocalMail'].includes(key)) {
    return 'text'
  }
  return 'none'
}

function categoryForPrecondition(category: 'environment' | 'player' | 'progress'): ConditionCategory {
  if (category === 'player') {
    return 'player'
  }
  if (category === 'progress') {
    return 'story'
  }
  return 'world'
}

function clockLabel(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

function compactClockLabel(value: string) {
  const numeric = Number.parseInt(value, 10)
  if (!Number.isFinite(numeric)) {
    return value
  }

  const hours = Math.floor(numeric / 100)
  const minutes = Math.abs(numeric % 100)
  return minutes === 0 ? String(hours) : `${hours}:${String(minutes).padStart(2, '0')}`
}

function compactText(value: string, maxLength = 12) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 3)}...`
}

function compactName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^[A-Za-z]+$/u.test(trimmed)) {
    return trimmed.length > 3 ? trimmed.slice(0, 3) : trimmed
  }
  return Array.from(trimmed).slice(0, 3).join('')
}

function compactSeasonName(value: string) {
  const trimmed = value.trim()
  if (/^[A-Za-z]+$/u.test(trimmed)) {
    return trimmed.slice(0, 3)
  }
  return trimmed.replace(/季$/u, '')
}

function compactWeatherName(value: string) {
  const trimmed = value.trim()
  if (/^[A-Za-z\s]+$/u.test(trimmed)) {
    return trimmed.split(/\s+/u)[0] ?? trimmed
  }
  return trimmed
}

function friendshipHeartCount(points: string) {
  const numeric = Number.parseInt(points, 10)
  if (!Number.isFinite(numeric)) {
    return points
  }
  return String(Math.max(0, Math.floor(numeric / 250)))
}

function normalizeRangeValue(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  const normalizedMinutes = minutes >= 30 ? 30 : 0
  return Math.min(2400, Math.max(600, hours * 100 + normalizedMinutes))
}

function quoteQuery(value: string) {
  return `"${value.trim().replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

function gameStateQueryFromChip(chip: ConditionChip | undefined) {
  if (!chip?.code.startsWith('GameStateQuery')) {
    return ''
  }
  const parsed = new EventPreconditionParser().parseOne(chip.code)
  return parsed.args.join(' ')
}

function initialEventId(event: EventPatchHubEvent) {
  return splitEventPreconditions(event.key)[0] ?? event.eventId
}

function compactLabelForPrecondition(precondition: ParsedEventPrecondition, hubCopy: HubCopy) {
  const [first = '', second = ''] = precondition.args

  switch (precondition.canonicalKey) {
    case 'Time':
      return `${compactClockLabel(first)}-${compactClockLabel(second)}`
    case 'Season':
      return precondition.args.map((season) => compactSeasonName(hubCopy.preconditionSeasonName(season))).join('/')
    case 'Weather':
      return compactWeatherName(hubCopy.preconditionWeatherName(first))
    case 'Friendship':
      return `${compactName(first)} ${friendshipHeartCount(second)}${hubCopy.preconditionGroupLabels.environment === '触发环境' ? '心' : 'h'}`
    case 'Dating':
    case 'Spouse':
    case 'NpcVisibleHere':
    case 'NPCVisible':
      return compactName(first)
    case 'HasMoney':
    case 'EarnedMoney':
      return `${first}g`
    case 'Skill':
      return `${first} ${second}`
    case 'Gender':
      return hubCopy.preconditionGenderName(first)
    case 'HasItem':
    case 'Shipped':
      return compactText(first, 10)
    case 'LocalMail':
    case 'HostMail':
    case 'HostOrLocalMail':
      return compactText(first, 12)
    case 'SawEvent':
      return `#${compactText(first, 10)}`
    case 'GameStateQuery':
      return compactText(precondition.args.join(' '), 14)
    default:
      return compactText(formatEventPreconditionForHub({ ...precondition, negated: false }, hubCopy), 14)
  }
}

function compactLabelForChip(chip: ConditionChip, hubCopy: HubCopy) {
  if (chip.id.startsWith('weather:')) {
    return compactWeatherName(chip.label)
  }

  const parser = new EventPreconditionParser()
  const parsed = parser.parseOne(chip.code)
  return compactLabelForPrecondition(parsed, hubCopy)
}

function iconForChip(chip: ConditionChip) {
  if (chip.id === 'weather:greenRain') {
    return Flower2
  }

  const parser = new EventPreconditionParser()
  const parsed = parser.parseOne(chip.code)

  if (parsed.canonicalKey === 'Time') {
    return Clock
  }
  if (parsed.canonicalKey === 'Season' || parsed.canonicalKey === 'DayOfMonth' || parsed.canonicalKey === 'DayOfWeek') {
    return CalendarDays
  }
  if (parsed.canonicalKey === 'Weather') {
    const weather = parsed.args[0]?.toLowerCase()
    if (weather === 'rainy' || weather === 'rain') {
      return CloudRain
    }
    if (weather === 'storm') {
      return CloudLightning
    }
    if (weather === 'snow') {
      return Snowflake
    }
    return Sun
  }
  if (
    parsed.canonicalKey === 'Friendship' ||
    parsed.canonicalKey === 'Dating' ||
    parsed.canonicalKey === 'Spouse' ||
    parsed.canonicalKey === 'Roommate'
  ) {
    return Heart
  }
  if (parsed.canonicalKey === 'HasMoney' || parsed.canonicalKey === 'EarnedMoney') {
    return Coins
  }
  if (parsed.canonicalKey === 'HasItem' || parsed.canonicalKey === 'Shipped') {
    return PackageSearch
  }
  if (parsed.canonicalKey === 'LocalMail' || parsed.canonicalKey === 'HostMail' || parsed.canonicalKey === 'HostOrLocalMail') {
    return Mail
  }
  if (parsed.canonicalKey === 'GameStateQuery') {
    return Code2
  }
  return CATEGORY_ICONS[chip.category]
}

function initialChips(event: EventPatchHubEvent, hubCopy: HubCopy): ConditionChip[] {
  const parser = new EventPreconditionParser()
  return splitEventPreconditions(event.key)
    .slice(1)
    .filter(Boolean)
    .map((raw, index) => {
      const parsed = parser.parseOne(raw)
      const label = formatEventPreconditionForHub({ ...parsed, negated: false }, hubCopy)
      return {
        id: `existing:${index}:${raw}`,
        category: categoryForPrecondition(parsed.category),
        label,
        natural: label,
        code: raw.replace(/^!\s*/u, ''),
        negated: parsed.negated,
      }
    })
}

function chipCode(chip: ConditionChip) {
  return `${chip.negated ? '!' : ''}${chip.code}`
}

function chipNatural(chip: ConditionChip, copy: ConditionBuilderCopy) {
  return chip.negated ? copy.negateLabel(chip.natural) : chip.natural
}

export function EventConditionBuilderModal({ event, allEvents, alias, hubCopy, copy, onApply, onCancel }: EventConditionBuilderModalProps) {
  const [activeCategory, setActiveCategory] = useState<ConditionCategory>('world')
  const [eventId, setEventId] = useState(initialEventId(event))
  const [eventAlias, setEventAlias] = useState(alias)
  const [chips, setChips] = useState<ConditionChip[]>(() => initialChips(event, hubCopy))
  const [selectedSeasons, setSelectedSeasons] = useState<SeasonId[]>([])
  const [selectedWeathers, setSelectedWeathers] = useState<WeatherId[]>([])
  const [timeRange, setTimeRange] = useState<[number, number]>([1900, 2300])
  const [npcQuery, setNpcQuery] = useState('Abigail')
  const [heartCount, setHeartCount] = useState(4)
  const [friendshipComparator, setFriendshipComparator] = useState<'atLeast' | 'below'>('atLeast')
  const [moneyAmount, setMoneyAmount] = useState('1000')
  const [skillName, setSkillName] = useState(SKILL_OPTIONS[0] ?? 'Farming')
  const [skillLevel, setSkillLevel] = useState('4')
  const [gender, setGender] = useState('male')
  const [itemQuery, setItemQuery] = useState('')
  const [storyQuery, setStoryQuery] = useState('')
  const [mailId, setMailId] = useState('')
  const [gameStateQueryBuilderOpen, setGameStateQueryBuilderOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')
  const [chipDrag, setChipDrag] = useState<ChipDragState | null>(null)
  const [catalogArgs, setCatalogArgs] = useState<Record<string, string>>({})
  const [openCatalogCategories, setOpenCatalogCategories] = useState<Partial<Record<ConditionCategory, boolean>>>({})
  const draggedChipId = chipDrag?.chipId ?? null

  const eventSuggestions = useMemo(() => {
    const normalized = storyQuery.trim().toLowerCase()
    return allEvents
      .filter((item) => item.key !== event.key)
      .filter((item) => !normalized || item.eventId.toLowerCase().includes(normalized) || item.title.toLowerCase().includes(normalized))
      .slice(0, 5)
  }, [allEvents, event.key, storyQuery])

  const filteredNpcs = useMemo(() => {
    const normalized = npcQuery.trim().toLowerCase()
    return NPC_OPTIONS.filter((name) => !normalized || name.toLowerCase().includes(normalized)).slice(0, 5)
  }, [npcQuery])

  const filteredItems = useMemo(() => {
    const normalized = itemQuery.trim().toLowerCase()
    return ITEM_SUGGESTIONS.filter(
      (item) => !normalized || item.id.includes(normalized) || item.label.toLowerCase().includes(normalized),
    ).slice(0, 4)
  }, [itemQuery])

  const hasWeatherConflict = selectedWeathers.includes('sunny') && selectedWeathers.includes('rainy')
  const compactLogicChain = chips.length >= COMPACT_CHAIN_THRESHOLD
  const normalizedCategorySearch = categorySearch.trim().toLowerCase()
  const visibleCategories = CATEGORY_IDS.filter((category) => {
    if (!normalizedCategorySearch) {
      return true
    }
    return [copy.categories[category], copy.categoryDescriptions[category], category]
      .join(' ')
      .toLowerCase()
      .includes(normalizedCategorySearch)
  })
  const eventIdValidation = eventId.trim() ? '' : copy.validationEventIdRequired
  const queryChip = chips.find((chip) => chip.id === 'query')
  const naturalPreview = chips.length > 0 ? copy.naturalPreview(chips.map((chip) => chipNatural(chip, copy))) : copy.naturalPreviewEmpty
  const codePreview = chips.length > 0 ? chips.map((chip) => `${chipCode(chip)}/`).join('') : copy.codePreviewEmpty
  const friendshipPoints = Math.max(0, heartCount * 250)

  function upsertChip(chip: ConditionChip) {
    setChips((current) =>
      current.some((item) => item.id === chip.id) ? current.map((item) => (item.id === chip.id ? chip : item)) : [...current, chip],
    )
  }

  function removeChip(id: string) {
    setChips((current) => current.filter((chip) => chip.id !== id))
    if (id === 'season') {
      setSelectedSeasons([])
    }
    if (id.startsWith('weather:')) {
      const weatherId = id.slice('weather:'.length) as WeatherId
      setSelectedWeathers((current) => current.filter((item) => item !== weatherId))
    }
  }

  function toggleChipNegation(id: string) {
    setChips((current) => current.map((chip) => (chip.id === id ? { ...chip, negated: !chip.negated } : chip)))
  }

  function reorderChip(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return
    }
    setChips((current) => {
      const sourceIndex = current.findIndex((chip) => chip.id === sourceId)
      const targetIndex = current.findIndex((chip) => chip.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) {
        return current
      }
      const next = current.slice()
      const [chip] = next.splice(sourceIndex, 1)
      if (!chip) {
        return current
      }
      next.splice(targetIndex, 0, chip)
      return next
    })
  }

  function chipIdUnderPointer(clientX: number, clientY: number, sourceId: string) {
    const elements = document.querySelectorAll<HTMLElement>('[data-condition-chip-id]')
    for (const element of elements) {
      const chipId = element.dataset.conditionChipId
      if (!chipId || chipId === sourceId) {
        continue
      }
      const rect = element.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return chipId
      }
    }
    return null
  }

  function handleChipPointerDown(event: PointerEvent<HTMLDivElement>, chipId: string) {
    if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest('button'))) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setChipDrag({
      chipId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      overChipId: null,
    })
  }

  function handleChipPointerMove(event: PointerEvent<HTMLDivElement>, chipId: string) {
    if (!chipDrag || chipDrag.chipId !== chipId || chipDrag.pointerId !== event.pointerId) {
      return
    }
    const overChipId = chipIdUnderPointer(event.clientX, event.clientY, chipId)
    setChipDrag((current) =>
      current && current.chipId === chipId ? { ...current, currentX: event.clientX, currentY: event.clientY, overChipId } : current,
    )
  }

  function handleChipPointerEnd(event: PointerEvent<HTMLDivElement>, chipId: string) {
    if (!chipDrag || chipDrag.chipId !== chipId || chipDrag.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const overChipId = chipIdUnderPointer(event.clientX, event.clientY, chipId) ?? chipDrag.overChipId
    if (overChipId) {
      reorderChip(chipId, overChipId)
    }
    setChipDrag(null)
  }

  function handleSeasonToggle(season: SeasonId) {
    const next = selectedSeasons.includes(season) ? selectedSeasons.filter((item) => item !== season) : [...selectedSeasons, season]
    setSelectedSeasons(next)

    if (next.length === 0) {
      removeChip('season')
      return
    }

    const labels = next.map((item) => hubCopy.preconditionSeasonName(SEASON_CODES[item]))
    upsertChip({
      id: 'season',
      category: 'world',
      label: labels.join(' / '),
      natural: labels.join(' / '),
      code: `Season ${next.map((item) => SEASON_CODES[item]).join(' ')}`,
      negated: false,
    })
  }

  function handleWeatherToggle(weather: WeatherId) {
    const next = selectedWeathers.includes(weather) ? selectedWeathers.filter((item) => item !== weather) : [...selectedWeathers, weather]
    setSelectedWeathers(next)

    if (selectedWeathers.includes(weather)) {
      removeChip(`weather:${weather}`)
      return
    }

    const code = weather === 'greenRain' ? 'GameStateQuery IS_GREEN_RAIN_DAY' : `Weather ${WEATHER_CODES[weather]}`
    upsertChip({
      id: `weather:${weather}`,
      category: 'world',
      label: copy.weathers[weather],
      natural: copy.weathers[weather],
      code,
      negated: false,
    })
  }

  function applyTimeRange() {
    const start = Math.min(timeRange[0], timeRange[1])
    const end = Math.max(timeRange[0], timeRange[1])
    upsertChip({
      id: 'time',
      category: 'world',
      label: `${clockLabel(start)} - ${clockLabel(end)}`,
      natural: `${clockLabel(start)} - ${clockLabel(end)}`,
      code: `Time ${start} ${end}`,
      negated: false,
    })
  }

  function applyFriendship() {
    const npc = npcQuery.trim() || 'Abigail'
    upsertChip({
      id: 'friendship',
      category: 'social',
      label: `${npc} ${copy.heartsLabel(heartCount)}`,
      natural: `${npc} ${copy.heartsLabel(heartCount)}`,
      code: `Friendship ${npc} ${friendshipPoints}`,
      negated: friendshipComparator === 'below',
    })
  }

  function addSimpleSocialChip(kind: 'dating' | 'spouse' | 'present') {
    const npc = npcQuery.trim() || 'Abigail'
    const definitions = {
      dating: { label: copy.chipLabels.dating, code: `Dating ${npc}`, natural: `${copy.datingLabel}: ${npc}` },
      spouse: { label: copy.chipLabels.spouse, code: `Spouse ${npc}`, natural: `${copy.spouseLabel}: ${npc}` },
      present: { label: copy.chipLabels.present, code: `NpcVisibleHere ${npc}`, natural: `${copy.presentLabel}: ${npc}` },
    }
    const definition = definitions[kind]
    upsertChip({
      id: kind,
      category: 'social',
      label: definition.natural,
      natural: definition.natural,
      code: definition.code,
      negated: false,
    })
  }

  function addPlayerChip(kind: 'money' | 'skill' | 'gender' | 'item') {
    const itemId = itemQuery.trim()
    const fallbackItemId = itemId || (ITEM_SUGGESTIONS[0]?.id ?? '24')
    const fallbackItemLabel = itemId || (ITEM_SUGGESTIONS[0]?.label ?? 'Parsnip')
    const definitions = {
      money: {
        label: `${moneyAmount}g`,
        natural: `${copy.moneyLabel} ${moneyAmount}g`,
        code: `HasMoney ${moneyAmount}`,
      },
      skill: {
        label: `${skillName} ${skillLevel}`,
        natural: `${skillName} ${copy.skillLevelLabel} ${skillLevel}`,
        code: `Skill ${skillName} ${skillLevel}`,
      },
      gender: {
        label: gender,
        natural: `${copy.genderLabel}: ${gender}`,
        code: `Gender ${gender}`,
      },
      item: {
        label: fallbackItemLabel,
        natural: `${copy.hasItemLabel}: ${fallbackItemLabel}`,
        code: `HasItem ${fallbackItemId}`,
      },
    }
    upsertChip({
      id: kind,
      category: 'player',
      ...definitions[kind],
      negated: false,
    })
  }

  function addStoryEventChip(eventId: string, title: string) {
    upsertChip({
      id: 'saw-event',
      category: 'story',
      label: `${copy.storyTagPrefix}: ${title}`,
      natural: `${copy.storyTagPrefix}: ${title}`,
      code: `SawEvent ${eventId}`,
      negated: false,
    })
  }

  function addMailChip() {
    const value = mailId.trim()
    if (!value) {
      return
    }
    upsertChip({
      id: 'mail',
      category: 'story',
      label: value,
      natural: `${copy.mailLabel}: ${value}`,
      code: `LocalMail ${value}`,
      negated: false,
    })
  }

  function addGameStateQueryChip(result: GameStateQueryBuilderResult) {
    const value = result.query.trim()
    if (!value) {
      return
    }
    upsertChip({
      id: 'query',
      category: 'query',
      label: result.natural,
      natural: result.natural,
      code: `GameStateQuery ${quoteQuery(value)}`,
      negated: false,
    })
    setGameStateQueryBuilderOpen(false)
  }

  function addCatalogChip(definition: CatalogConditionDefinition) {
    const args = catalogArgValue(definition.key).trim()
    if (definition.requiresArgs && !args) {
      return
    }
    const code = `${definition.key}${args ? ` ${args}` : ''}`
    const parser = new EventPreconditionParser()
    const parsed = parser.parseOne(code)
    const label = formatEventPreconditionForHub({ ...parsed, negated: false }, hubCopy)
    upsertChip({
      id: `catalog:${code}`,
      category: definition.category,
      label,
      natural: label,
      code,
      negated: false,
    })
  }

  function catalogArgValue(key: string) {
    return catalogArgs[key] ?? DEFAULT_CATALOG_ARGS[key] ?? ''
  }

  function setCatalogArg(key: string, value: string) {
    setCatalogArgs((current) => ({ ...current, [key]: value }))
  }

  function catalogTokens(key: string) {
    return catalogArgValue(key).split(/\s+/u).filter(Boolean)
  }

  function toggleCatalogToken(key: string, token: string) {
    const tokens = catalogTokens(key)
    const next = tokens.includes(token) ? tokens.filter((item) => item !== token) : [...tokens, token]
    setCatalogArg(key, next.join(' '))
  }

  function updateCatalogPair(key: string, index: 0 | 1, value: string) {
    const [first = '', second = ''] = catalogTokens(key)
    const next: [string, string] = index === 0 ? [value, second] : [first, value]
    setCatalogArg(key, next.filter(Boolean).join(' '))
  }

  function changeCatalogNumber(key: string, delta: number, fallback: string, min = 0, max = 999999) {
    const current = Number.parseInt(catalogArgValue(key) || fallback, 10)
    const next = Math.max(min, Math.min(max, (Number.isFinite(current) ? current : Number.parseInt(fallback, 10)) + delta))
    setCatalogArg(key, String(next))
  }

  function renderCatalogNumberControl(definition: CatalogConditionDefinition, label: string, fallback: string, min = 0, max = 999999) {
    const value = catalogArgValue(definition.key) || fallback
    return (
      <label className="condition-catalog-number">
        <span>{label}</span>
        <div>
          <button type="button" onClick={() => changeCatalogNumber(definition.key, -1, fallback, min, max)}>
            -
          </button>
          <input value={value} inputMode="numeric" onChange={(event) => setCatalogArg(definition.key, event.target.value)} />
          <button type="button" onClick={() => changeCatalogNumber(definition.key, 1, fallback, min, max)}>
            +
          </button>
        </div>
      </label>
    )
  }

  function renderCatalogTextControl(definition: CatalogConditionDefinition, label: string, placeholder?: string) {
    return (
      <label className="condition-builder-field condition-catalog-args">
        <span>{label}</span>
        <input
          value={catalogArgValue(definition.key)}
          onChange={(event) => setCatalogArg(definition.key, event.target.value)}
          placeholder={placeholder}
        />
      </label>
    )
  }

  function renderCatalogVisualControl(
    definition: CatalogConditionDefinition,
    catalogCopy: ConditionBuilderCopy['catalogConditions'][string],
  ) {
    const value = catalogArgValue(definition.key)
    const label = catalogCopy.fieldLabel ?? catalogCopy.title

    if (definition.key === 'DayOfMonth') {
      return (
        <div className="condition-catalog-visual-control">
          <span>{label}</span>
          <div className="condition-catalog-pill-row">
            {DAY_PRESETS.map((day) => (
              <button
                key={day}
                type="button"
                className={cx(catalogTokens(definition.key).includes(day) && 'active')}
                onClick={() => toggleCatalogToken(definition.key, day)}
              >
                {day}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(event) => setCatalogArg(definition.key, event.target.value)}
            placeholder={catalogCopy.placeholder}
          />
        </div>
      )
    }

    if (definition.key === 'DayOfWeek') {
      return (
        <div className="condition-catalog-visual-control">
          <span>{label}</span>
          <div className="condition-catalog-week-row">
            {WEEKDAY_CODES.map((day) => (
              <button
                key={day}
                type="button"
                className={cx(catalogTokens(definition.key).includes(day) && 'active')}
                onClick={() => toggleCatalogToken(definition.key, day)}
              >
                {copy.catalogWeekdayLabels[day]}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (definition.key === 'Random') {
      const chance = Math.max(0, Math.min(1, Number.parseFloat(value || '0.2')))
      return (
        <label className="condition-catalog-range">
          <span>{label}</span>
          <output>{Math.round(chance * 100)}%</output>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={Number.isFinite(chance) ? chance : 0.2}
            onChange={(event) =>
              setCatalogArg(definition.key, Number(event.target.value).toFixed(2).replace(/0$/u, '').replace(/\.0$/u, ''))
            }
          />
        </label>
      )
    }

    if (definition.key === 'NPCVisible') {
      return (
        <div className="condition-catalog-visual-control">
          <span>{label}</span>
          <div className="condition-catalog-pill-row">
            {NPC_OPTIONS.slice(0, 4).map((npc) => (
              <button key={npc} type="button" className={cx(value === npc && 'active')} onClick={() => setCatalogArg(definition.key, npc)}>
                {npc.slice(0, 3)}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(event) => setCatalogArg(definition.key, event.target.value)}
            placeholder={catalogCopy.placeholder}
          />
        </div>
      )
    }

    if (definition.key === 'MissingPet') {
      return (
        <div className="condition-catalog-visual-control">
          <span>{label}</span>
          <div className="condition-catalog-pill-row">
            <button type="button" className={cx(!value && 'active')} onClick={() => setCatalogArg(definition.key, '')}>
              {copy.catalogAnyPetLabel}
            </button>
            {(['cat', 'dog'] as const).map((pet) => (
              <button key={pet} type="button" className={cx(value === pet && 'active')} onClick={() => setCatalogArg(definition.key, pet)}>
                {copy.catalogPetLabels[pet]}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (definition.key === 'Shipped') {
      const [itemId = '24', count = '1'] = catalogTokens(definition.key)
      return (
        <div className="condition-catalog-pair-control">
          <label>
            <span>{copy.catalogItemIdLabel}</span>
            <input value={itemId} onChange={(event) => updateCatalogPair(definition.key, 0, event.target.value)} />
          </label>
          <label>
            <span>{copy.catalogCountInputLabel}</span>
            <input value={count} inputMode="numeric" onChange={(event) => updateCatalogPair(definition.key, 1, event.target.value)} />
          </label>
          <div className="condition-catalog-pill-row">
            {ITEM_SUGGESTIONS.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx(itemId === item.id && 'active')}
                onClick={() => updateCatalogPair(definition.key, 0, item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (definition.key === 'Tile') {
      const [x = '12', y = '45'] = catalogTokens(definition.key)
      return (
        <div className="condition-catalog-pair-control two">
          <label>
            <span>{copy.catalogTileXLabel}</span>
            <input value={x} inputMode="numeric" onChange={(event) => updateCatalogPair(definition.key, 0, event.target.value)} />
          </label>
          <label>
            <span>{copy.catalogTileYLabel}</span>
            <input value={y} inputMode="numeric" onChange={(event) => updateCatalogPair(definition.key, 1, event.target.value)} />
          </label>
        </div>
      )
    }

    if (
      ['GoldenWalnuts', 'UpcomingFestival', 'Year', 'EarnedMoney', 'FreeInventorySlots', 'SawSecretNote', 'DaysPlayed'].includes(
        definition.key,
      )
    ) {
      return renderCatalogNumberControl(definition, label, DEFAULT_CATALOG_ARGS[definition.key] ?? '1', 0)
    }

    if (definition.key === 'InUpgradedHouse') {
      return renderCatalogNumberControl(definition, label, '2', 0)
    }

    if (definition.key === 'ReachedMineBottom') {
      return renderCatalogNumberControl(definition, label, '1', 1)
    }

    if (catalogCopy.placeholder) {
      return renderCatalogTextControl(definition, label, catalogCopy.placeholder)
    }

    return null
  }

  function renderCatalogSection(category: ConditionCategory) {
    const definitions = CATALOG_CONDITIONS.filter((definition) => definition.category === category)
    if (definitions.length === 0) {
      return null
    }
    const open = openCatalogCategories[category] === true

    return (
      <section className="condition-builder-card condition-catalog-card">
        <button
          type="button"
          className="condition-catalog-toggle"
          aria-expanded={open}
          onClick={() => setOpenCatalogCategories((current) => ({ ...current, [category]: current[category] !== true }))}
        >
          <span>
            <Code2 className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.catalogTitle}</strong>
          </span>
          <small>{copy.catalogCountLabel(definitions.length)}</small>
          <ChevronDown className={cx('h-4 w-4', open && 'open')} aria-hidden="true" />
        </button>
        {open ? (
          <div className="condition-catalog-grid">
            {definitions.map((definition) => {
              const args = catalogArgValue(definition.key)
              const disabled = definition.requiresArgs === true && !args.trim()
              const catalogCopy = copy.catalogConditions[definition.key]
              const controlKind = catalogControlKind(definition.key)
              const Icon = iconForChip({
                id: `catalog-preview:${definition.key}`,
                category: definition.category,
                label: definition.key,
                natural: definition.key,
                code: definition.key,
                negated: false,
              })
              return (
                <article
                  key={definition.key}
                  className={cx('condition-catalog-option', `catalog-kind-${controlKind}`, controlKind === 'none' && 'no-controls')}
                >
                  <div className="condition-catalog-option-head">
                    <span className="condition-catalog-icon">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{catalogCopy.title}</strong>
                      <small>{catalogCopy.description}</small>
                    </span>
                    <button
                      type="button"
                      className="condition-catalog-add-button"
                      disabled={disabled}
                      onClick={() => addCatalogChip(definition)}
                    >
                      {copy.catalogAddLabel}
                    </button>
                  </div>
                  {renderCatalogVisualControl(definition, catalogCopy)}
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    )
  }

  function applyBuilder() {
    if (eventIdValidation) {
      return
    }
    const normalizedEventId = eventId.trim()
    const eventKey = [normalizedEventId, ...chips.map(chipCode)].filter(Boolean).join('/')
    onApply({ eventKey, alias: eventAlias.trim() })
  }

  function generateEventId() {
    const aliasSeed = eventAlias
      .trim()
      .replace(/阿比盖尔/gu, 'Abigail')
      .replace(/秘密/gu, 'Secret')
      .replace(/的/gu, ' ')
    const words = aliasSeed.match(/[A-Za-z0-9]+/gu) ?? []
    const suffix = words.length > 0 ? words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('_') : initialEventId(event)
    setEventId(`{{ModId}}_${suffix}`)
  }

  function renderWorldPanel() {
    return (
      <div className="condition-builder-panel">
        <section className="condition-builder-card">
          <div className="condition-builder-card-title">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.timeTitle}</strong>
          </div>
          <div className="condition-time-values">
            <label>
              <span>{copy.timeStartLabel}</span>
              <output>{clockLabel(timeRange[0])}</output>
              <input
                type="range"
                min={600}
                max={2400}
                step={50}
                value={timeRange[0]}
                onChange={(changeEvent) => setTimeRange((current) => [normalizeRangeValue(Number(changeEvent.target.value)), current[1]])}
              />
            </label>
            <label>
              <span>{copy.timeEndLabel}</span>
              <output>{clockLabel(timeRange[1])}</output>
              <input
                type="range"
                min={600}
                max={2400}
                step={50}
                value={timeRange[1]}
                onChange={(changeEvent) => setTimeRange(([start]) => [start, normalizeRangeValue(Number(changeEvent.target.value))])}
              />
            </label>
          </div>
          <div className="condition-time-scale" aria-hidden="true">
            <span>6:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
          <button type="button" className="condition-builder-inline-action" onClick={applyTimeRange}>
            {copy.applyTimeLabel}
          </button>
        </section>

        <section className="condition-builder-card">
          <div className="condition-builder-card-title">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.seasonTitle}</strong>
          </div>
          <div className="condition-season-grid">
            {(Object.keys(copy.seasons) as SeasonId[]).map((season) => (
              <button
                key={season}
                type="button"
                className={cx('condition-season-button', `season-${season}`, selectedSeasons.includes(season) && 'selected')}
                aria-pressed={selectedSeasons.includes(season)}
                onClick={() => handleSeasonToggle(season)}
              >
                {copy.seasons[season]}
              </button>
            ))}
          </div>
        </section>

        <section className="condition-builder-card">
          <div className="condition-builder-card-title">
            <CloudRain className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.weatherTitle}</strong>
          </div>
          <div className="condition-weather-row">
            {(Object.keys(copy.weathers) as WeatherId[]).map((weather) => {
              const WeatherIcon = WEATHER_ICONS[weather]
              return (
                <button
                  key={weather}
                  type="button"
                  className={cx('condition-weather-button', selectedWeathers.includes(weather) && 'selected')}
                  aria-pressed={selectedWeathers.includes(weather)}
                  title={copy.weathers[weather]}
                  onClick={() => handleWeatherToggle(weather)}
                >
                  <WeatherIcon className="h-5 w-5" aria-hidden="true" />
                  <span>{copy.weathers[weather]}</span>
                </button>
              )
            })}
          </div>
          {hasWeatherConflict ? <p className="condition-conflict-note">{copy.conflictLabel}</p> : null}
        </section>

        {renderCatalogSection('world')}
      </div>
    )
  }

  function renderSocialPanel() {
    return (
      <div className="condition-builder-panel">
        <section className="condition-builder-card">
          <label className="condition-builder-field">
            <span>{copy.npcLabel}</span>
            <span className="condition-builder-search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input value={npcQuery} onChange={(event) => setNpcQuery(event.target.value)} placeholder={copy.npcPlaceholder} />
            </span>
          </label>
          <div className="condition-npc-section-title">{copy.recentNpcsTitle}</div>
          <div className="condition-npc-options recent">
            {NPC_OPTIONS.slice(0, 4).map((npc) => (
              <button key={npc} type="button" className={cx(npcQuery === npc && 'active')} onClick={() => setNpcQuery(npc)}>
                <i>{npc.slice(0, 2)}</i>
                <span>{npc}</span>
              </button>
            ))}
          </div>
          <div className="condition-npc-section-title">{copy.npcResultsTitle}</div>
          <div className="condition-npc-options">
            {filteredNpcs.map((npc) => (
              <button key={npc} type="button" className={cx(npcQuery === npc && 'active')} onClick={() => setNpcQuery(npc)}>
                <i>{npc.slice(0, 2)}</i>
                <span>{npc}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="condition-builder-card">
          <div className="condition-builder-card-title">
            <Heart className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.friendshipTitle}</strong>
            <select value={friendshipComparator} onChange={(event) => setFriendshipComparator(event.target.value as 'atLeast' | 'below')}>
              <option value="atLeast">{copy.comparatorAtLeast}</option>
              <option value="below">{copy.comparatorBelow}</option>
            </select>
          </div>
          <label className="condition-friendship-slider">
            <span>{copy.friendshipPointsLabel(friendshipPoints, 3500, heartCount)}</span>
            <input
              type="range"
              min={0}
              max={14}
              step={1}
              value={heartCount}
              onChange={(event) => setHeartCount(Number(event.target.value))}
            />
          </label>
          <div className="condition-heart-row" aria-label={copy.friendshipTitle}>
            {Array.from({ length: 14 }, (_, index) => index + 1).map((heart) => (
              <button
                key={heart}
                type="button"
                className={cx(heart <= heartCount && 'filled')}
                aria-label={copy.heartsLabel(heart)}
                onClick={() => setHeartCount(heart)}
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" className="condition-builder-inline-action" onClick={applyFriendship}>
            {copy.friendshipTitle}
          </button>
        </section>

        <section className="condition-builder-card">
          <div className="condition-builder-card-title">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.specialStatusTitle}</strong>
          </div>
          <div className="condition-checkbox-row">
            <button type="button" onClick={() => addSimpleSocialChip('dating')}>
              {copy.datingLabel}
            </button>
            <button type="button" onClick={() => addSimpleSocialChip('spouse')}>
              {copy.spouseLabel}
            </button>
            <button type="button" onClick={() => addSimpleSocialChip('present')}>
              {copy.presentLabel}
            </button>
          </div>
        </section>

        {renderCatalogSection('social')}
      </div>
    )
  }

  function renderPlayerPanel() {
    return (
      <div className="condition-builder-panel">
        <section className="condition-builder-card condition-builder-two-col">
          <label className="condition-builder-field">
            <span>{copy.moneyLabel}</span>
            <input value={moneyAmount} inputMode="numeric" onChange={(event) => setMoneyAmount(event.target.value)} />
          </label>
          <button type="button" className="condition-builder-inline-action" onClick={() => addPlayerChip('money')}>
            <Coins className="h-4 w-4" aria-hidden="true" />
            {copy.chipLabels.money}
          </button>
        </section>

        <section className="condition-builder-card condition-builder-two-col">
          <label className="condition-builder-field">
            <span>{copy.skillLabel}</span>
            <select value={skillName} onChange={(event) => setSkillName(event.target.value)}>
              {SKILL_OPTIONS.map((skill) => (
                <option key={skill}>{skill}</option>
              ))}
            </select>
          </label>
          <label className="condition-builder-field">
            <span>{copy.skillLevelLabel}</span>
            <input value={skillLevel} inputMode="numeric" onChange={(event) => setSkillLevel(event.target.value)} />
          </label>
          <button type="button" className="condition-builder-inline-action" onClick={() => addPlayerChip('skill')}>
            {copy.chipLabels.skill}
          </button>
        </section>

        <section className="condition-builder-card condition-builder-two-col">
          <label className="condition-builder-field">
            <span>{copy.genderLabel}</span>
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="male">male</option>
              <option value="female">female</option>
            </select>
          </label>
          <button type="button" className="condition-builder-inline-action" onClick={() => addPlayerChip('gender')}>
            {copy.chipLabels.gender}
          </button>
        </section>

        <section className="condition-builder-card">
          <label className="condition-builder-field">
            <span>{copy.hasItemLabel}</span>
            <span className="condition-builder-search">
              <PackageSearch className="h-4 w-4" aria-hidden="true" />
              <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder={copy.itemPlaceholder} />
            </span>
          </label>
          <div className="condition-item-options">
            {filteredItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setItemQuery(item.id)}>
                <i aria-hidden="true" />
                <span>{item.label}</span>
                <code>{item.id}</code>
              </button>
            ))}
          </div>
          <button type="button" className="condition-builder-inline-action" onClick={() => addPlayerChip('item')}>
            {copy.chipLabels.item}
          </button>
        </section>

        {renderCatalogSection('player')}
      </div>
    )
  }

  function renderStoryPanel() {
    return (
      <div className="condition-builder-panel">
        <section className="condition-builder-card">
          <label className="condition-builder-field">
            <span>{copy.storyEventLabel}</span>
            <span className="condition-builder-search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input value={storyQuery} onChange={(event) => setStoryQuery(event.target.value)} placeholder={copy.storyEventPlaceholder} />
            </span>
          </label>
          <div className="condition-story-options">
            {eventSuggestions.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onClick={() => addStoryEventChip(item.eventId, `#${String(index + 1).padStart(2, '0')} ${item.title}`)}
              >
                {copy.storyTagPrefix}: #{String(index + 1).padStart(2, '0')} {item.title}
              </button>
            ))}
          </div>
        </section>

        <section className="condition-builder-card condition-builder-two-col">
          <label className="condition-builder-field">
            <span>{copy.mailLabel}</span>
            <input value={mailId} onChange={(event) => setMailId(event.target.value)} placeholder={copy.mailPlaceholder} />
          </label>
          <button type="button" className="condition-builder-inline-action" onClick={addMailChip}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {copy.chipLabels.mail}
          </button>
        </section>

        {renderCatalogSection('story')}
      </div>
    )
  }

  function renderQueryPanel() {
    return (
      <div className="condition-builder-panel">
        <section className="condition-builder-card condition-builder-query-card">
          <div className="condition-builder-card-title">
            <Code2 className="h-4 w-4" aria-hidden="true" />
            <strong>{copy.queryLabel}</strong>
          </div>
          <div className="condition-builder-query-summary">
            <span>{queryChip?.natural ?? copy.querySummaryEmpty}</span>
            {queryChip ? <code>{gameStateQueryFromChip(queryChip)}</code> : null}
          </div>
          <button type="button" className="condition-builder-inline-action" onClick={() => setGameStateQueryBuilderOpen(true)}>
            <Code2 className="h-4 w-4" aria-hidden="true" />
            {copy.queryOpenBuilderLabel}
          </button>
        </section>
      </div>
    )
  }

  function renderActivePanel() {
    if (activeCategory === 'world') {
      return renderWorldPanel()
    }
    if (activeCategory === 'social') {
      return renderSocialPanel()
    }
    if (activeCategory === 'player') {
      return renderPlayerPanel()
    }
    if (activeCategory === 'story') {
      return renderStoryPanel()
    }
    return renderQueryPanel()
  }

  function renderLogicChain() {
    return (
      <div className={cx('condition-chip-scroll', compactLogicChain && 'compact')}>
        {chips.length === 0 ? (
          <span className="condition-chip-empty">{copy.logicChainEmpty}</span>
        ) : (
          chips.map((chip) => {
            const CategoryIcon = iconForChip(chip)
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
                onPointerDown={(pointerEvent) => handleChipPointerDown(pointerEvent, chip.id)}
                onPointerMove={(pointerEvent) => handleChipPointerMove(pointerEvent, chip.id)}
                onPointerUp={(pointerEvent) => handleChipPointerEnd(pointerEvent, chip.id)}
                onPointerCancel={(pointerEvent) => handleChipPointerEnd(pointerEvent, chip.id)}
              >
                <button
                  type="button"
                  className="condition-chip-negate"
                  aria-label={copy.negateLabel(chip.label)}
                  onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                  onClick={() => toggleChipNegation(chip.id)}
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
                  onClick={() => removeChip(chip.id)}
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

  return (
    <div className="event-condition-builder-backdrop" role="presentation" onClick={onCancel}>
      <div className="event-condition-builder-stack" onClick={(event) => event.stopPropagation()}>
        <section className="event-condition-builder-modal" role="dialog" aria-modal="true" aria-label={copy.title}>
          <header className="condition-builder-header">
            <div>
              <h2>{copy.title}</h2>
              <p>{copy.subtitle}</p>
            </div>
            <button type="button" className="icon-button h-8 w-8" aria-label={copy.closeLabel} onClick={onCancel}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <section className="condition-builder-identity">
            <div className="condition-builder-field condition-builder-event-id">
              <span className="condition-builder-field-head">
                <label htmlFor="condition-builder-event-id">{copy.eventIdLabel}</label>
                <button type="button" onClick={generateEventId}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.autoGenerateLabel}
                </button>
              </span>
              <input
                id="condition-builder-event-id"
                value={eventId}
                onChange={(changeEvent) => setEventId(changeEvent.target.value)}
                placeholder={copy.eventIdPlaceholder}
                aria-invalid={Boolean(eventIdValidation)}
              />
            </div>
            <label className="condition-builder-field">
              <span>{copy.aliasLabel}</span>
              <input
                value={eventAlias}
                onChange={(changeEvent) => setEventAlias(changeEvent.target.value)}
                placeholder={copy.aliasPlaceholder}
              />
            </label>
          </section>

          <main className="condition-builder-body">
            <nav className="condition-builder-rail" aria-label={copy.title}>
              <label className="condition-builder-category-search">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <input
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder={copy.categorySearchPlaceholder}
                  aria-label={copy.categorySearchPlaceholder}
                />
              </label>
              {visibleCategories.map((category) => {
                const CategoryIcon = CATEGORY_ICONS[category]
                return (
                  <button
                    key={category}
                    type="button"
                    className={cx(activeCategory === category && 'active')}
                    aria-pressed={activeCategory === category}
                    onClick={() => setActiveCategory(category)}
                  >
                    <CategoryIcon className="h-5 w-5" aria-hidden="true" />
                    <span>{copy.categories[category]}</span>
                    <small>{copy.categoryDescriptions[category]}</small>
                  </button>
                )
              })}
            </nav>

            <section className="condition-builder-workbench">{renderActivePanel()}</section>
          </main>
        </section>
        <aside className={cx('condition-builder-chain-dock', hasWeatherConflict && 'conflict')} aria-label={copy.logicChainTitle}>
          {renderLogicChain()}
        </aside>
        <aside className={cx('condition-builder-preview-dock', eventIdValidation && 'invalid')} aria-label={copy.previewDockLabel}>
          <div className="condition-builder-previews">
            {eventIdValidation ? (
              <p className="condition-builder-validation">
                <strong>{eventIdValidation}</strong>
              </p>
            ) : (
              <p>
                <strong>{copy.naturalPreviewLabel}</strong>
                {naturalPreview}
              </p>
            )}
            <p>
              <strong>{copy.codePreviewLabel}</strong>
              <code>{codePreview}</code>
            </p>
          </div>
          <div className="condition-builder-actions">
            <button type="button" className="control-button" onClick={onCancel}>
              {copy.cancelAction}
            </button>
            <button
              type="button"
              className="control-button control-button-primary"
              onClick={applyBuilder}
              disabled={Boolean(eventIdValidation)}
            >
              {copy.confirmAction}
            </button>
          </div>
        </aside>
        {gameStateQueryBuilderOpen ? (
          <EventGameStateQueryBuilderModal
            copy={copy.gameStateQueryBuilder}
            hubCopy={hubCopy}
            initialQuery={gameStateQueryFromChip(queryChip)}
            onApply={addGameStateQueryChip}
            onCancel={() => setGameStateQueryBuilderOpen(false)}
          />
        ) : null}
      </div>
    </div>
  )
}
