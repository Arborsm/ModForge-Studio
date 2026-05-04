import type { MapPropertyValue } from './types'

export function asMapPropertyString(value: MapPropertyValue | undefined) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}
