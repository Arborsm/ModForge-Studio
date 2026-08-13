import { parseStardewI18n } from '@shared/infra/game-formats/stardew-i18n/stardewI18n'
import { parseDialogueScript } from './script'

/** Where a merged dialogue entry comes from. */
export type DialogueEntryOrigin = 'vanilla' | 'project' | 'override'

export type DialogueEntrySummary = {
  key: string
  /** Effective script (project overrides vanilla). */
  script: string
  origin: DialogueEntryOrigin
  /** Vanilla script shadowed by a project override, when one exists. */
  vanillaScript: string | null
  /** Author-facing title stored alongside the patch entries, when set. */
  title: string | null
  pageCount: number
  /** Plain-text preview of the first page with protocol tokens stripped. */
  preview: string
}

/** Editor state stored on a `dialogue` workspace EditData patch. */
export type DialoguePatchEditorState = {
  entries: Record<string, string>
  /** Optional author-facing titles per entry key; additive to the entries contract. */
  titles?: Record<string, string>
}

/** Content Patcher target prefix for NPC dialogue assets. */
export const DIALOGUE_TARGET_PREFIX = 'Characters/Dialogue/'

/** Builds the Content Patcher target for an NPC's dialogue asset. */
export function buildDialogueTarget(npcId: string): string {
  return `${DIALOGUE_TARGET_PREFIX}${npcId}`
}

/** Extracts the NPC id from a dialogue patch target, or null for other targets. */
export function parseDialogueTargetNpc(target: string): string | null {
  const normalized = target.trim().replaceAll('\\', '/')
  if (!normalized.toLowerCase().startsWith(DIALOGUE_TARGET_PREFIX.toLowerCase())) {
    return null
  }
  const npcId = normalized.slice(DIALOGUE_TARGET_PREFIX.length).trim()
  return npcId || null
}

/** Builds the patch log name for an NPC dialogue patch. */
export function buildDialoguePatchLogName(npcId: string): string {
  return `Dialogue: ${npcId}`
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      typeof entry === 'string' ? ([[key, entry]] as const) : [],
    ),
  )
}

/** Defensively reads a patch's editor state into the dialogue shape. */
export function readDialoguePatchEditorState(editorState: unknown): DialoguePatchEditorState {
  if (!editorState || typeof editorState !== 'object' || Array.isArray(editorState)) {
    return { entries: {} }
  }
  const record = editorState as Record<string, unknown>
  return {
    entries: readStringRecord(record.entries),
    titles: readStringRecord(record.titles),
  }
}

/** Returns the plain-text preview of a script's first page, protocol tokens stripped. */
export function getDialogueScriptPreview(script: string, maxLength = 96): string {
  const firstPage = parseDialogueScript(script).pages[0]
  const source = firstPage ? (firstPage.kind === 'raw' ? firstPage.raw : firstPage.text || firstPage.question?.prompt || firstPage.raw) : ''
  const plain = parseStardewI18n(source)
    .textNodes.map((node) => node.value)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (plain.length <= maxLength) {
    return plain
  }
  return `${plain.slice(0, Math.max(0, maxLength - 1))}…`
}

function compareEntryKeys(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Merges vanilla and project dialogue entries for one NPC.
 * Project entries shadow vanilla entries with the same key (`override`).
 */
export function mergeDialogueEntries(
  vanillaEntries: Record<string, string>,
  projectEntries: Record<string, string>,
  projectTitles: Record<string, string> = {},
): DialogueEntrySummary[] {
  const keys = new Set([...Object.keys(vanillaEntries), ...Object.keys(projectEntries)])
  const summaries: DialogueEntrySummary[] = []

  for (const key of keys) {
    const projectScript = projectEntries[key]
    const vanillaScript = vanillaEntries[key]
    const script = projectScript ?? vanillaScript ?? ''
    const origin: DialogueEntryOrigin = projectScript != null ? (vanillaScript != null ? 'override' : 'project') : 'vanilla'
    summaries.push({
      key,
      script,
      origin,
      vanillaScript: origin === 'override' ? (vanillaScript ?? null) : null,
      title: projectTitles[key] ?? null,
      pageCount: parseDialogueScript(script).pages.length,
      preview: getDialogueScriptPreview(script),
    })
  }

  return summaries.sort((left, right) => compareEntryKeys(left.key, right.key))
}
