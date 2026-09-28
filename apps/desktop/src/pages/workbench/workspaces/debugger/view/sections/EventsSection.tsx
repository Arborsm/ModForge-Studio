import { useState } from 'react'
import { useGameDebuggerCopy } from '@locales/provider'
import {
  buildClearTempEntriesCommand,
  buildPlayEventCommand,
  buildRunEventScriptCommand,
  buildSetTempEntryCommand,
  extractEventIdFromEntryKey,
  isEventAssetTarget,
} from '@entities/debug-bridge'
import { cx } from '@shared/lib/helper'
import type { GameDebuggerWorkspaceState } from '../../state/useGameDebuggerWorkspace'

type ActionFeedback = { tone: 'success' | 'error'; text: string } | null

function FeedbackLine({ feedback }: { feedback: ActionFeedback }) {
  if (feedback === null) return null
  return <p className={cx('game-debugger-feedback', feedback.tone === 'error' ? 'is-error' : 'is-success')}>{feedback.text}</p>
}

interface ProjectEventEntry {
  patchTarget: string
  entryKey: string
  script: string
  logName: string
}

function collectProjectEventEntries(workspace: GameDebuggerWorkspaceState): ProjectEventEntry[] {
  const project = workspace.project
  if (!project?.activeDraft) return []
  const entries: ProjectEventEntry[] = []
  for (const patch of project.activeDraft.patches) {
    if (patch.action !== 'EditData' || !isEventAssetTarget(patch.target)) continue
    if (patch.enabled === false || patch.enabled === 'false') continue
    const state = patch.editorState
    if (!state || typeof state !== 'object' || Array.isArray(state)) continue
    const rawEntries = (state as { entries?: unknown }).entries
    if (!rawEntries || typeof rawEntries !== 'object' || Array.isArray(rawEntries)) continue
    for (const [entryKey, value] of Object.entries(rawEntries as Record<string, unknown>)) {
      if (typeof value !== 'string' || !value.trim()) continue
      entries.push({ patchTarget: patch.target, entryKey, script: value, logName: patch.logName })
    }
  }
  return entries
}

