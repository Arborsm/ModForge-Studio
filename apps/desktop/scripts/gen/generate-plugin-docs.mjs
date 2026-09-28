/**
 * Generates the plugin design guide and the plugin-facing TS mirror surface
 * from a single source of truth — the JSDoc + prop declarations of the real
 * host components in `apps/desktop/src/shared/ui/`.
 *
 * Source layout:
 * - `packages/plugin-sdk/DESIGN.md` is the hand-written master. Its
 *   "Host components" section is a generated block (marked with
 *   `BEGIN/END GENERATED host-components`) filled from the JSDoc of the real
 *   host components — document props there, and every public prop must carry a
 *   single-line doc comment or this script fails. Props tagged `@internal` are
 *   hidden from the guide. Copies are emitted to
 *   `packages/plugin-sdk/template/DESIGN.md` and the bundled example plugin's
 *   `DESIGN.md` with a do-not-edit header.
 * - `packages/plugin-sdk/src/host-components.generated.ts` mirrors the same
 *   host props as `Plugin*` types (JSDoc preserved per member, host-internal
 *   types remapped word-for-word: `ReactNode` → `PluginReactNode`,
 *   `CSSProperties` → `Record<string, unknown>`, referenced extra types →
 *   `Plugin*` mirrors; generic parameter lists carried verbatim) plus the
 *   `PluginGeneratedComponents` interface.
 * - `apps/desktop/src/features/compat-plugins/runtime/pluginHostComponents.generated.ts`
 *   wires the real components into `pluginHostComponents: PluginComponents`
 *   with an explicit type annotation so host tsc catches SDK/host drift.
 *
 * Usage:
 *   node ./scripts/gen/generate-plugin-docs.mjs          # rewrite master + copies + generated TS
 *   node ./scripts/gen/generate-plugin-docs.mjs --check  # fail on any drift (CI)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(__filename)
const desktopRoot = path.resolve(scriptDir, '../..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const require = createRequire(import.meta.url)

const MASTER = path.join(repoRoot, 'packages/plugin-sdk/DESIGN.md')
const COPIES = [
  path.join(repoRoot, 'packages/plugin-sdk/template/DESIGN.md'),
  path.join(desktopRoot, 'compat-plugins/modforge.example-code-plugin/DESIGN.md'),
]

/** Generated SDK mirror types (do-not-edit header; rewritten by this script). */
const SDK_GENERATED_TS = path.join(repoRoot, 'packages/plugin-sdk/src/host-components.generated.ts')
/** Generated host→plugin component wiring (do-not-edit header; rewritten by this script). */
const HOST_COMPONENTS_GENERATED_TS = path.join(desktopRoot, 'src/features/compat-plugins/runtime/pluginHostComponents.generated.ts')

/** Host components exposed to plugins, in guide order. */
const COMPONENTS = [
  { name: 'PanelFrame', file: 'PanelFrame.tsx', propsType: 'PanelFrameProps' },
  { name: 'PanelSection', file: 'PanelSection.tsx', propsType: 'PanelSectionProps' },
  { name: 'EmptyStateCard', file: 'EmptyStateCard.tsx', propsType: 'EmptyStateCardProps' },
  {
    name: 'WorkspaceSplitView',
    file: 'WorkspaceSplitView.tsx',
    propsType: 'WorkspaceSplitViewProps',
    extraTypes: ['WorkspaceSplitViewEmptyState'],
  },
  {
    name: 'CompactSelect',
    file: 'CompactSelect.tsx',
    propsType: 'CompactSelectProps',
    extraTypes: ['CompactSelectOption'],
    // Marks the `PluginComponents` entry as a generic function signature; the
    // clause itself must match the host props declaration exactly (validated).
    genericSignature: '<TValue extends string | number>',
  },
  { name: 'Disclosure', file: 'Disclosure.tsx', propsType: 'DisclosureProps' },
  { name: 'ProgressRing', file: 'ProgressRing.tsx', propsType: 'ProgressRingProps' },
  { name: 'ImageSkeleton', file: 'ImageSkeleton.tsx', propsType: 'ImageSkeletonProps' },
  { name: 'ItemGroupPopover', file: 'ItemGroupPopover.tsx', propsType: 'ItemGroupPopoverProps', genericSignature: '<T>' },
  {
    name: 'SheetRegionPicker',
    file: 'SheetRegionPicker.tsx',
    propsType: 'SheetRegionPickerProps',
    extraTypes: ['SheetRegion'],
  },
  { name: 'Tooltip', file: 'Tooltip.tsx', propsType: 'TooltipProps' },
]

