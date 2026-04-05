/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function resolveRepoPath(pathFromRoot: string) {
  const normalizedPath = pathFromRoot.replace(/^apps\/desktop\//, '')
  const desktopPath = normalizedPath.startsWith('src/') ? `apps/desktop/${normalizedPath}` : normalizedPath
  const candidates = [
    resolve(process.cwd(), pathFromRoot),
    resolve(process.cwd(), normalizedPath),
    resolve(process.cwd(), desktopPath),
    resolve(process.cwd(), '..', '..', pathFromRoot),
    resolve(process.cwd(), '..', '..', desktopPath),
  ]

  return candidates.find(existsSync) ?? candidates[0]
}

function resolveStylesPath(pathFromRoot: string) {
  return resolveRepoPath(pathFromRoot)
}

function escapeSelector(selector: string) {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getRuleBody(source: string, selector: string) {
  const matches = [...source.matchAll(new RegExp(`${escapeSelector(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'gm'))]
  const match = matches.at(-1)

  expect(match?.[1]).toBeTruthy()
  return match?.[1] ?? ''
}

const contentPatcherStyles = readFileSync(resolveStylesPath('src/styles/features/content-patcher.css'), 'utf8')
const workspaceStyles = readFileSync(resolveStylesPath('src/styles/workspace/layout.css'), 'utf8')

describe('content patcher layout styles', () => {
  it('keeps debugger panes shrinkable so internal regions can scroll', () => {
    const shellRule = getRuleBody(contentPatcherStyles, '.cp-debugger-shell')
    const bodyChildrenRule = getRuleBody(contentPatcherStyles, '.cp-debugger-body > *')
    const bodyRule = getRuleBody(contentPatcherStyles, '.cp-debugger-body')
    const previewRule = getRuleBody(contentPatcherStyles, '.cp-debugger-preview')
    const headerRule = getRuleBody(contentPatcherStyles, '.cp-debugger-header')
    const titleRule = getRuleBody(contentPatcherStyles, '.cp-debugger-title')
    const imageStageRule = getRuleBody(contentPatcherStyles, '.cp-debugger-image-stage')
    const imageRule = getRuleBody(contentPatcherStyles, '.cp-debugger-image')
    const imageFrameRule = getRuleBody(contentPatcherStyles, '.cp-debugger-image-frame')
    const patchBoundsRule = getRuleBody(contentPatcherStyles, '.cp-debugger-patch-bounds')
    const navScrollRule = getRuleBody(contentPatcherStyles, '.cp-debugger-nav-scroll')
    const cardRule = getRuleBody(contentPatcherStyles, '.cp-debugger-card')
    const formGridCompactRule = getRuleBody(contentPatcherStyles, '.cp-debugger-form-grid-compact')
    const imageToolbarRule = getRuleBody(contentPatcherStyles, '.cp-debugger-image-toolbar')
    const workspaceToolbarRule = getRuleBody(workspaceStyles, '.workspace-viewport-toolbar')
    const toolbarPopupRule = getRuleBody(contentPatcherStyles, '.cp-debugger-toolbar-popup')
    const compareSplitRule = getRuleBody(contentPatcherStyles, '.cp-debugger-compare-split')
    const compareOverlayRule = getRuleBody(contentPatcherStyles, '.cp-debugger-compare-overlay')

    expect(shellRule).toMatch(/height:\s*100%/)
    expect(bodyChildrenRule).toMatch(/min-height:\s*0/)
    expect(bodyRule).toMatch(/overflow:\s*hidden/)
    expect(previewRule).toMatch(/flex:\s*1/)
    expect(headerRule).toMatch(/padding:\s*12px 14px/)
    expect(titleRule).toMatch(/font-size:\s*18px/)
    expect(imageStageRule).toMatch(/flex:\s*1/)
    expect(imageStageRule).toMatch(/min-height:\s*0/)
    expect(imageRule).toMatch(/width:\s*100%/)
    expect(imageRule).toMatch(/height:\s*100%/)
    expect(imageFrameRule).toMatch(/position:\s*relative/)
    expect(patchBoundsRule).toMatch(/border:\s*2px dashed/)
    expect(navScrollRule).toMatch(/flex:\s*1 1 auto/)
    expect(navScrollRule).toMatch(/min-height:\s*0/)
    expect(navScrollRule).toMatch(/overflow:\s*auto/)
    expect(cardRule).toMatch(/min-height:\s*0/)
    expect(formGridCompactRule).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\)/)
    expect(imageToolbarRule).toMatch(/position:\s*absolute/)
    expect(imageToolbarRule).toMatch(/bottom:\s*16px/)
    expect(imageToolbarRule).toMatch(/display:\s*flex/)
    expect(workspaceToolbarRule).toMatch(/position:\s*absolute/)
    expect(workspaceToolbarRule).toMatch(/bottom:\s*16px/)
    expect(workspaceToolbarRule).toMatch(/display:\s*flex/)
    expect(toolbarPopupRule).toMatch(/position:\s*absolute/)
    expect(compareSplitRule).toMatch(/display:\s*grid/)
    expect(compareOverlayRule).toMatch(/position:\s*relative/)
  })
})
