import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'
import { LocaleProvider } from '../lib/app/localeContext'
import type { LocaleCode } from '../locales'

export function renderWithLocale(ui: ReactElement, locale: LocaleCode = 'en-US', options?: Omit<RenderOptions, 'wrapper'>) {
  return render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>, options)
}