const BEGIN_MARKER = '<!-- BEGIN GENERATED host-components — from apps/desktop/src/shared/ui; do not edit -->'
const END_MARKER = '<!-- END GENERATED host-components -->'
const COPY_HEADER = `<!-- Generated from packages/plugin-sdk/DESIGN.md by apps/desktop/scripts/gen/generate-plugin-docs.mjs — do not edit by hand. -->\n\n`

/**
 * Reads the JSDoc block immediately above declaration line `declIndex`.
 * Supports single-line and multi-line doc blocks. Returns the
 * cleaned text lines, or null when no doc block is attached.
 */
export function readDocBlock(lines, declIndex) {
  let i = declIndex - 1
  while (i >= 0 && lines[i].trim() === '') i -= 1
  if (i < 0) return null
  const single = lines[i].trim().match(/^\/\*\*\s*(.*?)\s*\*\/$/)
  if (single) return [single[1]]
  if (lines[i].trim() !== '*/') return null
  const block = []
  i -= 1
  while (i >= 0 && !lines[i].trim().startsWith('/**')) {
    block.unshift(lines[i].trim().replace(/^\*\s?/, ''))
    i -= 1
  }
  if (i < 0) return null
  return block.filter((line) => line !== '')
}

/** Returns the index of a `type <propsType>...` declaration line, or -1. */
export function findTypeDeclIndex(source, propsType) {
  return source.split('\n').findIndex((line) => new RegExp(`^(export\\s+)?type ${propsType}\\b`).test(line.trim()))
}

/**
 * Captures the generic parameter clause of a props type declaration line,
 * verbatim from the host (e.g. `<TValue extends string | number>`), or null
 * when the type is not generic.
 */
export function extractGenericClause(source, propsType, fileName) {
  const declIndex = findTypeDeclIndex(source, propsType)
  if (declIndex === -1) throw new Error(`${fileName}: props type ${propsType} not found`)
  const line = source.split('\n')[declIndex].trim()
  const match = line.match(new RegExp(`^(?:export\\s+)?type ${propsType}(<[^>]*>)?\\s*=`, 'i'))
  return match?.[1] ?? null
}

/**
 * Parses a props type alias into documented members. Contract: each member is
 * a single-line `name?: type` pair preceded by a single-line doc comment.
 * Members whose doc contains `@internal` are skipped; members without a doc
 * comment throw, so the guide can never silently lose a prop.
 */
export function extractPropsMembers(source, propsType, fileName) {
  const declIndex = findTypeDeclIndex(source, propsType)
  if (declIndex === -1) throw new Error(`${fileName}: props type ${propsType} not found`)
  const lines = source.split('\n')
  const members = []
  let i = declIndex + 1
  let pendingDoc = null
  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed === '}') break
    if (trimmed === '') continue
    const doc = trimmed.match(/^\/\*\*\s*(.*?)\s*\*\/$/)
    if (doc) {
      pendingDoc = doc[1]
      continue
    }
    const member = trimmed.match(/^(\w+)(\?)?\s*:\s*(.+?);?$/)
    if (!member) throw new Error(`${fileName}: ${propsType} member is not a single-line declaration: ${trimmed}`)
    if (pendingDoc == null) throw new Error(`${fileName}: ${propsType}.${member[1]} is missing a /** ... */ doc comment`)
    if (!pendingDoc.includes('@internal')) {
      members.push({ name: member[1], optional: member[2] === '?', type: member[3].replace(/;$/, ''), doc: pendingDoc })
    }
    pendingDoc = null
  }
  return members
}

