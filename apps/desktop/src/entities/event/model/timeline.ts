/**
 * @file Builds the event timeline read model: scene summary, flat command
 * entries, and grouped "beats" that pair dialogue with supporting commands.
 */

import type { EventCommand, EventScript } from './types'

export const EVENT_SETUP_ENTRY_ID = 'setup'

export type EventTimelineEntry = {
  id: string
  title: string
  detail: string
  kind: EventCommand['kind'] | 'setup'
  command: EventCommand | null
}

export type EventTimelineLabels = {
  setup: string
  music: string
  camera: string
  actors: string
}

export type EventTimelineBeat = {
  id: string
  primaryEntry: EventTimelineEntry
  supportingEntries: EventTimelineEntry[]
}

/** Builds a one-line summary of the event scene setup (music, camera, actor count). */
export function buildEventSceneSummary(event: EventScript, labels: EventTimelineLabels) {
  return [
    `${labels.music}: ${event.scene.musicCue ?? 'none'}`,
    `${labels.camera}: ${event.scene.cameraInstruction ?? 'follow'}`,
    `${labels.actors}: ${event.scene.actors.length}`,
  ].join(' | ')
}

/** Flattens an event into timeline entries: a setup entry followed by one per command. */
export function buildEventTimelineEntries(event: EventScript | null, labels: EventTimelineLabels): EventTimelineEntry[] {
  if (!event) {
    return []
  }

  return [
    {
      id: EVENT_SETUP_ENTRY_ID,
      title: labels.setup,
      detail: buildEventSceneSummary(event, labels),
      kind: 'setup',
      command: null,
    },
    ...event.commands.map((command) => ({
      id: command.id,
      title: command.title,
      detail: command.detail,
      kind: command.kind,
      command,
    })),
  ]
}

function isPrimaryTimelineEntry(entry: EventTimelineEntry) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return true
  }

  const command = entry.command
  if (!command) {
    return false
  }

  if (entry.kind === 'dialogue' || entry.kind === 'message' || entry.kind === 'choice') {
    return true
  }

  if (command.command === 'end' && (command.dialoguePages?.length ?? 0) > 0) {
    return true
  }

  return false
}

/** Groups timeline entries into beats, each led by a dialogue/message/choice command with its supporting commands. */
export function buildEventTimelineBeats(event: EventScript | null, labels: EventTimelineLabels): EventTimelineBeat[] {
  const entries = buildEventTimelineEntries(event, labels)
  if (entries.length === 0) {
    return []
  }

  const beats: EventTimelineBeat[] = []
  let currentBeat: EventTimelineBeat | null = null

  for (const entry of entries) {
    if (currentBeat == null) {
      currentBeat = {
        id: `beat:${entry.id}`,
        primaryEntry: entry,
        supportingEntries: [],
      }
      continue
    }

    if (isPrimaryTimelineEntry(entry)) {
      beats.push(currentBeat)
      currentBeat = {
        id: `beat:${entry.id}`,
        primaryEntry: entry,
        supportingEntries: [],
      }
      continue
    }

    currentBeat.supportingEntries.push(entry)
  }

  if (currentBeat) {
    beats.push(currentBeat)
  }

  return beats
}
