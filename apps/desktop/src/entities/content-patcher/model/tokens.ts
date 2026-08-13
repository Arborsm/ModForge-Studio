/**
 * The Content Patcher built-in token catalog (70 tokens), mirrored from the
 * official docs (`ContentPatcher/docs/author-guide/tokens.md`, CP 2.9).
 *
 * Each entry records what the condition editor and validation need: whether
 * the token takes an input argument, whether that input is optional, and the
 * enumerable value domain when the docs list one (for value suggestions).
 * Tokens whose `When`-key use carries a docs caveat are flagged instead of
 * banned, because the docs never ban them outright.
 */

export type CpTokenGroup =
  | 'dateWeather'
  | 'player'
  | 'relationship'
  | 'world'
  | 'number'
  | 'string'
  | 'metadata'
  | 'fieldReference'
  | 'specialized'
  | 'random'

export type CpTokenDefinition = {
  name: string
  group: CpTokenGroup
  /** The token accepts an input argument (`Token:Input`). */
  takesInput: boolean
  /** The token also works bare when it takes an input (e.g. `{{Weather}}`). */
  inputOptional: boolean
  /** Enumerable `When` value domain quoted by the docs, when one exists. */
  values?: readonly string[]
  /** Field-reference tokens only work inside a patch block, never in dynamic tokens. */
  patchBlockOnly?: boolean
  /** `When`-key usage is undocumented (`Random`) or restricted to query comparisons (`DailyLuck`). */
  whenKeyCaveat?: 'undocumented' | 'queryOnly'
}

/** Target-player input values accepted by the ★ player tokens. */
export const CP_TARGET_PLAYER_VALUES = ['currentPlayer', 'hostPlayer', 'anyPlayer'] as const

/** Location-context input values for tokens like `{{Weather:island}}`. */
export const CP_LOCATION_CONTEXT_VALUES = ['current', 'island', 'valley'] as const

/** Valid skill names for `{{SkillLevel:...}}`. */
export const CP_SKILL_VALUES = ['Combat', 'Farming', 'Fishing', 'Foraging', 'Luck', 'Mining'] as const

const BOOLEAN_VALUES = ['true', 'false'] as const

const PROFESSION_VALUES = [
  // Combat
  'Acrobat',
  'Brute',
  'Defender',
  'Desperado',
  'Fighter',
  'Scout',
  // Farming
  'Agriculturist',
  'Artisan',
  'Coopmaster',
  'Rancher',
  'Shepherd',
  'Tiller',
  // Fishing
  'Angler',
  'Fisher',
  'Mariner',
  'Pirate',
  'Luremaster',
  'Trapper',
  // Foraging
  'Botanist',
  'Forester',
  'Gatherer',
  'Lumberjack',
  'Tapper',
  'Tracker',
  // Mining
  'Blacksmith',
  'Excavator',
  'Gemologist',
  'Geologist',
  'Miner',
  'Prospector',
] as const

const PLAYER_TOKEN = { takesInput: true, inputOptional: true } as const
const NO_INPUT = { takesInput: false, inputOptional: false } as const
const REQUIRED_INPUT = { takesInput: true, inputOptional: false } as const

