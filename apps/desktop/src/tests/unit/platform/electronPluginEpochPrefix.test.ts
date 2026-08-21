import { describe, expect, test } from 'vite-plus/test'
import { stripPluginEpochPrefix } from '@shared/lib/pluginEpochPrefix'

describe('stripPluginEpochPrefix (Electron handler mirror)', () => {
  test('strips a valid epoch segment', () => {
    expect(stripPluginEpochPrefix('__v1/index.js')).toBe('index.js')
    expect(stripPluginEpochPrefix('__v42/assets/ui.js')).toBe('assets/ui.js')
    expect(stripPluginEpochPrefix('__v0/index.js')).toBe('index.js')
  })

  test('strips only the leading segment', () => {
    expect(stripPluginEpochPrefix('__v3/sub/dir/file.js')).toBe('sub/dir/file.js')
    expect(stripPluginEpochPrefix('dir/__v1/file.js')).toBe('dir/__v1/file.js')
  })

  test('leaves paths without a prefix untouched', () => {
    expect(stripPluginEpochPrefix('index.js')).toBe('index.js')
    expect(stripPluginEpochPrefix('assets/ui.js')).toBe('assets/ui.js')
    expect(stripPluginEpochPrefix('')).toBe('')
  })

  test('rejects forged prefixes', () => {
    expect(stripPluginEpochPrefix('__v/index.js')).toBe('__v/index.js')
    expect(stripPluginEpochPrefix('__v1x/index.js')).toBe('__v1x/index.js')
    expect(stripPluginEpochPrefix('..__v1__/index.js')).toBe('..__v1__/index.js')
    expect(stripPluginEpochPrefix('__v/')).toBe('__v/')
  })

  test('strips epoch with no trailing path to empty', () => {
    expect(stripPluginEpochPrefix('__v1')).toBe('')
  })
})
