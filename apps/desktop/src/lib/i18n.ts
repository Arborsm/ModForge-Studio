export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type InspectorTab = 'inspector' | 'layers' | 'objects' | 'diagnostics'
export type DockTab = 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceMode = 'map' | DockTab

type ModulePreview = {
  key: string
  title: string
  state: string
  summary: string
}

type DockNodePreview = {
  title: string
  detail: string
}

type DockBlueprint = {
  title: string
  state: string
  summary: string
  focusTitle: string
  columns: [string, string, string]
  list: string[]
  lanes: string[]
  bullets: string[]
  nodes: DockNodePreview[]
}

export type AppCopy = {
  appTitle: string
  appTagline: string
  mainMenuLabel: string
  mainMenuItems: string[]
  workspaceTabs: Record<WorkspaceMode, string>
  themeLabel: string
  localeLabel: string
  themes: Record<ThemeMode, string>
  locales: Record<LocaleCode, string>
  status: string
  idle: string
  working: string
  ready: string
  error: string
  desktopHost: string
  browserMode: string
  browserHostPrompt: string
  gameDirectory: string
  gameDirectoryPlaceholder: string
  browse: string
  useKnownPath: string
  validateOnly: string
  scanAndOpenTown: string
  projectNavigator: string
  workspaceHealth: string
  preferredFormat: string
  detectedMaps: string
  sceneFocus: string
  installState: string
  preferredMaps: string
  contentBrowser: string
  mapAssets: string
  filterMaps: string
  searchMapsPlaceholder: string
  townPriority: string
  noMapsFound: string
  noFilteredMaps: string
  futureTools: string
  moduleRail: string
  moduleWorkspace: string
  moduleInspector: string
  moduleCanvas: string
  futureModules: ModulePreview[]
  activeScene: string
  sceneViewport: string
  noSceneLoaded: string
  loadScenePrompt: string
  mainViewport: string
  viewportCore: string
  rightClickContext: string
  inspectorTabs: Record<InspectorTab, string>
  sceneSummary: string
  dimensions: string
  tileSize: string
  tilesets: string
  objectGroups: string
  path: string
  orientation: string
  renderOrder: string
  format: string
  hoverProbe: string
  hoverDetails: string
  tile: string
  pixel: string
  gid: string
  layer: string
  tileId: string
  tileProperties: string
  noTileProperties: string
  layers: string
  visibleLayers: string
  layerTiles: string
  layerTogglePrompt: string
  show: string
  hide: string
  showAll: string
  hideAll: string
  objects: string
  objectCount: string
  objectTogglePrompt: string
  noObjectGroups: string
  hoveredObjects: string
  hoverContext: string
  type: string
  bounds: string
  noHoveredObjects: string
  projectFacts: string
  visibleObjects: string
  executable: string
  unpackedMaps: string
  xnbMaps: string
  diagnosticsPrompt: string
  workspaceStatus: string
  workspaceDock: string
  dockSubtitle: string
  dockTabs: Record<DockTab, string>
  futureModulesLabel: string
  dockBlueprints: Record<DockTab, DockBlueprint>
  none: string
  yes: string
  no: string
  objectLabel: (id: number) => string
  detectingDefaultInstall: string
  detectedKnownPath: (path: string) => string
  automaticDetectionFailed: string
  enterFolderBeforeValidating: string
  validatingDirectory: string
  validatedDirectory: (path: string) => string
  validationFailed: string
  enterFolderBeforeScanning: string
  validatingAndScanning: string
  mapScanFailed: string
  loadingMap: string
  loadingMapFailed: string
  onlyTmxSupported: string
  directorySelectionFailed: string
  hoverPrompt: string
  loadedMapAssets: (count: number, format: string) => string
  loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  viewportLabels: {
    loadPrompt: string
    zoomOut: string
    oneToOne: string
    fit: string
    zoomIn: string
    fitMap: string
    setOneToOne: string
    centerView: string
    resetPan: string
    tilesLabel: string
    tilesetsLoadedLabel: (loaded: number, total: number) => string
    layersVisibleLabel: (visible: number, total: number) => string
    objectGroupsVisibleLabel: (visible: number, total: number) => string
    zoomLabel: (zoom: number) => string
    failedToLoadTilesetImage: (path: string) => string
  }
}

