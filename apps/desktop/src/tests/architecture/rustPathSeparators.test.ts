import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

// `src/tests/` contains Rust test code (regression tests construct backslash forms for assertions), not production code.
const TEST_SOURCE_EXCLUDE_DIRS = /(?:^|\/)src\/(tests|test)\//

// Hand-written `/` → `\` replacement is forbidden: on Linux/macOS `\` is not a path separator but a regular filename character,
// which would turn relative paths into single filenames containing backslashes (e.g. `assets\maps\foo.png`). Both quote styles are checked.
// Separator conversion must converge to the semantic helpers in infrastructure/fs/pathing.rs.
const HAND_WRITTEN_BACKSLASH_REPLACE_PATTERNS = [/replace\(\s*'\/'\s*,\s*"\\\\"\s*\)/g, /replace\(\s*"\/"\s*,\s*"\\\\"\s*\)/g]

describe('rust backend path separator rules', () => {
  it('keeps separator conversion inside infrastructure/fs/pathing.rs helpers', async () => {
    const rustSourceFiles = await collectRequiredFiles(sourcePath('src-tauri/src'), {
      extensions: ['.rs'],
      excludePath: TEST_SOURCE_EXCLUDE_DIRS,
    })
    const violations: string[] = []

    for (const filePath of rustSourceFiles) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = relative(sourcePath(), filePath).replaceAll('\\', '/')

      for (const pattern of HAND_WRITTEN_BACKSLASH_REPLACE_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  }, 30000)
})
