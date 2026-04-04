/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(pathFromRoot: string) {
  return readFileSync(resolve(process.cwd(), pathFromRoot), 'utf8')
}

const stylesPath = existsSync(resolve(process.cwd(), 'src/styles/globals.css'))
  ? resolve(process.cwd(), 'src/styles/globals.css')
  : resolve(process.cwd(), 'apps/desktop/src/styles/globals.css')

const styles = readFileSync(stylesPath, 'utf8')
const centralWorkspace = readSource('apps/desktop/src/components/CentralWorkspace.tsx')
const eventWorkspace = readSource('apps/desktop/src/components/EventWorkspace.tsx')
const eventStageWorkspace = readSource('apps/desktop/src/components/EventStageWorkspace.tsx')

describe('viewport overlay toolbar', () => {
  it('uses a shared bottom overlay toolbar style for map and event canvases', () => {
    expect(styles).toMatch(/\.workspace-viewport-toolbar\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*16px;[^}]*display:\s*flex;/s)
    expect(styles).toMatch(/\.workspace-viewport-toolbar-icon-button\s*\{[^}]*min-width:\s*34px;[^}]*min-height:\s*34px;/s)
    expect(styles).toMatch(/\.workspace-viewport-toolbar-zoom\s*\{[^}]*font-family:\s*var\(--font-mono\);/s)
  })

  it('attaches the shared overlay toolbar to the main map and event canvases', () => {
    expect(centralWorkspace).toContain('workspace-viewport-toolbar')
    expect(eventWorkspace).toContain('workspace-viewport-toolbar')
    expect(eventStageWorkspace).toContain('workspace-viewport-toolbar')
  })

  it('keeps playback controls on the left side of event toolbars', () => {
    expect(eventWorkspace.indexOf('title={labels.step}')).toBeLessThan(eventWorkspace.indexOf('title="Toggle grid"'))
    expect(eventStageWorkspace.indexOf('title={labels.step}')).toBeLessThan(eventStageWorkspace.indexOf('title={labels.toggleGrid}'))
    expect(eventStageWorkspace.indexOf('workspace-viewport-toolbar-group workspace-viewport-toolbar-group-push')).toBeGreaterThan(-1)
  })
})
