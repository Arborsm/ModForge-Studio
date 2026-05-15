import enUS from './en-US'
import zhCN from './zh-CN'
import type { LocaleBundle, LocaleCode } from './schema'

export * from './schema'

export const localeBundles: Record<LocaleCode, LocaleBundle> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}
