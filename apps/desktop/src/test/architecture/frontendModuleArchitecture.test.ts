import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

async function expectFile(path: string) {
  await expect(access(path)).resolves.toBeUndefined()
}

async function collectSourceFiles(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true })
    const nestedFiles = await Promise.all(
      entries.map((entry) => {
        const entryPath = resolve(rootPath, entry.name)

        if (entry.isDirectory()) {
          return collectSourceFiles(entryPath)
        }

        if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          return [entryPath]
        }

        return []
      }),
    )

    return nestedFiles.flat()
  } catch {
    return []
  }
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]

      if (specifier) {
        specifiers.push(specifier)
      }
    }
  }

  return specifiers
}

function topLevelFeatureFromPath(filePath: string): string | null {
  const relativePath = relative(sourcePath('src/features'), filePath)
  const [featureName] = relativePath.split(/[\\/]/)

  if (!featureName || featureName === '..' || featureName.startsWith('..')) {
    return null
  }

  return featureName
}

function topLevelFeatureFromSpecifier(filePath: string, specifier: string): string | null {
  if (specifier.startsWith('@features/')) {
    return specifier.slice('@features/'.length).split('/')[0] ?? null
  }

  if (!specifier.startsWith('.')) {
    return null
  }

  const resolvedImportPath = resolve(dirname(filePath), specifier)
  const relativeToFeatures = relative(sourcePath('src/features'), resolvedImportPath)

  if (relativeToFeatures.startsWith('..') || relativeToFeatures === '') {
    return null
  }

  return topLevelFeatureFromPath(resolvedImportPath)
}

