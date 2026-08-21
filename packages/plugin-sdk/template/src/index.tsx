/**
 * Example plugin entry point for ModForge Studio compat plugins.
 * The host loads the bundled output via `import('plugin://<pluginId>/index.js')`.
 *
 * JSX works out of the box: the build uses the automatic runtime, and the
 * host's import map resolves `react/jsx-runtime` (plus `react`, `react-dom`
 * and `@modforge/plugin-sdk`) to the host singletons — never bundle them.
 *
 * This page shows the shared design-system controls exposed via `ctx.components`
 * (PanelFrame, PanelSection, CompactSelect, EmptyStateCard) plus the host-global
 * `control-button control-button-primary` classes. Every user-visible string
 * goes through `ctx.i18n.t(...)`. The template ships without an i18n bundle,
 * so before shipping add these keys to your plugin manifest's `i18n` section:
 *
 *   myPlugin.page.title          myPlugin.page.subtitle
 *   myPlugin.section.title       myPlugin.select.ariaLabel
 *   myPlugin.select.option.parsnip    myPlugin.select.option.starfruit
 *   myPlugin.select.option.none  myPlugin.empty.title  myPlugin.empty.detail
 *   myPlugin.action.reset
 */
import { useState } from 'react'
import type { PluginCompactSelectOption, PluginModule, PluginContext } from '@modforge/plugin-sdk'

const plugin: PluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx: PluginContext) {
    const { i18n } = ctx
    const { PanelFrame, PanelSection, CompactSelect, EmptyStateCard } = ctx.components

    const snackOptions: PluginCompactSelectOption<string>[] = [
      { value: 'parsnip', label: i18n.t('myPlugin.select.option.parsnip') },
      { value: 'starfruit', label: i18n.t('myPlugin.select.option.starfruit') },
      { value: 'none', label: i18n.t('myPlugin.select.option.none') },
    ]

    // The page component is defined inside `activate` so it can close over the
    // context's components; the host renders it as the registered page.
    const MyPluginPage = () => {
      const [snack, setSnack] = useState<string>('parsnip')

      return (
        <PanelFrame title={i18n.t('myPlugin.page.title')} subtitle={i18n.t('myPlugin.page.subtitle')}>
          <PanelSection title={i18n.t('myPlugin.section.title')}>
            <CompactSelect value={snack} options={snackOptions} onChange={setSnack} ariaLabel={i18n.t('myPlugin.select.ariaLabel')} />
            {snack === 'none' ? (
              <EmptyStateCard title={i18n.t('myPlugin.empty.title')} detail={i18n.t('myPlugin.empty.detail')} />
            ) : (
              <button type="button" className="control-button control-button-primary" onClick={() => setSnack('parsnip')}>
                {i18n.t('myPlugin.action.reset')}
              </button>
            )}
          </PanelSection>
        </PanelFrame>
      )
    }

    ctx.registerPage({
      id: 'my-page',
      section: 'tools',
      order: 500,
      icon: 'package',
      titleKey: 'myPlugin.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: MyPluginPage,
    })

    ctx.onDispose(() => {
      // Clean up any resources, event listeners, etc.
    })
  },
}

export default plugin
