import { afterEach, describe, expect, test } from 'vite-plus/test'
import { registerPluginConditionSyntax } from '@features/compat-plugins'
import { usePluginConditionSyntaxStore } from '@entities/content-patcher'
import type { CompatPluginSummary } from '@features/compat-plugins'

afterEach(() => {
  usePluginConditionSyntaxStore.getState().clear()
})

function makePlugin(overrides: Partial<CompatPluginSummary> = {}): CompatPluginSummary {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    format: 1,
    hasCodeEntry: false,
    entry: null,
    sdkVersion: null,
    targets: [],
    pageIds: [],
    pages: [],
    i18n: {},
    loadError: null,
    assetSchemas: [],
    conditionSyntax: [],
    capabilities: [],
    ...overrides,
  }
}

describe('registerPluginConditionSyntax', () => {
  test('flattens conditionSyntax contributions into the store', () => {
    const plugins = [
      makePlugin({
        id: 'mail-framework',
        conditionSyntax: [
          {
            namespace: 'MailFrameworkMod',
            keys: [{ key: 'HasMail' }, { key: 'HasQuest', labelKey: 'mail.hasQuest' }],
          },
        ],
      }),
      makePlugin({
        id: 'festivals-plus',
        conditionSyntax: [
          {
            namespace: 'FestivalsPlus',
            keys: [{ key: 'IsFestival' }],
          },
        ],
      }),
    ]

    registerPluginConditionSyntax(plugins)

    const contributions = usePluginConditionSyntaxStore.getState().contributions
    expect(contributions).toHaveLength(3)
    expect(contributions[0]).toEqual({ key: 'HasMail', namespace: 'MailFrameworkMod' })
    expect(contributions[1]).toEqual({ key: 'HasQuest', namespace: 'MailFrameworkMod' })
    expect(contributions[2]).toEqual({ key: 'IsFestival', namespace: 'FestivalsPlus' })
  })

  test('handles plugins with no conditionSyntax contributions', () => {
    registerPluginConditionSyntax([makePlugin(), makePlugin({ id: 'other' })])
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(0)
  })

  test('handles empty plugin list', () => {
    registerPluginConditionSyntax([])
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(0)
  })

  test('replaces previous contributions on re-registration', () => {
    registerPluginConditionSyntax([
      makePlugin({
        conditionSyntax: [{ namespace: 'A', keys: [{ key: 'KeyA' }] }],
      }),
    ])
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(1)

    registerPluginConditionSyntax([
      makePlugin({
        conditionSyntax: [{ namespace: 'B', keys: [{ key: 'KeyB' }, { key: 'KeyC' }] }],
      }),
    ])
    const contributions = usePluginConditionSyntaxStore.getState().contributions
    expect(contributions).toHaveLength(2)
    expect(contributions.map((c) => c.key)).toEqual(['KeyB', 'KeyC'])
  })
})
