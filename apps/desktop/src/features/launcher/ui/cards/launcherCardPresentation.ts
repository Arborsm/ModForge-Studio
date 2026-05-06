type LauncherCardFallbackPalette = {
  hue: number
  bright: string
  base: string
  dark: string
  edge: string
  glow: string
  shadow: string
}

function hashText(value: string) {
  let hash = 0
  for (const char of value) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash)
}

function wrapHue(value: number) {
  return ((value % 360) + 360) % 360
}

export function getLauncherCardMonogram(title: string) {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!words.length) {
    return 'MOD'
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 3).toUpperCase()
  }

  return words
    .slice(0, 3)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

export function getLauncherCardCoverWord(title: string) {
  const words = title
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)

  if (!words.length) {
    return getLauncherCardMonogram(title)
  }

  const featuredWord = words.find((word) => word.length >= 4) ?? words[0]!
  return featuredWord.slice(0, 14).toUpperCase()
}

export function getLauncherCardFallbackPalette(seed: string): LauncherCardFallbackPalette {
  const hash = hashText(seed || 'mod')
  const hue = wrapHue(hash % 360)
  const accentHue = wrapHue(hue + 14 + (hash % 10))
  const deepHue = wrapHue(hue - 12 - (hash % 10))
  const saturation = 42 + (hash % 9)
  const lightness = 52 + ((hash >> 3) % 7)
  const brightLightness = Math.min(lightness + 7, 62)
  const darkLightness = Math.max(lightness - 8, 46)

  return {
    hue,
    bright: `hsl(${accentHue} ${Math.min(saturation + 5, 54)}% ${brightLightness}%)`,
    base: `hsl(${hue} ${saturation}% ${lightness}%)`,
    dark: `hsl(${deepHue} ${Math.max(saturation - 5, 36)}% ${darkLightness}%)`,
    edge: `hsla(${accentHue} ${Math.min(saturation + 3, 56)}% ${Math.min(brightLightness + 2, 66)}% / 0.76)`,
    glow: `hsla(${accentHue} ${Math.min(saturation + 4, 58)}% ${Math.min(brightLightness + 4, 70)}% / 0.16)`,
    shadow: `hsla(${deepHue} ${Math.max(saturation - 6, 34)}% ${Math.max(darkLightness - 8, 34)}% / 0.18)`,
  }
}