/** Extracts the component description and documented props from one source file. */
export function extractComponentDoc(source, fileName, spec) {
  const lines = source.split('\n')
  const declIndex = lines.findIndex(
    (line) => line.trim().startsWith(`export function ${spec.name}(`) || line.trim().startsWith(`export function ${spec.name}<`),
  )
  if (declIndex === -1) throw new Error(`${fileName}: exported function ${spec.name} not found`)
  const description = (readDocBlock(lines, declIndex) ?? []).join(' ')
  if (!description) throw new Error(`${fileName}: ${spec.name} is missing a JSDoc description`)
  const generics = extractGenericClause(source, spec.propsType, fileName)
  if (generics == null && spec.genericSignature != null) {
    throw new Error(`${fileName}: ${spec.propsType} is not generic but COMPONENTS declares a generic signature`)
  }
  if (generics != null && generics !== spec.genericSignature) {
    throw new Error(
      `${fileName}: ${spec.propsType} generic clause ${generics} does not match COMPONENTS.genericSignature ${spec.genericSignature}`,
    )
  }
  const extras = (spec.extraTypes ?? []).map((typeName) => {
    const extraDeclIndex = findTypeDeclIndex(source, typeName)
    if (extraDeclIndex === -1) throw new Error(`${fileName}: extra type ${typeName} not found`)
    const doc = (readDocBlock(lines, extraDeclIndex) ?? []).join(' ')
    if (!doc) throw new Error(`${fileName}: extra type ${typeName} is missing a JSDoc description`)
    return {
      name: typeName,
      doc,
      generics: extractGenericClause(source, typeName, fileName),
      props: extractPropsMembers(source, typeName, fileName),
    }
  })
  return {
    name: spec.name,
    file: spec.file,
    propsType: spec.propsType,
    description,
    generics,
    props: extractPropsMembers(source, spec.propsType, fileName),
    extras,
  }
}

/** Formats a type for the guide: drops generic parameters, escapes table pipes. */
function displayType(type) {
  return type.replace(/<[^>]*>/g, '').replace(/\|/g, '\\|')
}

function renderPropsTable(members) {
  const rows = members.map(
    (member) => `| \`${member.name}${member.optional ? '?' : ''}\` | \`${displayType(member.type)}\` | ${member.doc} |`,
  )
  return ['| Prop | Type | Description |', '| ---- | ---- | ----------- |', ...rows].join('\n')
}

/** Renders the generated "Host components" markdown block (without markers). */
export function renderComponentsSection(components) {
  const sections = components.map((component) => {
    const parts = [`### ${component.name}`, '', component.description, '', renderPropsTable(component.props)]
    for (const extra of component.extras) {
      parts.push('', `**\`${extra.name}\`**`, '', renderPropsTable(extra.props))
    }
    return parts.join('\n')
  })
  return sections.join('\n\n')
}

/** Replaces the marked generated block inside the master document. */
export function injectGeneratedBlock(master, section) {
  const begin = master.indexOf(BEGIN_MARKER)
  const end = master.indexOf(END_MARKER)
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`${MASTER}: missing or misordered GENERATED host-components markers`)
  }
  return `${master.slice(0, begin + BEGIN_MARKER.length)}\n${section}\n${master.slice(end)}`
}

/** Renders a distributable copy: do-not-edit header plus the master content. */
export function renderCopy(master) {
  return COPY_HEADER + master
}

/** Shared host-internal type remappings applied word-for-word to member type strings. */
const PLUGIN_TYPE_MAPPINGS = [
  { from: 'ReactNode', to: 'PluginReactNode' },
  { from: 'CSSProperties', to: 'Record<string, unknown>' },
]

/** The union of every extra type across all components, so cross-references always resolve. */
export function allPluginExtraTypes(components) {
  return [...new Set(components.flatMap((component) => component.extras.map((extra) => extra.name)))]
}

/**
 * Remaps a host member type string to the plugin-facing mirror:
 * `ReactNode` → `PluginReactNode`, `CSSProperties` → `Record<string, unknown>`,
 * and every referenced extra type (from any component) → `Plugin*` mirror.
 * Replaced at word boundaries only, so `SheetRegionPickerProps` is never hit by
 * the `SheetRegion` rule and `ReactNode[]` still becomes `PluginReactNode[]`.
 */
export function mapMemberType(type, extraTypes) {
  let mapped = type
  for (const { from, to } of PLUGIN_TYPE_MAPPINGS) {
    mapped = mapped.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
  }
  for (const extra of extraTypes) {
    mapped = mapped.replace(new RegExp(`\\b${extra}\\b`, 'g'), `Plugin${extra}`)
  }
  return mapped
}

/** Derives the instantiation argument list from a generic clause, e.g. `<TValue extends string | number>` → `<TValue>`. */
export function genericArgs(genericClause) {
  if (genericClause == null) return ''
  const params = genericClause
    .slice(1, -1)
    .split(',')
    .map((param) => param.trim().split(/\s+/)[0])
  return `<${params.join(', ')}>`
}

