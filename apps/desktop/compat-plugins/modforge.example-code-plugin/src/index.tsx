/**
 * Example code plugin: a Stardew item-dex memory match game.
 * Exercises the full SDK surface in one real interaction flow:
 * - registerPage with a stateful React component (shared React instance)
 * - components (PanelFrame / EmptyStateCard / CompactSelect)
 * - game asset commands: loadGameDataAsset (Data/Objects), loadGameImage
 *   (Maps/springobjects atlas, cropped and upscaled 4x with smoothing off),
 *   scanGameAudio + loadGameAudioCue (XACT music cues as BGM, sound cues as SFX)
 * - resolveGameRoot fallback: without a game directory the game deals emoji
 *   faces from the bundled cards.json (readPluginAsset)
 * - notifications (win toast with session-best note; retracted on dispose)
 * - capabilities (plugin.id, host.locale for localized item names)
 * - i18n (t) for all user-visible copy
 * - module state + onDispose (session bests and the audio cache are cleared)
 * Styling lives in styles.css (declared via the manifest "styles" field; the
 * host injects it and removes it on unload) with all colors from the host
 * design tokens (var(--…)).
 */
import { MemoryMatchPage } from './MemoryMatchPage.js'
import { stopBgm, clearAudioCache } from './audio.js'
import { clearBests } from './game.js'
import type { PluginModule, PluginContext } from '@modforge/plugin-sdk'

const pluginModule: PluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx: PluginContext) {
    ctx.registerPage({
      id: 'example-code-page',
      section: 'tools',
      order: 990,
      icon: 'beaker',
      titleKey: 'example.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: () => <MemoryMatchPage ctx={ctx} />,
    })

    // Session bests and decoded audio live in module scope; dispose clears them.
    ctx.onDispose(() => {
      clearBests()
      stopBgm()
      clearAudioCache()
    })
  },
}

export default pluginModule