describe('frontend module architecture', () => {
  it('exposes the FSD foundation roots and mounts app/App directly', async () => {
    await expectFile(sourcePath('src/app/App.tsx'))
    await expectFile(sourcePath('src/app/App.test.tsx'))
    await expectFile(sourcePath('src/app/app-shell/index.ts'))
    await expectFile(sourcePath('src/app/providers/PlatformProvider.tsx'))
    await expectFile(sourcePath('src/app/providers/platformContext.ts'))
    await expectFile(sourcePath('src/app/providers/usePlatformPorts.ts'))
    await expectFile(sourcePath('src/app/registry-setup.ts'))
    await expect(access(sourcePath('src/pages/index.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/widgets/index.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/entities/index.ts'))).rejects.toThrow()
    await expectFile(sourcePath('src/shared/contracts/registry.ts'))
    await expectFile(sourcePath('src/shared/contracts/events.ts'))
    await expectFile(sourcePath('src/shared/contracts/commands.ts'))
    await expectFile(sourcePath('src/shared/contracts/platform.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/index.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/workspaceLayout.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/workspaceRuntime.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/cpMaker.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/desktop.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/appUiState.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/modBrowser.ts'))
    await expect(access(sourcePath('src/shared/contracts/types/panelTypes.ts'))).rejects.toThrow()
    await expectFile(sourcePath('src/shared/contracts/types/viewport.ts'))
    await expectFile(sourcePath('src/shared/contracts/types/maps.ts'))
    await expectFile(sourcePath('src/platform/tauri/index.ts'))

    const mainEntry = await readFile(sourcePath('src/main.tsx'), 'utf8')
    const appEntry = await readFile(sourcePath('src/app/App.tsx'), 'utf8')
    const appShellBridge = await readFile(sourcePath('src/app/app-shell/index.ts'), 'utf8')

    await expect(access(sourcePath('src/App.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/App.test.tsx'))).rejects.toThrow()
    expect(mainEntry).toContain("from '@app/App'")
    expect(mainEntry).not.toContain("from './App'")
    expect(appEntry).toContain("from '@app/app-shell/AppShell'")
    expect(appEntry).toContain("from '@app/providers/PlatformProvider'")
    expect(appShellBridge).toContain("from './AppShell'")
  })

  it('defines shared contracts without creating runtime instances in shared', async () => {
    const registry = await readFile(sourcePath('src/shared/contracts/registry.ts'), 'utf8')
    const events = await readFile(sourcePath('src/shared/contracts/events.ts'), 'utf8')
    const commands = await readFile(sourcePath('src/shared/contracts/commands.ts'), 'utf8')
    const platform = await readFile(sourcePath('src/shared/contracts/platform.ts'), 'utf8')
    const registrySetup = await readFile(sourcePath('src/app/registry-setup.ts'), 'utf8')

    expect(registry).toContain('export type RegistryItemKind')
    expect(registry).toContain('export type WorkbenchViewRegistration')
    expect(registry).toContain('export interface AppRegistry')
    expect(registry).not.toContain('createAppRegistry(')
    expect(registry).not.toContain('new Map')
    expect(events).toContain('export type AppEvent')
    expect(events).toContain('export type WorkbenchEvent')
    expect(events).toContain('export type CpMakerEvent')
    expect(commands).toContain('export type AppCommand')
    expect(commands).toContain('export interface CommandDispatcher')
    expect(commands).toContain('export type NavigationCommand')
    expect(platform).toContain('export interface FileSystemPort')
    expect(platform).toContain('export interface DesktopWindowPort')
    expect(platform).toContain('export interface StoragePort')
    expect(platform).toContain('export interface DialogPort')
    expect(platform).toContain('export interface PlatformPorts')
    expect(registrySetup).toContain('createAppRegistry(')
    expect(registrySetup).toContain("viewId: 'studio-desk'")
    expect(registrySetup).toContain("viewId: 'workspace-editor'")
    expect(registrySetup).toContain("panelId: 'assets'")
    expect(registrySetup).toContain("panelId: 'viewport'")
    expect(registrySetup).toContain('getWorkbenchViewRegistration')
    expect(registrySetup).toContain('getWorkspacePanelRegistration')
  })

  it('provides platform ports from the app layer through the Tauri adapter', async () => {
    const provider = await readFile(sourcePath('src/app/providers/PlatformProvider.tsx'), 'utf8')
    const tauriAdapter = await readFile(sourcePath('src/platform/tauri/index.ts'), 'utf8')

    expect(provider).toContain('PlatformProvider')
    const platformContext = await readFile(sourcePath('src/app/providers/platformContext.ts'), 'utf8')
    const usePlatformPorts = await readFile(sourcePath('src/app/providers/usePlatformPorts.ts'), 'utf8')

    expect(platformContext).toContain('createContext<PlatformPorts')
    expect(usePlatformPorts).toContain('usePlatformPorts')
    expect(tauriAdapter).toContain("from '@shared/contracts'")
    expect(tauriAdapter).toContain("from '@tauri-apps/api/core'")
    expect(tauriAdapter).toContain("from '@tauri-apps/api/window'")
    expect(tauriAdapter).toContain("from '@tauri-apps/plugin-dialog'")
    expect(tauriAdapter).toContain('createTauriPlatformPorts')
  })

  it('keeps new layer path aliases synchronized across TypeScript, Vite, and Vitest', async () => {
    const tsconfig = await readFile(sourcePath('tsconfig.app.json'), 'utf8')
    const viteConfig = await readFile(sourcePath('vite.config.ts'), 'utf8')
    const vitestConfig = await readFile(sourcePath('vitest.config.ts'), 'utf8')

    for (const alias of ['@app', '@pages', '@widgets', '@entities', '@shared']) {
      expect(tsconfig).toContain(`"${alias}/*"`)
      expect(viteConfig).toContain(`'${alias}'`)
      expect(vitestConfig).toContain(`'${alias}'`)
    }
  })

  it('blocks direct Tauri imports and invoke calls from new business layers', async () => {
    const scannedRoots = ['src/pages', 'src/widgets', 'src/features', 'src/entities', 'src/shared']
    const sourceFiles = await Promise.all(scannedRoots.map((root) => collectSourceFiles(sourcePath(root))))
    const violations: string[] = []

    for (const filePath of sourceFiles.flat()) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = filePath.replace(`${process.cwd()}/`, '')

      if (source.includes('@tauri-apps/api')) {
        violations.push(`${relativePath} imports @tauri-apps/api`)
      }

      if (/\binvoke\s*\(/.test(source)) {
        violations.push(`${relativePath} calls invoke(`)
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps widgets free of platform adapter imports and direct desktop bridge calls', async () => {
    const sourceFiles = await collectSourceFiles(sourcePath('src/widgets'))
    const violations: string[] = []

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = filePath.replace(`${process.cwd()}/`, '')

      if (source.includes('@platform/')) {
        violations.push(`${relativePath} imports @platform`)
      }

      if (source.includes('@tauri-apps/api')) {
        violations.push(`${relativePath} imports @tauri-apps/api`)
      }

      if (/\binvoke\s*\(/.test(source)) {
        violations.push(`${relativePath} calls invoke(`)
      }
    }

    expect(violations).toEqual([])
  })

  it(
    'blocks direct @platform/desktop imports from cp-maker production code',
    async () => {
      const sourceFiles = await collectSourceFiles(sourcePath('src/features/cp-maker'))
      const violations: string[] = []

      for (const filePath of sourceFiles) {
        if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) {
          continue
        }

        const source = await readFile(filePath, 'utf8')
        const relativePath = filePath.replace(`${process.cwd()}/`, '')

        if (source.includes('@platform/desktop')) {
          violations.push(`${relativePath} imports @platform/desktop`)
        }

        if (source.includes('@tauri-apps/api')) {
          violations.push(`${relativePath} imports @tauri-apps/api`)
        }

        if (/\binvoke\s*\(/.test(source)) {
          violations.push(`${relativePath} calls invoke(`)
        }
      }

      expect(violations).toEqual([])
    },
    10000,
  )

  it('routes the app entry through the new module roots', async () => {
    const mainSource = await readFile(sourcePath('src/main.tsx'), 'utf8')
    const appShellSource = await readFile(sourcePath('src/app/app-shell/AppShell.tsx'), 'utf8')
    const registrySetupSource = await readFile(sourcePath('src/app/registry-setup.ts'), 'utf8')
    const workbenchSource = await readFile(sourcePath('src/pages/workbench/ui/WorkbenchPage.tsx'), 'utf8')
    const launcherSource = await readFile(sourcePath('src/pages/launcher/LauncherPage.tsx'), 'utf8')
    const launcherShellSource = await readFile(sourcePath('src/pages/launcher/ui/LauncherShell.tsx'), 'utf8')
    const workbenchExperienceSource = await readFile(sourcePath('src/pages/workbench/ui/WorkbenchExperience.tsx'), 'utf8')
    const workbenchLayoutHostSource = await readFile(sourcePath('src/pages/workbench/ui/WorkbenchLayoutHost.tsx'), 'utf8')
    const workbenchViewHostSource = await readFile(sourcePath('src/pages/workbench/ui/WorkbenchViewHost.tsx'), 'utf8')
    const editWorkspaceContentSource = await readFile(sourcePath('src/features/cp-maker/ui/EditWorkspaceContent.tsx'), 'utf8')
    const cpMakerPublicApiSource = await readFile(sourcePath('src/features/cp-maker/index.ts'), 'utf8')
    const patchListPageSource = await readFile(sourcePath('src/features/cp-maker/ui/PatchListPage.tsx'), 'utf8')
    const workspacePanelsCoreSource = await readFile(sourcePath('src/pages/workbench/model/workspace-panels/core.tsx'), 'utf8')
    const sharedTypesWorkspaceLayout = await readFile(sourcePath('src/shared/contracts/types/workspaceLayout.ts'), 'utf8')
    const sharedTypesWorkspaceRuntime = await readFile(sourcePath('src/shared/contracts/types/workspaceRuntime.ts'), 'utf8')
    const sharedTypesCpMaker = await readFile(sourcePath('src/shared/contracts/types/cpMaker.ts'), 'utf8')
    const sharedTypesModBrowser = await readFile(sourcePath('src/shared/contracts/types/modBrowser.ts'), 'utf8')
    const sharedTypesViewport = await readFile(sourcePath('src/shared/contracts/types/viewport.ts'), 'utf8')
    const mapEntityTypes = await readFile(sourcePath('src/entities/map/lib/types.ts'), 'utf8')

    expect(mainSource).toContain("from '@app/App'")
    expect(appShellSource).toContain("import('@pages/workbench')")
    expect(registrySetupSource).toContain("from '@features/cp-maker'")
    expect(registrySetupSource).not.toContain("from '@pages/workbench'")
    await expect(access(sourcePath('src/App.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/App.test.tsx'))).rejects.toThrow()
    expect(launcherSource).toContain("from './ui/LauncherShell'")
    expect(launcherSource).toContain('useLauncherRuntime(locale)')
    expect(launcherSource).toContain('useLauncherUpdateProgressNotifications(locale)')
    expect(launcherShellSource).toContain("from './LauncherLibraryPage'")
    expect(workbenchSource).toContain("import('./WorkbenchExperience')")
    expect(workbenchSource).not.toContain("from '../DevDebugOverlay'")
    expect(workbenchSource).not.toContain("from '../InitializationOverlay'")
    expect(workbenchSource).not.toContain("from '../PlayerAppearanceWindow'")
    expect(workbenchSource).not.toContain("from '../SettingsWindow'")
    expect(workbenchSource).not.toContain("from '../StatusBar'")
    expect(workbenchSource).not.toContain("from '../TopMenuBar'")
    expect(workbenchExperienceSource).not.toContain("from '@app/registry-setup'")
    expect(workbenchExperienceSource).toContain('getWorkbenchViewRegistration:')
    expect(workbenchExperienceSource).toContain('getWorkbenchViewRegistration(editModeRoute)')
    expect(workbenchExperienceSource).not.toContain("from '@features/cp-maker/ui/StudioDesk'")
    expect(workbenchExperienceSource).toContain("from '@features/cp-maker'")
    expect(workbenchExperienceSource).not.toContain("from '@features/cp-maker/ui")
    expect(workbenchExperienceSource).not.toContain("from '@features/cp-maker/state")
    expect(workbenchExperienceSource).not.toContain("from '@features/cp-maker/routing")
    expect(workbenchExperienceSource).not.toContain("from '@features/cp-maker/model")
    expect(workbenchExperienceSource).toContain("from '../model/workspace-panels/buildWorkspacePanels'")
    expect(workbenchExperienceSource).toContain("from '@platform/desktop'")
    expect(workbenchExperienceSource).toContain("import '../model/builtInWorkspaces'")
    expect(workbenchExperienceSource).toContain("from './WorkbenchLayoutHost'")
    expect(workbenchExperienceSource).toContain("from './WorkbenchViewHost'")
    expect(workbenchExperienceSource).not.toContain("from '@shared/workspace'")
    expect(workbenchExperienceSource).not.toContain("from '../ui/EditWorkspaceContent'")
    expect(workbenchLayoutHostSource).toContain("from '@shared/workspace'")
    expect(workbenchViewHostSource).not.toContain('workspaceLayoutRef')
    expect(workbenchViewHostSource).not.toContain('workspacePanels')
    expect(workbenchViewHostSource).not.toContain('onLayoutMetaChange')
    expect(editWorkspaceContentSource).toContain("from './EditModeShell'")
    expect(cpMakerPublicApiSource).not.toContain('EventConditionBuilderModal')
    expect(cpMakerPublicApiSource).not.toContain('EventGameStateQueryBuilderModal')
    expect(patchListPageSource).toContain("import('./EventConditionBuilderModal')")
    expect(patchListPageSource).not.toMatch(/import\s+\{\s*EventConditionBuilderModal[\s,}]/)
    expect(workspacePanelsCoreSource).toContain("from '@shared/ui/WorkspaceDeferred'")
    expect(sharedTypesWorkspaceLayout).toContain('export type DockArea')
    expect(sharedTypesWorkspaceRuntime).toContain('export type WorkspaceStatus')
    expect(sharedTypesCpMaker).toContain('export interface CpMakerDraft')
    expect(sharedTypesModBrowser).toContain('export type ModBrowserEntry')
    expect(sharedTypesViewport).toContain('export type FocusedMapObjectTarget')
    expect(mapEntityTypes).toContain("from '@shared/contracts'")
  })

  it('blocks null Suspense fallbacks in covered page-level loading entry points', async () => {
    const coveredEntryFiles = [
      'src/app/app-shell/AppShell.tsx',
      'src/pages/workbench/ui/WorkbenchPage.tsx',
      'src/pages/workbench/ui/WorkbenchExperience.tsx',
    ]
    const violations: string[] = []

    for (const file of coveredEntryFiles) {
      const source = await readFile(sourcePath(file), 'utf8')

      if (/fallback\s*=\s*\{\s*null\s*\}/.test(source)) {
        violations.push(`${file} uses fallback={null}`)
      }

      if (!source.includes('@shared/ui/loading-motion')) {
        violations.push(`${file} does not consume shared loading-motion UI`)
      }
    }

    expect(violations).toEqual([])
  })

  it('creates the new root modules and removes obsolete compatibility shims', async () => {
    await expectFile(sourcePath('src/app/app-shell/AppShell.tsx'))
    await expectFile(sourcePath('src/pages/launcher/LauncherPage.tsx'))
    await expectFile(sourcePath('src/pages/launcher/ui/LauncherShell.tsx'))
    await expectFile(sourcePath('src/pages/launcher/ui/LauncherLibraryPage.tsx'))
    await expectFile(sourcePath('src/pages/launcher/ui/LauncherDiscoverPage.tsx'))
    await expectFile(sourcePath('src/pages/launcher/ui/LauncherUpdatesPage.tsx'))
    await expectFile(sourcePath('src/pages/launcher/ui/LauncherConfigurationPage.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/WorkbenchPage.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/WorkbenchViewHost.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/WorkbenchLayoutHost.tsx'))
    await expectFile(sourcePath('src/widgets/top-navigation/ui/TopMenuBar.tsx'))
    await expectFile(sourcePath('src/widgets/status-bar/ui/StatusBar.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/DevDebugOverlay.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/InitializationOverlay.tsx'))
    await expectFile(sourcePath('src/pages/workbench/ui/PlayerAppearanceWindow.tsx'))
    await expectFile(sourcePath('src/app/app-shell/SettingsWindow.tsx'))
    await expectFile(sourcePath('src/app/App.test.tsx'))
    await expectFile(sourcePath('src/features/cp-maker/ui/EditWorkspaceContent.tsx'))
    await expect(access(sourcePath('src/pages/workbench/page.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/pages/workbench/registry.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/pages/workbench/ui/EditWorkspaceContent.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/components'))).rejects.toThrow()
    await expect(access(sourcePath('src/lib'))).rejects.toThrow()
    await expectFile(sourcePath('src/entities/event/model/gameStateQueryCatalog.ts'))
    await expectFile(sourcePath('src/entities/event/model/gameStateQuerySemantics.ts'))
    await expectFile(sourcePath('src/entities/event/model/preconditionSemantics.ts'))
    await expectFile(sourcePath('src/entities/event/model/patchHub.ts'))
    await expectFile(sourcePath('src/features/cp-maker/model/studioDeskModel.ts'))
    await expectFile(sourcePath('src/features/cp-maker/routing/editModeRoute.ts'))
    await expectFile(sourcePath('src/features/cp-maker/state/useCpMaker.ts'))
    await expectFile(sourcePath('src/features/cp-maker/index.ts'))
    await expect(access(sourcePath('src/features/cp-maker/routing/index.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/cp-maker/state/index.ts'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/cp-maker/ui/index.ts'))).rejects.toThrow()
    await expectFile(sourcePath('src/pages/workbench/model/workspace-panels/buildWorkspacePanels.tsx'))
    await expectFile(sourcePath('src/pages/workbench/model/workspace-panels/core.tsx'))
    await expectFile(sourcePath('src/pages/workbench/model/workspace-panels/items.tsx'))
    await expectFile(sourcePath('src/pages/workbench/model/workspace-panels/mods.tsx'))
    await expectFile(sourcePath('src/pages/workbench/model/workspace-panels/types.ts'))
    await expectFile(sourcePath('src/platform/desktop/index.ts'))
    await expectFile(sourcePath('src/platform/plugins/workspaceRegistry.ts'))
    await expectFile(sourcePath('src/shared/ui/WorkspaceDeferred.tsx'))
    await expectFile(sourcePath('src/features/cp-maker/ui/EventConditionBuilderModal.tsx'))
    await expectFile(sourcePath('src/features/cp-maker/ui/EventGameStateQueryBuilderModal.tsx'))
    await expect(access(sourcePath('src/shared/ui/cp-maker'))).rejects.toThrow()
    await expectFile(sourcePath('src/shared/contracts/types/cpMaker.ts'))

    await expect(access(sourcePath('src/App.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/App.test.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/pages/LauncherLibraryPage.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/pages/LauncherDiscoverPage.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/pages/LauncherUpdatesPage.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/pages/launcher/ui/LauncherDebugPage.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/pages/LauncherConfigurationPage.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/shared/LauncherDownloadsPopover.tsx'))).rejects.toThrow()
    await expect(access(sourcePath('src/features/launcher/ui/shared/LauncherProgressRing.tsx'))).rejects.toThrow()
  })

  it('keeps platform plugin modules decoupled from legacy component paths', async () => {
    const builtInWorkspaces = await readFile(sourcePath('src/pages/workbench/model/builtInWorkspaces.ts'), 'utf8')
    const workspaceRegistry = await readFile(sourcePath('src/platform/plugins/workspaceRegistry.ts'), 'utf8')
    const workspacePanelTypes = await readFile(sourcePath('src/pages/workbench/model/workspace-panels/types.ts'), 'utf8')
    const sharedTypesWorkspaceLayout = await readFile(sourcePath('src/shared/contracts/types/workspaceLayout.ts'), 'utf8')
    const sharedTypesWorkspaceRuntime = await readFile(sourcePath('src/shared/contracts/types/workspaceRuntime.ts'), 'utf8')
    const sharedTypesCpMaker = await readFile(sourcePath('src/shared/contracts/types/cpMaker.ts'), 'utf8')
    const sharedTypesModBrowser = await readFile(sourcePath('src/shared/contracts/types/modBrowser.ts'), 'utf8')
    const sharedTypesViewport = await readFile(sourcePath('src/shared/contracts/types/viewport.ts'), 'utf8')
    const mapEntityTypes = await readFile(sourcePath('src/entities/map/lib/types.ts'), 'utf8')

    expect(builtInWorkspaces).not.toContain('/components/')
    expect(workspaceRegistry).toContain("from '@shared/contracts'")
    expect(workspaceRegistry).not.toContain("from '../app/useCpMaker'")
    expect(workspaceRegistry).not.toContain("from '../../lib/app/useCpMaker'")
    expect(workspacePanelTypes).toContain("from '@shared/contracts'")
    expect(workspacePanelTypes).not.toContain("from '@entities/map/ui/MapViewport'")
    expect(sharedTypesWorkspaceLayout).toContain('export type DockArea')
    expect(sharedTypesWorkspaceRuntime).toContain('export type WorkspaceStatus')
    expect(sharedTypesCpMaker).toContain('export interface CpMakerDraft')
    expect(sharedTypesModBrowser).toContain('export type ModBrowserEntry')
    expect(sharedTypesViewport).toContain('export type FocusedMapObjectTarget')
    expect(mapEntityTypes).toContain("from '@shared/contracts'")
  })

  it(
    'blocks feature-to-feature imports',
    async () => {
      const featureFiles = await collectSourceFiles(sourcePath('src/features'))
      const featureViolations: string[] = []

      for (const filePath of featureFiles) {
        const source = await readFile(filePath, 'utf8')
        const ownerFeature = topLevelFeatureFromPath(filePath)

        if (!ownerFeature) {
          continue
        }

        for (const specifier of extractImportSpecifiers(source)) {
          const importedFeature = topLevelFeatureFromSpecifier(filePath, specifier)

          if (importedFeature && importedFeature !== ownerFeature) {
            const relativePath = filePath.replace(`${process.cwd()}/`, '')
            featureViolations.push(`${relativePath} imports ${specifier}`)
          }
        }
      }

      expect(featureViolations).toEqual([])
    },
    10000,
  )

  it(
    'blocks cp-maker segment public APIs outside the slice root',
    async () => {
      const scannedRoots = ['src/app', 'src/pages', 'src/widgets', 'src/features', 'src/platform']
      const sourceFiles = await Promise.all(scannedRoots.map((root) => collectSourceFiles(sourcePath(root))))
      const violations: string[] = []
      const blockedSpecifiers = [
        '@features/cp-maker/model',
        '@features/cp-maker/routing',
        '@features/cp-maker/state',
        '@features/cp-maker/ui',
      ]

      for (const filePath of sourceFiles.flat()) {
        if (filePath.includes(`${sourcePath('src/features/cp-maker')}\\`) || filePath.includes(`${sourcePath('src/features/cp-maker')}/`)) {
          continue
        }

        const source = await readFile(filePath, 'utf8')
        const relativePath = filePath.replace(`${process.cwd()}/`, '')

        for (const specifier of extractImportSpecifiers(source)) {
          if (blockedSpecifiers.some((blockedSpecifier) => specifier === blockedSpecifier || specifier.startsWith(`${blockedSpecifier}/`))) {
            violations.push(`${relativePath} imports ${specifier}`)
          }
        }
      }

      expect(violations).toEqual([])
    },
    30000,
  )

  it(
    'blocks removed legacy path references',
    async () => {
      const scannedRoots = [
        'src/app',
        'src/pages',
        'src/widgets',
        'src/features',
        'src/entities',
        'src/shared',
        'src/platform',
      ]
      const sourceFiles = await Promise.all(scannedRoots.map((root) => collectSourceFiles(sourcePath(root))))
      const removedPathPatterns = [
        'src/components',
        'src/lib',
        'components/',
        'components/event-workflow',
        'components/cp-maker',
        'components/map-workflow',
        'components/image-workflow',
        'map-workflow',
        'image-workflow',
      ]
      const removedPathViolations: string[] = []

      for (const filePath of sourceFiles.flat()) {
        const source = await readFile(filePath, 'utf8')
        const relativePath = filePath.replace(`${process.cwd()}/`, '')

        for (const pattern of removedPathPatterns) {
          if (source.includes(pattern)) {
            removedPathViolations.push(`${relativePath} contains ${pattern}`)
          }
        }

        for (const specifier of extractImportSpecifiers(source)) {
          if (!specifier.startsWith('.')) {
            continue
          }

          const resolvedImportPath = resolve(dirname(filePath), specifier)
          const relativeToLegacyComponents = relative(sourcePath('src/components'), resolvedImportPath)
          const relativeToLegacyLib = relative(sourcePath('src/lib'), resolvedImportPath)
          const importsLegacyComponents =
            relativeToLegacyComponents === '' || (!relativeToLegacyComponents.startsWith('..') && !relativeToLegacyComponents.startsWith('/'))
          const importsLegacyLib = relativeToLegacyLib === '' || (!relativeToLegacyLib.startsWith('..') && !relativeToLegacyLib.startsWith('/'))

          if (importsLegacyComponents || importsLegacyLib) {
            removedPathViolations.push(`${relativePath} imports ${specifier}`)
          }
        }
      }

      expect(removedPathViolations).toEqual([])
    },
    30000,
  )

  it('blocks legacy workspace paths and confirms page-owned workspace consumers', async () => {
    const scannedRoots = ['src/app', 'src/pages', 'src/widgets', 'src/features', 'src/entities', 'src/shared', 'src/platform']
    const sourceFiles = await Promise.all(scannedRoots.map((root) => collectSourceFiles(sourcePath(root))))
    const workspaceViolations: string[] = []

    for (const filePath of sourceFiles.flat()) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = filePath.replace(`${process.cwd()}/`, '')

      if (source.includes('@features/workspaces') || source.includes('features/workspaces')) {
        workspaceViolations.push(`${relativePath} contains legacy workspace path reference`)
      }
    }

    expect(workspaceViolations).toEqual([])
    await expect(access(sourcePath('src/features/workspaces'))).rejects.toThrow()

    await expectFile(sourcePath('src/pages/workbench/workspaces/event-stage/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/map/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/item/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/character/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/building/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/mod/index.ts'))
    await expectFile(sourcePath('src/pages/workbench/workspaces/image-patch/index.ts'))

    const workbenchExperienceSource = await readFile(sourcePath('src/pages/workbench/ui/WorkbenchExperience.tsx'), 'utf8')
    const builtInWorkspacesSource = await readFile(sourcePath('src/pages/workbench/model/builtInWorkspaces.ts'), 'utf8')

    expect(workbenchExperienceSource).not.toContain('@features/workspaces')
    expect(workbenchExperienceSource).toContain("from '../workspaces/event-stage'")
    expect(workbenchExperienceSource).toContain("from '../workspaces/map'")
    expect(workbenchExperienceSource).toContain("from '../workspaces/character'")
    expect(workbenchExperienceSource).toContain("from '../workspaces/building/state/useBuildingWorkspace'")
    expect(workbenchExperienceSource).toContain("from '../workspaces/item'")
    expect(workbenchExperienceSource).toContain("from '../workspaces/mod'")

    expect(builtInWorkspacesSource).not.toContain('@features/workspaces')
    expect(builtInWorkspacesSource).toContain("from '../workspaces/event-stage'")
    expect(builtInWorkspacesSource).toContain("from '../workspaces/image-patch'")
    expect(builtInWorkspacesSource).toContain("from '../workspaces/map'")
  })

  it('keeps shared modules free of upper-layer imports and desktop bridge calls', async () => {
    const sharedSourceFiles = await collectSourceFiles(sourcePath('src/shared'))
      const sharedViolations: string[] = []
      const blockedSharedSpecifiers = [
        '@app/',
        '@entities/',
        '@features/',
        '@pages/',
        '@platform/',
        '@widgets/',
        '../../app',
        '../../components',
        '../../pages',
        '../../lib/app',
        '../../lib/desktop',
        '../../platform',
        '../app',
        '../components',
        '../pages',
        '../lib/app',
        '../lib/desktop',
        '../platform',
    ]

    for (const filePath of sharedSourceFiles) {
      const source = await readFile(filePath, 'utf8')
      const relativePath = filePath.replace(`${process.cwd()}/`, '')

      for (const specifier of extractImportSpecifiers(source)) {
        if (blockedSharedSpecifiers.some((blockedSpecifier) => specifier === blockedSpecifier || specifier.startsWith(blockedSpecifier))) {
          sharedViolations.push(`${relativePath} imports ${specifier}`)
        }
      }
    }

    expect(sharedViolations).toEqual([])

    const sharedCpMaker = await readFile(sourcePath('src/shared/contracts/types/cpMaker.ts'), 'utf8')
    const sharedWorkspaceDeferred = await readFile(sourcePath('src/shared/ui/WorkspaceDeferred.tsx'), 'utf8')
    const sharedPanelFrame = await readFile(sourcePath('src/shared/ui/PanelFrame.tsx'), 'utf8')
    const sharedPanelSection = await readFile(sourcePath('src/shared/ui/PanelSection.tsx'), 'utf8')
    const sharedLayoutTypes = await readFile(sourcePath('src/shared/contracts/types/workspaceLayout.ts'), 'utf8')
    const sharedWorkspaceLayout = await readFile(sourcePath('src/shared/workspace/layout-view/WorkspaceLayout.tsx'), 'utf8')
    const platformDesktop = await readFile(sourcePath('src/platform/desktop/index.ts'), 'utf8')
    const sharedTypesIndex = await readFile(sourcePath('src/shared/contracts/types/index.ts'), 'utf8')

    expect(sharedCpMaker).not.toContain('@features/')
    expect(sharedWorkspaceDeferred).not.toContain('@features/')
    expect(sharedWorkspaceDeferred).toContain("from '@shared/ui/PanelFrame'")
    expect(sharedPanelFrame).not.toContain('../../components')
    expect(sharedPanelSection).not.toContain('../../components')
    expect(sharedLayoutTypes).not.toContain('@features/')
    expect(sharedLayoutTypes).not.toContain("export * from '../../components/workspace/layoutTypes'")
    expect(sharedWorkspaceLayout).not.toContain('@features/')
    expect(platformDesktop).not.toContain("export * from '@platform/desktop'")
    expect(sharedTypesIndex).toContain("export type * from './workspaceLayout'")
    expect(sharedTypesIndex).toContain("export type * from './cpMaker'")
    expect(sharedTypesIndex).toContain("export type * from './modBrowser'")
    expect(sharedTypesIndex).not.toContain("export type * from './panelTypes'")
    expect(sharedTypesIndex).toContain("export type * from './viewport'")
    expect(sharedTypesIndex).toContain("export type * from './maps'")
    expect(sharedTypesIndex).toContain("export type * from './workspaceRuntime'")
    expect(sharedTypesIndex).toContain("export type * from './desktop'")
    expect(sharedTypesIndex).toContain("export type * from './appUiState'")
    expect(sharedTypesIndex).not.toContain("export type * from '@platform/desktop'")
    expect(sharedCpMaker).toContain('export interface CpMakerDraft')
    expect(sharedLayoutTypes).toContain('export type DockArea')
    expect(await readFile(sourcePath('src/shared/contracts/types/modBrowser.ts'), 'utf8')).toContain('export type ModBrowserEntry')
    expect(await readFile(sourcePath('src/shared/contracts/types/workspaceRuntime.ts'), 'utf8')).toContain('export type WorkspaceStatus')
    expect(await readFile(sourcePath('src/shared/contracts/types/viewport.ts'), 'utf8')).toContain('export type FocusedMapObjectTarget')
    expect(await readFile(sourcePath('src/entities/map/lib/types.ts'), 'utf8')).toContain("from '@shared/contracts'")
  })


  /**
   * Platform boundary classification: tracks every production file that imports @platform/desktop
   * and classifies it as either an approved adapter/app-assembly boundary or a migration target.
   * A new production file outside both categories fails the test.
   */
  const APPROVED_BOUNDARY_PATTERNS = [
    /^app\/app-shell\/AppShell\.tsx$/,
    /^platform\/desktop\/index\.ts$/,
    /^platform\/desktop\/index\.test\.ts$/,
  ]
  const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/
  const TEST_SUPPORT_PATTERN = /^test\//

  // Known migration targets - these exact files are documented pending work, not accidental drift.
  // Keep this as a per-file baseline so new @platform/desktop imports fail until classified.
  const MIGRATION_TARGET_FILES = new Set([
    'app/providers/launcherPortAdapter.ts',
    'entities/event/model/stage/eventStageShared.ts',
    'features/launcher/model/nexusDiagnostics.ts',
    'pages/launcher/LauncherPage.tsx',
    'pages/launcher/ui/LauncherConfigurationPage.tsx',
    'pages/launcher/ui/LauncherDiscoverPage.tsx',
    'pages/launcher/ui/LauncherLibraryPage.tsx',
    'pages/launcher/ui/LauncherUpdatesPage.tsx',
    'pages/workbench/ui/DevDebugOverlay.tsx',
    'pages/workbench/ui/PlayerAppearanceWindow.tsx',
    'pages/workbench/ui/WorkbenchExperience.tsx',
    'pages/workbench/workspaces/building/state/useBuildingWorkspace.ts',
    'pages/workbench/workspaces/building/state/buildingTextLocalization.ts',
    'pages/workbench/workspaces/building/state/buildingObjectDisplay.ts',
    'pages/workbench/workspaces/building/state/buildingWorldEntries.ts',
    'pages/workbench/workspaces/building/state/buildingTextureAssets.ts',
    'pages/workbench/workspaces/character/state/useCharacterWorkspace.ts',
    'pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview.tsx',
    'pages/workbench/workspaces/event-stage/state/audioPreview.ts',
    'pages/workbench/workspaces/event-stage/state/useEventStageWorkspace.ts',
    'pages/workbench/workspaces/event-stage/state/useEventWorkspace.ts',
    'pages/workbench/workspaces/event-stage/view/EventStageWorkspace.tsx',
    'pages/workbench/workspaces/item/state/useItemWorkspace.ts',
    'pages/workbench/workspaces/map/editors/MapPatchEditor.tsx',
    'pages/workbench/workspaces/map/state/useMapWorkspace.ts',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-model/contentPatcher.ts',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherDiagnosticsPanel.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherExportPanel.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherNavigator.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherResultPreview.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherTracePanel.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherWorkspace.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ModBrowserPanel.tsx',
    'pages/workbench/workspaces/mod/mods/content-patcher/content-view/ModDiagnosticsPanel.tsx',
    'pages/workbench/workspaces/mod/state/modResultAssets.ts',
    'pages/workbench/workspaces/mod/state/useModAssetIndex.ts',
    'pages/workbench/workspaces/mod/state/useModWorkspace.ts',
  ])

  it(
    'classifies all production @platform/desktop imports and prevents new unapproved drift',
    async () => {
      const allFiles = await collectSourceFiles(sourcePath('src'))
      const unclassified: string[] = []

      for (const filePath of allFiles) {
        const source = await readFile(filePath, 'utf8')
        if (!source.includes('@platform/desktop')) {
          continue
        }

        const relPath = relative(sourcePath('src'), filePath).replace(/\\/g, '/')
        const isTestOnly = TEST_FILE_PATTERN.test(relPath) || TEST_SUPPORT_PATTERN.test(relPath)
        const isApproved = APPROVED_BOUNDARY_PATTERNS.some((p) => p.test(relPath))
        const isMigrationTarget = MIGRATION_TARGET_FILES.has(relPath)

        if (isApproved || isMigrationTarget || isTestOnly) {
          continue
        }

        unclassified.push(relPath)
      }

      expect(unclassified).toEqual([])
    },
    30000,
  )

  it(
    'blocks active Nexus Public HTML and Cloudflare verification paths',
    async () => {
      const scannedRoots = ['src/app', 'src/pages', 'src/widgets', 'src/features', 'src/shared', 'src/platform']
      const sourceFiles = await Promise.all(scannedRoots.map((root) => collectSourceFiles(sourcePath(root))))
      const blockedPatterns = [
        /publicHtml/i,
        /Public HTML/,
        /Cloudflare/,
        /cloudflare/,
        /cf_clearance/,
        /launcher\/cloudflare-challenge-required/,
        /public_html_nexus_/,
      ]
      const violations: string[] = []

      for (const filePath of sourceFiles.flat()) {
        const source = await readFile(filePath, 'utf8')
        const relPath = relative(sourcePath('src'), filePath).replace(/\\/g, '/')

        for (const pattern of blockedPatterns) {
          if (pattern.test(source)) {
            violations.push(`${relPath} contains ${pattern}`)
          }
        }
      }

      await expect(access(sourcePath('src/app/webview-surfaces/PublicHtmlVerificationControlsSurface.tsx'))).rejects.toThrow()
      expect(violations).toEqual([])
    },
    30000,
  )

  it(
    'keeps the official Nexus SDK isolated behind a platform adapter',
    async () => {
      const allFiles = await collectSourceFiles(sourcePath('src'))
      const violations: string[] = []
      const allowed = new Set([
        'platform/nexus/officialSdkAdapter.ts',
      ])

      for (const filePath of allFiles) {
        const relPath = relative(sourcePath('src'), filePath).replace(/\\/g, '/')
        if (TEST_FILE_PATTERN.test(relPath)) {
          continue
        }

        const source = await readFile(filePath, 'utf8')
        if (!source.includes('@nexusmods/nexus-api')) {
          continue
        }

        if (!allowed.has(relPath)) {
          violations.push(relPath)
        }
      }

      expect(violations).toEqual([])
    },
    30000,
  )

  it(
    'keeps NexusMods provider code outside the launcher Rust domain',
    async () => {
      const launcherFiles = await collectSourceFiles(sourcePath('src-tauri/src/domain/launcher'))
      const blockedPatterns = [
        /api-router\.nexusmods\.com/,
        /api\.nexusmods\.com/,
        /graphql\.nexusmods\.com/,
        /staticdelivery\.nexusmods\.com/,
        /send_nexus_(json_)?request/,
        /api_headers/,
        /graphql_headers/,
        /public_graphql_headers/,
        /^pub mod (catalog|discovery|downloads_provider|http|mod_detail|remote|rest_api|session|shared|sso);/m,
      ]
      const violations: string[] = []

      for (const filePath of launcherFiles) {
        const source = await readFile(filePath, 'utf8')
        const relPath = relative(sourcePath('src-tauri/src/domain/launcher'), filePath).replace(/\\/g, '/')

        for (const pattern of blockedPatterns) {
          if (pattern.test(source)) {
            violations.push(`${relPath} contains ${pattern}`)
          }
        }
      }

      expect(violations).toEqual([])
    },
    30000,
  )



  it(
    'rejects page-specific workbench panel source files under dock-side folder names',
    async () => {
      const panelsRoot = sourcePath('src/pages/workbench/ui/workspace-panels')
      const allowedDomainFolders = new Set(['event', 'building', 'character', 'map', 'item', 'mod', 'common'])

      let panelsDir
      try {
        panelsDir = await readdir(panelsRoot, { withFileTypes: true })
      } catch {
        return
      }

      const violations: string[] = []

      for (const entry of panelsDir) {
        if (!entry.isDirectory()) {
          continue
        }

        if (allowedDomainFolders.has(entry.name)) {
          continue
        }

        violations.push(
          'workspace-panels/' + entry.name + ' is not an allowed domain folder. Allowed: ' + Array.from(allowedDomainFolders).join(', '),
        )
      }

      expect(violations).toEqual([])
    },
    10000,
  )

})
