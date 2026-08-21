/** Game logic: shuffle, deck dealing, time formatting, session best tracking. */

import { DIFFICULTIES, type DifficultyPreset } from './constants.js'

// Module-scoped session state: survives page unmounts because the plugin module
// stays loaded; cleared via ctx.onDispose when the plugin is torn down.
const sessionBest = new Map<string, BestRecord>()

export interface BestRecord {
  moves: number
  seconds: number
}

export function getBest(difficulty: string): BestRecord | undefined {
  return sessionBest.get(difficulty)
}

export function setBest(difficulty: string, record: BestRecord) {
  sessionBest.set(difficulty, record)
}

export function clearBests() {
  sessionBest.clear()
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

export function dealDeck<T>(faces: T[], pairs: number): T[] {
  return shuffle(faces.slice(0, pairs).flatMap((face) => [face, face]))
}

export function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export { DIFFICULTIES, type DifficultyPreset }
