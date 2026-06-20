import { create } from 'zustand'
import type { AppUiState, ThemeId, WindowBorderTone, WindowBorderWeight } from '@shared/contracts'
import type { LoadingMotionPreference } from '@shared/contracts/types/loadingMotion'
import { canUseDesktopHost } from '@shared/lib/desktop/runtime'
import { normalizeLoadingMotionPreference } from '@shared/lib/loading-motion'
import type { LocaleCode, ThemeMode } from '@locales/model'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from './appUiState'
import { DEFAULT_THEME_ID, normalizeThemeId } from './theme'

type PreferencesStateValues = {
  theme: ThemeMode
  themeId: ThemeId
  locale: LocaleCode
  windowBorderTone: WindowBorderTone
  windowBorderWeight: WindowBorderWeight
  windowIsFullscreen: boolean
  desktopHost: boolean
  debugEnabled: boolean
  notificationSoundEnabled: boolean
  loadingMotionPreference: LoadingMotionPreference
}

export type PreferencesState = PreferencesStateValues & {
  setTheme: (theme: ThemeMode) => void
  setThemeId: (themeId: string) => void
  setLocale: (locale: LocaleCode) => void
  setWindowBorderTone: (tone: WindowBorderTone) => void
  setWindowBorderWeight: (weight: WindowBorderWeight) => void
  toggleFullscreen: () => Promise<void>
  setDebugEnabled: (enabled: boolean) => void
  setNotificationSoundEnabled: (enabled: boolean) => void
  setLoadingMotionPreference: (preference: LoadingMotionPreference) => void
}

type PreferencesStoreSeed = Partial<PreferencesStateValues>

function getPreferredTheme(): ThemeMode {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light'
  }

  return 'dark'
}

function resolveLocale(value: unknown): LocaleCode {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }

  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

function normalizeWindowBorderTone(value: unknown): WindowBorderTone {
  return value === 'neutral' ? 'neutral' : 'accent'
}

function normalizeWindowBorderWeight(value: unknown): WindowBorderWeight {
  return value === 'thin' || value === 'none' ? value : 'standard'
}

function readPreferencesFromAppUiState(state: AppUiState): PreferencesStateValues {
  return {
    theme: getPreferredTheme(),
    themeId: normalizeThemeId(state.appearance.themeId || DEFAULT_THEME_ID),
    locale: resolveLocale(state.appearance.locale),
    windowBorderTone: normalizeWindowBorderTone(state.appearance.windowBorderTone),
    windowBorderWeight: normalizeWindowBorderWeight(state.appearance.windowBorderWeight),
    windowIsFullscreen: false,
    desktopHost: canUseDesktopHost(),
    debugEnabled: state.shell.debugEnabled,
    notificationSoundEnabled: state.shell.notificationSoundEnabled,
    loadingMotionPreference: normalizeLoadingMotionPreference(state.appearance.loadingMotion),
  }
}

function syncDocumentPreferences(state: Pick<PreferencesStateValues, 'theme' | 'themeId' | 'locale'>) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.classList.toggle('dark', state.theme === 'dark')
  document.documentElement.dataset.theme = state.themeId
  document.documentElement.lang = state.locale
}

function patchShellPreference(patch: Partial<AppUiState['shell']>) {
  const shell = getAppUiStateSnapshot().shell
  void applyAppUiStatePatch({
    shell: {
      ...shell,
      ...patch,
    },
  })
}

