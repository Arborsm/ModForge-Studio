import { lazy } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { renderWithLocale } from '@test/renderWithLocale'
import { WorkbenchViewHost } from '@pages/workbench/ui/WorkbenchViewHost'

function module(createRuntime: WorkbenchModuleRegistration['createRuntime']): WorkbenchModuleRegistration {
  return {
    id: 'test-module',
    navigation: { section: 'tools', order: 1, icon: 'package', labelKey: 'mod-browser' },
    presentation: 'standalone',
    projectAccess: 'none',
    createRuntime,
    persistenceKey: 'test-module',
  }
}

describe('WorkbenchViewHost', () => {
  it('renders a registered lazy runtime without feature props', async () => {
    renderWithLocale(<WorkbenchViewHost module={module(() => lazy(async () => ({ default: () => <div>Module body</div> })))} />)
    expect(await screen.findByText('Module body')).toBeInTheDocument()
    expect(screen.getByText('Module body').closest('[data-loading-section]')).toHaveAttribute(
      'data-loading-section',
      'workbench-module:test-module',
    )
  })

  it('keeps suspense fallback inside the module content area', () => {
    const { container } = renderWithLocale(<WorkbenchViewHost module={module(() => lazy(() => new Promise<never>(() => {})))} />)
    expect(container.querySelector('.workbench-loading-motion-fallback')).toBeTruthy()
  })

  it('contains runtime errors and exposes a module retry action', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithLocale(
      <WorkbenchViewHost
        module={module(() =>
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
    expect(await screen.findByRole('alert')).toBeTruthy()
    errorSpy.mockRestore()
  })

  it('recreates a rejected lazy runtime when retrying a module import', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    const createRuntime = () =>
      lazy(async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('chunk failed')
        }
        return { default: () => <div>Recovered module</div> }
      })

    renderWithLocale(<WorkbenchViewHost module={module(createRuntime)} />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered module')).toBeInTheDocument()
    expect(attempts).toBe(2)
    errorSpy.mockRestore()
  })
})
