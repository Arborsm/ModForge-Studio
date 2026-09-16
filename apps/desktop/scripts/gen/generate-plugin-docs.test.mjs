import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExpectedDocs,
  buildExpectedTypeScriptOutputs,
  checkPluginDocsDrift,
  checkPluginGeneratedDrift,
  extractComponentDoc,
  extractGenericClause,
  extractPropsMembers,
  genericArgs,
  injectGeneratedBlock,
  mapMemberType,
  readDocBlock,
  renderComponentsSection,
  renderCopy,
  renderHostComponentsTs,
  renderSdkGeneratedTs,
} from './generate-plugin-docs.mjs'

const COMPONENT_FIXTURE = `/** @file Fixture. */

/** Standard frame for plugin pages. */
export function PanelFrame({ title }: PanelFrameProps) {}

type PanelFrameProps = {
  /** Header title text. */
  title: string
  /** Secondary line rendered under the title. */
  subtitle?: string
  /** @internal Host-only hook. */
  legacyClassName?: string
  /** Body content. */
  children: ReactNode
}
`

void test('readDocBlock reads single-line and multi-line JSDoc', () => {
  assert.deepEqual(readDocBlock(['/** One liner. */', 'const x = 1'], 1), ['One liner.'])
  assert.deepEqual(readDocBlock(['/**', ' * First.', ' * Second.', ' */', 'const x = 1'], 4), ['First.', 'Second.'])
  assert.equal(readDocBlock(['// not a doc block', 'const x = 1'], 1), null)
})

void test('extractComponentDoc extracts description, documented props and hides @internal', () => {
  const doc = extractComponentDoc(COMPONENT_FIXTURE, 'fixture.tsx', { name: 'PanelFrame', propsType: 'PanelFrameProps' })
  assert.equal(doc.description, 'Standard frame for plugin pages.')
  assert.deepEqual(
    doc.props.map((prop) => [prop.name, prop.optional, prop.type, prop.doc]),
    [
      ['title', false, 'string', 'Header title text.'],
      ['subtitle', true, 'string', 'Secondary line rendered under the title.'],
      ['children', false, 'ReactNode', 'Body content.'],
    ],
  )
})

void test('extractPropsMembers rejects undocumented props instead of dropping them silently', () => {
  assert.throws(
    () => extractPropsMembers('type XProps = {\n  /** Documented. */\n  a: string\n  b: string\n}', 'XProps', 'x.tsx'),
    /x\.tsx: XProps\.b is missing a .+ doc comment/,
  )
  assert.throws(
    () => extractPropsMembers('type XProps = {\n  /** Doc. */\n  a: string\n}', 'MissingProps', 'x.tsx'),
    /MissingProps not found/,
  )
})

void test('renderComponentsSection escapes union pipes and strips generics from displayed types', () => {
  const rendered = renderComponentsSection([
    {
      name: 'CompactSelect',
      description: 'A select.',
      props: [{ name: 'placement', optional: true, type: "'bottom-start' | 'top-end'", doc: 'Popover placement.' }],
      extras: [
        {
          name: 'CompactSelectOption',
          props: [{ name: 'options', optional: false, type: 'readonly CompactSelectOption<TValue>[]', doc: 'Options.' }],
        },
      ],
    },
  ])
  assert.match(rendered, /\| `placement\?` \| `'bottom-start' \\\| 'top-end'` \| Popover placement\. \|/)
  assert.match(rendered, /`readonly CompactSelectOption\[\]`/)
  assert.match(rendered, /\*\*`CompactSelectOption`\*\*/)
})

void test('injectGeneratedBlock replaces only the marked block and rejects missing markers', () => {
  const master =
    'before\n<!-- BEGIN GENERATED host-components — from apps/desktop/src/shared/ui; do not edit -->\nold\n<!-- END GENERATED host-components -->\nafter\n'
  const next = injectGeneratedBlock(master, 'NEW')
  assert.match(next, /do not edit -->\nNEW\n<!-- END GENERATED/)
  assert.ok(next.startsWith('before\n'))
  assert.ok(next.endsWith('after\n'))
  assert.throws(() => injectGeneratedBlock('no markers here', 'NEW'), /missing or misordered GENERATED host-components markers/)
})

void test('renderCopy prepends the do-not-edit header', () => {
  assert.ok(renderCopy('# Guide\n').startsWith('<!-- Generated from packages/plugin-sdk/DESIGN.md'))
})

