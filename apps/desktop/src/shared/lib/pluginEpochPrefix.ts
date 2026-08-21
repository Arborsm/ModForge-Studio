/**
 * @file Pure helper for stripping the hot-reload epoch prefix from a plugin
 * relative path. Shared by the Electron main-process plugin protocol handler
 * and unit-tested here without pulling in the Electron runtime. Mirrors the
 * `strip_plugin_epoch_prefix` function in the Tauri crate root handler.
 * @module shared/lib
 */

/**
 * Strips a leading `__v<N>/` hot-reload epoch segment from a plugin relative
 * path. Only an exact `__v` + ASCII-digits segment is stripped; forged prefixes
 * are left untouched so the downstream checks reject them.
 */
export function stripPluginEpochPrefix(relativePath: string): string {
  const segments = relativePath.split('/')
  const first = segments[0]
  if (first !== undefined && first.startsWith('__v')) {
    const num = first.slice(3)
    if (num.length > 0 && /^[0-9]+$/.test(num)) {
      return segments.slice(1).join('/')
    }
  }
  return relativePath
}
