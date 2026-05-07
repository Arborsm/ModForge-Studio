import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { LocaleProvider } from '@locales/localeContext'
import type { LocaleCode } from '@locales'
import { LauncherTestWrapper } from './launcherTestWrapper'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { GeneratedProjectProvider } from '@features/generated-project/model/generatedProjectProvider'
import type { GeneratedProjectPort } from '@features/generated-project/model/generatedProjectPort'
import { createMockLauncherPort } from './launcherTestPort'

export function renderWithLocaleAndLaunchers(
  ui: ReactElement,
  locale: LocaleCode = 'en-US',
  options?: Omit<RenderOptions, 'wrapper'>,
  port?: LauncherPort,
  generatedProjectPort?: GeneratedProjectPort,
) {
  const launcherPort = port ?? createMockLauncherPort()

  function Wrapper({ children }: { children: ReactNode }) {
    const content = <LocaleProvider locale={locale}>{children}</LocaleProvider>

    return (
      <LauncherTestWrapper port={launcherPort}>
        {generatedProjectPort ? <GeneratedProjectProvider port={generatedProjectPort}>{content}</GeneratedProjectProvider> : content}
      </LauncherTestWrapper>
    )
  }

  return render(ui, { ...options, wrapper: Wrapper })
}
