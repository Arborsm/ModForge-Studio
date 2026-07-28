import { useState } from 'react'
import { useGameDebuggerCopy } from '@locales/provider'
import { buildDebugCommand } from '@entities/debug-bridge'
import { cx } from '@shared/lib/helper'
import type { GameDebuggerWorkspaceState } from '../../state/useGameDebuggerWorkspace'

interface DebugRun {
  id: number
  command: string
  handled: boolean
  output: string[]
  error?: string
}

/** Advanced section: raw vanilla debug-command passthrough with output capture and presets. */
export function AdvancedSection({ workspace, connected }: { workspace: GameDebuggerWorkspaceState; connected: boolean }) {
  const copy = useGameDebuggerCopy()
  const [command, setCommand] = useState('')
  const [runs, setRuns] = useState<DebugRun[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const presets: Array<{ label: string; command: string }> = [
    { label: copy.advanced.presets.dayUpdate, command: 'dayUpdate' },
    { label: copy.advanced.presets.levelUpFarming, command: 'experience farming 1000' },
    { label: copy.advanced.presets.growCrops, command: 'growCrops 5' },
    { label: copy.advanced.presets.hurryNpc, command: 'hurry Abigail' },
    { label: copy.advanced.presets.whereIsNpc, command: 'whereIs Abigail' },
    { label: copy.advanced.presets.seenEventReset, command: 'seenEvent 100001 false' },
  ]

  async function run(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(copy.advanced.commandRequired)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildDebugCommand(trimmed))
      if (!response.ok) {
        setError(response.error ?? '')
        return
      }
      const result = (response.result ?? {}) as { handled?: boolean; output?: string[] }
      setRuns((previous) => {
        const entry: DebugRun = {
          id: previous.length === 0 ? 1 : previous[0].id + 1,
          command: trimmed,
          handled: result.handled === true,
          output: Array.isArray(result.output) ? result.output : [],
        }
        return [entry, ...previous].slice(0, 20)
      })
    } finally {
      setBusy(false)
    }
  }

  const disabled = !connected || busy

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.advanced.title}</div>
        <p className="game-debugger-card-hint">{copy.advanced.hint}</p>
        <div className="game-debugger-field-row">
          <span className="game-debugger-field-row-label">{copy.advanced.commandLabel}</span>
          <input
            type="text"
            className="control-input game-debugger-command-input"
            value={command}
            placeholder={copy.advanced.commandPlaceholder}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void run(command)
            }}
          />
          <button type="button" className="control-button is-accent" disabled={disabled} onClick={() => void run(command)}>
            {copy.advanced.runAction}
          </button>
        </div>
        {error !== null ? <p className="game-debugger-feedback is-error">{error}</p> : null}
        <div className="game-debugger-preset-title">{copy.advanced.presetsTitle}</div>
        <div className="game-debugger-actions">
          {presets.map((preset) => (
            <button
              key={preset.command}
              type="button"
              className="control-button is-compact"
              disabled={disabled}
              title={preset.command}
              onClick={() => {
                setCommand(preset.command)
                void run(preset.command)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="game-debugger-card-hint is-danger">{copy.advanced.dangerHint}</p>
      </section>

      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.advanced.outputTitle}</div>
        {runs.length === 0 ? (
          <p className="game-debugger-card-hint">{copy.advanced.outputEmpty}</p>
        ) : (
          <ul className="game-debugger-output-list">
            {runs.map((entry) => (
              <li key={entry.id} className="game-debugger-output-entry">
                <div className={cx('game-debugger-output-command', !entry.handled && 'is-warn')}>
                  &gt; {entry.command}
                  {!entry.handled ? ` — ${copy.advanced.notHandled}` : ''}
                </div>
                {entry.output.length > 0 ? (
                  <pre className="game-debugger-output-text">{entry.output.join('\n')}</pre>
                ) : (
                  <div className="game-debugger-output-text is-empty">{copy.advanced.outputEmpty}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
