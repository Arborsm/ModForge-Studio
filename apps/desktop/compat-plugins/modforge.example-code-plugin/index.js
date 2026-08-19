/**
 * Example code plugin entry point. Demonstrates the SDK surface:
 * - registerPage with a React component
 * - components (PanelFrame, PanelSection, EmptyStateCard, CompactSelect)
 * - commands (resolveTargetModRoot, readPluginAsset)
 * - capabilities (plugin.id)
 * - i18n (t)
 * - onDispose (cleanup hook)
 */
import React from 'react'
import { PluginContext, PluginModule } from '@modforge/plugin-sdk'

function ExamplePage({ ctx }) {
  const [assetContent, setAssetContent] = React.useState('')
  const [modRoot, setModRoot] = React.useState(null)

  React.useEffect(() => {
    // Demonstrate commands: resolve target mod root
    ctx.commands
      .invoke('resolveTargetModRoot')
      .then(setModRoot)
      .catch(() => setModRoot(null))
    // Demonstrate commands: read a plugin asset
    ctx.commands
      .invoke('readPluginAsset', { path: 'manifest.json' })
      .then(setAssetContent)
      .catch(() => setAssetContent('Failed to read asset'))
  }, [ctx])

  const { PanelFrame, PanelSection, EmptyStateCard } = ctx.components
  const pluginId = ctx.capabilities.get('plugin.id')

  return React.createElement(
    PanelFrame,
    { title: ctx.i18n.t('example.component.demo') },
    React.createElement(
      PanelSection,
      { title: ctx.i18n.t('example.greeting') },
      React.createElement('p', null, ctx.i18n.t('example.capability').replace('{pluginId}', pluginId)),
      React.createElement('p', null, 'Target mod root: ' + (modRoot || 'N/A')),
      React.createElement('pre', { style: { maxHeight: '200px', overflow: 'auto', fontSize: '12px' } }, assetContent.slice(0, 500)),
    ),
    React.createElement(
      PanelSection,
      { title: 'EmptyStateCard demo' },
      React.createElement(EmptyStateCard, { title: 'Demo', detail: 'Design system component', density: 'compact' }),
    ),
  )
}

const pluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx) {
    ctx.registerPage({
      id: 'example-code-page',
      section: 'tools',
      order: 990,
      icon: 'code',
      titleKey: 'example.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: () => React.createElement(ExamplePage, { ctx }),
    })

    // Demonstrate onDispose
    ctx.onDispose(() => {
      console.log('[example-code-plugin] Disposing')
    })
  },
}

export default pluginModule
