import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PanelFrame } from './PanelFrame'
import { PanelEmptyState, PanelSection } from './PanelSection'

const desktopRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/desktop')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/desktop')
const primitivesRoot = resolve(desktopRoot, 'src/styles/primitives')

describe('panel primitives', () => {
  it('keeps wrapper components bound to the panel primitive hooks', () => {
    const { container } = render(
      <>
        <PanelFrame title="Inspector" subtitle="Details">
          <div>Body</div>
        </PanelFrame>
        <PanelSection title="Layers" subtitle="Visibility" variant="muted">
          <div>Body</div>
        </PanelSection>
        <PanelEmptyState>Nothing selected</PanelEmptyState>
      </>,
    )

    expect(screen.getByText('Inspector')).toBeInTheDocument()
    expect(container.querySelector('.panel-surface')).toBeTruthy()
    expect(container.querySelector('.panel-header')).toBeTruthy()
    expect(container.querySelector('.panel-section')).toBeTruthy()
    expect(container.querySelector('.panel-section-muted')).toBeTruthy()
    expect(container.querySelector('.panel-empty-state')).toBeTruthy()
  })

  it('moves shared primitive selectors into the dedicated primitive css files', () => {
    const panelCss = readFileSync(resolve(primitivesRoot, 'panel.css'), 'utf8')
    const controlsCss = readFileSync(resolve(primitivesRoot, 'controls.css'), 'utf8')
    const statusCss = readFileSync(resolve(primitivesRoot, 'status.css'), 'utf8')
    const menuCss = readFileSync(resolve(primitivesRoot, 'menu.css'), 'utf8')
    const overlayCss = readFileSync(resolve(primitivesRoot, 'overlay.css'), 'utf8')

    expect(panelCss).toMatch(/^\s*\.panel-surface\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.panel-surface-flat\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.panel-surface-muted\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.panel-section\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.panel-empty-state\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.metric-card\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.kv-row\s*\{/m)
    expect(panelCss).toMatch(/^\s*\.asset-row\s*\{/m)

    expect(controlsCss).toMatch(/^\s*\.control-button\s*\{/m)
    expect(controlsCss).toMatch(/^\s*\.icon-button\s*\{/m)
    expect(controlsCss).toMatch(/^\s*\.window-control-button\s*\{/m)
    expect(controlsCss).toMatch(/^\s*\.tool-button\s*\{/m)

    expect(statusCss).toMatch(/^\s*\.dock-chip\s*\{/m)
    expect(statusCss).toMatch(/^\s*\.status-pill-ready\s*\{/m)
    expect(statusCss).toMatch(/prefers-reduced-motion/)

    expect(menuCss).toMatch(/^\s*\.context-menu-content\s*\{/m)
    expect(menuCss).toMatch(/^\s*\.context-menu-item\s*\{/m)

    expect(overlayCss).toMatch(/^\s*\.panel-overlay-card\s*\{/m)
    expect(overlayCss).toMatch(/^\s*\.panel-canvas\s*\{/m)
  })
})
