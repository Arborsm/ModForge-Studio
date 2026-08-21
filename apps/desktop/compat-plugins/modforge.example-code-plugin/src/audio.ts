/** Audio helpers: BGM/SFX playback, cue selection, module-scoped audio cache. */

import type { PluginContext, PluginAudioCueSummary } from '@modforge/plugin-sdk'
import { BGM_VOLUME } from './constants.js'

// Module-scoped session state: survives page unmounts because the plugin module
// stays loaded; cleared via ctx.onDispose when the plugin is torn down.
const audioCache = new Map<string, HTMLAudioElement>()
const audioState: { bgm: HTMLAudioElement | null; bgmCue: string | null } = { bgm: null, bgmCue: null }

export function getBgmCue(): string | null {
  return audioState.bgmCue
}

export function stopBgm() {
  if (audioState.bgm) {
    audioState.bgm.pause()
    audioState.bgm.currentTime = 0
  }
  audioState.bgm = null
  audioState.bgmCue = null
}

export function clearAudioCache() {
  audioCache.clear()
}

async function ensureAudio(ctx: PluginContext, cue: string): Promise<HTMLAudioElement> {
  let audio = audioCache.get(cue)
  if (!audio) {
    const dataUrl = await ctx.commands.invoke<string>('loadGameAudioCue', { cue })
    audio = new Audio(dataUrl)
    audioCache.set(cue, audio)
  }
  return audio
}

export async function playBgm(ctx: PluginContext, cue: string) {
  if (!cue || audioState.bgmCue === cue) return
  stopBgm()
  try {
    const audio = await ensureAudio(ctx, cue)
    audio.loop = true
    audio.volume = BGM_VOLUME
    await audio.play()
    audioState.bgm = audio
    audioState.bgmCue = cue
  } catch {
    // BGM is best-effort; autoplay policies may still block it.
  }
}

export async function playSfx(ctx: PluginContext, cue: string | null | undefined, volume = 0.5) {
  if (!cue) return
  try {
    const audio = await ensureAudio(ctx, cue)
    audio.loop = false
    audio.volume = volume
    audio.currentTime = 0
    await audio.play()
  } catch {
    // SFX are best-effort.
  }
}

export function pickCue(cues: PluginAudioCueSummary[], patterns: RegExp[], kind: PluginAudioCueSummary['kind']): string | null {
  for (const pattern of patterns) {
    const hit = cues.find((entry) => entry.kind === kind && pattern.test(entry.cue))
    if (hit) return hit.cue
  }
  return null
}

export function pickDefaultTrack(musicCues: string[]): string | null {
  const preferred = [/stardew/i, /spring/i, /overture|main|theme/i]
  for (const pattern of preferred) {
    const hit = musicCues.find((cue) => pattern.test(cue))
    if (hit) return hit
  }
  return musicCues[0] ?? null
}
