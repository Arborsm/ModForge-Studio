import type { PluginContext, PluginModule } from '@modforge/plugin-sdk'
import { AlternativeTexturesPage } from './AlternativeTexturesPage.js'

const pluginModule: PluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx: PluginContext) {
    ctx.registerPage({
      id: 'at-texture-editor',
      section: 'tools',
      order: 900,
      icon: 'images',
      titleKey: 'at.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: () => <AlternativeTexturesPage ctx={ctx} />,
    })
  },
}

export default pluginModule
