import { lazy } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { renderWithLocale } from '@test/renderWithLocale'
import { WorkbenchViewHost } from '@pages/workbench/ui/WorkbenchViewHost'

function module(runtime: WorkbenchModuleRegistration['runtime']): WorkbenchModuleRegistration {
  return {
    id: 'test-module',
    navigation: { section: 'tools', order: 1, icon: 'package', labelKey: 'mod-browser' },
    presentation: 'standalone',
    projectAccess: 'none',
    layout: 'fixed',
    runtime,
    persistenceKey: 'test-module',
  }
}

describe('WorkbenchViewHost', () => {
  it('renders a registered lazy runtime without feature props', async () => {
    renderWithLocale(<WorkbenchViewHost module={module(lazy(async () => ({ default: () => <div>Module body</div> })))} />)
    expect(await screen.findByText('Module body')).toBeInTheDocument()
    expect(screen.getByText('Module body').closest('[data-loading-section]')).toHaveAttribute(
      'data-loading-section',
      'workbench-module:test-module',
    )
  })

  it('keeps suspense fallback inside the module content area', () => {
    const { container } = renderWithLocale(<WorkbenchViewHost module={module(lazy(() => new Promise<never>(() => {})))} />)
    expect(container.querySelector('.workbench-loading-motion-fallback')).toBeTruthy()
  })

  it('contains runtime errors and exposes a module retry action', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithLocale(
      <WorkbenchViewHost
        module={module(
          lazy(async () => ({
            default: () => {
              throw new Error('runtime failed')
            },
          })),
        )}
      />,
    )

    expect(await screen.findByRole('alert')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    expect(screen.getByRole('alert')).toBeTruthy()
    errorSpy.mockRestore()
  })
})