const initialPreferencesState = readPreferencesFromAppUiState(getAppUiStateSnapshot())

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...initialPreferencesState,
  setTheme: (theme) => {
    set({ theme })
    syncDocumentPreferences({ ...get(), theme })
  },
  setThemeId: (themeId) => {
    const nextThemeId = normalizeThemeId(themeId)
    set({ themeId: nextThemeId })
    syncDocumentPreferences({ ...get(), themeId: nextThemeId })
    void applyAppUiStatePatch({ appearance: { themeId: nextThemeId } })
  },
  setLocale: (locale) => {
    set({ locale })
    syncDocumentPreferences({ ...get(), locale })
    void applyAppUiStatePatch({ appearance: { locale } })
  },
  setWindowBorderTone: (windowBorderTone) => {
    set({ windowBorderTone })
    void applyAppUiStatePatch({ appearance: { windowBorderTone, windowBorderWeight: get().windowBorderWeight } })
  },
  setWindowBorderWeight: (windowBorderWeight) => {
    set({ windowBorderWeight })
    void applyAppUiStatePatch({ appearance: { windowBorderTone: get().windowBorderTone, windowBorderWeight } })
  },
  toggleFullscreen: async () => {
    const { toggleFullscreenCurrentWindow } = await import('@shared/lib/desktop/window')
    const nextFullscreen = await toggleFullscreenCurrentWindow()
    set({ windowIsFullscreen: nextFullscreen })
    queueFullscreenRefresh()
  },
  setDebugEnabled: (debugEnabled) => {
    set({ debugEnabled })
    patchShellPreference({ debugEnabled })
  },
  setNotificationSoundEnabled: (notificationSoundEnabled) => {
    set({ notificationSoundEnabled })
    patchShellPreference({ notificationSoundEnabled })
  },
  setLoadingMotionPreference: (loadingMotionPreference) => {
    const normalizedPreference = normalizeLoadingMotionPreference(loadingMotionPreference)
    set({ loadingMotionPreference: normalizedPreference })
    void applyAppUiStatePatch({ appearance: { loadingMotion: normalizedPreference } })
  },
}))

let runtimeStarted = false
let runtimeDisposed = false
let runtimeFrameId: number | null = null

function queueFullscreenRefresh() {
  if (typeof window === 'undefined') {
    return
  }

  if (runtimeFrameId !== null) {
    window.cancelAnimationFrame(runtimeFrameId)
  }

  runtimeFrameId = window.requestAnimationFrame(() => {
    runtimeFrameId = null

    if (runtimeDisposed || !usePreferencesStore.getState().desktopHost) {
      usePreferencesStore.setState({ windowIsFullscreen: false })
      return
    }

    void (async () => {
      const { isCurrentWindowFullscreen } = await import('@shared/lib/desktop/window')
      return isCurrentWindowFullscreen()
    })()
      .then((windowIsFullscreen) => {
        if (!runtimeDisposed) {
          usePreferencesStore.setState({ windowIsFullscreen })
        }
      })
      .catch(() => {
        if (!runtimeDisposed) {
          usePreferencesStore.setState({ windowIsFullscreen: false })
        }
      })
  })
}

/** Starts host preference subscriptions such as fullscreen state synchronization. */
export function startPreferencesRuntime(desktopHost = usePreferencesStore.getState().desktopHost) {
  syncDocumentPreferences(usePreferencesStore.getState())
  if (runtimeStarted || typeof window === 'undefined') {
    return
  }

  runtimeStarted = true
  runtimeDisposed = false
  usePreferencesStore.setState({ desktopHost })
  queueFullscreenRefresh()
  window.addEventListener('resize', queueFullscreenRefresh)
}

/** Stops preference subscriptions registered by `startPreferencesRuntime`. */
export function stopPreferencesRuntime() {
  if (!runtimeStarted || typeof window === 'undefined') {
    return
  }

  runtimeStarted = false
  runtimeDisposed = true
  if (runtimeFrameId !== null) {
    window.cancelAnimationFrame(runtimeFrameId)
    runtimeFrameId = null
  }
  window.removeEventListener('resize', queueFullscreenRefresh)
}

/** Synchronizes the preference store after app UI state has been initialized or patched externally. */
export function syncPreferencesStoreFromAppUiState(
  state: AppUiState = getAppUiStateSnapshot(),
  desktopHost = usePreferencesStore.getState().desktopHost,
) {
  const current = usePreferencesStore.getState()
  const next = {
    ...readPreferencesFromAppUiState(state),
    theme: current.theme,
    windowIsFullscreen: current.windowIsFullscreen,
    desktopHost,
  }

  usePreferencesStore.setState(next)
  syncDocumentPreferences(next)
}

/** Resets global preferences state between tests and optionally applies a seed. */
export function resetPreferencesStoreForTest(seed: PreferencesStoreSeed = {}) {
  stopPreferencesRuntime()
  const next = {
    ...readPreferencesFromAppUiState(getAppUiStateSnapshot()),
    ...seed,
  }
  usePreferencesStore.setState(next)
  syncDocumentPreferences(next)
}
