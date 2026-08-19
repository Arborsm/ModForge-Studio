import { afterEach, describe, expect, test } from 'vite-plus/test'
import {
  findPluginConditionSyntaxKey,
  getPluginConditionSyntaxKeys,
  pluginConditionSyntaxToTokens,
  usePluginConditionSyntaxStore,
} from '@entities/content-patcher'

afterEach(() => {
  usePluginConditionSyntaxStore.getState().clear()
})

describe('pluginConditionSyntaxStore', () => {
  test('register stores contributions and clear resets', () => {
    const store = usePluginConditionSyntaxStore.getState()
    store.register([
      { key: 'HasMail', namespace: 'MailFrameworkMod' },
      { key: 'HasQuest', namespace: 'MailFrameworkMod' },
    ])
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(2)
    store.clear()
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(0)
  })

  test('getPluginConditionSyntaxKeys returns all when no namespace given', () => {
    usePluginConditionSyntaxStore.getState().register([
      { key: 'HasMail', namespace: 'MailFrameworkMod' },
      { key: 'IsFestival', namespace: 'FestivalsPlus' },
    ])
    expect(getPluginConditionSyntaxKeys()).toHaveLength(2)
  })

  test('getPluginConditionSyntaxKeys filters by namespace', () => {
    usePluginConditionSyntaxStore.getState().register([
      { key: 'HasMail', namespace: 'MailFrameworkMod' },
      { key: 'HasQuest', namespace: 'MailFrameworkMod' },
      { key: 'IsFestival', namespace: 'FestivalsPlus' },
    ])
    expect(getPluginConditionSyntaxKeys('MailFrameworkMod')).toHaveLength(2)
    expect(getPluginConditionSyntaxKeys('FestivalsPlus')).toHaveLength(1)
    expect(getPluginConditionSyntaxKeys('Unknown')).toHaveLength(0)
  })

  test('findPluginConditionSyntaxKey matches case-insensitively', () => {
    usePluginConditionSyntaxStore.getState().register([{ key: 'HasMail', namespace: 'MailFrameworkMod' }])
    expect(findPluginConditionSyntaxKey('hasmail')?.key).toBe('HasMail')
    expect(findPluginConditionSyntaxKey('  HasMail  ')?.namespace).toBe('MailFrameworkMod')
    expect(findPluginConditionSyntaxKey('Nope')).toBeUndefined()
  })

  test('pluginConditionSyntaxToTokens converts keys to CpTokenDefinition entries', () => {
    const tokens = pluginConditionSyntaxToTokens([
      { key: 'HasMail', namespace: 'MailFrameworkMod' },
      { key: 'IsFestival', namespace: 'FestivalsPlus' },
    ])
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({
      name: 'HasMail',
      group: 'specialized',
      takesInput: false,
      inputOptional: false,
    })
    expect(tokens[1].name).toBe('IsFestival')
    expect(tokens[1].group).toBe('specialized')
  })

  test('pluginConditionSyntaxToTokens returns empty array for no keys', () => {
    expect(pluginConditionSyntaxToTokens([])).toEqual([])
  })
})
