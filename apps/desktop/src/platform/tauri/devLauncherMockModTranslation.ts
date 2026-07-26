type MockCommandResult = { handled: true; result: unknown } | { handled: false }

// Structural mirrors of the entities/game and entities/mod contracts. The
// platform layer must stay free of domain imports, so the mock declares the
// payload shapes it serves instead of importing them.
type MockGameDirectoryInfo = {
  rootPath: string
  executablePath: string
  mapsPath: string | null
  mapCount: number
}

type MockI18nFile = {
  locale: string
  path: string
  relativePath: string
  rawJson: string
  entryCount: number
}

type MockModProjectSummary = {
  id: string
  name: string
  author: string | null
  version: string | null
  description: string | null
  uniqueId: string | null
  contentPackFor: string | null
  folderName: string
  absolutePath: string
  manifestPath: string
  contentPath: string | null
  pluginKind: 'content-patcher' | 'unknown'
  status: 'ready' | 'incompatible' | 'unsupported'
  missingRequiredDependencies: string[]
  hasI18n: boolean
  i18nEntryCount: number
}

type MockModProject = {
  summary: MockModProjectSummary
  i18nFiles: MockI18nFile[]
}

type MockSaveModI18nFilesRequest = {
  sourcePath: string
  i18nFiles: Array<{
    locale: string
    rawJson: string
  }>
}

const MOCK_MOD_DEFAULT_ENTRIES: Record<string, string> = {
  'event.grampleton-fair.intro': 'The annual Grampleton Fair begins at noon.',
  'grampleton.farewell': 'Come back soon, farmer.',
  'grampleton.welcome': 'Welcome to Grampleton! Enjoy your stay.',
  'mail.grampleton-intro.title': 'A letter from Grampleton',
  'shop.GrampletonStore.name': 'Grampleton General Store',
}

const MOCK_MOD_ZH_ENTRIES: Record<string, string> = {
  'grampleton.welcome': '欢迎来到格兰普顿！祝你玩得愉快。',
}

function toRawJson(entries: Record<string, string>) {
  return `${JSON.stringify(entries, null, 2)}\n`
}

function countEntries(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).length : 0
  } catch {
    return 0
  }
}

function createI18nFile(modPath: string, locale: string, entries: Record<string, string>): MockI18nFile {
  const fileName = locale === 'default' ? 'default.json' : `${locale}.json`
  return {
    locale,
    path: `${modPath}\\i18n\\${fileName}`,
    relativePath: `i18n/${fileName}`,
    rawJson: toRawJson(entries),
    entryCount: Object.keys(entries).length,
  }
}

function createMockModCatalog(gameDirectory: string): MockModProject[] {
  const grampletonPath = `${gameDirectory}\\Mods\\GrampletonFields`
  const hudPath = `${gameDirectory}\\Mods\\SimpleHudTweaks`
  return [
    {
      summary: {
        id: 'grampleton-fields',
        name: 'Grampleton Fields',
        author: 'ModForge Dev',
        version: '1.2.0',
        description: 'Development mock content pack with i18n files.',
        uniqueId: 'ModForge.Dev.GrampletonFields',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'GrampletonFields',
        absolutePath: grampletonPath,
        manifestPath: `${grampletonPath}\\manifest.json`,
        contentPath: `${grampletonPath}\\content.json`,
        pluginKind: 'content-patcher',
        status: 'ready',
        missingRequiredDependencies: [],
        hasI18n: true,
        i18nEntryCount: Object.keys(MOCK_MOD_DEFAULT_ENTRIES).length + Object.keys(MOCK_MOD_ZH_ENTRIES).length,
      },
      i18nFiles: [
        createI18nFile(grampletonPath, 'default', MOCK_MOD_DEFAULT_ENTRIES),
        createI18nFile(grampletonPath, 'zh', MOCK_MOD_ZH_ENTRIES),
      ],
    },
    {
      summary: {
        id: 'simple-hud-tweaks',
        name: 'Simple HUD Tweaks',
        author: 'Test Author',
        version: '0.3.1',
        description: 'Development mock mod without i18n files.',
        uniqueId: 'ModForge.Dev.SimpleHudTweaks',
        contentPackFor: null,
        folderName: 'SimpleHudTweaks',
        absolutePath: hudPath,
        manifestPath: `${hudPath}\\manifest.json`,
        contentPath: null,
        pluginKind: 'unknown',
        status: 'ready',
        missingRequiredDependencies: [],
        hasI18n: false,
        i18nEntryCount: 0,
      },
      i18nFiles: [],
    },
  ]
}

