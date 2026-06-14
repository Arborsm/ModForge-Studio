/**
 * 显式注册所有语言包。
 *
 * 新增语言的步骤：
 * 1. 在 `../model/core.ts` 的 `LocaleCode` 中添加新的语言代码。
 * 2. 在 `../model/settings.ts` 的 `SettingsMenuCopy.localeLabels` 中补充标签。
 * 3. 复制一个已有语言目录（如 `en-US/`）作为骨架，逐域补完翻译。
 * 4. 在下方 `localeBundles` 中新增一行注册。
 * 5. 运行 `pnpm --filter @modforge/desktop test` 验证。
 */
import enUS from './en-US'
import zhCN from './zh-CN'
import type { LocaleBundle, LocaleCode } from '../model'

export const localeBundles: Record<LocaleCode, LocaleBundle> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}
