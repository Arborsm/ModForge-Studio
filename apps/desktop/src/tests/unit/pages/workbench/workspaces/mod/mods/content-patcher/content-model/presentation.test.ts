import { describe, expect, it } from 'vite-plus/test'
import { contentPatcherStatusClass } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-model/presentation'

describe('contentPatcherStatusClass', () => {
  it('maps applied and determinate states to success pills', () => {
    expect(contentPatcherStatusClass('applied')).toBe('cp-debugger-pill cp-debugger-pill-ok')
    expect(contentPatcherStatusClass('determinate')).toBe('cp-debugger-pill cp-debugger-pill-ok')
  })

  it('maps skipped and error states to their dedicated pills', () => {
    expect(contentPatcherStatusClass('skipped')).toBe('cp-debugger-pill cp-debugger-pill-muted')
    expect(contentPatcherStatusClass('error')).toBe('cp-debugger-pill cp-debugger-pill-error')
  })

  it('falls back to warning pills for indeterminate states', () => {
    expect(contentPatcherStatusClass('indeterminate')).toBe('cp-debugger-pill cp-debugger-pill-warn')
    expect(contentPatcherStatusClass('warning')).toBe('cp-debugger-pill cp-debugger-pill-warn')
  })
})
