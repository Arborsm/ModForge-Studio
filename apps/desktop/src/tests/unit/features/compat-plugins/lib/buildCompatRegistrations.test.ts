import { describe, expect, test } from 'vite-plus/test'
import { buildCompatRegistrations } from '@features/compat-plugins'
import type { CompatPluginSummary } from '@features/compat-plugins'

function plugin(overrides: Partial<CompatPluginSummary> = {}): CompatPluginSummary {
  return {
    id: 'arborsm.test-plugin',
    name: 'Test Plugin',
    format: 1,
    hasCodeEntry: false,
    targets: ['SomeMod'],
    pageIds: ['test-page'],
    pages: [
      {
        id: 'test-page',
        section: 'tools',
        order: 100,
        icon: 'images',
        titleKey: 'test.page.title',
        presentation: 'standalone',
        projectAccess: 'read',
        source: null,
        layout: null,
        sections: [],
      },
    ],
    i18n: {},
    loadError: null,
    ...overrides,
  }
}

describe('buildCompatRegistrations', () => {
  test('prefixes module id with compat-', () => {
    const registrations = buildCompatRegistrations([plugin()])
    expect(registrations).toHaveLength(1)
    expect(registrations[0].id).toBe('compat-arborsm.test-plugin:test-page')
  })

  test('uses pluginLabel for navigation', () => {
    const registrations = buildCompatRegistrations([plugin()])
    expect(registrations[0].navigation.labelKey).toBeUndefined()
    expect(registrations[0].navigation.pluginLabel).toEqual({
      pluginId: 'arborsm.test-plugin',
      key: 'test.page.title',
    })
  })

  test('clamps unknown section to tools', () => {
    const registrations = buildCompatRegistrations([
      plugin({
        pages: [
          {
            id: 'p',
            section: 'unknown-section',
            order: 1,
            icon: 'images',
            titleKey: 'k',
            presentation: 'standalone',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
          },
        ],
      }),
    ])
    expect(registrations[0].navigation.section).toBe('tools')
  })

  test('clamps unknown icon to package', () => {
    const registrations = buildCompatRegistrations([
      plugin({
        pages: [
          {
            id: 'p',
            section: 'tools',
            order: 1,
            icon: 'nonexistent',
            titleKey: 'k',
            presentation: 'standalone',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
          },
        ],
      }),
    ])
    expect(registrations[0].navigation.icon).toBe('package')
  })

  test('clamps unknown presentation to standalone', () => {
    const registrations = buildCompatRegistrations([
      plugin({
        pages: [
          {
            id: 'p',
            section: 'tools',
            order: 1,
            icon: 'images',
            titleKey: 'k',
            presentation: 'weird',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
          },
        ],
      }),
    ])
    expect(registrations[0].presentation).toBe('standalone')
  })

  test('clamps unknown projectAccess to none', () => {
    const registrations = buildCompatRegistrations([
      plugin({
        pages: [
          {
            id: 'p',
            section: 'tools',
            order: 1,
            icon: 'images',
            titleKey: 'k',
            presentation: 'standalone',
            projectAccess: 'invalid',
            source: null,
            layout: null,
            sections: [],
          },
        ],
      }),
    ])
    expect(registrations[0].projectAccess).toBe('none')
  })

  test('returns empty for plugins with no pages', () => {
    const registrations = buildCompatRegistrations([plugin({ pages: [], pageIds: [] })])
    expect(registrations).toHaveLength(0)
  })

  test('returns empty for empty plugin list', () => {
    expect(buildCompatRegistrations([])).toHaveLength(0)
  })

  test('builds multiple registrations for multiple pages', () => {
    const registrations = buildCompatRegistrations([
      plugin({
        pages: [
          {
            id: 'a',
            section: 'tools',
            order: 1,
            icon: 'images',
            titleKey: 'a',
            presentation: 'standalone',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
          },
          {
            id: 'b',
            section: 'tools',
            order: 2,
            icon: 'images',
            titleKey: 'b',
            presentation: 'standalone',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
          },
        ],
      }),
    ])
    expect(registrations).toHaveLength(2)
    expect(registrations[0].id).toBe('compat-arborsm.test-plugin:a')
    expect(registrations[1].id).toBe('compat-arborsm.test-plugin:b')
  })
})
