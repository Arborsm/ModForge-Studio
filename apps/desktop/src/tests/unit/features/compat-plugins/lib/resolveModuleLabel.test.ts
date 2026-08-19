import { describe, expect, test } from 'vite-plus/test'
import { resolveModuleLabel } from '@features/compat-plugins'
import type { WorkbenchModuleRegistration } from '@shared/contracts'

function builtinModule(labelKey: WorkbenchModuleRegistration['navigation']['labelKey'] & string): WorkbenchModuleRegistration {
  return {
    id: 'map-browser',
    navigation: { section: 'browse', order: 10, icon: 'map', labelKey },
    presentation: 'browser',
    projectAccess: 'none',
    createRuntime: () => null as never,
    persistenceKey: 'map-browser',
  }
}

function pluginModule(pluginId: string, key: string): WorkbenchModuleRegistration {
  return {
    id: 'compat-test:test-page',
    navigation: { section: 'tools', order: 100, icon: 'images', pluginLabel: { pluginId, key } },
    presentation: 'standalone',
    projectAccess: 'read',
    createRuntime: () => null as never,
    persistenceKey: 'compat-test:test-page',
  }
}

const moduleLabels = {
  'map-browser': 'Maps',
  'event-browser': 'Events',
} as const

describe('resolveModuleLabel', () => {
  test('resolves built-in labelKey via typed moduleLabels', () => {
    const label = resolveModuleLabel(builtinModule('map-browser'), moduleLabels, {}, 'en-US')
    expect(label).toBe('Maps')
  })

  test('resolves plugin label via plugin locale bundle', () => {
    const bundles = {
      'arborsm.test': {
        'en-US': { 'test.page.title': 'Test Page' },
      },
    }
    const label = resolveModuleLabel(pluginModule('arborsm.test', 'test.page.title'), moduleLabels, bundles, 'en-US')
    expect(label).toBe('Test Page')
  })

  test('falls back to key when plugin bundle is missing', () => {
    const label = resolveModuleLabel(pluginModule('arborsm.missing', 'test.page.title'), moduleLabels, {}, 'en-US')
    expect(label).toBe('test.page.title')
  })

  test('falls back to key when locale is missing in bundle', () => {
    const bundles = {
      'arborsm.test': {
        'zh-CN': { 'test.page.title': '测试页面' },
      },
    }
    const label = resolveModuleLabel(pluginModule('arborsm.test', 'test.page.title'), moduleLabels, bundles, 'en-US')
    expect(label).toBe('test.page.title')
  })

  test('falls back to key when entry is missing in locale bundle', () => {
    const bundles = {
      'arborsm.test': {
        'en-US': { 'other.key': 'Other' },
      },
    }
    const label = resolveModuleLabel(pluginModule('arborsm.test', 'test.page.title'), moduleLabels, bundles, 'en-US')
    expect(label).toBe('test.page.title')
  })

  test('falls back to labelKey when typed lookup misses', () => {
    const label = resolveModuleLabel(builtinModule('dev-resource-browser'), moduleLabels, {}, 'en-US')
    expect(label).toBe('dev-resource-browser')
  })
})
