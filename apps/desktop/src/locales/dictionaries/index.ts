/**
 * Explicitly registers all locale bundles.
 *
 * Steps to add a new language:
 * 1. Add the new locale code to `LocaleCode` in `../model/core.ts`.
 * 2. Add the label to `SettingsMenuCopy.localeLabels` in `../model/settings.ts`.
 * 3. Copy an existing language directory (e.g. `en-US/`) as a skeleton and complete translations per domain.
 * 4. Add a registration line in `localeBundles` below.
 * 5. Run `pnpm --filter @modforge/desktop test` to verify.
 */
import enUS from './en-US'
import zhCN from './zh-CN'
import type { LocaleBundle, LocaleCode } from '../model'

export const localeBundles: Record<LocaleCode, LocaleBundle> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}
