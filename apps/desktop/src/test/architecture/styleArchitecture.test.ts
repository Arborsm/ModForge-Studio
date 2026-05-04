import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES_DIR = resolve(process.cwd(), 'src/styles')

const THEME_TOKEN_DEFINITION_PATTERN =
  /--(?:accent|accent-soft|bg-(?:app|panel|panel-muted|viewport|active|elevated)|text-(?:primary|secondary|tertiary|inverse)|border-color)\s*:/g
const LIGHT_THEME_PIN_PATTERN = /color-scheme\s*:\s*light/g

async function listCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        return listCssFiles(entryPath)
      }
      return Promise.resolve(entry.name.endsWith('.css') ? [entryPath] : [])
    }),
  )

  return nested.flat()
}

describe('style architecture', () => {
  it('keeps global theme tokens owned by tokens.css', async () => {
    const cssFiles = (await listCssFiles(STYLES_DIR)).filter((file) => basename(file) !== 'tokens.css')
    const violations: string[] = []

    await Promise.all(
      cssFiles.map(async (file) => {
        const source = await readFile(file, 'utf8')
        const relativePath = relative(STYLES_DIR, file)

        for (const match of source.matchAll(THEME_TOKEN_DEFINITION_PATTERN)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }

        for (const match of source.matchAll(LIGHT_THEME_PIN_PATTERN)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
      }),
    )

    expect(violations).toEqual([])
  })

  it('does not let export center metadata styles override the publish button label', async () => {
    const source = await readFile(join(STYLES_DIR, 'features/generated-project/studio-world-bible.css'), 'utf8')

    expect(source).not.toMatch(/\.studio-export-center\s+span\s*\{/)
  })
})
