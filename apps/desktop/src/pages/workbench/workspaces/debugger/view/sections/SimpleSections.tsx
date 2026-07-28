import { useEffect, useState } from 'react'
import { useGameDebuggerCopy } from '@locales/provider'
import {
  BRIDGE_WEATHER_IDS,
  buildAddMoneyCommand,
  buildSetFriendshipCommand,
  buildSetHealthCommand,
  buildSetStaminaCommand,
  buildSetTimeCommand,
  buildSetWeatherTomorrowCommand,
  buildSpeechCommand,
  buildWarpCommand,
  formatBridgeTime,
  type BridgeWeatherId,
} from '@entities/debug-bridge'
import { loadResourceRegistry } from '@entities/game/api'
import { cx } from '@shared/lib/helper'
import type { GameDebuggerWorkspaceState } from '../../state/useGameDebuggerWorkspace'

type ActionFeedback = { tone: 'success' | 'error'; text: string } | null

function FeedbackLine({ feedback }: { feedback: ActionFeedback }) {
  if (feedback === null) return null
  return <p className={cx('game-debugger-feedback', feedback.tone === 'error' ? 'is-error' : 'is-success')}>{feedback.text}</p>
}

type SectionProps = { workspace: GameDebuggerWorkspaceState; connected: boolean }

/** Dialogue section: show a raw dialogue string for an NPC in the running game. */
export function DialogueSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [npc, setNpc] = useState('')
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)

  async function show() {
    if (!npc.trim()) {
      setFeedback({ tone: 'error', text: copy.dialogue.npcRequired })
      return
    }
    if (!text.trim()) {
      setFeedback({ tone: 'error', text: copy.dialogue.textRequired })
      return
    }
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildSpeechCommand(npc.trim(), text))
      setFeedback(response.ok ? { tone: 'success', text: copy.dialogue.shownStatus } : { tone: 'error', text: response.error ?? '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.dialogue.title}</div>
        <p className="game-debugger-card-hint">{copy.dialogue.hint}</p>
        <label className="game-debugger-field">
          <span>{copy.dialogue.npcLabel}</span>
          <input
            type="text"
            className="control-input"
            value={npc}
            placeholder={copy.dialogue.npcPlaceholder}
            onChange={(event) => setNpc(event.target.value)}
          />
        </label>
        <label className="game-debugger-field">
          <span>{copy.dialogue.textLabel}</span>
          <textarea
            className="control-input game-debugger-textarea"
            value={text}
            placeholder={copy.dialogue.textPlaceholder}
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="game-debugger-actions">
          <button type="button" className="control-button is-accent" disabled={!connected || busy} onClick={() => void show()}>
            {copy.dialogue.showAction}
          </button>
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}

/** Player section: money, stamina, and health controls. */
export function PlayerSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [moneyAmount, setMoneyAmount] = useState('1000')
  const [staminaValue, setStaminaValue] = useState('')
  const [healthValue, setHealthValue] = useState('')
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)
  const maxStamina = workspace.gameState?.maxStamina ?? 270
  const maxHealth = workspace.gameState?.maxHealth ?? 100

  async function run(action: () => ReturnType<GameDebuggerWorkspaceState['runCommand']>, successText: string) {
    setBusy(true)
    try {
      const response = await action()
      setFeedback(response.ok ? { tone: 'success', text: successText } : { tone: 'error', text: response.error ?? '' })
    } finally {
      setBusy(false)
    }
  }

  function adjustMoney(sign: 1 | -1) {
    const amount = Number.parseInt(moneyAmount, 10)
    if (Number.isNaN(amount)) {
      setFeedback({ tone: 'error', text: copy.player.amountRequired })
      return
    }
    void run(() => workspace.runCommand(buildAddMoneyCommand(sign * Math.abs(amount))), copy.player.updatedStatus)
  }

  function setNumeric(raw: string, fallback: number, build: (value: number) => ReturnType<typeof buildSetStaminaCommand>) {
    const parsed = raw.trim() === '' ? fallback : Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) {
      setFeedback({ tone: 'error', text: copy.player.amountRequired })
      return
    }
    void run(() => workspace.runCommand(build(parsed)), copy.player.updatedStatus)
  }

  const disabled = !connected || busy

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.player.title}</div>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.player.moneyLabel}</span>
          <input
            type="number"
            className="control-input game-debugger-number"
            value={moneyAmount}
            placeholder={copy.player.moneyAmountPlaceholder}
            onChange={(event) => setMoneyAmount(event.target.value)}
          />
          <button type="button" className="control-button" disabled={disabled} onClick={() => adjustMoney(1)}>
            {copy.player.moneyAddAction}
          </button>
          <button type="button" className="control-button" disabled={disabled} onClick={() => adjustMoney(-1)}>
            {copy.player.moneyDeductAction}
          </button>
        </div>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.player.staminaLabel}</span>
          <input
            type="number"
            className="control-input game-debugger-number"
            value={staminaValue}
            placeholder={copy.player.valuePlaceholder}
            onChange={(event) => setStaminaValue(event.target.value)}
          />
          <button
            type="button"
            className="control-button"
            disabled={disabled}
            onClick={() => setNumeric(staminaValue, maxStamina, buildSetStaminaCommand)}
          >
            {copy.player.staminaSetAction}
          </button>
          <button
            type="button"
            className="control-button"
            disabled={disabled}
            onClick={() => void run(() => workspace.runCommand(buildSetStaminaCommand(maxStamina)), copy.player.updatedStatus)}
          >
            {copy.player.staminaFillAction}
          </button>
        </div>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.player.healthLabel}</span>
          <input
            type="number"
            className="control-input game-debugger-number"
            value={healthValue}
            placeholder={copy.player.valuePlaceholder}
            onChange={(event) => setHealthValue(event.target.value)}
          />
          <button
            type="button"
            className="control-button"
            disabled={disabled}
            onClick={() => setNumeric(healthValue, maxHealth, buildSetHealthCommand)}
          >
            {copy.player.healthSetAction}
          </button>
          <button
            type="button"
            className="control-button"
            disabled={disabled}
            onClick={() => void run(() => workspace.runCommand(buildSetHealthCommand(maxHealth)), copy.player.updatedStatus)}
          >
            {copy.player.healthFillAction}
          </button>
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}

