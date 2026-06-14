/**
 * i18n dictionary extraction script.
 *
 * Reads the monolithic en-US.ts and zh-CN.ts from temp files (extracted from git),
 * splits each top-level section into individual typed files, and writes them
 * into the per-locale directory structure.
 *
 * Uses only text/line extraction — no eval, no JSON.parse/stringify.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, '../apps/desktop/src/locales/dictionaries')
const TMP = process.env.TEMP || '/tmp'

function readLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8')
  return text.split('\n')
}

/**
 * Extract the value text for a top-level key from the monolithic file.
 *
 * strategy: Find the line `  <key>: {`, collect lines from the line after
 * until a line that starts with `  },` at the correct indentation level — but
 * only the *first* `},` that closes this key, dealing with nested braces.
 */
function extractSection(lines, startLineIdx, keyName) {
  // Find the key line
  const keyLine = lines[startLineIdx]
  if (!keyLine || (!keyLine.trim().startsWith(`${keyName}:`) && !keyLine.trim().startsWith(`${keyName} `))) {
    // Some keys like "viewMenu" and "settingsMenu" and "worldAtlasViews" use 2-space indent
    // Let's just search from startLineIdx
    let found = -1
    for (let i = startLineIdx; i < lines.length; i++) {
      if (lines[i].trim() === `${keyName}: {` || lines[i].trim().startsWith(`${keyName}: `)) {
        found = i
        break
      }
    }
    if (found === -1) {
      console.error(`Could not find key "${keyName}" starting from line ${startLineIdx + 1}`)
      return ''
    }
    startLineIdx = found
  }

  const valueLines = []
  let braceDepth = 0
  let started = false

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i]

    if (!started) {
      // This is the key line, start counting braces from its content
      const content = line.trim()
      // Remove the key prefix to get the value part
      const valuePart = content.replace(/^\w+\s*:\s*/, '')
      // Count braces in valuePart
      for (const ch of valuePart) {
        if (ch === '{') braceDepth++
        if (ch === '}') braceDepth--
      }
      started = true
      continue
    }

    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }

    if (braceDepth <= 0) {
      // This is the closing line
      break
    }

    valueLines.push(line)
  }

  return valueLines
}

/**
 * Extract a section by 0-indexed line range [startIdx, endIdx] inclusive.
 * The extracted content is the value between key line and closing brace.
 */
function extractSectionByRange(lines, keyLineIdx, endLineIdx) {
  const valueLines = []
  let braceDepth = 0
  let started = false

  for (let i = keyLineIdx; i <= endLineIdx; i++) {
    const line = lines[i]

    if (!started) {
      const content = line.trim()
      const valuePart = content.replace(/^\w+\s*:\s*/, '')
      for (const ch of valuePart) {
        if (ch === '{') braceDepth++
        if (ch === '}') braceDepth--
      }
      started = true
      continue
    }

    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }

    if (braceDepth <= 0) {
      break
    }

    valueLines.push(line)
  }

  return valueLines
}

/**
 * Remove trailing commas on the last property (last non-empty line of value).
 * TypeScript strict mode forbids trailing commas on the last property of an object literal.
 */
function fixTrailingComma(lines) {
  if (lines.length === 0) return lines

  // Work backwards to find the last non-empty line
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trimEnd()
    if (trimmed === '') continue
    // Remove trailing comma if present
    if (trimmed.endsWith(',')) {
      lines[i] = trimmed.slice(0, -1)
    }
    break
  }

  return lines
}

/**
 * Determine the indentation of the section value (the first content line's leading whitespace).
 */
