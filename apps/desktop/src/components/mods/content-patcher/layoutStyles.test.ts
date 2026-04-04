/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesPath = existsSync(resolve(process.cwd(), 'src/styles/globals.css'))
  ? resolve(process.cwd(), 'src/styles/globals.css')
  : resolve(process.cwd(), 'apps/desktop/src/styles/globals.css')

const styles = readFileSync(stylesPath, 'utf8')

describe('content patcher layout styles', () => {
  it('keeps debugger panes shrinkable so internal regions can scroll', () => {
    expect(styles).toMatch(/\.cp-debugger-shell\s*\{[^}]*height:\s*100%;/s)
    expect(styles).toMatch(/\.cp-debugger-body > \*\s*\{[^}]*min-height:\s*0;/s)
    expect(styles).toMatch(/\.cp-debugger-body\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.cp-debugger-preview\s*\{[^}]*flex:\s*1;/s)
    expect(styles).toMatch(/\.cp-debugger-header\s*\{[^}]*padding:\s*12px 14px;/s)
    expect(styles).toMatch(/\.cp-debugger-title\s*\{[^}]*font-size:\s*18px;/s)
    expect(styles).toMatch(/\.cp-debugger-image-stage\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/s)
    expect(styles).toMatch(/\.cp-debugger-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
    expect(styles).toMatch(/\.cp-debugger-image-frame\s*\{[^}]*position:\s*relative;/s)
    expect(styles).toMatch(/\.cp-debugger-patch-bounds\s*\{[^}]*border:\s*2px dashed/s)
    expect(styles).toMatch(/\.cp-debugger-nav-scroll\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(/\.cp-debugger-card\s*\{[^}]*min-height:\s*0;/s)
    expect(styles).toMatch(/\.cp-debugger-form-grid-compact\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\);/s)
    expect(styles).toMatch(
      /\.cp-debugger-image-toolbar\s*,\s*\.workspace-viewport-toolbar\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*16px;[^}]*display:\s*flex;/s,
    )
    expect(styles).toMatch(/\.cp-debugger-toolbar-popup\s*\{[^}]*position:\s*absolute;/s)
    expect(styles).toMatch(/\.cp-debugger-compare-split\s*\{[^}]*display:\s*grid;/s)
    expect(styles).toMatch(/\.cp-debugger-compare-overlay\s*\{[^}]*position:\s*relative;/s)
  })
})
