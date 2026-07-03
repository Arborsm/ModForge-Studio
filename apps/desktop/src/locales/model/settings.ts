import type { LocaleCode } from './core'
import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionStyleId } from '@shared/lib/loading-motion'

export type SettingsMenuCopy = {
  title: string
  categories: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
  closeDialogLabel: string
  cancelActionLabel: string
  themeLabel: string
  resetThemeLabel: string
  themeDescription: string
  themeLabels: Record<string, string>
  languageLabel: string
  languageDescription: string
  localeLabels: Record<LocaleCode, string>
  windowModeLabel: string
  windowBorderToneLabel: string
  windowBorderToneDescription: string
  windowBorderToneOptions: Record<'accent' | 'neutral', string>
  windowBorderWeightLabel: string
  windowBorderWeightDescription: string
  windowBorderWeightOptions: Record<'standard' | 'thin' | 'none', string>
  closeBehaviorLabel: string
  closeBehaviorDescription: string
  closeBehaviorOptions: Record<'quit' | 'minimizeToTray', string>
  rememberCloseChoiceLabel: string
  borderlessFullscreenLabel: string
  borderlessFullscreenDescription: string
  enableBorderlessFullscreenLabel: string
  disableBorderlessFullscreenLabel: string
  debugModeLabel: string
  debugModeDescription: string
  enableDebugModeLabel: string
  disableDebugModeLabel: string
  notificationSoundLabel: string
  notificationSoundDescription: string
  enableNotificationSoundLabel: string
  disableNotificationSoundLabel: string
  loadingMotionStyleLabel: string
  loadingMotionStyleDescription: string
  loadingMotionIntensityLabel: string
  loadingMotionIntensityDescription: string
  loadingMotionSpeedLabel: string
  loadingMotionSpeedDescription: string
  loadingMotionStyleLabels: Record<LoadingMotionStyleId, string>
  loadingMotionIntensityLabels: Record<LoadingMotionIntensityId, string>
  loadingMotionSpeedLabels: Record<LoadingMotionSpeedId, string>
  loadingMotionCustomSpeedLabel: string
  loadingMotionCustomSpeedDescription: string
  loadingMotionCustomSpeedToggleLabel: string
  loadingMotionPresetSpeedToggleLabel: string
  loadingMotionSpeedValueLabel: (value: number) => string
  quitDialogTitle: string
  quitDialogMessage: string
  quitDialogDescription: string
  quitActionLabel: string
  minimizeToTrayActionLabel: string
  futureLabel: string
  futureDescription: string
  categoryDescriptions: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
}