function createMockGameDirectoryInfo(rootPath: string): MockGameDirectoryInfo {
  return {
    rootPath,
    executablePath: `${rootPath}\\Stardew Valley.exe`,
    mapsPath: `${rootPath}\\Content\\Maps`,
    mapCount: 42,
  }
}

function getMockRequest<TRequest>(payload: unknown): TRequest | null {
  if (!payload || typeof payload !== 'object' || !('request' in payload)) {
    return null
  }

  return (payload as { request: TRequest }).request
}

function getPayloadField(payload: unknown, field: string): string | null {
  if (!payload || typeof payload !== 'object' || !(field in payload)) {
    return null
  }

  const value = (payload as Record<string, unknown>)[field]
  return typeof value === 'string' && value.trim() ? value : null
}

/** Creates an in-memory mod catalog and game-directory backend for browser-only UI debugging. */
export function createModTranslationMockHandler(initialGameDirectory: string) {
  let gameDirectory = initialGameDirectory
  const catalog = createMockModCatalog(initialGameDirectory)
  const handled = (result: unknown): MockCommandResult => ({ handled: true, result })
  const requireProject = (absolutePath: string) => {
    const project = catalog.find((item) => item.summary.absolutePath === absolutePath)
    if (!project) throw new Error(`Unknown mock mod project: ${absolutePath}`)
    return project
  }

  return function handleModTranslationMockCommand(command: string, payload: unknown): MockCommandResult {
    switch (command) {
      case 'validate_game_directory': {
        const path = getPayloadField(payload, 'path') ?? gameDirectory
        gameDirectory = path
        return handled(createMockGameDirectoryInfo(path))
      }
      case 'scan_mod_projects': {
        return handled(catalog.map((project) => project.summary))
      }
      case 'load_mod_project': {
        const path = getPayloadField(payload, 'path') ?? ''
        const project = requireProject(path)
        return handled({
          pluginKind: project.summary.pluginKind,
          summary: project.summary,
          diagnostics: [],
          contentPatcher: null,
          i18nFiles: project.i18nFiles,
        })
      }
      case 'save_mod_i18n_files': {
        const request = getMockRequest<MockSaveModI18nFilesRequest>(payload)
        if (!request) throw new Error('Missing mock i18n save request')
        const project = requireProject(request.sourcePath)
        const writtenLocales: string[] = []
        for (const incoming of request.i18nFiles) {
          const existing = project.i18nFiles.find((file) => file.locale === incoming.locale)
          if (existing) {
            existing.rawJson = incoming.rawJson
            existing.entryCount = countEntries(incoming.rawJson)
          } else {
            const fileName = incoming.locale === 'default' ? 'default.json' : `${incoming.locale}.json`
            project.i18nFiles.push({
              locale: incoming.locale,
              path: `${project.summary.absolutePath}\\i18n\\${fileName}`,
              relativePath: `i18n/${fileName}`,
              rawJson: incoming.rawJson,
              entryCount: countEntries(incoming.rawJson),
            })
          }
          writtenLocales.push(incoming.locale)
        }
        project.summary.hasI18n = project.i18nFiles.length > 0
        project.summary.i18nEntryCount = project.i18nFiles.reduce((total, file) => total + file.entryCount, 0)
        return handled({ sourcePath: request.sourcePath, writtenLocales })
      }
      default:
        return { handled: false }
    }
  }
}
