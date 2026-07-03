export function eventAliasesFromState(state: Record<string, unknown>): Record<string, string> {
  if (typeof state['eventAliases'] !== 'object' || state['eventAliases'] === null || Array.isArray(state['eventAliases'])) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(state['eventAliases'] as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

export function eventLocationsFromState(state: Record<string, unknown>): Record<string, string> {
  if (typeof state['eventLocations'] !== 'object' || state['eventLocations'] === null || Array.isArray(state['eventLocations'])) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(state['eventLocations'] as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

export function buildPresetScript(preset: { music: string; camera: string; actors: string; commands: string[] }) {
  return [preset.music, preset.camera, preset.actors, ...preset.commands].join('/')
}

export function getLocationFromTarget(target: string) {
  const parts = target.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function getEventIdFromKey(key: string) {
  return key.split('/')[0] ?? key
}

export function removeEntriesWithEventId<T>(records: Record<string, T>, eventId: string) {
  return Object.fromEntries(Object.entries(records).filter(([key]) => getEventIdFromKey(key) !== eventId))
}

export function createUniqueEventKey(entries: Record<string, unknown>, startAt: number) {
  for (let offset = 0; offset < 1000; offset += 1) {
    const suffix = startAt + offset
    const candidate = `900${String(suffix).padStart(3, '0')}/Season spring/Time 900 1700`
    if (entries[candidate] == null) {
      return candidate
    }
  }
  return `900${Date.now()}/Season spring/Time 900 1700`
}

export function eventLocationDotClass(location: string | null | undefined) {
  switch (location) {
    case 'Mine':
      return 'dot-mine'
    case 'Beach':
      return 'dot-beach'
    default:
      return 'dot-town'
  }
}
