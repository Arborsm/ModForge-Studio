import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

/** UI language definition for the installer language picker. */
export interface InstallerLanguageDefinition {
  /** Locale id used by the installer UI (also the i18next resource key). */
  uiCode: string
  /** Locale id persisted for the main app (`appearance.locale` in ui-state.json). */
  appCode: AppLanguage
  label: string
  nativeName: string
  continueLabel: string
  /** Accepted aliases when detecting the OS / saved language. */
  aliases: readonly string[]
}

export const INSTALLER_LANGUAGE_DEFINITIONS = [
  {
    uiCode: 'en-US',
    appCode: 'en-US',
    label: 'English',
    nativeName: 'English',
    continueLabel: 'Continue',
    aliases: ['en', 'en-us'],
  },
  {
    uiCode: 'zh-CN',
    appCode: 'zh-CN',
    label: 'Chinese',
    nativeName: '简体中文',
    continueLabel: '继续',
    aliases: ['zh', 'zh-hans', 'zh-cn'],
  },
] as const satisfies readonly InstallerLanguageDefinition[]

export type InstallerUiLanguage = (typeof INSTALLER_LANGUAGE_DEFINITIONS)[number]['uiCode']
export type AppLanguage = 'zh-CN' | 'en-US'

export const DEFAULT_INSTALLER_UI_LANGUAGE: InstallerUiLanguage = 'en-US'

const installerResourceByUiCode = {
  'en-US': enUS,
  'zh-CN': zhCN,
} satisfies Record<InstallerUiLanguage, Record<string, unknown>>

export const INSTALLER_LANGUAGES = INSTALLER_LANGUAGE_DEFINITIONS.map((language) => ({
  ...language,
  resource: installerResourceByUiCode[language.uiCode],
}))

const installerAliasesByPriority = INSTALLER_LANGUAGES.flatMap((language) =>
  language.aliases.map((alias) => ({ language, alias: alias.toLowerCase() })),
).sort((a, b) => b.alias.length - a.alias.length)

export const installerResources = Object.fromEntries(
  INSTALLER_LANGUAGES.map((language) => [language.uiCode, { translation: language.resource }]),
)

export function isInstallerUiLanguage(value: string | null | undefined): value is InstallerUiLanguage {
  return INSTALLER_LANGUAGES.some((language) => language.uiCode === value)
}

export function mapUiLanguageToAppLanguage(uiLanguage: InstallerUiLanguage): AppLanguage {
  return INSTALLER_LANGUAGES.find((language) => language.uiCode === uiLanguage)?.appCode ?? 'en-US'
}

export function mapAppLanguageToUiLanguage(appLanguage: string | null | undefined): InstallerUiLanguage | null {
  const normalized = appLanguage?.trim()
  if (!normalized) return null

  const exact = INSTALLER_LANGUAGES.find((language) => language.appCode === normalized)
  return exact?.uiCode ?? resolveInstallerUiLanguage(normalized)
}

export function resolveInstallerUiLanguage(value: string | null | undefined): InstallerUiLanguage | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null

  const exact = INSTALLER_LANGUAGES.find((language) => language.uiCode.toLowerCase() === normalized)
  if (exact) return exact.uiCode

  // Keep alias resolution deterministic: longest alias first, so `zh-hans`
  // wins over the broad `zh` prefix when both could match.
  return installerAliasesByPriority.find(({ alias }) => normalized === alias || normalized.startsWith(`${alias}-`))?.language.uiCode ?? null
}

export function getInstallerUiFallbackChain(uiLanguage: string | null | undefined, includeSelf = false): InstallerUiLanguage[] {
  const resolved = resolveInstallerUiLanguage(uiLanguage) ?? DEFAULT_INSTALLER_UI_LANGUAGE
  const fallbacks = INSTALLER_LANGUAGES.map((language) => language.uiCode).filter((code) => code !== resolved)
  return includeSelf ? [resolved, ...fallbacks] : fallbacks
}

export function detectInstallerUiLanguage(appLanguage?: string | null): InstallerUiLanguage {
  return (
    mapAppLanguageToUiLanguage(appLanguage) ??
    resolveInstallerUiLanguage(typeof navigator !== 'undefined' ? navigator.language : null) ??
    DEFAULT_INSTALLER_UI_LANGUAGE
  )
}
