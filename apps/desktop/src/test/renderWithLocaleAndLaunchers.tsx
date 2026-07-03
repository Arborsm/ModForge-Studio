import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { LocaleProvider } from '@locales/provider'
import type { LocaleCode } from '@locales'
import { LauncherTestWrapper } from './launcherTestWrapper'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { CpMakerProvider } from '@features/cp-maker/model/cpMakerProvider'
import type { CpMakerPort } from '@features/cp-maker/model/cpMakerPort'
import { createMockLauncherPort } from './launcherTestPort'

export function renderWithLocaleAndLaunchers(
  ui: ReactElement,
  locale: LocaleCode = 'en-US',
  options?: Omit<RenderOptions, 'wrapper'>,
  port?: LauncherPort,
  cpMakerPort?: CpMakerPort,
) {
  const launcherPort = port ?? createMockLauncherPort()

  function Wrapper({ children }: { children: ReactNode }) {
    const content = <LocaleProvider locale={locale}>{children}</LocaleProvider>

    return (
      <LauncherTestWrapper port={launcherPort}>
        {cpMakerPort ? <CpMakerProvider port={cpMakerPort}>{content}</CpMakerProvider> : content}
      </LauncherTestWrapper>
    )
  }

  return render(ui, { ...options, wrapper: Wrapper })
}