void test('generator output is idempotent and the real tree has no drift', () => {
  const { master } = buildExpectedDocs()
  assert.deepEqual(checkPluginDocsDrift(), [], 'run `vp run --filter @modforge/desktop gen:plugin-docs` to regenerate')
  // Re-injecting the generated block already present in the master is a no-op.
  const begin = '<!-- BEGIN GENERATED host-components — from apps/desktop/src/shared/ui; do not edit -->\n'
  const end = '\n<!-- END GENERATED host-components -->'
  const section = master.slice(master.indexOf(begin) + begin.length, master.indexOf(end))
  assert.equal(injectGeneratedBlock(master, section), master)
})

// ── TS mirror generation ─────────────────────────────────────────────────────

const MIRROR_FIXTURES = [
  {
    name: 'CompactSelect',
    file: 'CompactSelect.tsx',
    propsType: 'CompactSelectProps',
    description: 'A compact select.',
    generics: '<TValue extends string | number>',
    props: [
      { name: 'value', optional: false, type: 'TValue', doc: 'Currently selected value.' },
      { name: 'options', optional: false, type: 'readonly CompactSelectOption<TValue>[]', doc: 'Options to display.' },
      { name: 'onChange', optional: false, type: '(value: TValue) => void', doc: 'Called on pick.' },
      { name: 'triggerIcon', optional: false, type: 'ReactNode | ((isOpen: boolean) => ReactNode)', doc: 'Trigger icon.' },
      { name: 'style', optional: true, type: 'CSSProperties', doc: 'Inline styles.' },
    ],
    extras: [
      {
        name: 'CompactSelectOption',
        doc: 'One selectable option.',
        generics: '<TValue extends string | number>',
        props: [{ name: 'label', optional: false, type: 'string', doc: 'Visible label.' }],
      },
    ],
  },
  {
    name: 'WorkspaceSplitView',
    file: 'WorkspaceSplitView.tsx',
    propsType: 'WorkspaceSplitViewProps',
    description: 'A split layout.',
    generics: null,
    props: [
      { name: 'sidebar', optional: false, type: 'ReactNode', doc: 'Left column.' },
      { name: 'emptyState', optional: true, type: 'WorkspaceSplitViewEmptyState', doc: 'Hint state.' },
    ],
    extras: [
      {
        name: 'WorkspaceSplitViewEmptyState',
        doc: 'A hint.',
        generics: null,
        props: [{ name: 'icon', optional: false, type: 'ReactNode', doc: 'Icon.' }],
      },
    ],
  },
]

void test('mapMemberType remaps ReactNode/CSSProperties and extra types at word boundaries', () => {
  assert.equal(mapMemberType('ReactNode', []), 'PluginReactNode')
  assert.equal(
    mapMemberType('ReactNode | ((isOpen: boolean) => ReactNode)', []),
    'PluginReactNode | ((isOpen: boolean) => PluginReactNode)',
  )
  assert.equal(mapMemberType('CSSProperties', []), 'Record<string, unknown>')
  assert.equal(
    mapMemberType('readonly CompactSelectOption<TValue>[]', ['CompactSelectOption']),
    'readonly PluginCompactSelectOption<TValue>[]',
  )
  assert.equal(mapMemberType('SheetRegion | null', ['SheetRegion']), 'PluginSheetRegion | null')
  // Word boundaries: a longer name containing an extra-type prefix is untouched.
  assert.equal(mapMemberType('SheetRegionPickerProps', ['SheetRegion']), 'SheetRegionPickerProps')
  assert.equal(mapMemberType('ReactNodeish', []), 'ReactNodeish')
})

void test('extractGenericClause captures the host generic clause verbatim', () => {
  assert.equal(
    extractGenericClause('type XProps<TValue extends string | number> = {\n}', 'XProps', 'x.tsx'),
    '<TValue extends string | number>',
  )
  assert.equal(extractGenericClause('type XProps<T> = {\n}', 'XProps', 'x.tsx'), '<T>')
  assert.equal(extractGenericClause('export type XProps = {\n}', 'XProps', 'x.tsx'), null)
  assert.throws(() => extractGenericClause('type XProps = {\n}', 'MissingProps', 'x.tsx'), /MissingProps not found/)
})

