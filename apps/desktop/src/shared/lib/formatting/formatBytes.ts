type FormatBytesOptions = {
  base?: number
  decimals?: number | ((size: number, value: number, unit: string, unitIndex: number) => number)
  units?: string[]
}

const DEFAULT_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(value: number, options: FormatBytesOptions = {}) {
  const { base = 1024, decimals = 1, units = DEFAULT_UNITS } = options

  if (!Number.isFinite(value) || value <= 0) {
    return `0 ${units[0]}`
  }

  let size = value
  let unitIndex = 0

  while (unitIndex < units.length - 1 && size >= base) {
    size /= base
    unitIndex += 1
  }

  const unit = units[unitIndex]

  if (unit === units[0]) {
    return `${Math.round(size)} ${unit}`
  }

  const precisionResult =
    typeof decimals === 'function'
      ? decimals(size, value, unit, unitIndex)
      : decimals
  const precisionValue = Number.isFinite(precisionResult) ? Math.max(0, precisionResult) : 0

  return `${size.toFixed(precisionValue)} ${unit}`
}

export function formatBytesOrPlaceholder(value: number | null, placeholder: string, options?: FormatBytesOptions) {
  if (value == null) {
    return placeholder
  }

  return formatBytes(value, options)
}