export const appCopy: Record<LocaleCode, AppCopy> = {
  'zh-CN': {
    appTitle: 'ModForge Studio',
    appTagline: '桌面内容创作工作台',
    mainMenuLabel: '主菜单',
    mainMenuItems: ['文件', '编辑', '视图', '工具', '窗口', '帮助'],
    workspaceTabs: {
      map: '地图',
      characters: '人物',
      buildings: '建筑',
      items: '物品',
      events: '事件图',
    },
    themeLabel: '主题',
    localeLabel: '语言',
    themes: { dark: '深色', light: '浅色' },
    locales: { 'zh-CN': '中文', 'en-US': 'English' },
    status: '状态',
    idle: '空闲',
    working: '处理中',
    ready: '就绪',
    error: '错误',
    desktopHost: '桌面宿主',
    browserMode: '浏览器模式',
    browserHostPrompt: '请在 Tauri 桌面环境中运行，以访问本地 Stardew Valley 目录。',
    gameDirectory: '游戏目录',
    gameDirectoryPlaceholder: '选择 Stardew Valley 安装目录',
    browse: '浏览',
    useKnownPath: '使用已知路径',
    validateOnly: '仅校验',
    scanAndOpenTown: '扫描并打开世界',
    projectNavigator: '项目导航',
    workspaceHealth: '工作区健康度',
    preferredFormat: '优先格式',
    detectedMaps: '地图数量',
    sceneFocus: '当前场景',
    installState: '安装状态',
    preferredMaps: '首选地图目录',
    contentBrowser: '内容浏览器',
    mapAssets: '地图资源',
    filterMaps: '筛选',
    searchMapsPlaceholder: '按地图名、文件名或相对路径过滤',
    townPriority: '优先',
    noMapsFound: '尚未扫描到可加载的地图资源。',
    noFilteredMaps: '当前筛选条件下没有匹配的地图资源。',
    futureTools: '后续模块',
    moduleRail: '扩展编辑器预留位',
    moduleWorkspace: '模块工作区',
    moduleInspector: '模块侧栏',
    moduleCanvas: '主编辑区',
    futureModules: [
      {
        key: 'characters',
        title: '人物编辑器',
        state: '预留',
        summary: '人物列表、肖像、日程、对话绑定与关系参数会挂入底部 Dock。',
      },
      {
        key: 'buildings',
        title: '建筑编辑器',
        state: '预留',
        summary: 'Footprint、入口、室内映射、升级阶段会与地图视口协同工作。',
      },
      {
        key: 'items',
        title: '物品编辑器',
        state: '预留',
        summary: '定义、图标图集、商店、掉落与奖励会复用统一 Inspector。',
      },
      {
        key: 'events',
        title: '事件节点图',
        state: '预留',
        summary: 'Trigger / Condition / Action / Dialogue 会进入底部节点图 Dock。',
      },
    ],
    activeScene: '活动场景',
    sceneViewport: '场景视口',
    noSceneLoaded: '尚未加载场景',
    loadScenePrompt: '加载 TMX 地图后，这里会成为当前 Town 主视口。',
    mainViewport: '主视口',
    viewportCore: 'Town 核心画布',
    rightClickContext: '保留右键场景菜单',
    inspectorTabs: {
      inspector: 'Inspector',
      layers: '图层',
      objects: '对象组',
      diagnostics: '诊断',
    },
    sceneSummary: '场景摘要',
    dimensions: '尺寸',
    tileSize: '瓦片尺寸',
    tilesets: '图块集',
    objectGroups: '对象组',
    path: '路径',
    orientation: '方向',
    renderOrder: '渲染顺序',
    format: '格式',
    hoverProbe: '悬停探针',
    hoverDetails: '悬停详情',
    tile: '瓦片',
    pixel: '像素',
    gid: 'GID',
    layer: '图层',
    tileId: 'Tile ID',
    tileProperties: '瓦片属性',
    noTileProperties: '当前瓦片没有附加属性。',
    layers: '图层',
    visibleLayers: '可见图层',
    layerTiles: '格',
    layerTogglePrompt: '打开 TMX 地图后，这里会列出图层显隐控制。',
    show: '显示',
    hide: '隐藏',
    showAll: '全部显示',
    hideAll: '全部隐藏',
    objects: '对象',
    objectCount: '个对象',
    objectTogglePrompt: '打开 TMX 地图后，这里会列出对象组显隐控制。',
    noObjectGroups: '当前地图没有对象组。',
    hoveredObjects: '命中对象',
    hoverContext: '悬停上下文',
    type: '类型',
    bounds: '边界',
    noHoveredObjects: '当前悬停位置没有命中对象。',
    projectFacts: '项目事实',
    visibleObjects: '可见对象',
    executable: '可执行文件',
    unpackedMaps: '解包地图目录',
    xnbMaps: 'XNB 地图目录',
    diagnosticsPrompt: '先校验游戏目录，这里才会填充诊断信息。',
    workspaceStatus: '工作区状态',
    workspaceDock: '工作区 Dock',
    dockSubtitle: '人物 / 建筑 / 物品 / 事件节点图',
    dockTabs: {
      characters: '人物',
      buildings: '建筑',
      items: '物品',
      events: '事件图',
    },
    futureModulesLabel: '扩展要点',
    dockBlueprints: {
      characters: {
        title: '人物工作区',
        state: '预留',
        summary: '这个 Dock 将承载人物列表、肖像预览、日程轨与对话绑定。',
        focusTitle: '肖像 / 日程焦点区',
        columns: ['人物列表', '主编辑区', '联动参数'],
        list: ['Abigail', 'Lewis', 'Robin', 'Wizard'],
        lanes: ['头像与表情', '日程时间线', '对话引用', '关系参数'],
        bullets: ['场景锚点绑定', 'NPC 出生点校验', '节日与天气条件'],
        nodes: [],
      },
      buildings: {
        title: '建筑工作区',
        state: '预留',
        summary: '在这里编辑 footprint、入口点、室内映射和升级阶段。',
        focusTitle: 'Footprint / Entry 编辑区',
        columns: ['建筑列表', '主编辑区', '升级链'],
        list: ['Barn', 'Coop', 'Shop', 'Town Hall'],
        lanes: ['Footprint 轮廓', '入口点', '室内映射', '升级阶段'],
        bullets: ['碰撞盒校验', '室内门点可视化', '升级阶段差异预览'],
        nodes: [],
      },
      items: {
        title: '物品工作区',
        state: '预留',
        summary: '这里会组合物品定义、图标图集、商店规则和掉落奖励。',
        focusTitle: '图标图集 / 定义区',
        columns: ['物品目录', '主编辑区', '投放渠道'],
        list: ['Seeds', 'Quest Item', 'Craftable', 'Festival Reward'],
        lanes: ['定义字段', '图标图集', '商店售卖', '掉落与奖励'],
        bullets: ['图集坐标预览', '价格与稀有度关系', '奖励来源链路'],
        nodes: [],
      },
      events: {
        title: '事件节点图工作区',
        state: '预留',
        summary: 'Trigger、Condition、Action 与 Dialogue 节点会在同一个 Dock 中联动。',
        focusTitle: '节点图',
        columns: ['节点目录', '主图编辑区', '执行约束'],
        list: ['Trigger', 'Condition', 'Action', 'Dialogue'],
        lanes: ['地图触发', '条件分支', '动作节点', '对话节点'],
        bullets: ['地图对象双向绑定', '时间与关系条件', '节点结果回写 Inspector'],
        nodes: [
          { title: 'Town Entry', detail: 'Trigger' },
          { title: 'Festival Gate', detail: 'Condition' },
          { title: 'Mayor Intro', detail: 'Dialogue' },
          { title: 'Reward Mail', detail: 'Action' },
        ],
      },
    },
    none: '无',
    yes: '是',
    no: '否',
    objectLabel: (id) => `对象 ${id}`,
    detectingDefaultInstall: '正在检测默认 Stardew Valley 安装目录...',
    detectedKnownPath: (path) => `已定位目录：${path}`,
    automaticDetectionFailed: '自动检测失败，请手动选择目录。',
    enterFolderBeforeValidating: '校验前请先输入 Stardew Valley 目录。',
    validatingDirectory: '正在校验游戏目录...',
    validatedDirectory: (path) => `目录已校验：${path}`,
    validationFailed: '目录校验失败。',
    enterFolderBeforeScanning: '扫描前请先输入 Stardew Valley 目录。',
    validatingAndScanning: '正在校验并扫描地图资源...',
    mapScanFailed: '地图扫描失败。',
    loadingMap: '正在加载地图...',
    loadingMapFailed: '地图加载失败。',
    onlyTmxSupported: '当前只支持加载 TMX 地图。',
    directorySelectionFailed: '目录选择失败。',
    hoverPrompt: '在中央主视口中移动鼠标，可查看 tile / object 悬停信息。',
    loadedMapAssets: (count, format) => `已加载 ${count} 个 ${format.toUpperCase()} 地图资源。`,
    loadedMapAssetsWithActiveMap: (count, format, mapName) =>
      `已加载 ${count} 个 ${format.toUpperCase()} 地图资源，当前主视口为 ${mapName}。`,
    viewportLabels: {
      loadPrompt: '加载 TMX 地图后，这里会显示可见图层与对象组叠加。',
      zoomOut: '缩小',
      oneToOne: '1:1',
      fit: '适配',
      zoomIn: '放大',
      fitMap: '适配地图',
      setOneToOne: '设置 1:1',
      centerView: '居中视图',
      resetPan: '重置平移',
      tilesLabel: '格',
      tilesetsLoadedLabel: (loaded, total) => `图块集 ${loaded}/${total}`,
      layersVisibleLabel: (visible, total) => `图层 ${visible}/${total}`,
      objectGroupsVisibleLabel: (visible, total) => `对象组 ${visible}/${total}`,
      zoomLabel: (zoom) => `缩放 ${Math.round(zoom * 100)}%`,
      failedToLoadTilesetImage: (path) => `无法加载图块集图片：${path}`,
    },
  },
  'en-US': {
    appTitle: 'ModForge Studio',
    appTagline: 'Desktop Authoring Workspace',
    mainMenuLabel: 'Main menu',
    mainMenuItems: ['File', 'Edit', 'View', 'Tools', 'Window', 'Help'],
    workspaceTabs: {
      map: 'Map',
      characters: 'Characters',
      buildings: 'Buildings',
      items: 'Items',
      events: 'Event Graph',
    },
    themeLabel: 'Theme',
    localeLabel: 'Language',
    themes: { dark: 'Dark', light: 'Light' },
    locales: { 'zh-CN': 'Chinese', 'en-US': 'English' },
    status: 'Status',
    idle: 'Idle',
    working: 'Working',
    ready: 'Ready',
    error: 'Error',
    desktopHost: 'Desktop host',
    browserMode: 'Browser mode',
    browserHostPrompt: 'Run this screen inside the Tauri desktop host to access the local Stardew Valley directory.',
    gameDirectory: 'Game directory',
    gameDirectoryPlaceholder: 'Select the Stardew Valley install folder',
    browse: 'Browse',
    useKnownPath: 'Use known path',
    validateOnly: 'Validate only',
    scanAndOpenTown: 'Scan World',
    projectNavigator: 'Project Navigator',
    workspaceHealth: 'Workspace Health',
    preferredFormat: 'Preferred format',
    detectedMaps: 'Detected maps',
    sceneFocus: 'Scene focus',
    installState: 'Install state',
    preferredMaps: 'Preferred maps path',
    contentBrowser: 'Content Browser',
    mapAssets: 'Map Assets',
    filterMaps: 'Filter',
    searchMapsPlaceholder: 'Filter by map name, file name, or relative path',
    townPriority: 'Pinned',
    noMapsFound: 'No loadable map assets have been scanned yet.',
    noFilteredMaps: 'No map assets match the current filter.',
    futureTools: 'Future Modules',
    moduleRail: 'Reserved editor slots',
    moduleWorkspace: 'Module Workspace',
    moduleInspector: 'Module Sidebar',
    moduleCanvas: 'Main Editing Surface',
    futureModules: [
      {
        key: 'characters',
        title: 'Character Editor',
        state: 'Reserved',
        summary: 'Character lists, portraits, schedules, dialogue bindings, and relations will dock here.',
      },
      {
        key: 'buildings',
        title: 'Building Editor',
        state: 'Reserved',
        summary: 'Footprints, entries, interior mapping, and upgrade stages will work alongside the viewport.',
      },
      {
        key: 'items',
        title: 'Item Editor',
        state: 'Reserved',
        summary: 'Definitions, icon atlases, shops, drops, and rewards will reuse the shared inspector.',
      },
      {
        key: 'events',
        title: 'Event Graph',
        state: 'Reserved',
        summary: 'Trigger / Condition / Action / Dialogue nodes will live in the lower graph dock.',
      },
    ],
    activeScene: 'Active Scene',
    sceneViewport: 'Scene Viewport',
    noSceneLoaded: 'No scene loaded',
    loadScenePrompt: 'Load a TMX map and this area becomes the live Town viewport.',
    mainViewport: 'Main viewport',
    viewportCore: 'Town core canvas',
    rightClickContext: 'Custom context menu preserved',
    inspectorTabs: {
      inspector: 'Inspector',
      layers: 'Layers',
      objects: 'Objects',
      diagnostics: 'Diagnostics',
    },
    sceneSummary: 'Scene Summary',
    dimensions: 'Dimensions',
    tileSize: 'Tile size',
    tilesets: 'Tilesets',
    objectGroups: 'Object groups',
    path: 'Path',
    orientation: 'Orientation',
    renderOrder: 'Render order',
    format: 'Format',
    hoverProbe: 'Hover Probe',
    hoverDetails: 'Hover Details',
    tile: 'Tile',
    pixel: 'Pixel',
    gid: 'GID',
    layer: 'Layer',
    tileId: 'Tile ID',
    tileProperties: 'Tile properties',
    noTileProperties: 'The current tile has no extra properties.',
    layers: 'Layers',
    visibleLayers: 'Visible Layers',
    layerTiles: 'tiles',
    layerTogglePrompt: 'Open a TMX map to populate layer visibility controls.',
    show: 'Show',
    hide: 'Hide',
    showAll: 'Show all',
    hideAll: 'Hide all',
    objects: 'Objects',
    objectCount: 'objects',
    objectTogglePrompt: 'Open a TMX map to populate object group visibility controls.',
    noObjectGroups: 'This map has no object groups.',
    hoveredObjects: 'Hovered Objects',
    hoverContext: 'Hover Context',
    type: 'Type',
    bounds: 'Bounds',
    noHoveredObjects: 'No objects are hit at the current hover point.',
    projectFacts: 'Project Facts',
    visibleObjects: 'Visible objects',
    executable: 'Executable',
    unpackedMaps: 'Unpacked maps path',
    xnbMaps: 'XNB maps path',
    diagnosticsPrompt: 'Validate a game directory to populate diagnostics.',
    workspaceStatus: 'Workspace Status',
    workspaceDock: 'Workspace Dock',
    dockSubtitle: 'Characters / Buildings / Items / Event Graph',
    dockTabs: {
      characters: 'Characters',
      buildings: 'Buildings',
      items: 'Items',
      events: 'Event Graph',
    },
    futureModulesLabel: 'Extension Hooks',
    dockBlueprints: {
      characters: {
        title: 'Character Workspace',
        state: 'Reserved',
        summary: 'This dock will host a roster, portrait preview, schedule lanes, and dialogue bindings.',
        focusTitle: 'Portrait / Schedule Focus',
        columns: ['Roster', 'Main Editor', 'Linked Parameters'],
        list: ['Abigail', 'Lewis', 'Robin', 'Wizard'],
        lanes: ['Portrait + emotions', 'Schedule timeline', 'Dialogue bindings', 'Relationship tuning'],
        bullets: ['Scene anchor bindings', 'NPC spawn validation', 'Festival and weather conditions'],
        nodes: [],
      },
      buildings: {
        title: 'Building Workspace',
        state: 'Reserved',
        summary: 'Edit footprints, entry points, interior mapping, and upgrade stages here.',
        focusTitle: 'Footprint / Entry Focus',
        columns: ['Building List', 'Main Editor', 'Upgrade Chain'],
        list: ['Barn', 'Coop', 'Shop', 'Town Hall'],
        lanes: ['Footprint outline', 'Entry point', 'Interior mapping', 'Upgrade stage'],
        bullets: ['Collision footprint checks', 'Interior door visualization', 'Upgrade diff preview'],
        nodes: [],
      },
      items: {
        title: 'Item Workspace',
        state: 'Reserved',
        summary: 'This dock will combine item definitions, icon atlases, shop rules, drops, and rewards.',
        focusTitle: 'Atlas / Definition Focus',
        columns: ['Catalog', 'Main Editor', 'Distribution'],
        list: ['Seeds', 'Quest Item', 'Craftable', 'Festival Reward'],
        lanes: ['Definition fields', 'Icon atlas', 'Shop inventory', 'Drops + rewards'],
        bullets: ['Atlas coordinate preview', 'Value and rarity balancing', 'Reward source chains'],
        nodes: [],
      },
      events: {
        title: 'Event Graph Workspace',
        state: 'Reserved',
        summary: 'Trigger, Condition, Action, and Dialogue nodes will work together inside one dock.',
        focusTitle: 'Node Graph',
        columns: ['Node Catalog', 'Graph Editor', 'Execution Rules'],
        list: ['Trigger', 'Condition', 'Action', 'Dialogue'],
        lanes: ['Map trigger', 'Conditional branch', 'Action node', 'Dialogue node'],
        bullets: ['Bidirectional links to map objects', 'Time and relationship conditions', 'Inspector write-back from graph results'],
        nodes: [
          { title: 'Town Entry', detail: 'Trigger' },
          { title: 'Festival Gate', detail: 'Condition' },
          { title: 'Mayor Intro', detail: 'Dialogue' },
          { title: 'Reward Mail', detail: 'Action' },
        ],
      },
    },
    none: 'None',
    yes: 'Yes',
    no: 'No',
    objectLabel: (id) => `Object ${id}`,
    detectingDefaultInstall: 'Detecting a default Stardew Valley installation...',
    detectedKnownPath: (path) => `Detected directory: ${path}`,
    automaticDetectionFailed: 'Automatic detection failed. Choose the folder manually.',
    enterFolderBeforeValidating: 'Enter a Stardew Valley folder before validating.',
    validatingDirectory: 'Validating game directory...',
    validatedDirectory: (path) => `Validated directory: ${path}`,
    validationFailed: 'Directory validation failed.',
    enterFolderBeforeScanning: 'Enter a Stardew Valley folder before scanning.',
    validatingAndScanning: 'Validating and scanning map assets...',
    mapScanFailed: 'Map scan failed.',
    loadingMap: 'Loading map...',
    loadingMapFailed: 'Map load failed.',
    onlyTmxSupported: 'Only TMX map loading is supported right now.',
    directorySelectionFailed: 'Directory selection failed.',
    hoverPrompt: 'Move across the main viewport to inspect tile and object hover data.',
    loadedMapAssets: (count, format) => `Loaded ${count} ${format.toUpperCase()} map assets.`,
    loadedMapAssetsWithActiveMap: (count, format, mapName) =>
      `Loaded ${count} ${format.toUpperCase()} map assets. ${mapName} is active in the main viewport.`,
    viewportLabels: {
      loadPrompt: 'Load a TMX map to preview visible layers and object overlays.',
      zoomOut: 'Zoom out',
      oneToOne: '1:1',
      fit: 'Fit',
      zoomIn: 'Zoom in',
      fitMap: 'Fit map',
      setOneToOne: 'Set 1:1',
      centerView: 'Center view',
      resetPan: 'Reset pan',
      tilesLabel: 'tiles',
      tilesetsLoadedLabel: (loaded, total) => `Tilesets ${loaded}/${total}`,
      layersVisibleLabel: (visible, total) => `Layers ${visible}/${total}`,
      objectGroupsVisibleLabel: (visible, total) => `Object groups ${visible}/${total}`,
      zoomLabel: (zoom) => `Zoom ${Math.round(zoom * 100)}%`,
      failedToLoadTilesetImage: (path) => `Failed to load tileset image: ${path}`,
    },
  },
}