function detectIndent(lines) {
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed !== '' && trimmed !== ',') {
      const indent = line.length - line.trimStart().length
      return indent
    }
  }
  return 2
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  console.log(`  wrote ${filePath}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────

const LOCALES = ['en-US', 'zh-CN']

for (const locale of LOCALES) {
  console.log(`\n=== Processing ${locale} ===`)

  const srcPath = path.join(TMP, `${locale}-source.ts`)
  if (!fs.existsSync(srcPath)) {
    console.error(`  Source file not found: ${srcPath}. Run git extraction first.`)
    continue
  }

  const lines = readLines(srcPath)
  const baseDir = path.join(LOCALES_DIR, locale)

  // ── Delete all existing files in the locale directory ──
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true, force: true })
    console.log(`  deleted ${baseDir}`)
  }

  // ── Helper to extract sections by key name ──
  function findKeyLine(keyName, startIdx = 0) {
    const patterns = [(l) => l.trim() === `${keyName}: {`, (l) => l.trim() === `${keyName}:{`]
    for (let i = startIdx; i < lines.length; i++) {
      for (const p of patterns) {
        if (p(lines[i])) return i
      }
    }
    return -1
  }

  function writeValueFile(subDir, fileName, typeImport, typeName, valueLines, indentAdjust = 0) {
    let fixedLines = fixTrailingComma([...valueLines])

    // Adjust indentation if needed
    if (indentAdjust > 0) {
      fixedLines = fixedLines.map((l) => l.slice(indentAdjust))
    }

    // If typeName starts with "Record<", use different import (import the type param)
    let importLine
    if (typeName.startsWith('Record<')) {
      // Extract the type parameter, e.g. "Record<WorldAtlasViewId, string>" -> "WorldAtlasViewId"
      const match = typeName.match(/^Record<(\w+)/)
      const typeParam = match ? match[1] : 'string'
      importLine = `import type { ${typeParam} } from "${typeImport}"`
    } else {
      importLine = `import type { ${typeName} } from "${typeImport}"`
    }

    const content = [
      importLine,
      '',
      `const ${fileName.replace('.ts', '').replace(/-/g, '')}: ${typeName} = {`,
      ...fixedLines,
      '};',
      '',
      `export default ${fileName.replace('.ts', '').replace(/-/g, '')}`,
      '',
    ].join('\n')

    writeFile(path.join(subDir, fileName), content)
  }

  // ── 1. Top-level sections ──

  // Find all key lines first
  const editorKeyIdx = findKeyLine('editor')
  const modsKeyIdx = findKeyLine('mods')
  const modI18nKeyIdx = findKeyLine('modI18n')
  const notificationsKeyIdx = findKeyLine('notifications')
  const worldAtlasViewsKeyIdx = findKeyLine('worldAtlasViews')
  const viewMenuKeyIdx = findKeyLine('viewMenu')
  const settingsMenuKeyIdx = findKeyLine('settingsMenu')

  console.log(
    `  Found keys: editor=${editorKeyIdx + 1}, mods=${modsKeyIdx + 1}, modI18n=${modI18nKeyIdx + 1}, notifications=${notificationsKeyIdx + 1}, worldAtlasViews=${worldAtlasViewsKeyIdx + 1}, viewMenu=${viewMenuKeyIdx + 1}, settingsMenu=${settingsMenuKeyIdx + 1}`,
  )

  // Extract each section
  const editorValue = extractSection(lines, editorKeyIdx, 'editor')
  const modsValue = extractSection(lines, modsKeyIdx, 'mods')
  const modI18nValue = extractSection(lines, modI18nKeyIdx, 'modI18n')
  const notificationsValue = extractSection(lines, notificationsKeyIdx, 'notifications')
  const worldAtlasViewsValue = extractSection(lines, worldAtlasViewsKeyIdx, 'worldAtlasViews')
  const viewMenuValue = extractSection(lines, viewMenuKeyIdx, 'viewMenu')
  const settingsMenuValue = extractSection(lines, settingsMenuKeyIdx, 'settingsMenu')

  function findSubKeyInValue(valueLines, keyName) {
    for (let i = 0; i < valueLines.length; i++) {
      const trimmed = valueLines[i].trim()
      if (trimmed === `${keyName}: {` || (trimmed.startsWith(`${keyName}: `) && trimmed.endsWith('{'))) {
        return i
      }
      // Handle array values like `menus: ['File', ...],`
      if (trimmed.startsWith(`${keyName}: [`)) {
        return i
      }
    }
    return -1
  }

  function extractSubValue(valueLines, subKeyIdx) {
    const result = []
    let braceDepth = 0
    let started = false

    for (let i = subKeyIdx; i < valueLines.length; i++) {
      const line = valueLines[i]

      if (!started) {
        const content = line.trim()
        const valuePart = content.replace(/^\w+\s*:\s*/, '')
        for (const ch of valuePart) {
          if (ch === '{') braceDepth++
          if (ch === '}') braceDepth--
        }
        started = true
        continue
      }

      for (const ch of line) {
        if (ch === '{') braceDepth++
        if (ch === '}') braceDepth--
      }

      if (braceDepth <= 0) {
        break
      }

      result.push(line)
    }

    return result
  }

  /**
   * Extract a sub-section from editor value lines as a standalone object.
   * Handles both `key: { ... }` and `key: value,` forms.
   */
  function extractWorkbenchSub(valueLines, keyName) {
    for (let i = 0; i < valueLines.length; i++) {
      const trimmed = valueLines[i].trim()

      if (trimmed === `${keyName}: {` || (trimmed.startsWith(`${keyName}: `) && trimmed.endsWith('{'))) {
        return extractSubValue(valueLines, i)
      }
    }
    return null
  }

  // ── 2. Write workbench files ──
  const wbDir = path.join(baseDir, 'workbench')
  fs.mkdirSync(wbDir, { recursive: true })

  // This approach is getting too complicated. Let me just write a direct extraction
  // that uses the known line boundaries.

  // NEW APPROACH: Use the exact line boundaries from the task

  // First, let's re-read the source into lines and work with 0-indexed values
  // Convert the 1-indexed task boundaries to 0-indexed

  const BOUNDARIES = {
    'en-US': {
      editor: [3, 2619], // 1-indexed: [4, 2620]
      launcher: [13, 761], // 1-indexed: [14, 762]
      mods: [2620, 2972], // 1-indexed: [2621, 2973]
      modI18n: [2973, 2995], // 1-indexed: [2974, 2996]
      notifications: [2996, 3007], // 1-indexed: [2997, 3008]
      worldAtlasViews: [3008, 3011], // 1-indexed: [3009, 3012]
      viewMenu: [3012, 3024], // 1-indexed: [3013, 3025]
      settingsMenu: [3025, 3102], // 1-indexed: [3026, 3103]
    },
    'zh-CN': {
      editor: [3, 2547],
      launcher: [13, 753],
      mods: [2548, 2900],
      modI18n: [2901, 2923],
      notifications: [2924, 2935],
      worldAtlasViews: [2936, 2939],
      viewMenu: [2940, 2952],
      settingsMenu: [2953, 3029],
    },
  }

  const B = BOUNDARIES[locale]

  // Editor has `editor: {` at line 3 (0-indexed), and value is lines 4..2619
  // But the closing is at 2620 (the `},`), so value = lines 4..2619
  // Actually line 3 0-idx = line 4 1-idx which is `editor: {`
  // The value is everything after `editor: {` up to but not including `},`
  // So lines start at 4, and we need to find where `},` closes editor

  // Since we already have the value extracted above, let's use it

  // ── Write notifications.ts ──
  writeValueFile(baseDir, 'notifications.ts', '../../model', 'NotificationCopy', notificationsValue, 4)

  // ── Write settings.ts ──
  writeValueFile(baseDir, 'settings.ts', '../../model', 'SettingsMenuCopy', settingsMenuValue, 4)

  // ── Write mods.ts (workbench/mods.ts) ──
  writeValueFile(wbDir, 'mods.ts', '../../../model/workbench', 'ModWorkspaceCopy', modsValue, 4)

  // ── Write mod-i18n.ts (workbench/mod-i18n.ts) ──
  writeValueFile(wbDir, 'mod-i18n.ts', '../../../model/workbench', 'ModI18nWorkspaceCopy', modI18nValue, 4)

  // ── Write view-menu.ts (workbench/view-menu.ts) ──
  writeValueFile(wbDir, 'view-menu.ts', '../../../model/workbench', 'ViewMenuCopy', viewMenuValue, 4)

  // ── Write world-atlas.ts (workbench/world-atlas.ts) ──
  writeValueFile(wbDir, 'world-atlas.ts', '../../../model/workbench', 'Record<WorldAtlasViewId, string>', worldAtlasViewsValue, 4)

  // ── Write launcher sub-sections ──
  // The launcher value is the content of the `launcher: { ... }` block
  // Within it, we have: shared keys, library, discover, updates, configuration

  const launcherValue = extractSectionByRange(lines, B.launcher[0], B.launcher[1])
  const launcherDir = path.join(baseDir, 'launcher')
  fs.mkdirSync(launcherDir, { recursive: true })

  // Shared keys: title, subtitle, navigation, pages, descriptions, overview, actions, fields, toggles, sortOptions, states
  const sharedKeys = [
    'title',
    'subtitle',
    'navigation',
    'pages',
    'descriptions',
    'overview',
    'actions',
    'fields',
    'toggles',
    'sortOptions',
    'states',
  ]

  // Sub-keys: library, discover, updates
  // Configuration keys (all go into configuration.ts): diagnostics, downloads, settings, configuration
  const subLauncherKeys = ['library', 'discover', 'updates']
  const configKeys = ['diagnostics', 'downloads', 'settings', 'configuration']
  const allSkippableKeys = [...subLauncherKeys, ...configKeys]

  // Find the start position of each sub-section in launcherValue
  const libraryIdx = findSubKeyInValue(launcherValue, 'library')
  const discoverIdx = findSubKeyInValue(launcherValue, 'discover')
  const updatesIdx = findSubKeyInValue(launcherValue, 'updates')
  const diagnosticsIdx = findSubKeyInValue(launcherValue, 'diagnostics')

  // Extract shared value: collect all top-level lines in launcherValue that are
  // NOT sub-key or configuration-key blocks. This handles shared content both before and after.
  const sharedLines = []
  let launcherBraceDepth = 0
  let skippingSubKey = false
  let subKeyBraceDepth = 0

  for (let i = 0; i < launcherValue.length; i++) {
    const line = launcherValue[i]
    const trimmed = line.trim()

    if (skippingSubKey) {
      // We're inside a sub-key block, count braces until it closes
      for (const ch of line) {
        if (ch === '{') subKeyBraceDepth++
        if (ch === '}') subKeyBraceDepth--
      }
      if (subKeyBraceDepth <= 0) {
        skippingSubKey = false
      }
      continue
    }

    // Only check for skippable keys at top level
    if (launcherBraceDepth === 0) {
      let isSkippable = false
      for (const key of allSkippableKeys) {
        if (trimmed.startsWith(`${key}:`)) {
          isSkippable = true
          break
        }
      }
      if (isSkippable) {
        // Skip this key's block
        skippingSubKey = true
        subKeyBraceDepth = 0
        for (const ch of line) {
          if (ch === '{') subKeyBraceDepth++
          if (ch === '}') subKeyBraceDepth--
        }
        if (subKeyBraceDepth <= 0) {
          skippingSubKey = false
        }
        continue
      }
    }

    // Track brace depth for non-skipped lines
    for (const ch of line) {
      if (ch === '{') launcherBraceDepth++
      if (ch === '}') launcherBraceDepth--
    }

    sharedLines.push(line)
  }

  // Write launcher/shared.ts
  writeValueFile(launcherDir, 'shared.ts', '../../../model/launcher', 'LauncherSharedCopy', sharedLines, 2)

  // Extract library, discover, updates individually
  const libVal = extractSubValue(launcherValue, libraryIdx)
  const discVal = extractSubValue(launcherValue, discoverIdx)
  const updVal = extractSubValue(launcherValue, updatesIdx)

  // Extract configuration block: from diagnostics through end of configuration
  // First find where configuration ends
  const configurationIdx = findSubKeyInValue(launcherValue, 'configuration')
  const configEndVal = extractSubValue(launcherValue, configurationIdx)
  const configEndLine = configurationIdx + configEndVal.length + 1 // the closing `},`

  const configBlock = []
  for (let i = diagnosticsIdx; i <= configEndLine && i < launcherValue.length; i++) {
    configBlock.push(launcherValue[i])
  }

  // Remove trailing comma from last property in configBlock
  const fixedConfigBlock = fixTrailingComma([...configBlock])

  // Launcher sub-files export as string literal or object
  // For library:
  {
    const trimmed = launcherValue[libraryIdx].trim()
    const valuePart = trimmed.replace(/^\w+\s*:\s*/, '').replace(/,$/, '')
    // library: 'Library', → simple string
    // But it could also be an object
    if (valuePart.startsWith("'") || valuePart.startsWith('"')) {
      // String literal
      const strVal = valuePart.replace(/,$/, '').trim()
      writeFile(
        path.join(launcherDir, 'library.ts'),
        [
          `import type { LauncherLibraryCopy } from "../../../model/launcher"`,
          ``,
          `const library: LauncherLibraryCopy = ${strVal};`,
          ``,
          `export default library;`,
          ``,
        ].join('\n'),
      )
    } else if (valuePart === '{') {
      writeValueFile(launcherDir, 'library.ts', '../../../model/launcher', 'LauncherLibraryCopy', fixTrailingComma(libVal), 2)
    }
  }

  // Write discover and updates as standalone files
  for (const [key, val, fileName, typeName] of [
    ['discover', discVal, 'discover.ts', 'LauncherDiscoverCopy'],
    ['updates', updVal, 'updates.ts', 'LauncherUpdatesCopy'],
  ]) {
    const idx = findSubKeyInValue(launcherValue, key)
    const trimmed = launcherValue[idx].trim()
    const valuePart = trimmed.replace(/^\w+\s*:\s*/, '').replace(/,$/, '')

    if (valuePart.startsWith("'") || valuePart.startsWith('"')) {
      const strVal = valuePart.replace(/,$/, '').trim()
      writeFile(
        path.join(launcherDir, fileName),
        [
          `import type { ${typeName} } from "../../../model/launcher"`,
          ``,
          `const ${key}: ${typeName} = ${strVal};`,
          ``,
          `export default ${key};`,
          ``,
        ].join('\n'),
      )
    } else {
      writeValueFile(launcherDir, fileName, '../../../model/launcher', typeName, fixTrailingComma(val), 2)
    }
  }

  // Write configuration.ts using the extracted config block
  writeValueFile(launcherDir, 'configuration.ts', '../../../model/launcher', 'LauncherConfigurationCopy', fixedConfigBlock, 2)

  // Write launcher/index.ts
  writeFile(
    path.join(launcherDir, 'index.ts'),
    [
      `import type { LauncherCopy } from "../../../model/launcher"`,
      `import shared from "./shared"`,
      `import library from "./library"`,
      `import discover from "./discover"`,
      `import updates from "./updates"`,
      `import configuration from "./configuration"`,
      ``,
      `const launcher: LauncherCopy = {`,
      `  ...shared,`,
      `  library,`,
      `  discover,`,
      `  updates,`,
      `  ...configuration,`,
      `}`,
      ``,
      `export default launcher`,
      ``,
    ].join('\n'),
  )

  // ── Write workbench sub-sections ──

  // Workbench sub-section keys and their types in the EditorCopy
  // The editor value is the content of `editor: { ... }`
  // We need to find each key within it

  const workbenchSubSections = {
    viewportLabels: { fileName: 'map.ts', typeName: 'ViewportLabels', importPath: '../../../model/workbench' },
    eventStage: { fileName: 'event-stage.ts', typeName: 'EventStageCopy', importPath: '../../../model/workbench' },
    charactersPanel: { fileName: 'characters.ts', typeName: 'CharactersPanelCopy', importPath: '../../../model/workbench' },
    buildingsPanel: { fileName: 'buildings.ts', typeName: 'BuildingsPanelCopy', importPath: '../../../model/workbench' },
    itemsPanel: { fileName: 'items.ts', typeName: 'ItemsPanelCopy', importPath: '../../../model/workbench' },
    studioDesk: { fileName: 'studio-desk.ts', typeName: 'StudioDeskCopy', importPath: '../../../model/workbench' },
    moduleBlueprints: { fileName: 'module-blueprints.ts', typeName: 'ModuleBlueprintsCopy', importPath: '../../../model/workbench' },
  }

  for (const [key, meta] of Object.entries(workbenchSubSections)) {
    const keyIdx = findSubKeyInValue(editorValue, key)
    if (keyIdx < 0) {
      console.error(`  ERROR: Could not find '${key}' in editor value for ${locale}`)
      continue
    }

    const trimmed = editorValue[keyIdx].trim()
    const valuePart = trimmed.replace(/^\w+\s*:\s*/, '')

    if (valuePart.startsWith("'") || valuePart.startsWith('"')) {
      // Simple string value
      const strVal = valuePart.replace(/,$/, '').trim()
      writeFile(
        path.join(wbDir, meta.fileName),
        [
          `import type { ${meta.typeName} } from "${meta.importPath}"`,
          ``,
          `const ${key}: ${meta.typeName} = ${strVal};`,
          ``,
          `export default ${key}`,
          ``,
        ].join('\n'),
      )
    } else {
      // Extract the sub-value
      const subVal = extractSubValue(editorValue, keyIdx)
      writeValueFile(wbDir, meta.fileName, meta.importPath, meta.typeName, subVal, 4)
    }
  }

  // Write shell.ts - compose from all shell sub-sections.
  // Shell includes: brand, shell, menus, nav, localeShort, statusTone, controls, initialization,
  // leftDock, center, workbenchNavigation, rightDock, statusBar, common, messages.
  //
  // Strategy: Find each shell key individually in editorValue and extract its content.
  // Compose all into one object. This is robust across locale-specific ordering differences.

  const shellKeys = [
    'brand',
    'shell',
    'menus',
    'nav',
    'localeShort',
    'statusTone',
    'controls',
    'initialization',
    'leftDock',
    'center',
    'workbenchNavigation',
    'rightDock',
    'statusBar',
    'common',
    'messages',
  ]

  const shellLines = []
  for (const key of shellKeys) {
    const keyIdx = findSubKeyInValue(editorValue, key)
    if (keyIdx < 0) {
      console.error(`  ERROR: Could not find '${key}' in editor value for ${locale}`)
      continue
    }

    // Add the key line itself
    shellLines.push(editorValue[keyIdx])

    // If this key has an object value, extract its content lines
    const trimmed = editorValue[keyIdx].trim()
    if (trimmed.endsWith('{')) {
      const subVal = extractSubValue(editorValue, keyIdx)
      shellLines.push(...subVal)
      // Include the closing line (e.g. `    },`) after the sub-value
      const closeLineIdx = keyIdx + subVal.length + 1
      if (closeLineIdx < editorValue.length) {
        shellLines.push(editorValue[closeLineIdx])
      }
    }
  }

  // Fix trailing comma on the last property
  const fixedShell = fixTrailingComma([...shellLines])

  writeFile(
    path.join(wbDir, 'shell.ts'),
    [
      `import type { WorkbenchShellCopy } from "../../../model/workbench"`,
      ``,
      `const shell: WorkbenchShellCopy = {`,
      ...fixedShell,
      `};`,
      ``,
      `export default shell`,
      ``,
    ].join('\n'),
  )

  // ── Write workbench/index.ts ──
  writeFile(
    path.join(wbDir, 'index.ts'),
    [
      `import type { EditorCopy } from "../../../model/workbench"`,
      `import launcher from "../launcher"`,
      `import shell from "./shell"`,
      `import viewportLabels from "./map"`,
      `import studioDesk from "./studio-desk"`,
      `import eventStage from "./event-stage"`,
      `import charactersPanel from "./characters"`,
      `import buildingsPanel from "./buildings"`,
      `import itemsPanel from "./items"`,
      `import moduleBlueprints from "./module-blueprints"`,
      ``,
      `const editor: EditorCopy = {`,
      `  ...shell,`,
      `  launcher,`,
      `  viewportLabels,`,
      `  studioDesk,`,
      `  eventStage,`,
      `  charactersPanel,`,
      `  buildingsPanel,`,
      `  itemsPanel,`,
      `  moduleBlueprints,`,
      `}`,
      ``,
      `export default editor`,
      ``,
      `export { default as mods } from "./mods"`,
      `export { default as modI18n } from "./mod-i18n"`,
      `export { default as viewMenu } from "./view-menu"`,
      `export { default as worldAtlasViews } from "./world-atlas"`,
      ``,
    ].join('\n'),
  )

  // ── Write locale index.ts ──
  writeFile(
    path.join(baseDir, 'index.ts'),
    [
      `import type { LocaleBundle } from "../../model"`,
      `import editor from "./workbench"`,
      `import { mods, modI18n, viewMenu, worldAtlasViews } from "./workbench"`,
      `import notifications from "./notifications"`,
      `import settingsMenu from "./settings"`,
      ``,
      `const localeBundle: LocaleBundle = {`,
      `  editor,`,
      `  mods,`,
      `  modI18n,`,
      `  notifications,`,
      `  worldAtlasViews,`,
      `  viewMenu,`,
      `  settingsMenu,`,
      `}`,
      ``,
      `export default localeBundle`,
      ``,
    ].join('\n'),
  )
}

console.log('\n=== Done ===')
