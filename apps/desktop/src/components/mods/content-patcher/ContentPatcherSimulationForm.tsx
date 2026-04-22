import { useState } from 'react'
import type { ContentPatcherBackendSimulationContext } from '../../../lib/plugins/contentPatcher'

type ContentPatcherSimulationConfigEntry = {
  key: string
  defaultValue: unknown
}

type ContentPatcherSimulationFormProps = {
  compact?: boolean
  showTitle?: boolean
  title?: string
  configEntries: ContentPatcherSimulationConfigEntry[]
  value: ContentPatcherBackendSimulationContext
  onChange: (next: ContentPatcherBackendSimulationContext) => void
  dynamicTokens?: Record<string, unknown>
}

function coerceConfigValue(value: string) {
  const trimmed = value.trim()
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }
  if (trimmed.toLowerCase() === 'true') {
    return true
  }
  if (trimmed.toLowerCase() === 'false') {
    return false
  }
  return trimmed
}

function stringifyDisplayValue(value: unknown) {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseOptionalBool(value: string): boolean | undefined {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return undefined
}

function stringifyArray(value: string[]): string {
  return value.join(', ')
}

function parseArray(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function stringifyHearts(value: Record<string, number>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

function parseHearts(value: string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [name, countStr] = trimmed.split(':')
    if (name && countStr) {
      const count = Number(countStr.trim())
      if (!Number.isNaN(count)) {
        result[name.trim()] = count
      }
    }
  }
  return result
}

function stringifySkillLevels(value: Record<string, number>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

function parseSkillLevels(value: string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [name, levelStr] = trimmed.split(':')
    if (name && levelStr) {
      const level = Number(levelStr.trim())
      if (!Number.isNaN(level)) {
        result[name.trim()] = level
      }
    }
  }
  return result
}

function stringifyRelationships(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

function parseRelationships(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [name, relStr] = trimmed.split(':')
    if (name && relStr) {
      result[name.trim()] = relStr.trim()
    }
  }
  return result
}

export function ContentPatcherSimulationForm({
  compact = false,
  showTitle = true,
  title = 'Simulation Context',
  configEntries,
  value,
  onChange,
  dynamicTokens,
}: ContentPatcherSimulationFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const dynamicTokenEntries = Object.entries(dynamicTokens ?? {})

  return (
    <section className={compact ? 'cp-debugger-card cp-debugger-context-card' : 'cp-debugger-card'}>
      {showTitle ? <h3 className="cp-debugger-card-title">{title}</h3> : null}
      <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
        <label className="cp-debugger-field cp-debugger-field-full">
          <span>Ignore Entry When Conditions</span>
          <select
            value={value.ignoreEntryWhenConditions ? 'true' : 'false'}
            onChange={(event) => onChange({ ...value, ignoreEntryWhenConditions: event.target.value === 'true' })}
            aria-label="Ignore Entry When Conditions"
          >
            <option value="false">No (respect When conditions inside Entries)</option>
            <option value="true">Yes (show all entries regardless of When)</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Season</span>
          <select
            value={value.season}
            onChange={(event) => onChange({ ...value, season: event.target.value })}
            aria-label="Simulation Season"
          >
            <option value="">Any</option>
            <option value="spring">Spring</option>
            <option value="summer">Summer</option>
            <option value="fall">Fall</option>
            <option value="winter">Winter</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Weather</span>
          <select
            value={value.weather}
            onChange={(event) => onChange({ ...value, weather: event.target.value })}
            aria-label="Simulation Weather"
          >
            <option value="">Any</option>
            <option value="sunny">Sunny</option>
            <option value="rain">Rain</option>
            <option value="storm">Storm</option>
            <option value="snow">Snow</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Day</span>
          <input
            type="number"
            value={value.day ?? ''}
            onChange={(event) => onChange({ ...value, day: parseOptionalNumber(event.target.value) })}
            aria-label="Simulation Day"
            placeholder="Any"
          />
        </label>
        <label className="cp-debugger-field">
          <span>Day of Week</span>
          <select
            value={value.dayOfWeek}
            onChange={(event) => onChange({ ...value, dayOfWeek: event.target.value })}
            aria-label="Simulation Day of Week"
          >
            <option value="">Any</option>
            <option value="Monday">Monday</option>
            <option value="Tuesday">Tuesday</option>
            <option value="Wednesday">Wednesday</option>
            <option value="Thursday">Thursday</option>
            <option value="Friday">Friday</option>
            <option value="Saturday">Saturday</option>
            <option value="Sunday">Sunday</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Year</span>
          <input
            type="number"
            value={value.year ?? ''}
            onChange={(event) => onChange({ ...value, year: parseOptionalNumber(event.target.value) })}
            aria-label="Simulation Year"
            placeholder="Any"
          />
        </label>
        <label className="cp-debugger-field">
          <span>Time</span>
          <input
            type="number"
            value={value.time ?? ''}
            onChange={(event) => onChange({ ...value, time: parseOptionalNumber(event.target.value) })}
            aria-label="Simulation Time"
            placeholder="Any"
          />
        </label>
        <label className="cp-debugger-field">
          <span>Player Name</span>
          <input
            value={value.playerName}
            onChange={(event) => onChange({ ...value, playerName: event.target.value })}
            aria-label="Simulation Player Name"
            placeholder="Any"
          />
        </label>
        <label className="cp-debugger-field">
          <span>Player Gender</span>
          <select
            value={value.playerGender}
            onChange={(event) => onChange({ ...value, playerGender: event.target.value })}
            aria-label="Simulation Player Gender"
          >
            <option value="">Any</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Farm Type</span>
          <select
            value={value.farmType}
            onChange={(event) => onChange({ ...value, farmType: event.target.value })}
            aria-label="Simulation Farm Type"
          >
            <option value="">Any</option>
            <option value="Standard">Standard</option>
            <option value="Riverland">Riverland</option>
            <option value="Forest">Forest</option>
            <option value="Hill-top">Hill-top</option>
            <option value="Wilderness">Wilderness</option>
            <option value="Four Corners">Four Corners</option>
            <option value="Beach">Beach</option>
            <option value="Meadowlands">Meadowlands</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>Has Flags</span>
          <input
            value={stringifyArray(value.hasFlags)}
            onChange={(event) => onChange({ ...value, hasFlags: parseArray(event.target.value) })}
            aria-label="Simulation Has Flags"
            placeholder="comma,separated"
          />
        </label>
        <label className="cp-debugger-field">
          <span>Has Seen Events</span>
          <input
            value={stringifyArray(value.hasSeenEvents)}
            onChange={(event) => onChange({ ...value, hasSeenEvents: parseArray(event.target.value) })}
            aria-label="Simulation Has Seen Events"
            placeholder="comma,separated"
          />
        </label>
        {configEntries.map(({ key, defaultValue }) => {
          const displayedValue =
            value.config[key] !== undefined ? stringifyDisplayValue(value.config[key]) : stringifyDisplayValue(defaultValue)

          return (
          <label key={key} className="cp-debugger-field">
            <span>{`Config ${key}`}</span>
            <input
              value={displayedValue}
              onChange={(event) => {
                const nextConfig = { ...value.config }
                const nextValue = event.target.value.trim()
                if (!nextValue) {
                  delete nextConfig[key]
                } else {
                  nextConfig[key] = coerceConfigValue(nextValue)
                }
                onChange({ ...value, config: nextConfig })
              }}
              aria-label={`Config ${key}`}
              placeholder={defaultValue == null ? 'Any' : stringifyDisplayValue(defaultValue)}
            />
          </label>
          )
        })}
      </div>
      <button
        type="button"
        className="cp-debugger-advanced-toggle"
        onClick={() => setShowAdvanced((prev) => !prev)}
      >
        {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
      </button>
      {showAdvanced ? (
        <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
          <label className="cp-debugger-field">
            <span>Days Played</span>
            <input
              type="number"
              value={value.daysPlayed ?? ''}
              onChange={(event) => onChange({ ...value, daysPlayed: parseOptionalNumber(event.target.value) })}
              aria-label="Simulation Days Played"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Farm Name</span>
            <input
              value={value.farmName}
              onChange={(event) => onChange({ ...value, farmName: event.target.value })}
              aria-label="Simulation Farm Name"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Location Name</span>
            <input
              value={value.locationName}
              onChange={(event) => onChange({ ...value, locationName: event.target.value })}
              aria-label="Simulation Location Name"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Spouse</span>
            <input
              value={value.spouse}
              onChange={(event) => onChange({ ...value, spouse: event.target.value })}
              aria-label="Simulation Spouse"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Is Main Player</span>
            <select
              value={value.isMainPlayer === undefined ? '' : String(value.isMainPlayer)}
              onChange={(event) => onChange({ ...value, isMainPlayer: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Is Main Player"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Stardrop Count</span>
            <input
              type="number"
              value={value.stardropCount ?? ''}
              onChange={(event) => onChange({ ...value, stardropCount: parseOptionalNumber(event.target.value) })}
              aria-label="Simulation Stardrop Count"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Pet</span>
            <select
              value={value.hasPet === undefined ? '' : String(value.hasPet)}
              onChange={(event) => onChange({ ...value, hasPet: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Has Pet"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Pet Type</span>
            <select
              value={value.petType}
              onChange={(event) => onChange({ ...value, petType: event.target.value })}
              aria-label="Simulation Pet Type"
            >
              <option value="">Any</option>
              <option value="Cat">Cat</option>
              <option value="Dog">Dog</option>
              <option value="Turtle">Turtle</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Has Children</span>
            <select
              value={value.hasChildren === undefined ? '' : String(value.hasChildren)}
              onChange={(event) => onChange({ ...value, hasChildren: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Has Children"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Child Count</span>
            <input
              type="number"
              value={value.childCount ?? ''}
              onChange={(event) => onChange({ ...value, childCount: parseOptionalNumber(event.target.value) })}
              aria-label="Simulation Child Count"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Farmhouse Upgrade</span>
            <input
              type="number"
              value={value.farmhouseUpgrade ?? ''}
              onChange={(event) => onChange({ ...value, farmhouseUpgrade: parseOptionalNumber(event.target.value) })}
              aria-label="Simulation Farmhouse Upgrade"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Community Center Complete</span>
            <select
              value={value.isCommunityCenterComplete === undefined ? '' : String(value.isCommunityCenterComplete)}
              onChange={(event) => onChange({ ...value, isCommunityCenterComplete: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Community Center Complete"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Joja Mart Complete</span>
            <select
              value={value.isJojaMartComplete === undefined ? '' : String(value.isJojaMartComplete)}
              onChange={(event) => onChange({ ...value, isJojaMartComplete: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Joja Mart Complete"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Language</span>
            <input
              value={value.language}
              onChange={(event) => onChange({ ...value, language: event.target.value })}
              aria-label="Simulation Language"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Day Event</span>
            <input
              value={value.dayEvent}
              onChange={(event) => onChange({ ...value, dayEvent: event.target.value })}
              aria-label="Simulation Day Event"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Daily Luck</span>
            <input
              type="number"
              step="0.01"
              value={value.dailyLuck ?? ''}
              onChange={(event) => onChange({ ...value, dailyLuck: parseOptionalNumber(event.target.value) })}
              aria-label="Simulation Daily Luck"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Location Context</span>
            <input
              value={value.locationContext}
              onChange={(event) => onChange({ ...value, locationContext: event.target.value })}
              aria-label="Simulation Location Context"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Location Unique Name</span>
            <input
              value={value.locationUniqueName}
              onChange={(event) => onChange({ ...value, locationUniqueName: event.target.value })}
              aria-label="Simulation Location Unique Name"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Location Owner Id</span>
            <input
              value={value.locationOwnerId}
              onChange={(event) => onChange({ ...value, locationOwnerId: event.target.value })}
              aria-label="Simulation Location Owner Id"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Is Outdoors</span>
            <select
              value={value.isOutdoors === undefined ? '' : String(value.isOutdoors)}
              onChange={(event) => onChange({ ...value, isOutdoors: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Is Outdoors"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Preferred Pet</span>
            <select
              value={value.preferredPet}
              onChange={(event) => onChange({ ...value, preferredPet: event.target.value })}
              aria-label="Simulation Preferred Pet"
            >
              <option value="">Any</option>
              <option value="Cat">Cat</option>
              <option value="Dog">Dog</option>
              <option value="Turtle">Turtle</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Roommate</span>
            <input
              value={value.roommate}
              onChange={(event) => onChange({ ...value, roommate: event.target.value })}
              aria-label="Simulation Roommate"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Hearts</span>
            <input
              value={stringifyHearts(value.hearts)}
              onChange={(event) => onChange({ ...value, hearts: parseHearts(event.target.value) })}
              aria-label="Simulation Hearts"
              placeholder="Abigail:10, Sebastian:8"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Skill Levels</span>
            <input
              value={stringifySkillLevels(value.skillLevels)}
              onChange={(event) => onChange({ ...value, skillLevels: parseSkillLevels(event.target.value) })}
              aria-label="Simulation Skill Levels"
              placeholder="Farming:10, Mining:5"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Relationships</span>
            <input
              value={stringifyRelationships(value.relationships)}
              onChange={(event) => onChange({ ...value, relationships: parseRelationships(event.target.value) })}
              aria-label="Simulation Relationships"
              placeholder="Abigail:Married, Sebastian:Dating"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Farm Cave</span>
            <select
              value={value.farmCave}
              onChange={(event) => onChange({ ...value, farmCave: event.target.value })}
              aria-label="Simulation Farm Cave"
            >
              <option value="">Any</option>
              <option value="Bats">Bats</option>
              <option value="Mushrooms">Mushrooms</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Farm Map Asset</span>
            <input
              value={value.farmMapAsset}
              onChange={(event) => onChange({ ...value, farmMapAsset: event.target.value })}
              aria-label="Simulation Farm Map Asset"
              placeholder="Any"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Having Child</span>
            <select
              value={value.havingChild === undefined ? '' : String(value.havingChild)}
              onChange={(event) => onChange({ ...value, havingChild: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Having Child"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Pregnant</span>
            <select
              value={value.pregnant === undefined ? '' : String(value.pregnant)}
              onChange={(event) => onChange({ ...value, pregnant: parseOptionalBool(event.target.value) })}
              aria-label="Simulation Pregnant"
            >
              <option value="">Any</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>Has Caught Fish</span>
            <input
              value={stringifyArray(value.hasCaughtFish)}
              onChange={(event) => onChange({ ...value, hasCaughtFish: parseArray(event.target.value) })}
              aria-label="Simulation Has Caught Fish"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Read Letters</span>
            <input
              value={stringifyArray(value.hasReadLetters)}
              onChange={(event) => onChange({ ...value, hasReadLetters: parseArray(event.target.value) })}
              aria-label="Simulation Has Read Letters"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Visited Locations</span>
            <input
              value={stringifyArray(value.hasVisitedLocations)}
              onChange={(event) => onChange({ ...value, hasVisitedLocations: parseArray(event.target.value) })}
              aria-label="Simulation Has Visited Locations"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Child Names</span>
            <input
              value={stringifyArray(value.childNames)}
              onChange={(event) => onChange({ ...value, childNames: parseArray(event.target.value) })}
              aria-label="Simulation Child Names"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Child Genders</span>
            <input
              value={stringifyArray(value.childGenders)}
              onChange={(event) => onChange({ ...value, childGenders: parseArray(event.target.value) })}
              aria-label="Simulation Child Genders"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Professions</span>
            <input
              value={stringifyArray(value.hasProfessions)}
              onChange={(event) => onChange({ ...value, hasProfessions: parseArray(event.target.value) })}
              aria-label="Simulation Has Professions"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Wallet Items</span>
            <input
              value={stringifyArray(value.hasWalletItems)}
              onChange={(event) => onChange({ ...value, hasWalletItems: parseArray(event.target.value) })}
              aria-label="Simulation Has Wallet Items"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Crafting Recipes</span>
            <input
              value={stringifyArray(value.hasCraftingRecipes)}
              onChange={(event) => onChange({ ...value, hasCraftingRecipes: parseArray(event.target.value) })}
              aria-label="Simulation Has Crafting Recipes"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Cooking Recipes</span>
            <input
              value={stringifyArray(value.hasCookingRecipes)}
              onChange={(event) => onChange({ ...value, hasCookingRecipes: parseArray(event.target.value) })}
              aria-label="Simulation Has Cooking Recipes"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Items</span>
            <input
              value={stringifyArray(value.hasItems)}
              onChange={(event) => onChange({ ...value, hasItems: parseArray(event.target.value) })}
              aria-label="Simulation Has Items"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Active Quests</span>
            <input
              value={stringifyArray(value.hasActiveQuests)}
              onChange={(event) => onChange({ ...value, hasActiveQuests: parseArray(event.target.value) })}
              aria-label="Simulation Has Active Quests"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Completed Quests</span>
            <input
              value={stringifyArray(value.hasCompletedQuests)}
              onChange={(event) => onChange({ ...value, hasCompletedQuests: parseArray(event.target.value) })}
              aria-label="Simulation Has Completed Quests"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Conversation Topics</span>
            <input
              value={stringifyArray(value.hasConversationTopics)}
              onChange={(event) => onChange({ ...value, hasConversationTopics: parseArray(event.target.value) })}
              aria-label="Simulation Has Conversation Topics"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Has Dialogue Answers</span>
            <input
              value={stringifyArray(value.hasDialogueAnswers)}
              onChange={(event) => onChange({ ...value, hasDialogueAnswers: parseArray(event.target.value) })}
              aria-label="Simulation Has Dialogue Answers"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Installed Mods</span>
            <input
              value={stringifyArray(value.installedMods)}
              onChange={(event) => onChange({ ...value, installedMods: parseArray(event.target.value) })}
              aria-label="Simulation Installed Mods"
              placeholder="comma,separated"
            />
          </label>
          <label className="cp-debugger-field">
            <span>Custom Tokens</span>
            <input
              value={(() => {
                try {
                  return JSON.stringify(value.customTokens)
                } catch {
                  return ''
                }
              })()}
              onChange={(event) => {
                const trimmed = event.target.value.trim()
                if (!trimmed) {
                  onChange({ ...value, customTokens: {} })
                  return
                }
                try {
                  const parsed = JSON.parse(trimmed)
                  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    onChange({ ...value, customTokens: parsed })
                  }
                } catch {
                  // ignore invalid JSON while typing
                }
              }}
              aria-label="Simulation Custom Tokens"
              placeholder='{"TokenName": "value"}'
            />
          </label>
        </div>
      ) : null}
      {dynamicTokenEntries.length > 0 ? (
        <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
          <div className="cp-debugger-field cp-debugger-field-full">
            <span>Dynamic Tokens</span>
            <div className="cp-debugger-dynamic-tokens">
              {dynamicTokenEntries.map(([name, tokenValue]) => (
                <div key={name} className="cp-debugger-dynamic-token-row">
                  <code className="cp-debugger-dynamic-token-name">{name}</code>
                  <span className="cp-debugger-dynamic-token-value">
                    {typeof tokenValue === 'string' ? tokenValue : JSON.stringify(tokenValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
