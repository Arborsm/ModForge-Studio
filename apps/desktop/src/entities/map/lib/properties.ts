import type { MapPropertyValue } from './types'

export function unwrapMapPropertyValue(value: MapPropertyValue | undefined): string | number | boolean | undefined {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return unwrapMapPropertyValue(value.value)
  }
  return value
}

export function asMapPropertyString(value: MapPropertyValue | undefined) {
  const unwrapped = unwrapMapPropertyValue(value)
  if (typeof unwrapped === 'string') {
    return unwrapped
  }

  if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean') {
    return String(unwrapped)
  }

  return ''
}
