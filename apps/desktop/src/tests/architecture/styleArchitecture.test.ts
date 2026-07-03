import { access, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const STYLES_DIR = resolve(process.cwd(), 'src/styles')
const SOURCE_DIR = resolve(process.cwd(), 'src')

const THEME_TOKEN_DEFINITION_PATTERN =
  /--(?:accent|accent-soft|bg-(?:app|panel|panel-muted|viewport|active|elevated)|text-(?:primary|secondary|tertiary|inverse)|border-color)\s*:/g
const LIGHT_THEME_PIN_PATTERN = /color-scheme\s*:\s*light/g
const MAX_CSS_FILE_LINES = 1000
const MAX_TS_FILE_LINES = 1500
const TS_SOURCE_EXCLUDE_DIRS = /(?:^|\/)src\/(tests|test|dev)(?:\/|$)/

const HEX_COLOR_LITERAL_PATTERN = /['"](#[0-9a-fA-F]{3,6})['"]/g
const RGBA_FUNCTION_CALL_PATTERN = /\brgba\s*\(/g

// Some files legitimately need raw color values for canvas / sprite rendering.
// This is not a free pass for UI components; every entry should justify why
// it cannot consume CSS custom properties.
const TS_COLOR_LITERAL_ALLOWLIST = new Set([
  // Theme preview swatches are intentional hex literals.
  'shared/lib/theme/presets.ts',
  // The single color-mix helper is allowed to parse raw hex values.
  'shared/lib/color/rgbaFromHex.ts',
  // Dev/playground files are excluded from architecture scans below, but keep
  // the list explicit in case the exclusion changes.
  'dev/DevEventPatchEditorMock.tsx',
  'dev/DevPagePerformanceScenario.tsx',
  'dev/DevResourceBrowserLab.tsx',
  'dev/eventStagePreviewMockAssets.ts',
  // Event stage canvas renderers operate on raw pixel values.
  'entities/event/model/stage/eventStagePlayback.ts',
  'entities/event/model/stage/eventStageShared.ts',
  'entities/event/model/stage/eventStageSpecificSpriteEffectCases1.ts',
  'entities/event/model/stage/eventStageSpecificSpriteEffectCases2.ts',
  'entities/event/model/stage/eventStageSpecificSpriteEffectCases3.ts',
  'entities/event/model/stage/eventStageSpecificSpriteEffectCases5.ts',
  'entities/event/model/stage/eventStageSpecificSpriteEffectCases6.ts',
  'entities/event/model/stage/farmerAppearanceRenderer.ts',
  // Map viewport canvas rendering.
  'entities/map/ui/MapViewport.tsx',
  'entities/map/ui/mapViewportHelpers.ts',
  // Item/appearance sprite rendering.
  'pages/workbench/ui/PlayerAppearanceWindow.tsx',
  'pages/workbench/workspaces/item/entities/item/view/ItemSprite.tsx',
  // Event stage preview overlays render to canvas.
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview.tsx',
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/StagePathOverlay.tsx',
  // TODO: migrate the following UI files to CSS theme tokens instead of hard-coded literals.
  'pages/workbench/workspaces/character/view/CharacterGiftTasteSection.tsx',
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/CommandPalette.tsx',
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventResourcePicker.tsx',
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ParamPill.tsx',
  'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/eventResourceRegistry.ts',
  'pages/workbench/workspaces/item/view/ItemDetailPane.tsx',
  'pages/workbench/workspaces/item/view/itemWorkspaceSharedUi.tsx',
  'pages/workbench/workspaces/map/editors/MapPatchEditor.tsx',
  'pages/workbench/workspaces/map/view/CentralWorkspace.tsx',
  'pages/workbench/workspaces/mod/mods/content-patcher/content-view/scaleup/ContentPatcherScaleUpPanel.tsx',
])

// TODO: these files exceed the 1500-line threshold and should be split.
const TS_FILE_SIZE_ALLOWLIST = new Set([
  'entities/map/ui/MapViewport.tsx',
  'features/launcher/model/useLauncherLibrary.ts',
  'pages/launcher/library/hooks/useLauncherLibraryController.ts',
  'pages/launcher/library/ui/LauncherLibraryGrid.tsx',
  'pages/launcher/ui/LauncherDiscoverPage.tsx',
])

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

async function collectSourceFiles(rootPath: string, pattern: RegExp): Promise<string[]> {
  try {
    await access(rootPath)
  } catch {
    return []
  }

  const entries = await readdir(rootPath, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(rootPath, entry.name)

      if (entry.isDirectory()) {
        const relativeToCwd = relative(process.cwd(), entryPath).replace(/\\/g, '/')
        if (TS_SOURCE_EXCLUDE_DIRS.test(relativeToCwd)) {
          return Promise.resolve([])
        }
        return collectSourceFiles(entryPath, pattern)
      }

      if (entry.isFile() && pattern.test(entry.name)) {
        return Promise.resolve([entryPath])
      }

      return Promise.resolve([])
    }),
  )

  return nestedFiles.flat()
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

  it('does not import removed studio desk page styles from the workbench entry', async () => {
    const source = await readFile(join(STYLES_DIR, 'workbench.css'), 'utf8')

    expect(source).not.toMatch(/studio-(?:desk|workspace|pulse|world-bible)\.css/)
  })

  it('keeps launcher grid card hover rings inside a padded paint area', async () => {
    const source = await readCssWithImports(join(STYLES_DIR, 'features/launcher/library.css'))

    expect(source).toMatch(/\.launcher-library-grid-reveal\s*\{[^}]*padding:\s*0\.375rem;/s)
    expect(source).toMatch(/\.launcher-library-grid-reveal\s*\{[^}]*margin:\s*-0\.375rem;/s)
    expect(source).toMatch(/\.launcher-mod-card:hover,\s*\.launcher-mod-card:focus-within\s*\{[^}]*z-index:\s*1;/s)
  })

  it('keeps launcher mod detail overlays below the app titlebar', async () => {
    const source = await readCssWithImports(join(STYLES_DIR, 'features/launcher/library.css'))

    expect(source).toMatch(/\.launcher-library-drawer\s*\{[^}]*inset:\s*var\(--app-titlebar-height\)\s+0\s+0;/s)
    expect(source).not.toMatch(/\.launcher-library-drawer\s*\{[^}]*inset:\s*0;/s)
  })

  it('keeps TypeScript source files below the local split threshold', async () => {
    const tsFiles = await collectSourceFiles(SOURCE_DIR, /\.(ts|tsx)$/)
    const oversizedFiles: string[] = []

    await Promise.all(
      tsFiles.map(async (file) => {
        const relativePath = relative(SOURCE_DIR, file).replace(/\\/g, '/')
        if (TS_FILE_SIZE_ALLOWLIST.has(relativePath)) {
          return
        }
        const source = await readFile(file, 'utf8')
        const lineCount = source.split(/\r?\n/).length
        if (lineCount > MAX_TS_FILE_LINES) {
          oversizedFiles.push(`${relativePath}: ${lineCount} lines`)
        }
      }),
    )

    expect(oversizedFiles.sort()).toEqual([])
  })

  it('keeps raw hex/rgba color literals out of components and business logic', async () => {
    const tsFiles = await collectSourceFiles(SOURCE_DIR, /\.(ts|tsx)$/)
    const violations: string[] = []

    await Promise.all(
      tsFiles.map(async (file) => {
        const relativePath = relative(SOURCE_DIR, file).replace(/\\/g, '/')
        if (TS_COLOR_LITERAL_ALLOWLIST.has(relativePath)) {
          return
        }

        const source = await readFile(file, 'utf8')
        for (const match of source.matchAll(HEX_COLOR_LITERAL_PATTERN)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
        for (const match of source.matchAll(RGBA_FUNCTION_CALL_PATTERN)) {
          violations.push(`${relativePath}: ${match[0]}`)
        }
      }),
    )

    expect(violations).toEqual([])
  })
})