const WARP_PRESETS: Array<{ location: string; x: number; y: number }> = [
  { location: 'Farm', x: 64, y: 15 },
  { location: 'Town', x: 43, y: 57 },
  { location: 'Beach', x: 39, y: 1 },
  { location: 'Mountain', x: 31, y: 20 },
  { location: 'SeedShop', x: 4, y: 19 },
  { location: 'Saloon', x: 14, y: 24 },
]

/** Warp section: teleport the player to a location and tile. */
export function WarpSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [location, setLocation] = useState('')
  const [x, setX] = useState('0')
  const [y, setY] = useState('0')
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)
  const [locationNames, setLocationNames] = useState<string[]>([])
  const gameRootPath = workspace.gameRootPath

  useEffect(() => {
    let cancelled = false
    if (gameRootPath === null) {
      setLocationNames([])
      return
    }
    const load = async () => {
      try {
        const registry = await loadResourceRegistry(gameRootPath)
        if (cancelled) return
        const names = registry.entries
          .filter((entry) => entry.kind === 'location')
          .map((entry) => entry.value)
          .sort((a, b) => a.localeCompare(b))
        setLocationNames(names)
      } catch {
        if (!cancelled) setLocationNames([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [gameRootPath])

  async function warp(targetLocation: string, tileX: number, tileY: number) {
    if (!targetLocation.trim()) {
      setFeedback({ tone: 'error', text: copy.warp.locationRequired })
      return
    }
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildWarpCommand(targetLocation.trim(), tileX, tileY))
      setFeedback(response.ok ? { tone: 'success', text: copy.warp.warpedStatus } : { tone: 'error', text: response.error ?? '' })
    } finally {
      setBusy(false)
    }
  }

  const disabled = !connected || busy

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.warp.title}</div>
        <p className="game-debugger-card-hint">{copy.warp.hint}</p>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.warp.locationLabel}</span>
          <input
            type="text"
            className="control-input"
            list="game-debugger-warp-locations"
            value={location}
            placeholder={copy.warp.locationPlaceholder}
            onChange={(event) => setLocation(event.target.value)}
          />
          <datalist id="game-debugger-warp-locations">
            {locationNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <span className="game-debugger-field-row-label">{copy.warp.coordinateXLabel}</span>
          <input type="number" className="control-input game-debugger-number" value={x} onChange={(event) => setX(event.target.value)} />
          <span className="game-debugger-field-row-label">{copy.warp.coordinateYLabel}</span>
          <input type="number" className="control-input game-debugger-number" value={y} onChange={(event) => setY(event.target.value)} />
          <button
            type="button"
            className="control-button is-accent"
            disabled={disabled}
            onClick={() => void warp(location, Number.parseInt(x, 10) || 0, Number.parseInt(y, 10) || 0)}
          >
            {copy.warp.warpAction}
          </button>
        </div>
        <div className="game-debugger-preset-title">{copy.warp.presetsLabel}</div>
        <div className="game-debugger-actions">
          {WARP_PRESETS.map((preset) => (
            <button
              key={preset.location}
              type="button"
              className="control-button is-compact"
              disabled={disabled}
              onClick={() => void warp(preset.location, preset.x, preset.y)}
            >
              {preset.location}
            </button>
          ))}
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}

/** Time section: set today's in-game clock. */
export function TimeSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [hour, setHour] = useState(12)
  const [minute, setMinute] = useState(0)
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)

  async function setTime(time: number) {
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildSetTimeCommand(time))
      setFeedback(
        response.ok
          ? { tone: 'success', text: copy.time.setStatusTemplate(formatBridgeTime(time)) }
          : { tone: 'error', text: response.error ?? '' },
      )
    } finally {
      setBusy(false)
    }
  }

  const disabled = !connected || busy
  const presets = [
    { label: copy.time.presetMorning, value: 600 },
    { label: copy.time.presetNoon, value: 1200 },
    { label: copy.time.presetEvening, value: 1800 },
    { label: copy.time.presetNight, value: 2400 },
  ]

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.time.title}</div>
        <p className="game-debugger-card-hint">{copy.time.hint}</p>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.time.hourLabel}</span>
          <select className="control-input game-debugger-number" value={hour} onChange={(event) => setHour(Number(event.target.value))}>
            {Array.from({ length: 21 }, (_, index) => index + 6).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="game-debugger-field-row-label">{copy.time.minuteLabel}</span>
          <select className="control-input game-debugger-number" value={minute} onChange={(event) => setMinute(Number(event.target.value))}>
            {[0, 10, 20, 30, 40, 50].map((value) => (
              <option key={value} value={value}>
                {String(value).padStart(2, '0')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="control-button is-accent"
            disabled={disabled}
            onClick={() => void setTime(Math.min(hour * 100 + minute, 2600))}
          >
            {copy.time.setAction}
          </button>
        </div>
        <div className="game-debugger-preset-title">{copy.time.presetsLabel}</div>
        <div className="game-debugger-actions">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className="control-button is-compact"
              disabled={disabled}
              onClick={() => void setTime(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}

/** Weather section: choose tomorrow's weather. */
export function WeatherSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [weather, setWeather] = useState<BridgeWeatherId>('Sun')
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)

  async function apply() {
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildSetWeatherTomorrowCommand(weather))
      const label = copy.gameState.weatherNames[weather]
      setFeedback(
        response.ok ? { tone: 'success', text: copy.weather.setStatusTemplate(label) } : { tone: 'error', text: response.error ?? '' },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.weather.title}</div>
        <p className="game-debugger-card-hint">{copy.weather.hint}</p>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.weather.tomorrowLabel}</span>
          <select className="control-input" value={weather} onChange={(event) => setWeather(event.target.value as BridgeWeatherId)}>
            {BRIDGE_WEATHER_IDS.map((id) => (
              <option key={id} value={id}>
                {copy.gameState.weatherNames[id]}
              </option>
            ))}
          </select>
          <button type="button" className="control-button is-accent" disabled={!connected || busy} onClick={() => void apply()}>
            {copy.weather.setAction}
          </button>
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}

/** Relationship section: set friendship hearts with an NPC. */
export function RelationshipSection({ workspace, connected }: SectionProps) {
  const copy = useGameDebuggerCopy()
  const [npc, setNpc] = useState('')
  const [hearts, setHearts] = useState(8)
  const [feedback, setFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!npc.trim()) {
      setFeedback({ tone: 'error', text: copy.relationship.npcRequired })
      return
    }
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildSetFriendshipCommand(npc.trim(), hearts))
      setFeedback(
        response.ok
          ? { tone: 'success', text: copy.relationship.setStatusTemplate(npc.trim(), hearts) }
          : { tone: 'error', text: response.error ?? '' },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.relationship.title}</div>
        <p className="game-debugger-card-hint">{copy.relationship.hint}</p>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.relationship.npcLabel}</span>
          <input
            type="text"
            className="control-input"
            value={npc}
            placeholder={copy.relationship.npcPlaceholder}
            onChange={(event) => setNpc(event.target.value)}
          />
        </div>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.relationship.heartsLabel}</span>
          <input
            type="range"
            min={0}
            max={14}
            step={1}
            value={hearts}
            className="game-debugger-slider"
            onChange={(event) => setHearts(Number(event.target.value))}
          />
          <span className="game-debugger-hearts-value">{copy.relationship.heartsValueTemplate(hearts)}</span>
          <button type="button" className="control-button is-accent" disabled={!connected || busy} onClick={() => void apply()}>
            {copy.relationship.setAction}
          </button>
        </div>
        <FeedbackLine feedback={feedback} />
      </section>
    </div>
  )
}
