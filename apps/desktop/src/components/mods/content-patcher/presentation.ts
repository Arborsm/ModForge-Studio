export function contentPatcherStatusClass(status: string) {
  if (status === 'applied' || status === 'determinate') {
    return 'cp-debugger-pill cp-debugger-pill-ok'
  }
  if (status === 'skipped') {
    return 'cp-debugger-pill cp-debugger-pill-muted'
  }
  if (status === 'error') {
    return 'cp-debugger-pill cp-debugger-pill-error'
  }
  return 'cp-debugger-pill cp-debugger-pill-warn'
}
