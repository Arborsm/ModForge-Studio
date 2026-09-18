/**
 * @file Android platform adapter — wires the WebView `modforgeBridge` JS interface into the
 * `PlatformPorts` contract for the modforge-android launcher host.
 * @module platform/android
 */

import type { OpenDialogOptions, PlatformPorts, SaveDialogOptions } from '@shared/contracts'
import { createBrowserStorage, createDialogChoosers } from '../adapter-shared'

/**
 * WebView base URL served by `LauncherActivity` through `androidx.webkit`'s
 * `WebViewAssetLoader`. Local sandbox files (covers, plugin assets) are exposed
 * under dedicated prefixes handled by custom `IPathHandler`s on the C# side.
 */
const ANDROID_ASSET_ORIGIN = 'https://appassets.androidplatform.net'

/** Internal bridge command that opens the Android SAF document picker for files. */
const ANDROID_PICK_FILE_COMMAND = 'android:pick_file'
/** Internal bridge command that opens the Android SAF document picker for directories. */
const ANDROID_PICK_DIRECTORY_COMMAND = 'android:pick_dir'
/** Internal bridge command that opens the Android SAF document creator. */
const ANDROID_CREATE_DOCUMENT_COMMAND = 'android:create_document'
/** Internal bridge command that tints the native status/navigation bar strip to the app surface. */
const ANDROID_SET_SYSTEM_BARS_COMMAND = 'android:set_system_bars'
/** Internal bridge command that opens the built-in in-app browser overlay at a URL. */
const ANDROID_OPEN_IN_APP_BROWSER_COMMAND = 'android:open_in_app_browser'
/** Internal bridge command that proxies a minimal authenticated HTTP request for self-contained AI calls. */
const ANDROID_AI_REQUEST_COMMAND = 'android:ai_request'

/**
 * Host event the in-app browser pushes when it captures a file download:
 * the archive landed in the download directory and, when enabled, was
 * installed into Mods by the native host.
 */
export const ANDROID_IN_APP_BROWSER_DOWNLOAD_EVENT = 'android:in-app-browser-download'

export type AndroidInAppBrowserDownloadPayload = {
  status: 'completed' | 'failed'
  fileName: string
  installed: boolean
  message?: string | null
}

/** Minimal shape of the `modforgeBridge` object injected by the Android WebView host. */
type ModForgeBridge = {
  invokeCommand: (command: string, argsJson: string, callbackId: string) => void
  backHandled: () => void
}

declare global {
  interface Window {
    modforgeBridge?: ModForgeBridge
    __modforgeDispatch?: (frame: unknown) => void
  }
}

/** Reports whether the current runtime is inside the Android WebView launcher host. */
export function isAndroidHost() {
  return typeof window !== 'undefined' && 'modforgeBridge' in window
}

/** Acknowledges an `android:back` event: the SPA closed its topmost overlay. */
export function notifyAndroidBackHandled() {
  if (typeof window === 'undefined') {
    return
  }

  window.modforgeBridge?.backHandled()
}

let systemBarSyncInstalled = false

