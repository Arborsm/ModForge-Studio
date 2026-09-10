import type { GuidesCopy } from '../../model'

const guides: GuidesCopy = {
  controls: {
    previous: 'Previous',
    next: 'Next',
    skip: 'Skip',
    finish: 'Done',
    stepCounter: (current, total) => `${current} / ${total}`,
    anchorClickHint: 'Click the highlighted area to continue',
  },
  replayPendingTitle: 'The guide will play on its page',
  replayPendingDescription: (guideTitle) => `Open the page for "${guideTitle}" and the guide starts automatically.`,
  definitions: {
    'launcher-library': {
      title: 'Mod Library',
      steps: {
        welcome: {
          title: 'Welcome to the Mod Library',
          description: 'Every installed Stardew Valley mod lives here: browse, search, sort, toggle, and update them in one place.',
        },
        'nav-tabs': {
          title: 'Page navigation',
          description: 'Switch between Library, Discover, Updates, and Diagnostics. Badges highlight pending updates and downloads.',
        },
        'library-toolbar': {
          title: 'Search and view',
          description: 'Search mods by name, adjust sorting and grid density, or switch between list and grid views.',
        },
        'pack-sidebar': {
          title: 'Pack sidebar',
          description: 'Organize mods into packs and folders with drag and drop, and manage groups of mods together.',
        },
        'mod-grid': {
          title: 'Mod grid',
          description:
            'Each card shows the cover, version, and status. Drag cards to reorder or file them into packs, right-click for more actions.',
        },
        'mod-detail': {
          title: 'Mod details',
          description: 'Select a mod to read its description, review dependencies and files, then update, roll back, or uninstall it here.',
        },
      },
    },
    'launcher-discover': {
      title: 'Discover Mods',
      steps: {
        welcome: {
          title: 'Discover new mods',
          description: 'Search Nexus Mods for Stardew Valley content and download finds straight into your library.',
        },
        'discover-search': {
          title: 'Search mods',
          description: 'Type keywords to search Nexus Mods, then press Enter or the button to run the query.',
        },
        'discover-toolbar': {
          title: 'Filter and sort',
          description: 'Narrow results by time range, sort order, and page size to surface the most relevant mods.',
        },
        'discover-results': {
          title: 'Results and downloads',
          description: 'Browse mod cards for details, then queue a download — mods install automatically once fetched.',
        },
      },
    },
    'launcher-updates': {
      title: 'Mod Updates',
      steps: {
        welcome: {
          title: 'Keep mods up to date',
          description: 'Every mod with an available update is listed here, ready for one-by-one or batch updates.',
        },
        'updates-check': {
          title: 'Check for updates',
          description: 'Refresh the list manually and compare each installed version with the latest release.',
        },
        'updates-list': {
          title: 'Update list',
          description: 'Read changelogs, then update now or skip a specific version.',
        },
      },
    },
    'launcher-configuration': {
      title: 'Launcher Diagnostics',
      steps: {
        welcome: {
          title: 'Diagnose the launcher',
          description: 'Game paths, your Nexus account, and diagnostics are all maintained here.',
        },
        'config-game': {
          title: 'Game and paths',
          description:
            'Point the launcher at your Stardew Valley game directory and SMAPI install — the foundation for mod installs and launches.',
        },
        'config-nexus': {
          title: 'Nexus account',
          description: 'Sign in to Nexus Mods to enable downloads, update checks, and collection sync.',
        },
        'config-diagnostics': {
          title: 'Diagnostics',
          description: 'When connections or parsing misbehave, inspect per-service diagnostics here.',
        },
      },
    },
    'workbench-home': {
      title: 'Workbench',
      steps: {
        welcome: {
          title: 'Welcome to the Workbench',
          description:
            'The workbench is where Stardew Valley mods are made: manage projects, edit content, and generate localization files.',
        },
        'workbench-nav': {
          title: 'Module navigation',
          description: 'Browse the project dashboard, content editors, and tools by function, then jump into a module.',
        },
        'workbench-modules': {
          title: 'Projects and modules',
          description: 'Open or create a mod project and enter workspaces for events, items, characters, and more.',
        },
      },
    },
    'workbench-translation': {
      title: 'Localization Center',
      steps: {
        welcome: {
          title: 'Localization Center',
          description:
            'Generate and maintain translations for your mods, keeping terminology consistent with the knowledge base and official corpus.',
        },
        'translation-views': {
          title: 'Translation views',
          description: 'Switch between AI localization, the knowledge center, the official corpus, and quality history.',
        },
        'translation-knowledge': {
          title: 'Knowledge and corpus',
          description: 'Capture terminology and proven translations so every new translation reuses your previous work.',
        },
      },
    },
    'workbench-map': {
      title: 'Map Editor',
      steps: {
        welcome: {
          title: 'Map Editor',
          description:
            'Edit Stardew Valley maps: paint tiles, add warps and doors, manage layers, and export changes as Content Patcher patches or direct map assets.',
        },
        'map-catalog-card': {
          title: 'Choose a game map',
          description: 'Click a map card to create a patch, or use "Import & edit file" to edit the map file directly.',
        },
        'map-layer-list': {
          title: 'Select a layer',
          description: 'Maps are composed of layers (Back, Buildings, Front, etc.). Pick the layer you want to paint on.',
        },
        'map-tileset-palette': {
          title: 'Pick a tile',
          description: 'Open the palette tab and select a tile or tile region from the tilesheet to use as your brush.',
        },
        'map-canvas': {
          title: 'Paint on the canvas',
          description:
            'Drag on the canvas to paint with the selected tile. Use the tool rail to switch between brush, fill, erase, and more.',
        },
        'map-inspector-map': {
          title: 'Add warps and doors',
          description:
            'The Inspector > Content tab manages warps, doors and day/night swaps. Use Add, then pick the cell right inside the dialog. Music and ambient light live in the editor top bar.',
        },
        'map-save-button': {
          title: 'Save your changes',
          description: 'Press Ctrl+S or click the save button to write changes back to the patch or map asset.',
        },
      },
    },
  },
}

export default guides
