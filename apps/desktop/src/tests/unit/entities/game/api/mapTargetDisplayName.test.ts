import { describe, expect, it } from 'vite-plus/test'
import { mapTargetLocationName, parseMapLocationRecord, resolveMapTargetDisplayName } from '@entities/game/api'

const EMPTY_TABLE: Record<string, string> = {}

describe('mapTargetLocationName', () => {
  it('extracts the location name from Maps targets', () => {
    expect(mapTargetLocationName('Maps/Farm')).toBe('Farm')
    expect(mapTargetLocationName('maps\\farm')).toBe('farm')
    expect(mapTargetLocationName('  Maps/SpringObjects ')).toBe('SpringObjects')
  })

  it('rejects non-Maps targets, token expressions, and nested paths', () => {
    expect(mapTargetLocationName('Portraits/Abigail')).toBeNull()
    expect(mapTargetLocationName('Maps')).toBeNull()
    expect(mapTargetLocationName('Maps/')).toBeNull()
    expect(mapTargetLocationName('Maps/{{ModId}}_Custom')).toBeNull()
    expect(mapTargetLocationName('Maps/{{TargetWithoutPath}}')).toBeNull()
    expect(mapTargetLocationName('Maps/Mods/Custom')).toBeNull()
    expect(mapTargetLocationName('')).toBeNull()
  })
})

describe('parseMapLocationRecord', () => {
  it('keeps every entry keyed by location name', () => {
    const record = parseMapLocationRecord(
      JSON.stringify({ Farm: { DisplayName: '[LocalizedText Strings/Locations:Farm]' }, Town: { DisplayName: '镇' }, Beach: null }),
    )
    expect(record.Farm).toEqual({ DisplayName: '[LocalizedText Strings/Locations:Farm]' })
    expect(record.Town).toEqual({ DisplayName: '镇' })
    expect(record.Beach).toBeNull()
  })
})

describe('resolveMapTargetDisplayName', () => {
  const locations = {
    Farm: { DisplayName: '[LocalizedText Strings/Locations:Farm]' },
    Town: { DisplayName: '镇公所' },
    Beach: { DisplayName: '' },
    Library: null,
    Summit: { DisplayName: '[BrokenToken NoTable:Summit]' },
  }

  it('resolves a LocalizedText DisplayName through the string table', () => {
    expect(resolveMapTargetDisplayName('Maps/Farm', locations, { Farm: '牧场' })).toBe('牧场')
  })

  it('matches the location name case- and slash-insensitively', () => {
    expect(resolveMapTargetDisplayName('maps\\farm', locations, { Farm: '牧场' })).toBe('牧场')
  })

  it('passes a plain DisplayName through unchanged', () => {
    expect(resolveMapTargetDisplayName('Maps/Town', locations, EMPTY_TABLE)).toBe('镇公所')
  })

  it('returns null when the name is unresolvable', () => {
    // No location record (festival/event/mod maps).
    expect(resolveMapTargetDisplayName('Maps/FlowerFestival', locations, EMPTY_TABLE)).toBeNull()
    // Record without a readable DisplayName.
    expect(resolveMapTargetDisplayName('Maps/Beach', locations, EMPTY_TABLE)).toBeNull()
    expect(resolveMapTargetDisplayName('Maps/Library', locations, EMPTY_TABLE)).toBeNull()
    // Bracket form that is not a string-table reference.
    expect(resolveMapTargetDisplayName('Maps/Summit', locations, EMPTY_TABLE)).toBeNull()
    // Reference key missing from the table.
    expect(resolveMapTargetDisplayName('Maps/Farm', locations, EMPTY_TABLE)).toBeNull()
  })

  it('returns null for non-Maps targets regardless of the record', () => {
    expect(resolveMapTargetDisplayName('Portraits/Abigail', locations, { Abigail: '阿比盖尔' })).toBeNull()
    expect(resolveMapTargetDisplayName('Maps/{{ModId}}_Custom', locations, { Custom: '自定义' })).toBeNull()
  })
})
