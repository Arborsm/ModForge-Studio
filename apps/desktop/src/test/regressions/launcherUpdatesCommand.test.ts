import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('launcher updates command regression', () => {
  it('runs update checks off the UI thread', () => {
    const desktopRoot = process.cwd().replace(/\\/g, '/').endsWith('/apps/desktop')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/desktop')
    const catalogRsPath = resolve(desktopRoot, 'src-tauri/src/launcher/catalog.rs')
    const source = readFileSync(catalogRsPath, 'utf8')

    expect(source).toMatch(/#\[tauri::command\]\s*pub async fn check_launcher_updates/s)
    expect(source).toContain('tauri::async_runtime::spawn_blocking')
  })
})
