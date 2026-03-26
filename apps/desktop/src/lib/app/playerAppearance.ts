export type PlayerAppearanceColor = {
  r: number
  g: number
  b: number
  a: number
}

export type PlayerAppearanceProfile = {
  id: string
  label: string
  farmerName: string
  isFemale: boolean
  hairStyleIndex: number
  shirtSpriteIndex: number
  pantsSpriteIndex: number
  accessoryIndex: number
  hatSpriteIndex: number | null
  hatItemId: string | null
  shoesIndex: number
  skinToneIndex: number
  hairColor: PlayerAppearanceColor
  eyeColor: PlayerAppearanceColor
  shirtColor: PlayerAppearanceColor
  pantsColor: PlayerAppearanceColor
  sourceSaveFolder: string | null
  sourceFilePath: string | null
  importedAt: string | null
  customHairId: string | null
  customHatId: string | null
  customShirtId: string | null
  customPantsId: string | null
}

export type StoredPlayerAppearanceState = {
  profiles: PlayerAppearanceProfile[]
  activeProfileId: string | null
}

const DEFAULT_HAIR_COLOR: PlayerAppearanceColor = { r: 193, g: 90, b: 50, a: 255 }
const DEFAULT_EYE_COLOR: PlayerAppearanceColor = { r: 122, g: 68, b: 52, a: 255 }
const DEFAULT_SHIRT_COLOR: PlayerAppearanceColor = { r: 255, g: 255, b: 255, a: 255 }
const DEFAULT_PANTS_COLOR: PlayerAppearanceColor = { r: 46, g: 85, b: 183, a: 255 }

