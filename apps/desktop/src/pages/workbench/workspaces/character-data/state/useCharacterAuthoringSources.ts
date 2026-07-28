/**
 * Source-pane state for the character authoring editor.
 *
 * The left pane lists two populations at once — the NPCs this patch already
 * edits and the vanilla NPCs it could still override — so this hook resolves
 * the vanilla index once (shared cache with the codex page), joins it with the
 * patch entry keys and produces the grouped, filtered rows the pane renders.
 */

import { useEffect, useState } from 'react'
import {
  type CharacterDataEntry,
  type CharacterWorkspaceEntry,
  createCharacterWorkspaceEntry,
  loadCharacterWorkspaceEntries,
  loadVanillaCharacterRecords,
} from '@entities/character'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode } from '@locales'

/** One row of the source list. */
export type CharacterSourceRow = {
  /** `Data/Characters` entry key. */
  key: string
  displayName: string
  /** Present when the vanilla index knows this key; drives the sprite thumbnail. */
  vanilla: CharacterWorkspaceEntry | null
  /** Whether the patch currently defines an entry under this key. */
  inProject: boolean
}

export type CharacterSourceMode = 'all' | 'project' | 'vanilla'

export type CharacterSourceGroups = {
  project: CharacterSourceRow[]
  vanillaOnly: CharacterSourceRow[]
}

export type VanillaIndexState = {
  entries: Map<string, CharacterWorkspaceEntry>
  records: Record<string, unknown>
  loading: boolean
  available: boolean
}

const EMPTY_VANILLA: VanillaIndexState = { entries: new Map(), records: {}, loading: false, available: false }

/** Loads the vanilla character index once per game root and locale. */
export function useVanillaCharacterIndex(
  gameRootPath: string | null,
  directoryInfo: GameDirectoryInfo | null,
  locale: LocaleCode,
): VanillaIndexState {
  const [state, setState] = useState<VanillaIndexState>(EMPTY_VANILLA)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setState(EMPTY_VANILLA)
      return
    }

    let cancelled = false
    setState({ entries: new Map(), records: {}, loading: true, available: false })

    void Promise.all([loadCharacterWorkspaceEntries(gameRootPath, locale), loadVanillaCharacterRecords(gameRootPath, locale)])
      .then(([entries, records]) => {
        if (cancelled) {
          return
        }
        setState({
          entries: new Map(entries.map((entry) => [entry.key.toLowerCase(), entry])),
          records,
          loading: false,
          available: true,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ entries: new Map(), records: {}, loading: false, available: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameRootPath, directoryInfo, locale])

  return state
}

function matchesSearch(row: CharacterSourceRow, needle: string): boolean {
  if (!needle) {
    return true
  }
  return row.key.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle)
}

/**
 * Splits every known NPC into the two groups the pane renders. Project entries
 * keep the patch's authoring order; vanilla-only entries stay alphabetical.
 */
export function buildCharacterSourceGroups({
  projectKeys,
  projectEntries,
  vanilla,
  mode,
  search,
}: {
  projectKeys: readonly string[]
  projectEntries: Readonly<Record<string, unknown>>
  vanilla: VanillaIndexState
  mode: CharacterSourceMode
  search: string
}): CharacterSourceGroups {
  const needle = search.trim().toLowerCase()
  const projectKeySet = new Set(projectKeys.map((key) => key.toLowerCase()))

  const project = projectKeys.map((key) => {
    const vanillaEntry = vanilla.entries.get(key.toLowerCase()) ?? null
    const raw = projectEntries[key]
    const draftEntry = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    const displayName = typeof draftEntry['DisplayName'] === 'string' && draftEntry['DisplayName'].trim() ? draftEntry['DisplayName'] : key
    return { key, displayName, vanilla: vanillaEntry, inProject: true }
  })

  const vanillaOnly = Array.from(vanilla.entries.values())
    .filter((entry) => !projectKeySet.has(entry.key.toLowerCase()))
    .map((entry) => ({ key: entry.key, displayName: entry.displayName, vanilla: entry, inProject: false }))

  return {
    project: mode === 'vanilla' ? [] : project.filter((row) => matchesSearch(row, needle)),
    vanillaOnly: mode === 'project' ? [] : vanillaOnly.filter((row) => matchesSearch(row, needle)),
  }
}

/**
 * Builds the preview entry for the NPC being edited.
 *
 * The preview always renders the entry as the patch defines it, so an author
 * sees their own `TextureName` and `Appearance` edits immediately; vanilla data
 * is only a fallback for keys the patch does not redefine.
 */
export function buildPreviewEntry(
  entryKey: string | null,
  entryValue: unknown,
  vanilla: VanillaIndexState,
): CharacterWorkspaceEntry | null {
  if (entryKey === null) {
    return null
  }
  const record = typeof entryValue === 'object' && entryValue !== null && !Array.isArray(entryValue) ? entryValue : {}
  const vanillaEntry = vanilla.entries.get(entryKey.toLowerCase()) ?? null
  const merged = vanillaEntry ? { ...(vanilla.records[vanillaEntry.key] as Record<string, unknown>), ...record } : record
  return createCharacterWorkspaceEntry(entryKey, merged as CharacterDataEntry)
}
