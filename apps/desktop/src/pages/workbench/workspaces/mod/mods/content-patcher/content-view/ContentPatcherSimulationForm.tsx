import { useState } from 'react'
import type { ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { useModWorkspaceCopy } from '@locales/provider'

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
    return ''
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
  title,
  configEntries,
  value,
  onChange,
  dynamicTokens,
}: ContentPatcherSimulationFormProps) {
  const copy = useModWorkspaceCopy().contentPatcherSimulation
  const fields = copy.fields
  const [showAdvanced, setShowAdvanced] = useState(false)
  const dynamicTokenEntries = Object.entries(dynamicTokens ?? {})
  const resolvedTitle = title ?? copy.title

  return (
    <section className={compact ? 'cp-debugger-card cp-debugger-context-card' : 'cp-debugger-card'}>
      {showTitle ? <h3 className="cp-debugger-card-title">{resolvedTitle}</h3> : null}
      <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
        <label className="cp-debugger-field cp-debugger-field-full">
          <span>{copy.ignoreEntryWhenConditions}</span>
          <select
            value={value.ignoreEntryWhenConditions ? 'true' : 'false'}
            onChange={(event) => onChange({ ...value, ignoreEntryWhenConditions: event.target.value === 'true' })}
            aria-label={copy.ignoreEntryWhenConditionsAria}
          >
            <option value="false">{copy.ignoreWhenNo}</option>
            <option value="true">{copy.ignoreWhenYes}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.season}</span>
          <select value={value.season} onChange={(event) => onChange({ ...value, season: event.target.value })} aria-label={fields.season}>
            <option value="">{copy.any}</option>
            <option value="spring">{copy.options.seasons.spring}</option>
            <option value="summer">{copy.options.seasons.summer}</option>
            <option value="fall">{copy.options.seasons.fall}</option>
            <option value="winter">{copy.options.seasons.winter}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.weather}</span>
          <select
            value={value.weather}
            onChange={(event) => onChange({ ...value, weather: event.target.value })}
            aria-label={fields.weather}
          >
            <option value="">{copy.any}</option>
            <option value="sunny">{copy.options.weather.sunny}</option>
            <option value="rain">{copy.options.weather.rain}</option>
            <option value="storm">{copy.options.weather.storm}</option>
            <option value="snow">{copy.options.weather.snow}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.day}</span>
          <input
            type="number"
            value={value.day ?? ''}
            onChange={(event) => onChange({ ...value, day: parseOptionalNumber(event.target.value) })}
            aria-label={fields.day}
            placeholder={copy.any}
          />
        </label>
        <label className="cp-debugger-field">
          <span>{fields.dayOfWeek}</span>
          <select
            value={value.dayOfWeek}
            onChange={(event) => onChange({ ...value, dayOfWeek: event.target.value })}
            aria-label={fields.dayOfWeek}
          >
            <option value="">{copy.any}</option>
            <option value="Monday">{copy.options.daysOfWeek.Monday}</option>
            <option value="Tuesday">{copy.options.daysOfWeek.Tuesday}</option>
            <option value="Wednesday">{copy.options.daysOfWeek.Wednesday}</option>
            <option value="Thursday">{copy.options.daysOfWeek.Thursday}</option>
            <option value="Friday">{copy.options.daysOfWeek.Friday}</option>
            <option value="Saturday">{copy.options.daysOfWeek.Saturday}</option>
            <option value="Sunday">{copy.options.daysOfWeek.Sunday}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.year}</span>
          <input
            type="number"
            value={value.year ?? ''}
            onChange={(event) => onChange({ ...value, year: parseOptionalNumber(event.target.value) })}
            aria-label={fields.year}
            placeholder={copy.any}
          />
        </label>
        <label className="cp-debugger-field">
          <span>{fields.time}</span>
          <input
            type="number"
            value={value.time ?? ''}
            onChange={(event) => onChange({ ...value, time: parseOptionalNumber(event.target.value) })}
            aria-label={fields.time}
            placeholder={copy.any}
          />
        </label>
        <label className="cp-debugger-field">
          <span>{fields.playerName}</span>
          <input
            value={value.playerName}
            onChange={(event) => onChange({ ...value, playerName: event.target.value })}
            aria-label={fields.playerName}
            placeholder={copy.any}
          />
        </label>
        <label className="cp-debugger-field">
          <span>{fields.playerGender}</span>
          <select
            value={value.playerGender}
            onChange={(event) => onChange({ ...value, playerGender: event.target.value })}
            aria-label={fields.playerGender}
          >
            <option value="">{copy.any}</option>
            <option value="Male">{copy.options.playerGender.Male}</option>
            <option value="Female">{copy.options.playerGender.Female}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.farmType}</span>
          <select
            value={value.farmType}
            onChange={(event) => onChange({ ...value, farmType: event.target.value })}
            aria-label={fields.farmType}
          >
            <option value="">{copy.any}</option>
            <option value="Standard">{copy.options.farmType.Standard}</option>
            <option value="Riverland">{copy.options.farmType.Riverland}</option>
            <option value="Forest">{copy.options.farmType.Forest}</option>
            <option value="Hill-top">{copy.options.farmType['Hill-top']}</option>
            <option value="Wilderness">{copy.options.farmType.Wilderness}</option>
            <option value="Four Corners">{copy.options.farmType['Four Corners']}</option>
            <option value="Beach">{copy.options.farmType.Beach}</option>
            <option value="Meadowlands">{copy.options.farmType.Meadowlands}</option>
          </select>
        </label>
        <label className="cp-debugger-field">
          <span>{fields.hasFlags}</span>
          <input
            value={stringifyArray(value.hasFlags)}
            onChange={(event) => onChange({ ...value, hasFlags: parseArray(event.target.value) })}
            aria-label={fields.hasFlags}
            placeholder={copy.commaSeparatedPlaceholder}
          />
        </label>
        <label className="cp-debugger-field">
          <span>{fields.hasSeenEvents}</span>
          <input
            value={stringifyArray(value.hasSeenEvents)}
            onChange={(event) => onChange({ ...value, hasSeenEvents: parseArray(event.target.value) })}
            aria-label={fields.hasSeenEvents}
            placeholder={copy.commaSeparatedPlaceholder}
          />
        </label>
        {configEntries.map(({ key, defaultValue }) => {
          const displayedValue =
            value.config[key] !== undefined ? stringifyDisplayValue(value.config[key]) : stringifyDisplayValue(defaultValue)

          return (
            <label key={key} className="cp-debugger-field">
              <span>{copy.configLabel(key)}</span>
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
                aria-label={copy.configLabel(key)}
                placeholder={defaultValue == null ? copy.any : stringifyDisplayValue(defaultValue)}
              />
            </label>
          )
        })}
      </div>
      <button type="button" className="cp-debugger-advanced-toggle" onClick={() => setShowAdvanced((prev) => !prev)}>
        {showAdvanced ? copy.hideAdvanced : copy.showAdvanced}
      </button>
      {showAdvanced ? (
        <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
          <label className="cp-debugger-field">
            <span>{fields.daysPlayed}</span>
            <input
              type="number"
              value={value.daysPlayed ?? ''}
              onChange={(event) => onChange({ ...value, daysPlayed: parseOptionalNumber(event.target.value) })}
              aria-label={fields.daysPlayed}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.farmName}</span>
            <input
              value={value.farmName}
              onChange={(event) => onChange({ ...value, farmName: event.target.value })}
              aria-label={fields.farmName}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.locationName}</span>
            <input
              value={value.locationName}
              onChange={(event) => onChange({ ...value, locationName: event.target.value })}
              aria-label={fields.locationName}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.spouse}</span>
            <input
              value={value.spouse}
              onChange={(event) => onChange({ ...value, spouse: event.target.value })}
              aria-label={fields.spouse}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.isMainPlayer}</span>
            <select
              value={value.isMainPlayer === undefined ? '' : String(value.isMainPlayer)}
              onChange={(event) => onChange({ ...value, isMainPlayer: parseOptionalBool(event.target.value) })}
              aria-label={fields.isMainPlayer}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.stardropCount}</span>
            <input
              type="number"
              value={value.stardropCount ?? ''}
              onChange={(event) => onChange({ ...value, stardropCount: parseOptionalNumber(event.target.value) })}
              aria-label={fields.stardropCount}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasPet}</span>
            <select
              value={value.hasPet === undefined ? '' : String(value.hasPet)}
              onChange={(event) => onChange({ ...value, hasPet: parseOptionalBool(event.target.value) })}
              aria-label={fields.hasPet}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.petType}</span>
            <select
              value={value.petType}
              onChange={(event) => onChange({ ...value, petType: event.target.value })}
              aria-label={fields.petType}
            >
              <option value="">{copy.any}</option>
              <option value="Cat">{copy.options.petType.Cat}</option>
              <option value="Dog">{copy.options.petType.Dog}</option>
              <option value="Turtle">{copy.options.petType.Turtle}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasChildren}</span>
            <select
              value={value.hasChildren === undefined ? '' : String(value.hasChildren)}
              onChange={(event) => onChange({ ...value, hasChildren: parseOptionalBool(event.target.value) })}
              aria-label={fields.hasChildren}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.childCount}</span>
            <input
              type="number"
              value={value.childCount ?? ''}
              onChange={(event) => onChange({ ...value, childCount: parseOptionalNumber(event.target.value) })}
              aria-label={fields.childCount}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.farmhouseUpgrade}</span>
            <input
              type="number"
              value={value.farmhouseUpgrade ?? ''}
              onChange={(event) => onChange({ ...value, farmhouseUpgrade: parseOptionalNumber(event.target.value) })}
              aria-label={fields.farmhouseUpgrade}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.communityCenterComplete}</span>
            <select
              value={value.isCommunityCenterComplete === undefined ? '' : String(value.isCommunityCenterComplete)}
              onChange={(event) => onChange({ ...value, isCommunityCenterComplete: parseOptionalBool(event.target.value) })}
              aria-label={fields.communityCenterComplete}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.jojaMartComplete}</span>
            <select
              value={value.isJojaMartComplete === undefined ? '' : String(value.isJojaMartComplete)}
              onChange={(event) => onChange({ ...value, isJojaMartComplete: parseOptionalBool(event.target.value) })}
              aria-label={fields.jojaMartComplete}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.language}</span>
            <input
              value={value.language}
              onChange={(event) => onChange({ ...value, language: event.target.value })}
              aria-label={fields.language}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.dayEvent}</span>
            <input
              value={value.dayEvent}
              onChange={(event) => onChange({ ...value, dayEvent: event.target.value })}
              aria-label={fields.dayEvent}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.dailyLuck}</span>
            <input
              type="number"
              step="0.01"
              value={value.dailyLuck ?? ''}
              onChange={(event) => onChange({ ...value, dailyLuck: parseOptionalNumber(event.target.value) })}
              aria-label={fields.dailyLuck}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.locationContext}</span>
            <input
              value={value.locationContext}
              onChange={(event) => onChange({ ...value, locationContext: event.target.value })}
              aria-label={fields.locationContext}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.locationUniqueName}</span>
            <input
              value={value.locationUniqueName}
              onChange={(event) => onChange({ ...value, locationUniqueName: event.target.value })}
              aria-label={fields.locationUniqueName}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.locationOwnerId}</span>
            <input
              value={value.locationOwnerId}
              onChange={(event) => onChange({ ...value, locationOwnerId: event.target.value })}
              aria-label={fields.locationOwnerId}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.isOutdoors}</span>
            <select
              value={value.isOutdoors === undefined ? '' : String(value.isOutdoors)}
              onChange={(event) => onChange({ ...value, isOutdoors: parseOptionalBool(event.target.value) })}
              aria-label={fields.isOutdoors}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.preferredPet}</span>
            <select
              value={value.preferredPet}
              onChange={(event) => onChange({ ...value, preferredPet: event.target.value })}
              aria-label={fields.preferredPet}
            >
              <option value="">{copy.any}</option>
              <option value="Cat">{copy.options.petType.Cat}</option>
              <option value="Dog">{copy.options.petType.Dog}</option>
              <option value="Turtle">{copy.options.petType.Turtle}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.roommate}</span>
            <input
              value={value.roommate}
              onChange={(event) => onChange({ ...value, roommate: event.target.value })}
              aria-label={fields.roommate}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hearts}</span>
            <input
              value={stringifyHearts(value.hearts)}
              onChange={(event) => onChange({ ...value, hearts: parseHearts(event.target.value) })}
              aria-label={fields.hearts}
              placeholder="Abigail:10, Sebastian:8"
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.skillLevels}</span>
            <input
              value={stringifySkillLevels(value.skillLevels)}
              onChange={(event) => onChange({ ...value, skillLevels: parseSkillLevels(event.target.value) })}
              aria-label={fields.skillLevels}
              placeholder="Farming:10, Mining:5"
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.relationships}</span>
            <input
              value={stringifyRelationships(value.relationships)}
              onChange={(event) => onChange({ ...value, relationships: parseRelationships(event.target.value) })}
              aria-label={fields.relationships}
              placeholder="Abigail:Married, Sebastian:Dating"
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.farmCave}</span>
            <select
              value={value.farmCave}
              onChange={(event) => onChange({ ...value, farmCave: event.target.value })}
              aria-label={fields.farmCave}
            >
              <option value="">{copy.any}</option>
              <option value="Bats">{copy.options.farmCave.Bats}</option>
              <option value="Mushrooms">{copy.options.farmCave.Mushrooms}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.farmMapAsset}</span>
            <input
              value={value.farmMapAsset}
              onChange={(event) => onChange({ ...value, farmMapAsset: event.target.value })}
              aria-label={fields.farmMapAsset}
              placeholder={copy.any}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.havingChild}</span>
            <select
              value={value.havingChild === undefined ? '' : String(value.havingChild)}
              onChange={(event) => onChange({ ...value, havingChild: parseOptionalBool(event.target.value) })}
              aria-label={fields.havingChild}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.pregnant}</span>
            <select
              value={value.pregnant === undefined ? '' : String(value.pregnant)}
              onChange={(event) => onChange({ ...value, pregnant: parseOptionalBool(event.target.value) })}
              aria-label={fields.pregnant}
            >
              <option value="">{copy.any}</option>
              <option value="true">{copy.trueLabel}</option>
              <option value="false">{copy.falseLabel}</option>
            </select>
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasCaughtFish}</span>
            <input
              value={stringifyArray(value.hasCaughtFish)}
              onChange={(event) => onChange({ ...value, hasCaughtFish: parseArray(event.target.value) })}
              aria-label={fields.hasCaughtFish}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasReadLetters}</span>
            <input
              value={stringifyArray(value.hasReadLetters)}
              onChange={(event) => onChange({ ...value, hasReadLetters: parseArray(event.target.value) })}
              aria-label={fields.hasReadLetters}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasVisitedLocations}</span>
            <input
              value={stringifyArray(value.hasVisitedLocations)}
              onChange={(event) => onChange({ ...value, hasVisitedLocations: parseArray(event.target.value) })}
              aria-label={fields.hasVisitedLocations}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.childNames}</span>
            <input
              value={stringifyArray(value.childNames)}
              onChange={(event) => onChange({ ...value, childNames: parseArray(event.target.value) })}
              aria-label={fields.childNames}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.childGenders}</span>
            <input
              value={stringifyArray(value.childGenders)}
              onChange={(event) => onChange({ ...value, childGenders: parseArray(event.target.value) })}
              aria-label={fields.childGenders}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasProfessions}</span>
            <input
              value={stringifyArray(value.hasProfessions)}
              onChange={(event) => onChange({ ...value, hasProfessions: parseArray(event.target.value) })}
              aria-label={fields.hasProfessions}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasWalletItems}</span>
            <input
              value={stringifyArray(value.hasWalletItems)}
              onChange={(event) => onChange({ ...value, hasWalletItems: parseArray(event.target.value) })}
              aria-label={fields.hasWalletItems}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasCraftingRecipes}</span>
            <input
              value={stringifyArray(value.hasCraftingRecipes)}
              onChange={(event) => onChange({ ...value, hasCraftingRecipes: parseArray(event.target.value) })}
              aria-label={fields.hasCraftingRecipes}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasCookingRecipes}</span>
            <input
              value={stringifyArray(value.hasCookingRecipes)}
              onChange={(event) => onChange({ ...value, hasCookingRecipes: parseArray(event.target.value) })}
              aria-label={fields.hasCookingRecipes}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasItems}</span>
            <input
              value={stringifyArray(value.hasItems)}
              onChange={(event) => onChange({ ...value, hasItems: parseArray(event.target.value) })}
              aria-label={fields.hasItems}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasActiveQuests}</span>
            <input
              value={stringifyArray(value.hasActiveQuests)}
              onChange={(event) => onChange({ ...value, hasActiveQuests: parseArray(event.target.value) })}
              aria-label={fields.hasActiveQuests}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasCompletedQuests}</span>
            <input
              value={stringifyArray(value.hasCompletedQuests)}
              onChange={(event) => onChange({ ...value, hasCompletedQuests: parseArray(event.target.value) })}
              aria-label={fields.hasCompletedQuests}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasConversationTopics}</span>
            <input
              value={stringifyArray(value.hasConversationTopics)}
              onChange={(event) => onChange({ ...value, hasConversationTopics: parseArray(event.target.value) })}
              aria-label={fields.hasConversationTopics}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.hasDialogueAnswers}</span>
            <input
              value={stringifyArray(value.hasDialogueAnswers)}
              onChange={(event) => onChange({ ...value, hasDialogueAnswers: parseArray(event.target.value) })}
              aria-label={fields.hasDialogueAnswers}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.installedMods}</span>
            <input
              value={stringifyArray(value.installedMods)}
              onChange={(event) => onChange({ ...value, installedMods: parseArray(event.target.value) })}
              aria-label={fields.installedMods}
              placeholder={copy.commaSeparatedPlaceholder}
            />
          </label>
          <label className="cp-debugger-field">
            <span>{fields.customTokens}</span>
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
              aria-label={fields.customTokens}
              placeholder='{"TokenName": "value"}'
            />
          </label>
        </div>
      ) : null}
      {dynamicTokenEntries.length > 0 ? (
        <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
          <div className="cp-debugger-field cp-debugger-field-full">
            <span>{copy.dynamicTokens}</span>
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
