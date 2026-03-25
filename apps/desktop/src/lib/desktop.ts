import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type GameDirectoryInfo = {
  rootPath: string
  executablePath: string
  unpackedMapsPath: string | null
  xnbMapsPath: string | null
  preferredMapsPath: string | null
  preferredFormat: 'tmx' | 'xnb'
  hasUnpackedMaps: boolean
  hasXnbMaps: boolean
  mapCount: number
}

export type MapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type EventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type MapAssetContent = {
  name: string
  format: 'tmx' | 'xnb'
  absolutePath: string
  relativePath: string
  content: string
}

export type TextAssetContent = {
  absolutePath: string
  relativePath: string
  content: string
}

function isDesktopHost() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  if (!isDesktopHost()) {
    throw new Error('This feature is only available in the Tauri desktop host.')
  }

  return invoke<T>(command, args)
}

export function canUseDesktopHost() {
  return isDesktopHost()
}

export async function chooseGameDirectory() {
  if (!isDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select the Stardew Valley game folder',
  })

  return typeof selected === 'string' ? selected : null
}

export function detectDefaultGameDirectory() {
  return invokeDesktop<string | null>('detect_default_game_directory')
}

export function validateGameDirectory(path: string) {
  return invokeDesktop<GameDirectoryInfo>('validate_game_directory', { path })
}

export function scanMaps(path: string) {
  return invokeDesktop<MapAssetSummary[]>('scan_maps', { path })
}

export function scanEvents(path: string) {
  return invokeDesktop<EventAssetSummary[]>('scan_events', { path })
}

export function loadMapAsset(rootPath: string, mapPath: string) {
  return invokeDesktop<MapAssetContent>('load_map_asset', { rootPath, mapPath })
}

export function loadTextAsset(rootPath: string, assetPath: string) {
  return invokeDesktop<TextAssetContent>('load_text_asset', { rootPath, assetPath })
}

export async function minimizeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().minimize()
}

export async function toggleMaximizeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().toggleMaximize()
}

export async function closeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().close()
}
