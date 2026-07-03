import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const STYLES_DIR = resolve(process.cwd(), 'src/styles')

const THEME_TOKEN_DEFINITION_PATTERN =
  /--(?:accent|accent-soft|bg-(?:app|panel|panel-muted|viewport|active|elevated)|text-(?:primary|secondary|tertiary|inverse)|border-color)\s*:/g
const LIGHT_THEME_PIN_PATTERN = /color-scheme\s*:\s*light/g
const MAX_CSS_FILE_LINES = 1000

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

async function readCssWithImports(filePath: string): Promise<string> {
  const source = await readFile(filePath, 'utf8')
  const importMatches = Array.from(source.matchAll(/@import\s+['"](?<path>[^'"]+)['"];/g))
  if (!importMatches.length) {
    return source
  }

  const importedSources = await Promise.all(
    importMatches.map((match) => readCssWithImports(join(dirname(filePath), match.groups?.path ?? ''))),
  )

  return [source, ...importedSources].join('\n')
}

describe('style architecture', () => {
  it('keeps individual CSS files below the local split threshold', async () => {
    const cssFiles = await listCssFiles(STYLES_DIR)
    const oversizedFiles: string[] = []

    await Promise.all(
      cssFiles.map(async (file) => {
        const source = await readFile(file, 'utf8')
        const lineCount = source.split(/\r?\n/).length
        if (lineCount > MAX_CSS_FILE_LINES) {
          oversizedFiles.push(`${relative(STYLES_DIR, file)}: ${lineCount} lines`)
        }
      }),
    )

    expect(oversizedFiles.sort()).toEqual([])
  })

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
    const source = await readFile(join(STYLES_DIR, 'features/cp-maker/studio-world-bible.css'), 'utf8')

    expect(source).not.toMatch(/\.studio-export-center\s+span\s*\{/)
  })

  it('keeps launcher grid card hover rings inside a padded paint area', async () => {
    const source = await readCssWithImports(join(STYLES_DIR, 'features/launcher/library.css'))

    expect(source).toMatch(/\.launcher-library-grid-reveal\s*\{[^}]*padding:\s*6px;/s)
    expect(source).toMatch(/\.launcher-library-grid-reveal\s*\{[^}]*margin:\s*-6px;/s)
    expect(source).toMatch(/\.launcher-mod-card:hover,\s*\.launcher-mod-card:focus-within\s*\{[^}]*z-index:\s*1;/s)
  })

  it('keeps launcher mod detail overlays below the app titlebar', async () => {
    const source = await readCssWithImports(join(STYLES_DIR, 'features/launcher/library.css'))

    expect(source).toMatch(/\.launcher-library-drawer\s*\{[^}]*inset:\s*var\(--app-titlebar-height\)\s+0\s+0;/s)
    expect(source).not.toMatch(/\.launcher-library-drawer\s*\{[^}]*inset:\s*0;/s)
  })
})