/** Renders one `Plugin*` mirror type declaration (docs table input shape). */
export function renderMirrorType(typeName, source, extraTypes) {
  const lines = [`/** ${source.doc} */`, `export type ${typeName}${source.generics ?? ''} = {`]
  for (const member of source.props) {
    lines.push(`  /** ${member.doc} */`)
    lines.push(`  ${member.name}${member.optional ? '?' : ''}: ${mapMemberType(member.type, extraTypes)}`)
  }
  lines.push('}')
  return lines.join('\n')
}

/**
 * Renders the `PluginGeneratedComponents` interface. Non-generic components are
 * typed as `ReactComponentType<Plugin*Props>`; generic ones keep a generic
 * function signature carrying the host declaration's clauses, e.g.
 * `CompactSelect: <TValue extends string | number>(props: PluginCompactSelectProps<TValue>) => any`.
 */
export function renderGeneratedComponentsInterface(components) {
  const lines = ['/** Design-system component subset exposed to plugins (token-styled). */', 'export interface PluginGeneratedComponents {']
  for (const component of components) {
    const signature = component.generics
      ? `${component.generics}(props: Plugin${component.propsType}${genericArgs(component.generics)}) => any`
      : `ReactComponentType<Plugin${component.propsType}>`
    lines.push(`  /** ${component.description} */`)
    lines.push(`  ${component.name}: ${signature}`)
  }
  lines.push('}')
  return lines.join('\n')
}

/**
 * Renders `packages/plugin-sdk/src/host-components.generated.ts`: one `Plugin*`
 * mirror type per host props type and extra type (JSDoc preserved per member),
 * plus the `PluginGeneratedComponents` interface.
 */
export function renderSdkGeneratedTs(components) {
  const lines = [
    '/**',
    ' * @file Generated plugin-facing mirrors of the host design-system components — do not edit by hand.',
    ' *',
    ' * Regenerate with `vp run --filter @modforge/desktop gen:plugin-docs`. Source of truth: the',
    ' * JSDoc and prop declarations of `apps/desktop/src/shared/ui/*.tsx`. Host-internal types are',
    ' * remapped word-for-word (`ReactNode` → `PluginReactNode`, `CSSProperties` →',
    ' * `Record<string, unknown>`, referenced extra types → `Plugin*` mirrors); generic parameter',
    ' * lists are carried verbatim from the host declaration.',
    ' */',
    '',
    "import type { PluginReactNode, ReactComponentType } from './primitives'",
  ]
  const extraTypes = allPluginExtraTypes(components)
  for (const component of components) {
    for (const extra of component.extras) {
      lines.push('', renderMirrorType(`Plugin${extra.name}`, extra, extraTypes))
    }
    lines.push(
      '',
      renderMirrorType(
        `Plugin${component.propsType}`,
        { ...component, doc: `Props for \`PluginComponents.${component.name}\`; ${component.description}` },
        extraTypes,
      ),
    )
  }
  lines.push('', renderGeneratedComponentsInterface(components))
  return `${lines.join('\n')}\n`
}

/**
 * Renders `apps/desktop/src/features/compat-plugins/runtime/pluginHostComponents.generated.ts`:
 * imports the real components and wires them into an explicitly-typed
 * `PluginComponents` object, so host tsc fails when a real component's props
 * drift from the SDK declarations.
 */
export function renderHostComponentsTs(components) {
  const lines = [
    '/**',
    ' * @file Generated host→plugin component wiring — do not edit by hand.',
    ' *',
    ' * Regenerate with `vp run --filter @modforge/desktop gen:plugin-docs`. Source of truth:',
    ' * `apps/desktop/scripts/gen/generate-plugin-docs.mjs` and `apps/desktop/src/shared/ui/*.tsx`.',
    ' * The explicit `PluginComponents` annotation is the drift guard: host tsc fails when a',
    " * real component props no longer satisfy the SDK's plugin-facing declarations.",
    ' */',
    '',
    "import type { PluginComponents } from '@modforge/plugin-sdk'",
  ]
  for (const component of components) {
    const moduleName = component.file.replace(/\.tsx$/, '')
    lines.push(`import { ${component.name} } from '@shared/ui/${moduleName}'`)
  }
  lines.push('', '/** Real design-system components handed to plugins via `PluginContext.components`. */')
  lines.push('export const pluginHostComponents: PluginComponents = {')
  for (const component of components) {
    lines.push(`  ${component.name},`)
  }
  lines.push('}', '')
  return lines.join('\n')
}

