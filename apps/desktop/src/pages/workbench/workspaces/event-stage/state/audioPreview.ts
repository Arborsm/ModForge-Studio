import { loadAudioDataUrl, loadXactAudioDataUrl, scanAudioAssets, type AudioAssetSummary } from '@entities/game/api'
import { canUseDesktopHost } from '@platform/host'

type AudioCueKind = 'music' | 'sound'
type AudioCuePlaybackResult = { played: true } | { played: false; reason: string }

type AudioAssetIndex = Map<string, AudioAssetSummary[]>

const AUDIO_INDEX_CACHE = new Map<string, AudioAssetIndex>()
const AUDIO_URL_CACHE = new Map<string, string>()
const XACT_URL_CACHE = new Map<string, string>()

let activeMusicElement: HTMLAudioElement | null = null
let activeMusicCue: string | null = null
let musicRequestGeneration = 0
const activeSoundElements = new Map<string, HTMLAudioElement[]>()

function normalizeCue(value: string) {
  return value.trim().toLowerCase()
}

function getAudioExtensionScore(path: string, kind: AudioCueKind) {
  const lower = path.toLowerCase()
  const preferred = kind === 'music' ? ['.ogg', '.mp3', '.wav', '.flac'] : ['.wav', '.ogg', '.mp3', '.flac']
  const index = preferred.findIndex((ext) => lower.endsWith(ext))
  return index === -1 ? preferred.length : index
}

function pickAudioAsset(assets: AudioAssetSummary[], kind: AudioCueKind) {
  const byKind = assets.filter((asset) => asset.kind === kind)
  const pool = byKind.length ? byKind : assets
  return (
    pool
      .slice()
      .sort((left, right) => getAudioExtensionScore(left.absolutePath, kind) - getAudioExtensionScore(right.absolutePath, kind))[0] ?? null
  )
}

async function loadAudioIndex(rootPath: string) {
  const cached = AUDIO_INDEX_CACHE.get(rootPath)
  if (cached) {
    return cached
  }

  const assets = await scanAudioAssets(rootPath)
  const index: AudioAssetIndex = new Map()
  for (const asset of assets) {
    const key = normalizeCue(asset.cue)
    if (!key) {
      continue
    }

    const existing = index.get(key)
    if (existing) {
      existing.push(asset)
    } else {
      index.set(key, [asset])
    }
  }

  AUDIO_INDEX_CACHE.set(rootPath, index)
  return index
}

async function resolveAudioUrl(asset: AudioAssetSummary) {
  const cached = AUDIO_URL_CACHE.get(asset.absolutePath)
  if (cached) {
    return cached
  }

  const url = await loadAudioDataUrl(asset.absolutePath)
  AUDIO_URL_CACHE.set(asset.absolutePath, url)
  return url
}

async function resolveCue(rootPath: string, cue: string, kind: AudioCueKind) {
  const index = await loadAudioIndex(rootPath)
  const key = normalizeCue(cue)
  const assets = index.get(key)
  if (!assets?.length) {
    return null
  }

  return pickAudioAsset(assets, kind)
}

function stopAudioElement(element: HTMLAudioElement | null) {
  if (!element) {
    return
  }

  element.pause()
  element.currentTime = 0
}

export function stopMusicPreview() {
  musicRequestGeneration += 1
  stopAudioElement(activeMusicElement)
  activeMusicElement = null
  activeMusicCue = null
}

export function stopSoundPreview(cue?: string | null) {
  if (!cue) {
    for (const elements of activeSoundElements.values()) {
      elements.forEach(stopAudioElement)
    }
    activeSoundElements.clear()
    return
  }

  const key = normalizeCue(cue)
  const elements = activeSoundElements.get(key)
  if (!elements?.length) {
    return
  }

  elements.forEach(stopAudioElement)
  activeSoundElements.delete(key)
}

export function resetAudioPreview() {
  stopMusicPreview()
  stopSoundPreview()
  AUDIO_URL_CACHE.clear()
  AUDIO_INDEX_CACHE.clear()
  XACT_URL_CACHE.clear()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function resolveCueUrl(rootPath: string, cue: string, kind: AudioCueKind): Promise<{ url: string | null; reason?: string }> {
  let lastReason: string

  try {
    const asset = await resolveCue(rootPath, cue, kind)
    if (asset) {
      return { url: await resolveAudioUrl(asset) }
    }
    lastReason = `Cue not found in loose audio assets: ${cue}`
  } catch (error) {
    lastReason = getErrorMessage(error)
  }

  const cacheKey = `${rootPath}::${normalizeCue(cue)}`
  const cached = XACT_URL_CACHE.get(cacheKey)
  if (cached) {
    return { url: cached }
  }

  try {
    const url = await loadXactAudioDataUrl(rootPath, cue)
    if (url) {
      XACT_URL_CACHE.set(cacheKey, url)
      return { url }
    }
  } catch (error) {
    return { url: null, reason: getErrorMessage(error) }
  }

  return { url: null, reason: lastReason || `Cue did not resolve to playable audio: ${cue}` }
}

export async function playMusicCue(rootPath: string, cue: string) {
  if (!canUseDesktopHost()) {
    return false
  }

  const normalized = normalizeCue(cue)
  if (!normalized) {
    stopMusicPreview()
    return false
  }

  if (activeMusicCue === normalized && activeMusicElement) {
    return true
  }

  const requestGeneration = musicRequestGeneration + 1
  musicRequestGeneration = requestGeneration

  const { url } = await resolveCueUrl(rootPath, cue, 'music')
  if (musicRequestGeneration !== requestGeneration) {
    return false
  }

  if (!url) {
    return false
  }
  stopAudioElement(activeMusicElement)

  const audio = new Audio(url)
  audio.loop = true
  audio.volume = 0.6
  activeMusicElement = audio
  activeMusicCue = normalized

  void audio.play().catch(() => {})
  return true
}

export async function playSoundCue(rootPath: string, cue: string): Promise<AudioCuePlaybackResult> {
  if (!canUseDesktopHost()) {
    return { played: false, reason: 'Desktop audio host is unavailable.' }
  }

  const normalized = normalizeCue(cue)
  if (!normalized) {
    return { played: false, reason: 'Sound cue is empty.' }
  }

  const { url, reason } = await resolveCueUrl(rootPath, cue, 'sound')
  if (!url) {
    return { played: false, reason: reason ?? `Sound cue did not resolve: ${cue}` }
  }
  const audio = new Audio(url)
  audio.volume = 0.7

  const queue = activeSoundElements.get(normalized) ?? []
  queue.push(audio)
  activeSoundElements.set(normalized, queue)

  audio.addEventListener('ended', () => {
    const list = activeSoundElements.get(normalized)
    if (!list) {
      return
    }
    activeSoundElements.set(
      normalized,
      list.filter((element) => element !== audio),
    )
  })

  try {
    await audio.play()
  } catch (error) {
    stopAudioElement(audio)
    activeSoundElements.set(
      normalized,
      (activeSoundElements.get(normalized) ?? []).filter((element) => element !== audio),
    )
    return { played: false, reason: getErrorMessage(error) }
  }

  return { played: true }
}
