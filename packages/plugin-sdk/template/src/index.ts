/**
 * Example plugin entry point for ModForge Studio compat plugins.
 * The host loads this via `import('plugin://<pluginId>/index.js')`.
 */
import type { PluginModule, PluginContext } from '@modforge/plugin-sdk'

const MyPluginPage = () => {
  const root = document.createElement('div')
  root.textContent = 'Hello from My Plugin!'
  return root
}

const plugin: PluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx: PluginContext) {
    ctx.registerPage({
      id: 'my-page',
      section: 'tools',
      order: 500,
      icon: 'package',
      titleKey: 'myPlugin.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: MyPluginPage as any,
    })

    ctx.onDispose(() => {
      // Clean up any resources, event listeners, etc.
    })
  },
}

export default plugin