/** Reads the resolved app-window surface color and derives the native bar appearance from it. */
function readAppSurfaceAppearance(): { hex: string; lightBars: boolean } | null {
  if (typeof document === 'undefined') {
    return null
  }

  const surface = document.querySelector('.app-window-frame') ?? document.body
  const raw = getComputedStyle(surface).backgroundColor
  const match = /rgba?\(\s*(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(raw)
  if (!match) {
    return null
  }

  const channels = [Number(match[1]), Number(match[2]), Number(match[3])]
  const hex = `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  // WCAG relative-luminance shortcut is enough to pick readable system-bar icons.
  const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255
  return { hex, lightBars: luminance > 0.5 }
}

/**
 * Pushes the app surface color and system-bar icon appearance to the native
 * host so the status-bar strip above the WebView reads as one continuous
 * background. Hosts without the command keep their default light chrome.
 */
export function syncAndroidSystemBars() {
  if (!isAndroidHost()) {
    return
  }

  const appearance = readAppSurfaceAppearance()
  if (!appearance) {
    return
  }

  void invokeBridgeCommand(ANDROID_SET_SYSTEM_BARS_COMMAND, appearance).catch(() => {
    // Cosmetic chrome: older hosts and the browser dev mock legitimately have no handler.
  })
}

/**
 * Installs the Android system-bar sync: one immediate push plus a MutationObserver
 * that re-pushes whenever the theme (`data-theme`) or dark toggle (`class`) changes.
 * No-op outside the Android host.
 */
export function installAndroidSystemBarSync() {
  if (!isAndroidHost() || systemBarSyncInstalled || typeof document === 'undefined') {
    return
  }

  systemBarSyncInstalled = true
  syncAndroidSystemBars()
  const observer = new MutationObserver(() => syncAndroidSystemBars())
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
}

/**
 * Opens the built-in in-app browser overlay at an absolute http(s) URL.
 * The overlay runs inside the launcher host; rejected when the current
 * runtime is not the Android WebView host.
 */
export async function openAndroidInAppBrowser(url: string): Promise<void> {
  assertAndroidHost()
  await invokeBridgeCommand(ANDROID_OPEN_IN_APP_BROWSER_COMMAND, { url })
}

export type AndroidAiResponse = {
  statusCode: number
  body: string
}

/**
 * Pipes a minimal provider request through the native host's HTTP proxy. Used by
 * the launcher's self-contained AI features (game-log error analysis): the launcher
 * builds the provider request from the workbench AI profile and only the HTTP hop
 * crosses the bridge; when `profileId` is set, the native side attaches the stored
 * credential so API keys never reach JavaScript. Rejected when the current runtime
 * is not the Android WebView host.
 */
export async function androidAiRequest(request: {
  profileId?: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}): Promise<AndroidAiResponse> {
  assertAndroidHost()
  return invokeBridgeCommand<AndroidAiResponse>(ANDROID_AI_REQUEST_COMMAND, { ...request })
}

/**
 * Subscribes to in-app browser download events. Fires when the native overlay
 * captures a file download and finishes (or fails) fetching it into the app's
 * download directory. Returns the unsubscribe callback.
 */
export function listenToAndroidInAppBrowserDownload(listener: (payload: AndroidInAppBrowserDownloadPayload) => void): () => void {
  installDispatchSink()
  const listeners = eventListeners.get(ANDROID_IN_APP_BROWSER_DOWNLOAD_EVENT) ?? new Set<(payload: unknown) => void>()
  listeners.add(listener as (payload: unknown) => void)
  eventListeners.set(ANDROID_IN_APP_BROWSER_DOWNLOAD_EVENT, listeners)
  return () => {
    const currentListeners = eventListeners.get(ANDROID_IN_APP_BROWSER_DOWNLOAD_EVENT)
    if (!currentListeners) {
      return
    }
    currentListeners.delete(listener as (payload: unknown) => void)
    if (!currentListeners.size) {
      eventListeners.delete(ANDROID_IN_APP_BROWSER_DOWNLOAD_EVENT)
    }
  }
}

function assertAndroidHost() {
  if (!isAndroidHost()) {
    throw new Error('This feature is only available in the Android launcher host.')
  }
}

function getBridge() {
  const bridge = typeof window !== 'undefined' ? window.modforgeBridge : undefined
  if (!bridge) {
    throw new Error('This feature is only available in the Android launcher host.')
  }
  return bridge
}

type PendingCommand = {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
}

const pendingCommands = new Map<string, PendingCommand>()
const eventListeners = new Map<string, Set<(payload: unknown) => void>>()
let callbackCounter = 0
let dispatchInstalled = false

/**
 * Installs the single global dispatch sink the Android host pushes frames into.
 * Command results arrive as `{id, ok, payload}`, host events as `{event, payload}`;
 * both travel over the same `window.__modforgeDispatch(frame)` entry point.
 */
function installDispatchSink() {
  if (dispatchInstalled || typeof window === 'undefined') {
    return
  }

  window.__modforgeDispatch = (frame: unknown) => {
    if (!frame || typeof frame !== 'object') {
      return
    }

    const record = frame as Record<string, unknown>
    if (typeof record.id === 'string') {
      const pending = pendingCommands.get(record.id)
      if (!pending) {
        return
      }
      pendingCommands.delete(record.id)
      if (record.ok === true) {
        pending.resolve(record.payload)
      } else {
        pending.reject(new Error(String(record.payload ?? 'Android host command failed.')))
      }
      return
    }

    if (typeof record.event === 'string') {
      const listeners = eventListeners.get(record.event)
      if (!listeners) {
        return
      }
      for (const listener of [...listeners]) {
        listener(record.payload)
      }
    }
  }

  dispatchInstalled = true
}

function nextCallbackId() {
  callbackCounter += 1
  return `android-cb-${callbackCounter}`
}

/**
 * Fans one host event frame out to registered listeners. The production C#
 * host delivers events through `window.__modforgeDispatch` directly; this
 * helper exists for the browser dev mock, which fabricates the bridge and
 * needs to reach the same listener table.
 */
export function dispatchAndroidHostEvent(event: string, payload: unknown) {
  installDispatchSink()
  const listeners = eventListeners.get(event)
  if (!listeners) {
    return
  }
  for (const listener of [...listeners]) {
    listener(payload)
  }
}

async function invokeBridgeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  assertAndroidHost()
  installDispatchSink()
  const callbackId = nextCallbackId()
  return new Promise<T>((resolve, reject) => {
    pendingCommands.set(callbackId, {
      resolve: (payload) => resolve(payload as T),
      reject,
    })
    getBridge().invokeCommand(command, JSON.stringify(args ?? {}), callbackId)
  })
}

/**
 * Maps a local sandbox file path onto the Android asset origin so the WebView
 * can fetch it through the host's `local-file` path handler. The absolute path
 * travels as one encoded URL segment; the C# handler decodes and streams it.
 */
function toAndroidFileUrl(filePath: string) {
  return `${ANDROID_ASSET_ORIGIN}/local-file/${encodeURIComponent(filePath)}`
}

async function androidOpenDialog(options?: OpenDialogOptions): Promise<string | string[] | null> {
  const args: Record<string, unknown> = {
    title: options?.title ?? null,
    multiple: options?.multiple ?? false,
    directory: options?.directory ?? false,
    filters: options?.filters?.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })) ?? [],
  }
  const selected = await invokeBridgeCommand<string | string[] | null>(
    options?.directory ? ANDROID_PICK_DIRECTORY_COMMAND : ANDROID_PICK_FILE_COMMAND,
    args,
  )
  return selected ?? null
}

async function androidSaveFileDialog(options?: SaveDialogOptions): Promise<string | null> {
  const selected = await invokeBridgeCommand<string | null>(ANDROID_CREATE_DOCUMENT_COMMAND, {
    title: options?.title ?? null,
    defaultPath: options?.defaultPath ?? null,
    filters: options?.filters?.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })) ?? [],
  })
  return selected ?? null
}

/** Builds the `PlatformPorts` instance backed by the Android WebView bridge. */
export function createAndroidPlatformPorts(): PlatformPorts {
  return {
    fileSystem: {
      invokeCommand<T>(command: string, args?: Record<string, unknown>) {
        return invokeBridgeCommand<T>(command, args)
      },
      toAssetUrl(filePath: string) {
        return toAndroidFileUrl(filePath)
      },
      resolvePluginUrl(pluginId: string, relativePath: string, epoch?: number) {
        // Mirrors the desktop URL contract: the plugin id and every relative
        // segment are encoded individually, and when `epoch` is set a `__v<N>/`
        // segment is inserted after the plugin id so hot-reload bypasses the
        // WebView cache. The host path handler strips the version segment and
        // resolves the remainder under the app's plugin root directory.
        const pathSegments = relativePath.split('/').filter(Boolean)
        const segments = [pluginId, ...(epoch !== undefined ? [`__v${epoch}`] : []), ...pathSegments].map(encodeURIComponent).join('/')
        return `${ANDROID_ASSET_ORIGIN}/plugins/${segments}`
      },
    },
    desktopWindow: {
      // Android has no desktop window semantics; every control is a stub so
      // launcher pages keep compiling without branching on the host.
      async minimize() {},
      async toggleMaximize() {
        return false
      },
      async close() {},
      async forceClose() {},
      async hide() {},
      async show() {},
      async isMaximized() {
        return false
      },
      async isFullscreen() {
        return false
      },
      async setFullscreen() {},
      async toggleFullscreen() {
        return false
      },
    },
    storage: createBrowserStorage(),
    dialog: {
      open: androidOpenDialog,
      saveFile: androidSaveFileDialog,
      ...createDialogChoosers(androidOpenDialog),
    },
    hostEvents: {
      canUseHost: isAndroidHost,
      async listen<T>(event: string, listener: (payload: T) => void) {
        installDispatchSink()
        const listeners = eventListeners.get(event) ?? new Set<(payload: unknown) => void>()
        listeners.add(listener as (payload: unknown) => void)
        eventListeners.set(event, listeners)
        return () => {
          const currentListeners = eventListeners.get(event)
          if (!currentListeners) {
            return
          }
          currentListeners.delete(listener as (payload: unknown) => void)
          if (!currentListeners.size) {
            eventListeners.delete(event)
          }
        }
      },
      // Android has no window-close or drag-drop surface; both remain no-ops.
      async listenWindowCloseRequest() {
        return () => {}
      },
      async listenWindowDragDrop() {
        return () => {}
      },
    },
  }
}