void test('genericArgs derives the instantiation argument list from a clause', () => {
  assert.equal(genericArgs('<TValue extends string | number>'), '<TValue>')
  assert.equal(genericArgs('<T>'), '<T>')
  assert.equal(genericArgs(null), '')
})

void test('extractComponentDoc carries generics and validates genericSignature against the host', () => {
  const source = `/** @file F */

/** Widget. */
export function Widget() {}

type WidgetProps<T> = {
  /** Item. */
  item: T
}
`
  assert.equal(extractComponentDoc(source, 'f.tsx', { name: 'Widget', propsType: 'WidgetProps', genericSignature: '<T>' }).generics, '<T>')
  assert.throws(
    () => extractComponentDoc(source, 'f.tsx', { name: 'Widget', propsType: 'WidgetProps', genericSignature: '<TItem>' }),
    /generic clause <T> does not match COMPONENTS\.genericSignature <TItem>/,
  )
  assert.throws(
    () =>
      extractComponentDoc(
        `/** @file F */

/** Widget. */
export function Widget() {}

type WidgetProps = {
  /** Item. */
  item: string
}
`,
        'f.tsx',
        { name: 'Widget', propsType: 'WidgetProps', genericSignature: '<T>' },
      ),
    /not generic but COMPONENTS declares a generic signature/,
  )
})

void test('renderSdkGeneratedTs applies the full mirror contract (generics, mappings, interface)', () => {
  const sdk = renderSdkGeneratedTs(MIRROR_FIXTURES)
  assert.match(sdk, /do not edit by hand/)
  assert.match(sdk, /export type PluginCompactSelectOption<TValue extends string | number> = {/)
  assert.match(sdk, /options: readonly PluginCompactSelectOption<TValue>\[\]/)
  assert.match(sdk, /triggerIcon: PluginReactNode \| \(\(isOpen: boolean\) => PluginReactNode\)/)
  assert.match(sdk, /style\?: Record<string, unknown>/)
  assert.match(sdk, /export type PluginCompactSelectProps<TValue extends string | number> = {/)
  assert.match(sdk, /emptyState\?: PluginWorkspaceSplitViewEmptyState/)
  // JSDoc from the host is preserved per member.
  assert.match(sdk, /\/\*\* Visible label\. \*\/\n  label: string/)
  assert.match(sdk, /CompactSelect: <TValue extends string | number>\(props: PluginCompactSelectProps<TValue>\) => any/)
  assert.match(sdk, /WorkspaceSplitView: ReactComponentType<PluginWorkspaceSplitViewProps>/)
})

void test('renderSdkGeneratedTs drops the Omit base class and keeps own members only', () => {
  const sdk = renderSdkGeneratedTs(MIRROR_FIXTURES)
  assert.ok(!sdk.includes('HTMLAttributes') && !sdk.includes('Omit<'))
  // The split view only exposes its own declared members; no inherited attributes leak.
  assert.match(sdk, /sidebar: PluginReactNode/)
  assert.ok(!sdk.includes('aria-'))
})

void test('renderHostComponentsTs wires imports and the explicitly-typed object', () => {
  const host = renderHostComponentsTs(MIRROR_FIXTURES)
  assert.match(host, /do not edit by hand/)
  assert.match(host, /import type \{ PluginComponents \} from '@modforge\/plugin-sdk'/)
  assert.match(host, /import \{ CompactSelect \} from '@shared\/ui\/CompactSelect'/)
  assert.match(host, /import \{ WorkspaceSplitView \} from '@shared\/ui\/WorkspaceSplitView'/)
  assert.match(host, /export const pluginHostComponents: PluginComponents = {/)
  assert.match(host, /  CompactSelect,\n  WorkspaceSplitView,/)
})

void test('generated TS mirrors are idempotent and the real tree has no drift', () => {
  const { sdk, host } = buildExpectedTypeScriptOutputs()
  assert.deepEqual(checkPluginGeneratedDrift(), [], 'run `vp run --filter @modforge/desktop gen:plugin-docs` to regenerate')
  // Both files live in the tree and carry the do-not-edit header.
  assert.match(sdk.content, /do not edit by hand/)
  assert.match(host.content, /do not edit by hand/)
  assert.match(sdk.content, /export type PluginItemGroupPopoverProps<T> = {/)
  assert.match(sdk.content, /export interface PluginGeneratedComponents {/)
  // Dropping the WorkspaceSplitView Omit base must never leak host internals.
  assert.ok(!sdk.content.includes('HTMLAttributes'))
})
