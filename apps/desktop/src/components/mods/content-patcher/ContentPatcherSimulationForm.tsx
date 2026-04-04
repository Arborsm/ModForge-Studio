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

export function ContentPatcherSimulationForm({
  compact = false,
  showTitle = true,
  title = 'Simulation Context',
  configEntries,
  value,
  onChange,
}: ContentPatcherSimulationFormProps) {
  return (
    <section className={compact ? 'cp-debugger-card cp-debugger-context-card' : 'cp-debugger-card'}>
      {showTitle ? <h3 className="cp-debugger-card-title">{title}</h3> : null}
      <div className={compact ? 'cp-debugger-form-grid cp-debugger-form-grid-compact' : 'cp-debugger-form-grid'}>
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
          <span>Relationship</span>
          <input
            value={String(value.relationship ?? '')}
            onChange={(event) => onChange({ ...value, relationship: event.target.value })}
            aria-label="Simulation Relationship"
            placeholder="Any"
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
    </section>
  )
}