function createProfileId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `player-profile:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function clampByte(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampIndex(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(-1, Math.round(value))
}

function sanitizeColor(input: Partial<PlayerAppearanceColor> | null | undefined, fallback: PlayerAppearanceColor): PlayerAppearanceColor {
  return {
    r: clampByte(input?.r ?? Number.NaN, fallback.r),
    g: clampByte(input?.g ?? Number.NaN, fallback.g),
    b: clampByte(input?.b ?? Number.NaN, fallback.b),
    a: clampByte(input?.a ?? Number.NaN, fallback.a),
  }
}

export function createDefaultPlayerAppearanceProfile(label = 'Default Player'): PlayerAppearanceProfile {
  return {
    id: createProfileId(),
    label,
    farmerName: 'Farmer',
    isFemale: false,
    hairStyleIndex: 0,
    shirtSpriteIndex: 0,
    pantsSpriteIndex: 0,
    accessoryIndex: -1,
    hatSpriteIndex: null,
    hatItemId: null,
    shoesIndex: 2,
    skinToneIndex: 0,
    hairColor: { ...DEFAULT_HAIR_COLOR },
    eyeColor: { ...DEFAULT_EYE_COLOR },
    shirtColor: { ...DEFAULT_SHIRT_COLOR },
    pantsColor: { ...DEFAULT_PANTS_COLOR },
    sourceSaveFolder: null,
    sourceFilePath: null,
    importedAt: null,
    customHairId: null,
    customHatId: null,
    customShirtId: null,
    customPantsId: null,
  }
}

export function clonePlayerAppearanceProfile(profile: PlayerAppearanceProfile): PlayerAppearanceProfile {
  return {
    ...profile,
    id: createProfileId(),
    label: `${profile.label} Copy`,
    hairColor: { ...profile.hairColor },
    eyeColor: { ...profile.eyeColor },
    shirtColor: { ...profile.shirtColor },
    pantsColor: { ...profile.pantsColor },
    importedAt: profile.importedAt,
  }
}

export function sanitizePlayerAppearanceProfile(profile: Partial<PlayerAppearanceProfile> | null | undefined): PlayerAppearanceProfile {
  const fallback = createDefaultPlayerAppearanceProfile(typeof profile?.label === 'string' && profile.label.trim() ? profile.label.trim() : 'Player')

  return {
    id: typeof profile?.id === 'string' && profile.id.trim() ? profile.id : fallback.id,
    label: typeof profile?.label === 'string' && profile.label.trim() ? profile.label.trim() : fallback.label,
    farmerName: typeof profile?.farmerName === 'string' && profile.farmerName.trim() ? profile.farmerName.trim() : fallback.farmerName,
    isFemale: Boolean(profile?.isFemale),
    hairStyleIndex: clampIndex(Number(profile?.hairStyleIndex), fallback.hairStyleIndex),
    shirtSpriteIndex: clampIndex(Number(profile?.shirtSpriteIndex), fallback.shirtSpriteIndex),
    pantsSpriteIndex: clampIndex(Number(profile?.pantsSpriteIndex), fallback.pantsSpriteIndex),
    accessoryIndex: clampIndex(Number(profile?.accessoryIndex), fallback.accessoryIndex),
    hatSpriteIndex: profile?.hatSpriteIndex == null ? null : clampIndex(Number(profile.hatSpriteIndex), 0),
    hatItemId: typeof profile?.hatItemId === 'string' && profile.hatItemId.trim() ? profile.hatItemId : null,
    shoesIndex: clampIndex(Number(profile?.shoesIndex), fallback.shoesIndex),
    skinToneIndex: clampIndex(Number(profile?.skinToneIndex), fallback.skinToneIndex),
    hairColor: sanitizeColor(profile?.hairColor, DEFAULT_HAIR_COLOR),
    eyeColor: sanitizeColor(profile?.eyeColor, DEFAULT_EYE_COLOR),
    shirtColor: sanitizeColor(profile?.shirtColor, DEFAULT_SHIRT_COLOR),
    pantsColor: sanitizeColor(profile?.pantsColor, DEFAULT_PANTS_COLOR),
    sourceSaveFolder: typeof profile?.sourceSaveFolder === 'string' && profile.sourceSaveFolder.trim() ? profile.sourceSaveFolder : null,
    sourceFilePath: typeof profile?.sourceFilePath === 'string' && profile.sourceFilePath.trim() ? profile.sourceFilePath : null,
    importedAt: typeof profile?.importedAt === 'string' && profile.importedAt.trim() ? profile.importedAt : null,
    customHairId: typeof profile?.customHairId === 'string' && profile.customHairId.trim() ? profile.customHairId : null,
    customHatId: typeof profile?.customHatId === 'string' && profile.customHatId.trim() ? profile.customHatId : null,
    customShirtId: typeof profile?.customShirtId === 'string' && profile.customShirtId.trim() ? profile.customShirtId : null,
    customPantsId: typeof profile?.customPantsId === 'string' && profile.customPantsId.trim() ? profile.customPantsId : null,
  }
}

export function readStoredPlayerAppearanceState(
  rawProfiles: string | null,
  rawActiveProfileId: string | null,
): StoredPlayerAppearanceState {
  let parsedProfiles: unknown = []

  try {
    parsedProfiles = rawProfiles ? (JSON.parse(rawProfiles) as unknown) : []
  } catch {
    parsedProfiles = []
  }

  const profiles = Array.isArray(parsedProfiles) ? parsedProfiles.map((item) => sanitizePlayerAppearanceProfile(item)) : []
  const ensuredProfiles = profiles.length > 0 ? profiles : [createDefaultPlayerAppearanceProfile()]
  const activeProfileId =
    rawActiveProfileId && ensuredProfiles.some((profile) => profile.id === rawActiveProfileId)
      ? rawActiveProfileId
      : ensuredProfiles[0]?.id ?? null

  return {
    profiles: ensuredProfiles,
    activeProfileId,
  }
}

function findDirectChild(parent: Element, tagName: string) {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      return child
    }
  }

  return null
}

function readDirectChildText(parent: Element | null, tagName: string) {
  const child = parent ? findDirectChild(parent, tagName) : null
  return child?.textContent?.trim() ?? null
}

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBoolean(value: string | null) {
  if (!value) {
    return null
  }

  if (value === 'true' || value === 'True') {
    return true
  }

  if (value === 'false' || value === 'False') {
    return false
  }

  return null
}

function readColor(parent: Element | null, tagName: string, fallback: PlayerAppearanceColor) {
  const colorNode = parent ? findDirectChild(parent, tagName) : null
  return {
    r: clampByte(parseInteger(readDirectChildText(colorNode, 'R'), fallback.r), fallback.r),
    g: clampByte(parseInteger(readDirectChildText(colorNode, 'G'), fallback.g), fallback.g),
    b: clampByte(parseInteger(readDirectChildText(colorNode, 'B'), fallback.b), fallback.b),
    a: clampByte(parseInteger(readDirectChildText(colorNode, 'A'), fallback.a), fallback.a),
  }
}

function readModDataMap(parent: Element | null) {
  const result: Record<string, string | null> = {}
  if (!parent) {
    return result
  }

  for (const entry of Array.from(parent.children)) {
    if (entry.tagName !== 'item') {
      continue
    }

    const key = readDirectChildText(findDirectChild(entry, 'key'), 'string')
    const valueParent = findDirectChild(entry, 'value')
    const stringValue = readDirectChildText(valueParent, 'string')
    if (key) {
      result[key] = stringValue
    }
  }

  return result
}

function isProbablyVanillaHatItemId(itemId: string | null) {
  return Boolean(itemId && /^\d+$/u.test(itemId))
}

export function parsePlayerAppearanceProfileFromSave(
  xmlText: string,
  options?: {
    slotLabel?: string
    sourceSaveFolder?: string | null
    sourceFilePath?: string | null
  },
): PlayerAppearanceProfile {
  const parser = new DOMParser()
  const document = parser.parseFromString(xmlText, 'application/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError) {
    throw new Error(parseError.textContent?.trim() || 'Failed to parse Stardew Valley save XML.')
  }

  const root = document.documentElement
  const player =
    root.tagName === 'Farmer'
      ? root
      : Array.from(root.children).find((child) => child.tagName === 'player') ?? root

  if (!player) {
    throw new Error('The save file does not contain a player node.')
  }

  const playerName = readDirectChildText(player, 'name') ?? 'Farmer'
  const genderText = readDirectChildText(player, 'Gender') ?? readDirectChildText(player, 'gender')
  const isMale = parseBoolean(readDirectChildText(player, 'isMale'))
  const isFemale = genderText ? /female/iu.test(genderText) : isMale == null ? false : !isMale
  const shirtOverride = parseInteger(readDirectChildText(player, 'shirt'), -1)
  const pantsOverride = parseInteger(readDirectChildText(player, 'pants'), -1)
  const shirtItem = findDirectChild(player, 'shirtItem')
  const pantsItem = findDirectChild(player, 'pantsItem')
  const hatItem = findDirectChild(player, 'hat')
  const modData = readModDataMap(findDirectChild(player, 'modData'))

  const shirtSpriteIndex =
    shirtOverride >= 0 ? shirtOverride : parseInteger(readDirectChildText(shirtItem, 'indexInTileSheet'), 0)
  const pantsSpriteIndex =
    pantsOverride >= 0 ? pantsOverride : parseInteger(readDirectChildText(pantsItem, 'indexInTileSheet'), 0)

  const rawHatItemId = readDirectChildText(hatItem, 'itemId')
  const hatSpriteIndex = parseInteger(readDirectChildText(hatItem, 'parentSheetIndex'), -1)

  return sanitizePlayerAppearanceProfile({
    id: createProfileId(),
    label: options?.slotLabel?.trim() || playerName,
    farmerName: playerName,
    isFemale,
    hairStyleIndex: parseInteger(readDirectChildText(player, 'hair'), 0),
    shirtSpriteIndex,
    pantsSpriteIndex,
    accessoryIndex: parseInteger(readDirectChildText(player, 'accessory'), -1),
    hatSpriteIndex: hatSpriteIndex >= 0 && isProbablyVanillaHatItemId(rawHatItemId) ? hatSpriteIndex : null,
    hatItemId: rawHatItemId,
    shoesIndex: parseInteger(readDirectChildText(player, 'shoes'), 2),
    skinToneIndex: parseInteger(readDirectChildText(player, 'skin'), 0),
    hairColor: readColor(player, 'hairstyleColor', DEFAULT_HAIR_COLOR),
    eyeColor: readColor(player, 'newEyeColor', DEFAULT_EYE_COLOR),
    shirtColor: readColor(shirtItem, 'clothesColor', DEFAULT_SHIRT_COLOR),
    pantsColor: readColor(player, 'pantsColor', readColor(pantsItem, 'clothesColor', DEFAULT_PANTS_COLOR)),
    sourceSaveFolder: options?.sourceSaveFolder ?? null,
    sourceFilePath: options?.sourceFilePath ?? null,
    importedAt: new Date().toISOString(),
    customHairId: modData['FashionSense.CustomHair.Id'] ?? null,
    customHatId: modData['FashionSense.CustomHat.Id'] ?? null,
    customShirtId: modData['FashionSense.CustomShirt.Id'] ?? null,
    customPantsId: modData['FashionSense.CustomPants.Id'] ?? null,
  })
}

export function colorToHex(color: PlayerAppearanceColor) {
  return `#${[color.r, color.g, color.b]
    .map((value) => clampByte(value, 0).toString(16).padStart(2, '0'))
    .join('')}`
}

export function hexToColor(value: string, fallback: PlayerAppearanceColor): PlayerAppearanceColor {
  const normalized = value.trim().replace(/^#/u, '')
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) {
    return fallback
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: fallback.a,
  }
}