/**
 * Normalizes generated content with the repo formatter (`vp fmt`), writing
 * through a temp file. The committed docs pass the lint-staged `vp fmt .`
 * gate, so drift is defined against the formatter-normalized output.
 */
function normalizeWithFormatter(content, extension = '.md') {
  const tempFile = path.join(os.tmpdir(), `modforge-plugin-docs-${process.pid}-${Math.random().toString(36).slice(2)}${extension}`)
  fs.writeFileSync(tempFile, content)
  try {
    const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
    const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
    const result = spawnSync(process.execPath, [vitePlusCliEntry, 'fmt', tempFile], { cwd: desktopRoot, stdio: 'pipe' })
    if (result.status !== 0) {
      throw new Error(`vp fmt failed on generated ${extension} content: ${result.stderr?.toString() ?? result.status}`)
    }
    return fs.readFileSync(tempFile, 'utf8')
  } finally {
    fs.rmSync(tempFile, { force: true })
  }
}

/** Reads and parses all COMPONENTS specs from their host source files. */
function readComponents() {
  return COMPONENTS.map((spec) => {
    const fileName = `src/shared/ui/${spec.file}`
    const source = fs.readFileSync(path.join(desktopRoot, fileName), 'utf8')
    return extractComponentDoc(source, fileName, spec)
  })
}

/** Builds the up-to-date (formatter-normalized) master and copy contents without touching the real files. */
export function buildExpectedDocs() {
  const master = fs.readFileSync(MASTER, 'utf8')
  const components = readComponents()
  const nextMaster = normalizeWithFormatter(injectGeneratedBlock(master, renderComponentsSection(components)))
  const copies = COPIES.map((target) => ({ target, content: renderCopy(nextMaster) }))
  return { master: nextMaster, copies }
}

/** Builds the up-to-date (formatter-normalized) generated TS surfaces without touching the real files. */
export function buildExpectedTypeScriptOutputs() {
  const components = readComponents()
  return {
    sdk: { target: SDK_GENERATED_TS, content: normalizeWithFormatter(renderSdkGeneratedTs(components), '.ts') },
    host: { target: HOST_COMPONENTS_GENERATED_TS, content: normalizeWithFormatter(renderHostComponentsTs(components), '.ts') },
  }
}

/** Returns the list of files whose on-disk content drifts from the generator output. */
export function checkPluginDocsDrift() {
  const { master, copies } = buildExpectedDocs()
  const drifted = []
  if (fs.readFileSync(MASTER, 'utf8') !== master) drifted.push(MASTER)
  for (const { target, content } of copies) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) drifted.push(target)
  }
  return drifted
}

/** Returns the generated TS files that drift from the generator output. */
export function checkPluginGeneratedDrift() {
  const { sdk, host } = buildExpectedTypeScriptOutputs()
  const drifted = []
  for (const { target, content } of [sdk, host]) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) drifted.push(target)
  }
  return drifted
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMain) {
  if (process.argv.includes('--check')) {
    const drifted = [...checkPluginDocsDrift(), ...checkPluginGeneratedDrift()]
    if (drifted.length > 0) {
      console.error('[gen:plugin-docs] drift detected; run `vp run --filter @modforge/desktop gen:plugin-docs`:')
      for (const file of drifted) console.error(`  - ${path.relative(repoRoot, file)}`)
      process.exit(1)
    }
    console.log('[gen:plugin-docs] no drift')
  } else {
    const { master, copies } = buildExpectedDocs()
    fs.writeFileSync(MASTER, master)
    for (const { target, content } of copies) {
      fs.writeFileSync(target, content)
      console.log(`[gen:plugin-docs] ✓ ${path.relative(repoRoot, target)}`)
    }
    const { sdk, host } = buildExpectedTypeScriptOutputs()
    for (const { target, content } of [sdk, host]) {
      fs.writeFileSync(target, content)
      console.log(`[gen:plugin-docs] ✓ ${path.relative(repoRoot, target)}`)
    }
  }
}
