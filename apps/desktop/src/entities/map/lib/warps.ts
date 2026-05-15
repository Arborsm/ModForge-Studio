import type { MapDocument } from './types'
import { asMapPropertyString } from './properties'

export type WarpEntry = {
  sourceX: number
  sourceY: number
  targetMap: string
  targetX: number
  targetY: number
}

export function parseWarpProperty(rawValue: string) {
  const tokens = rawValue.trim().split(/\s+/u).filter(Boolean)
  const entries: WarpEntry[] = []

  for (let index = 0; index + 4 < tokens.length; index += 5) {
    const sourceX = Number.parseInt(tokens[index] ?? '', 10)
    const sourceY = Number.parseInt(tokens[index + 1] ?? '', 10)
    const targetMap = tokens[index + 2] ?? ''
    const targetX = Number.parseInt(tokens[index + 3] ?? '', 10)
    const targetY = Number.parseInt(tokens[index + 4] ?? '', 10)

    if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY) || !Number.isFinite(targetX) || !Number.isFinite(targetY) || !targetMap) {
      continue
    }

    entries.push({
      sourceX,
      sourceY,
      targetMap,
      targetX,
      targetY,
    })
  }

  return entries
}

export function parseWarpEntries(mapDocument: MapDocument) {
  const entries: WarpEntry[] = []

  for (const propertyName of ['Warp', 'NPCWarp']) {
    const rawValue = asMapPropertyString(mapDocument.properties[propertyName]).trim()
    if (!rawValue) {
      continue
    }

    entries.push(...parseWarpProperty(rawValue))
  }

  return entries
}

export function isExteriorWarp(mapDocument: MapDocument, entry: WarpEntry) {
  return entry.sourceX < 0 || entry.sourceY < 0 || entry.sourceX >= mapDocument.width || entry.sourceY >= mapDocument.height
}