export const CP_BUILTIN_TOKENS: readonly CpTokenDefinition[] = [
  // ── Date and weather ──
  { name: 'Day', group: 'dateWeather', ...NO_INPUT },
  {
    name: 'DayEvent',
    group: 'dateWeather',
    ...NO_INPUT,
    values: [
      'wedding',
      'Dance of the Moonlight Jellies',
      'Egg Festival',
      'Feast of the Winter Star',
      'Festival of Ice',
      'Flower Dance',
      'Luau',
      "Spirit's Eve",
      'Stardew Valley Fair',
    ],
  },
  {
    name: 'DayOfWeek',
    group: 'dateWeather',
    ...NO_INPUT,
    values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  { name: 'DaysPlayed', group: 'dateWeather', ...NO_INPUT },
  { name: 'Season', group: 'dateWeather', ...NO_INPUT, values: ['Spring', 'Summer', 'Fall', 'Winter'] },
  { name: 'Time', group: 'dateWeather', ...NO_INPUT },
  {
    name: 'Weather',
    group: 'dateWeather',
    takesInput: true,
    inputOptional: true,
    values: ['Sun', 'Rain', 'Storm', 'GreenRain', 'Snow', 'Wind'],
  },
  { name: 'Year', group: 'dateWeather', ...NO_INPUT },

  // ── Player ──
  { name: 'DailyLuck', group: 'player', ...PLAYER_TOKEN, whenKeyCaveat: 'queryOnly' },
  { name: 'FarmhouseUpgrade', group: 'player', ...PLAYER_TOKEN, values: ['0', '1', '2', '3'] },
  { name: 'HasActiveQuest', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasCaughtFish', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasConversationTopic', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasCookingRecipe', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasCraftingRecipe', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasDialogueAnswer', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasFlag', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasProfession', group: 'player', ...PLAYER_TOKEN, values: PROFESSION_VALUES },
  { name: 'HasReadLetter', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasSeenEvent', group: 'player', ...PLAYER_TOKEN },
  { name: 'HasVisitedLocation', group: 'player', ...PLAYER_TOKEN },
  {
    name: 'HasWalletItem',
    group: 'player',
    ...NO_INPUT,
    values: [
      'DwarvishTranslationGuide',
      'RustyKey',
      'ClubCard',
      'KeyToTheTown',
      'SpecialCharm',
      'SkullKey',
      'MagnifyingGlass',
      'DarkTalisman',
      'MagicInk',
      'BearsKnowledge',
      'SpringOnionMastery',
    ],
  },
  { name: 'IsMainPlayer', group: 'player', ...PLAYER_TOKEN, values: BOOLEAN_VALUES },
  { name: 'IsOutdoors', group: 'player', ...PLAYER_TOKEN, values: BOOLEAN_VALUES },
  { name: 'LocationContext', group: 'player', ...PLAYER_TOKEN, values: ['Default', 'Desert', 'Island'] },
  { name: 'LocationName', group: 'player', ...PLAYER_TOKEN },
  { name: 'LocationUniqueName', group: 'player', ...PLAYER_TOKEN },
  { name: 'LocationOwnerId', group: 'player', ...PLAYER_TOKEN },
  { name: 'PlayerGender', group: 'player', ...PLAYER_TOKEN, values: ['Female', 'Male'] },
  { name: 'PlayerName', group: 'player', ...PLAYER_TOKEN },
  { name: 'PreferredPet', group: 'player', ...NO_INPUT, values: ['Cat', 'Dog'] },
  { name: 'SkillLevel', group: 'player', ...REQUIRED_INPUT },

  // ── Relationships ──
  { name: 'ChildNames', group: 'relationship', ...PLAYER_TOKEN },
  { name: 'ChildGenders', group: 'relationship', ...PLAYER_TOKEN, values: ['Female', 'Male'] },
  { name: 'Hearts', group: 'relationship', ...REQUIRED_INPUT },
  {
    name: 'Relationship',
    group: 'relationship',
    ...REQUIRED_INPUT,
    values: ['Unmet', 'Friendly', 'Dating', 'Engaged', 'Married', 'Divorced'],
  },
  { name: 'Roommate', group: 'relationship', ...PLAYER_TOKEN },
  { name: 'Spouse', group: 'relationship', ...PLAYER_TOKEN },

  // ── World ──
  { name: 'FarmCave', group: 'world', ...NO_INPUT, values: ['None', 'Bats', 'Mushrooms'] },
  {
    name: 'FarmMapAsset',
    group: 'world',
    ...NO_INPUT,
    values: ['Farm', 'Farm_Island', 'Farm_Foraging', 'Farm_FourCorners', 'Farm_Mining', 'Farm_Ranching', 'Farm_Fishing', 'Farm_Combat'],
  },
  { name: 'FarmName', group: 'world', ...NO_INPUT },
  {
    name: 'FarmType',
    group: 'world',
    ...NO_INPUT,
    values: ['Standard', 'Beach', 'FourCorners', 'Forest', 'Hilltop', 'Riverland', 'Wilderness', 'Custom'],
  },
  { name: 'IsCommunityCenterComplete', group: 'world', ...NO_INPUT, values: BOOLEAN_VALUES },
  { name: 'IsJojaMartComplete', group: 'world', ...NO_INPUT, values: BOOLEAN_VALUES },
  { name: 'HavingChild', group: 'world', ...NO_INPUT },
  { name: 'Pregnant', group: 'world', ...NO_INPUT },

  // ── Number manipulation ──
  { name: 'Count', group: 'number', ...REQUIRED_INPUT },
  { name: 'Query', group: 'number', ...REQUIRED_INPUT },
  { name: 'Range', group: 'number', ...REQUIRED_INPUT },
  { name: 'Round', group: 'number', ...REQUIRED_INPUT },

  // ── String manipulation ──
  { name: 'Lowercase', group: 'string', ...REQUIRED_INPUT },
  { name: 'Uppercase', group: 'string', ...REQUIRED_INPUT },
  { name: 'Merge', group: 'string', ...REQUIRED_INPUT },
  { name: 'PathPart', group: 'string', ...REQUIRED_INPUT },
  { name: 'Render', group: 'string', ...REQUIRED_INPUT },

  // ── Metadata ──
  { name: 'FirstValidFile', group: 'metadata', ...REQUIRED_INPUT },
  { name: 'HasMod', group: 'metadata', ...NO_INPUT },
  { name: 'HasFile', group: 'metadata', ...REQUIRED_INPUT, values: BOOLEAN_VALUES },
  { name: 'HasValue', group: 'metadata', ...REQUIRED_INPUT, values: BOOLEAN_VALUES },
  { name: 'i18n', group: 'metadata', ...REQUIRED_INPUT },
  { name: 'Language', group: 'metadata', ...NO_INPUT, values: ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'] },
  { name: 'ModId', group: 'metadata', ...NO_INPUT },

  // ── Field references (patch blocks only) ──
  { name: 'FromFile', group: 'fieldReference', ...NO_INPUT, patchBlockOnly: true },
  { name: 'Target', group: 'fieldReference', ...NO_INPUT, patchBlockOnly: true },
  { name: 'TargetPathOnly', group: 'fieldReference', ...NO_INPUT, patchBlockOnly: true },
  { name: 'TargetWithoutPath', group: 'fieldReference', ...NO_INPUT, patchBlockOnly: true },

  // ── Specialized ──
  { name: 'AbsoluteFilePath', group: 'specialized', ...REQUIRED_INPUT },
  { name: 'FormatAssetName', group: 'specialized', ...REQUIRED_INPUT },
  { name: 'InternalAssetKey', group: 'specialized', ...REQUIRED_INPUT },

  // ── Randomization ──
  { name: 'Random', group: 'random', ...REQUIRED_INPUT, whenKeyCaveat: 'undocumented' },
]

const TOKEN_INDEX = new Map(CP_BUILTIN_TOKENS.map((token) => [token.name.toLowerCase(), token]))

/** Looks up a built-in token by name, case-insensitively. */
export function findCpToken(name: string): CpTokenDefinition | undefined {
  return TOKEN_INDEX.get(name.trim().toLowerCase())
}

/** All built-in token names, catalog order. */
export function listCpTokenNames(): string[] {
  return CP_BUILTIN_TOKENS.map((token) => token.name)
}
