export function rgbaFromHex(value: string, alpha: number): string {
  const normalized = value.trim().replace(/^#/u, '')
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/iu.test(normalized)) {
    return `rgba(79, 70, 229, ${alpha})`
  }

  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(hex, 16)

  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