/** Events section: temporary CP entry debugging, project event preview, and raw script playback. */
export function EventsSection({ workspace, connected }: { workspace: GameDebuggerWorkspaceState; connected: boolean }) {
  const copy = useGameDebuggerCopy()
  const [target, setTarget] = useState('Data/Events/Town')
  const [entryKey, setEntryKey] = useState('')
  const [entryValue, setEntryValue] = useState('')
  const [tempFeedback, setTempFeedback] = useState<ActionFeedback>(null)
  const [script, setScript] = useState('')
  const [scriptFeedback, setScriptFeedback] = useState<ActionFeedback>(null)
  const [projectFeedback, setProjectFeedback] = useState<ActionFeedback>(null)
  const [busy, setBusy] = useState(false)

  const projectEntries = collectProjectEventEntries(workspace)

  async function applyTempEntry(play: boolean) {
    const trimmedTarget = target.trim()
    const trimmedKey = entryKey.trim()
    if (!trimmedTarget) {
      setTempFeedback({ tone: 'error', text: copy.events.targetRequired })
      return
    }
    if (!trimmedKey) {
      setTempFeedback({ tone: 'error', text: copy.events.entryKeyRequired })
      return
    }
    if (!entryValue.trim()) {
      setTempFeedback({ tone: 'error', text: copy.events.valueRequired })
      return
    }
    if (play && !isEventAssetTarget(trimmedTarget)) {
      setTempFeedback({ tone: 'error', text: copy.events.playRequiresEventTarget })
      return
    }
    setBusy(true)
    try {
      const applied = await workspace.runCommand(buildSetTempEntryCommand(trimmedTarget, trimmedKey, entryValue))
      if (!applied.ok) {
        setTempFeedback({ tone: 'error', text: applied.error ?? '' })
        return
      }
      if (!play) {
        setTempFeedback({ tone: 'success', text: copy.events.appliedStatus })
        return
      }
      const played = await workspace.runCommand(buildPlayEventCommand(extractEventIdFromEntryKey(trimmedKey)))
      setTempFeedback(played.ok ? { tone: 'success', text: copy.events.scriptStartedStatus } : { tone: 'error', text: played.error ?? '' })
    } finally {
      setBusy(false)
    }
  }

  async function clearTempEntries() {
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildClearTempEntriesCommand())
      setTempFeedback(response.ok ? { tone: 'success', text: copy.events.clearedStatus } : { tone: 'error', text: response.error ?? '' })
    } finally {
      setBusy(false)
    }
  }

  async function debugProjectEntry(entry: ProjectEventEntry) {
    setBusy(true)
    try {
      const applied = await workspace.runCommand(buildSetTempEntryCommand(entry.patchTarget, entry.entryKey, entry.script))
      if (!applied.ok) {
        setProjectFeedback({ tone: 'error', text: applied.error ?? '' })
        return
      }
      const played = await workspace.runCommand(buildPlayEventCommand(extractEventIdFromEntryKey(entry.entryKey)))
      setProjectFeedback(
        played.ok ? { tone: 'success', text: copy.events.scriptStartedStatus } : { tone: 'error', text: played.error ?? '' },
      )
    } finally {
      setBusy(false)
    }
  }

  async function runScript() {
    if (!script.trim()) {
      setScriptFeedback({ tone: 'error', text: copy.events.scriptRequired })
      return
    }
    setBusy(true)
    try {
      const response = await workspace.runCommand(buildRunEventScriptCommand(script))
      setScriptFeedback(
        response.ok ? { tone: 'success', text: copy.events.scriptStartedStatus } : { tone: 'error', text: response.error ?? '' },
      )
    } finally {
      setBusy(false)
    }
  }

  const disabled = !connected || busy

  return (
    <div className="game-debugger-section">
      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.events.tempPatchTitle}</div>
        <p className="game-debugger-card-hint">{copy.events.tempPatchHint}</p>
        <label className="game-debugger-field">
          <span>{copy.events.targetLabel}</span>
          <input
            type="text"
            className="control-input"
            value={target}
            placeholder={copy.events.targetPlaceholder}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <label className="game-debugger-field">
          <span>{copy.events.entryKeyLabel}</span>
          <input
            type="text"
            className="control-input"
            value={entryKey}
            placeholder={copy.events.entryKeyPlaceholder}
            onChange={(event) => setEntryKey(event.target.value)}
          />
        </label>
        <label className="game-debugger-field">
          <span>{copy.events.entryValueLabel}</span>
          <textarea
            className="control-input game-debugger-textarea"
            value={entryValue}
            placeholder={copy.events.entryValuePlaceholder}
            rows={4}
            onChange={(event) => setEntryValue(event.target.value)}
          />
        </label>
        <div className="game-debugger-actions">
          <button type="button" className="control-button" disabled={disabled} onClick={() => void applyTempEntry(false)}>
            {copy.events.applyAction}
          </button>
          <button type="button" className="control-button is-accent" disabled={disabled} onClick={() => void applyTempEntry(true)}>
            {copy.events.applyAndPlayAction}
          </button>
          <button type="button" className="control-button" disabled={disabled} onClick={() => void clearTempEntries()}>
            {copy.events.clearTempAction}
          </button>
        </div>
        <FeedbackLine feedback={tempFeedback} />
      </section>

      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.events.projectPreviewTitle}</div>
        <p className="game-debugger-card-hint">{copy.events.projectPreviewHint}</p>
        {workspace.project === null ? (
          <p className="game-debugger-card-hint">{copy.events.projectPreviewNoProject}</p>
        ) : projectEntries.length === 0 ? (
          <p className="game-debugger-card-hint">{copy.events.projectPreviewEmpty}</p>
        ) : (
          <ul className="game-debugger-project-events">
            {projectEntries.map((entry) => (
              <li key={`${entry.patchTarget}::${entry.entryKey}`} className="game-debugger-project-event">
                <div className="game-debugger-project-event-info">
                  <span className="game-debugger-project-event-name">{entry.logName || copy.events.projectEntryUnnamed}</span>
                  <span className="game-debugger-project-event-meta">
                    {entry.patchTarget} · {entry.entryKey}
                  </span>
                </div>
                <button
                  type="button"
                  className="control-button is-compact"
                  disabled={disabled}
                  onClick={() => void debugProjectEntry(entry)}
                >
                  {copy.events.debugEntryAction}
                </button>
              </li>
            ))}
          </ul>
        )}
        <FeedbackLine feedback={projectFeedback} />
      </section>

      <section className="game-debugger-card">
        <div className="game-debugger-card-title">{copy.events.scriptRunTitle}</div>
        <p className="game-debugger-card-hint">{copy.events.scriptRunHint}</p>
        <label className="game-debugger-field">
          <span>{copy.events.scriptLabel}</span>
          <textarea
            className="control-input game-debugger-textarea"
            value={script}
            placeholder={copy.events.scriptPlaceholder}
            rows={4}
            onChange={(event) => setScript(event.target.value)}
          />
        </label>
        <div className="game-debugger-actions">
          <button type="button" className="control-button is-accent" disabled={disabled} onClick={() => void runScript()}>
            {copy.events.runScriptAction}
          </button>
        </div>
        <FeedbackLine feedback={scriptFeedback} />
      </section>
    </div>
  )
}
