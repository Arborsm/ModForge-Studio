import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'
import { LocaleProvider } from '@locales/provider'
import type { LocaleCode } from '@locales'
import { resetPreferencesStoreForTest } from '@shared/lib/app-state/preferencesStore'

export function renderWithLocale(ui: ReactElement, locale: LocaleCode = 'en-US', options?: Omit<RenderOptions, 'wrapper'>) {
  resetPreferencesStoreForTest({ locale })
  return render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>, options)
}
