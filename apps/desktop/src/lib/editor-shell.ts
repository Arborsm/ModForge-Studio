export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type WorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceTone = 'idle' | 'working' | 'ready' | 'error'

export type ViewportLabels = {
  loadPrompt: string
  zoomOut: string
  oneToOne: string
  fit: string
  zoomIn: string
  fitMap: string
  setOneToOne: string
  centerView: string
  resetPan: string
  addObjectHere: string
  inspectHover: string
  unavailable: string
  tilesLabel: string
  tilesetsLoadedLabel: (loaded: number, total: number) => string
  layersVisibleLabel: (visible: number, total: number) => string
  objectGroupsVisibleLabel: (visible: number, total: number) => string
  zoomLabel: (zoom: number) => string
  failedToLoadTilesetImage: (path: string) => string
}

type ModuleNode = {
  title: string
  detail: string
}

export type ModuleBlueprint = {
  title: string
  state: string
  summary: string
  focusTitle: string
  listTitle: string
  inspectorTitle: string
  list: string[]
  lanes: string[]
  bullets: string[]
  nodes: ModuleNode[]
}

export type EditorCopy = {
  brand: {
    name: string
    tagline: string
  }
  menus: string[]
  nav: Record<WorkspaceMode, string>
  localeShort: Record<LocaleCode, string>
  statusTone: Record<WorkspaceTone, string>
  controls: {
    toggleTheme: string
    toggleLocale: string
    browse: string
    useKnownPath: string
    validateOnly: string
    scanAndOpenTown: string
    showAll: string
    hideAll: string
  }
  leftDock: {
    project: string
    projectSubtitle: string
    contentBrowser: string
    contentSubtitle: string
    extensionRail: string
    extensionSubtitle: string
    hostMode: string
    browserHost: string
    desktopHost: string
    gameDirectory: string
    directoryPlaceholder: string
    filterMaps: string
    filterPlaceholder: string
    preferredFormat: string
    detectedMaps: string
    sceneFocus: string
    installState: string
    preferredMaps: string
    noMapsFound: string
    noFilteredMaps: string
    pinned: string
    reserved: string
  }
  center: {
    activeScene: string
    noSceneLoaded: string
    viewport: string
    canvas: string
    rightClick: string
    selectTool: string
    panTool: string
    moduleWorkspace: string
    moduleCanvas: string
    moduleInspector: string
  }
  rightDock: {
    title: string
    subtitle: string
    inspector: string
    layers: string
    objectGroups: string
    diagnostics: string
    sceneSummary: string
    hoverProbe: string
    hoverDetails: string
    projectFacts: string
    workspaceStatus: string
    noTileProperties: string
    noObjectGroups: string
    noHoveredObjects: string
    diagnosticsPrompt: string
    layerTiles: string
    objectCount: string
  }
  statusBar: {
    pathValid: string
    pathMissing: string
    scanned: string
    hover: string
    coordinates: string
  }
  common: {
    none: string
    yes: string
    no: string
    dimensions: string
    tileSize: string
    tilesets: string
    objectGroups: string
    path: string
    orientation: string
    renderOrder: string
    format: string
    tile: string
    pixel: string
    gid: string
    layer: string
    tileId: string
    tileProperties: string
    type: string
    bounds: string
    executable: string
    unpackedMaps: string
    xnbMaps: string
    visibleLayers: string
    visibleObjects: string
    objectLabel: (id: number) => string
  }
  messages: {
    browserHostPrompt: string
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
    loadedMapAssets: (count: number, format: string) => string
    loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  }
  viewportLabels: ViewportLabels
  moduleBlueprints: Record<Exclude<WorkspaceMode, 'map'>, ModuleBlueprint>
}

export const workspaceModes: WorkspaceMode[] = ['map', 'characters', 'buildings', 'items', 'events']

export const editorCopy: Record<LocaleCode, EditorCopy> = {
  'zh-CN': {
    brand: {
      name: 'ModForge Studio',
      tagline: '专业级模组内容创作工作台',
    },
    menus: ['文件', '编辑', '视图', '工具', '窗口'],
    nav: {
      map: '地图',
      characters: '角色',
      buildings: '建筑',
      items: '物品',
      events: '事件',
    },
    localeShort: {
      'zh-CN': '中',
      'en-US': 'EN',
    },
    statusTone: {
      idle: '空闲',
      working: '处理中',
      ready: '就绪',
      error: '错误',
    },
    controls: {
      toggleTheme: '切换主题',
      toggleLocale: '切换语言',
      browse: '浏览',
      useKnownPath: '已知路径',
      validateOnly: '仅验证',
      scanAndOpenTown: '扫描并打开世界',
      showAll: '全部显示',
      hideAll: '全部隐藏',
    },
    leftDock: {
      project: '项目导航',
      projectSubtitle: '游戏目录与工作区状态',
      contentBrowser: '资源浏览器',
      contentSubtitle: '地图资产',
      extensionRail: '扩展位',
      extensionSubtitle: '保留给后续编辑器生态',
      hostMode: '宿主环境',
      browserHost: '浏览器',
      desktopHost: '桌面端',
      gameDirectory: '游戏目录',
      directoryPlaceholder: '选择 Stardew Valley 安装目录',
      filterMaps: '筛选地图',
      filterPlaceholder: '按名称、文件名或相对路径过滤',
      preferredFormat: '优先格式',
      detectedMaps: '检测到的地图',
      sceneFocus: '当前焦点',
      installState: '安装状态',
      preferredMaps: '优先地图目录',
      noMapsFound: '尚未扫描到可加载的地图资产。',
      noFilteredMaps: '当前筛选条件下没有匹配的地图资产。',
      pinned: '优先',
      reserved: '预留',
    },
    center: {
      activeScene: '当前文档',
      noSceneLoaded: '尚未打开地图',
      viewport: '视口',
      canvas: '主画布',
      rightClick: '右键菜单已启用',
      selectTool: '选择',
      panTool: '平移',
      moduleWorkspace: '模块工作区',
      moduleCanvas: '主编辑面',
      moduleInspector: '模块侧栏',
    },
    rightDock: {
      title: '属性与图层',
      subtitle: 'Inspector / Layers / Diagnostics',
      inspector: 'Inspector',
      layers: '图层',
      objectGroups: '对象组',
      diagnostics: '诊断',
      sceneSummary: '场景摘要',
      hoverProbe: '悬停探针',
      hoverDetails: '悬停详情',
      projectFacts: '项目事实',
      workspaceStatus: '工作区状态',
      noTileProperties: '当前 Tile 没有附加属性。',
      noObjectGroups: '当前地图没有对象组。',
      noHoveredObjects: '当前悬停位置没有命中对象。',
      diagnosticsPrompt: '先验证游戏目录以填充诊断信息。',
      layerTiles: 'Tile',
      objectCount: '对象',
    },
    statusBar: {
      pathValid: 'SDV 路径有效',
      pathMissing: '未验证路径',
      scanned: '扫描结果',
      hover: '悬停',
      coordinates: '坐标',
    },
    common: {
      none: '无',
      yes: '是',
      no: '否',
      dimensions: '尺寸',
      tileSize: 'Tile 大小',
      tilesets: 'Tileset',
      objectGroups: '对象组',
      path: '路径',
      orientation: '方向',
      renderOrder: '渲染顺序',
      format: '格式',
      tile: 'Tile',
      pixel: '像素',
      gid: 'GID',
      layer: '图层',
      tileId: 'Tile ID',
      tileProperties: 'Tile 属性',
      type: '类型',
      bounds: '边界',
      executable: '可执行文件',
      unpackedMaps: '解包地图目录',
      xnbMaps: 'XNB 地图目录',
      visibleLayers: '可见图层',
      visibleObjects: '可见对象',
      objectLabel: (id) => `对象 ${id}`,
    },
    messages: {
      browserHostPrompt: '请在 Tauri 桌面宿主中运行，以访问本地 Stardew Valley 目录。',
      detectingDefaultInstall: '正在检测默认 Stardew Valley 安装目录...',
      detectedKnownPath: (path) => `检测到目录: ${path}`,
      automaticDetectionFailed: '自动检测失败，请手动选择目录。',
      enterFolderBeforeValidating: '请先输入 Stardew Valley 安装目录。',
      validatingDirectory: '正在验证游戏目录...',
      validatedDirectory: (path) => `目录验证通过: ${path}`,
      validationFailed: '目录验证失败。',
      enterFolderBeforeScanning: '请先输入 Stardew Valley 安装目录再扫描。',
      validatingAndScanning: '正在验证并扫描地图资产...',
      mapScanFailed: '地图扫描失败。',
      loadingMap: '正在加载地图...',
      loadingMapFailed: '地图加载失败。',
      onlyTmxSupported: '当前只支持 TMX 地图加载。',
      directorySelectionFailed: '目录选择失败。',
      loadedMapAssets: (count, format) => `已加载 ${count} 个 ${format.toUpperCase()} 地图资产。`,
      loadedMapAssetsWithActiveMap: (count, format, mapName) =>
        `已加载 ${count} 个 ${format.toUpperCase()} 地图资产，当前打开 ${mapName}。`,
    },
    viewportLabels: {
      loadPrompt: '加载 TMX 地图后，这里会变成可平移、可缩放、可右键的主视口。',
      zoomOut: '缩小',
      oneToOne: '1:1',
      fit: '适配',
      zoomIn: '放大',
      fitMap: '适配地图',
      setOneToOne: '原始比例',
      centerView: '居中视图',
      resetPan: '重置平移',
      addObjectHere: '在此添加对象',
      inspectHover: '查看悬停信息',
      unavailable: '暂不可用',
      tilesLabel: '格',
      tilesetsLoadedLabel: (loaded, total) => `Tileset ${loaded}/${total}`,
      layersVisibleLabel: (visible, total) => `图层 ${visible}/${total}`,
      objectGroupsVisibleLabel: (visible, total) => `对象组 ${visible}/${total}`,
      zoomLabel: (zoom) => `${Math.round(zoom * 100)}%`,
      failedToLoadTilesetImage: (path) => `无法加载 Tileset 图像: ${path}`,
    },
    moduleBlueprints: {
      characters: {
        title: '角色编辑器',
        state: '预留',
        summary: '角色列表、肖像、日程、对话绑定与关系编辑将在这里收拢成统一工作流。',
        focusTitle: '肖像 / 日程焦点',
        listTitle: '角色目录',
        inspectorTitle: '角色参数',
        list: ['Abigail', 'Lewis', 'Robin', 'Wizard'],
        lanes: ['肖像与情绪', '日程时间线', '对话关系', '节日条件'],
        bullets: ['与地图对象双向定位', 'NPC 出生点校验', '天气与季节条件'],
        nodes: [],
      },
      buildings: {
        title: '建筑编辑器',
        state: '预留',
        summary: '建筑占地、入口点、室内映射与升级链路会复用同一套 Dock 体系。',
        focusTitle: '占地 / 入口焦点',
        listTitle: '建筑目录',
        inspectorTitle: '升级链',
        list: ['Barn', 'Coop', 'Shop', 'Town Hall'],
        lanes: ['Footprint', 'Entry', 'Interior Mapping', 'Upgrade Stage'],
        bullets: ['占地碰撞检查', '入口可视化', '升级差异对比'],
        nodes: [],
      },
      items: {
        title: '物品编辑器',
        state: '预留',
        summary: '定义、图集、商店规则、掉落与奖励会在统一主编辑面中协同工作。',
        focusTitle: '图集 / 定义焦点',
        listTitle: '物品目录',
        inspectorTitle: '分发规则',
        list: ['Seeds', 'Quest Item', 'Craftable', 'Festival Reward'],
        lanes: ['Definition', 'Icon Atlas', 'Shop Rules', 'Drops + Rewards'],
        bullets: ['图集坐标预览', '稀有度与价值校准', '奖励来源追踪'],
        nodes: [],
      },
      events: {
        title: '事件图编辑器',
        state: '预留',
        summary: 'Trigger / Condition / Action / Dialogue 会以节点图形式与地图视口联动。',
        focusTitle: '节点图',
        listTitle: '节点目录',
        inspectorTitle: '执行规则',
        list: ['Trigger', 'Condition', 'Action', 'Dialogue'],
        lanes: ['地图触发器', '条件分支', '动作节点', '对话节点'],
        bullets: ['与地图对象双向跳转', '时间与关系条件', '图与 Inspector 写回同步'],
        nodes: [
          { title: 'Town Entry', detail: 'Trigger' },
          { title: 'Festival Gate', detail: 'Condition' },
          { title: 'Mayor Intro', detail: 'Dialogue' },
          { title: 'Reward Mail', detail: 'Action' },
        ],
      },
    },
  },
  'en-US': {
    brand: {
      name: 'ModForge Studio',
      tagline: 'Professional mod authoring workspace',
    },
    menus: ['File', 'Edit', 'View', 'Tools', 'Window'],
    nav: {
      map: 'Map',
      characters: 'Characters',
      buildings: 'Buildings',
      items: 'Items',
      events: 'Events',
    },
    localeShort: {
      'zh-CN': '中',
      'en-US': 'EN',
    },
    statusTone: {
      idle: 'Idle',
      working: 'Working',
      ready: 'Ready',
      error: 'Error',
    },
    controls: {
      toggleTheme: 'Toggle theme',
      toggleLocale: 'Toggle language',
      browse: 'Browse',
      useKnownPath: 'Known Path',
      validateOnly: 'Validate',
      scanAndOpenTown: 'Scan World',
      showAll: 'Show all',
      hideAll: 'Hide all',
    },
    leftDock: {
      project: 'Project Navigator',
      projectSubtitle: 'Game directory and workspace health',
      contentBrowser: 'Content Browser',
      contentSubtitle: 'Map assets',
      extensionRail: 'Extension Rail',
      extensionSubtitle: 'Reserved for upcoming editor modules',
      hostMode: 'Host mode',
      browserHost: 'Browser',
      desktopHost: 'Desktop',
      gameDirectory: 'Game directory',
      directoryPlaceholder: 'Select the Stardew Valley install folder',
      filterMaps: 'Filter maps',
      filterPlaceholder: 'Filter by name, file name, or relative path',
      preferredFormat: 'Preferred format',
      detectedMaps: 'Detected maps',
      sceneFocus: 'Scene focus',
      installState: 'Install state',
      preferredMaps: 'Preferred maps path',
      noMapsFound: 'No loadable map assets have been scanned yet.',
      noFilteredMaps: 'No map assets match the current filter.',
      pinned: 'Pinned',
      reserved: 'Reserved',
    },
    center: {
      activeScene: 'Active document',
      noSceneLoaded: 'No map loaded',
      viewport: 'Viewport',
      canvas: 'Main canvas',
      rightClick: 'Right-click menu enabled',
      selectTool: 'Select',
      panTool: 'Pan',
      moduleWorkspace: 'Module Workspace',
      moduleCanvas: 'Main Editing Surface',
      moduleInspector: 'Module Sidebar',
    },
    rightDock: {
      title: 'Properties & Layers',
      subtitle: 'Inspector / Layers / Diagnostics',
      inspector: 'Inspector',
      layers: 'Tile Layers',
      objectGroups: 'Object Groups',
      diagnostics: 'Diagnostics',
      sceneSummary: 'Scene Summary',
      hoverProbe: 'Hover Probe',
      hoverDetails: 'Hover Details',
      projectFacts: 'Project Facts',
      workspaceStatus: 'Workspace Status',
      noTileProperties: 'The current tile has no extra properties.',
      noObjectGroups: 'This map has no object groups.',
      noHoveredObjects: 'No objects are hit at the current hover point.',
      diagnosticsPrompt: 'Validate a game directory to populate diagnostics.',
      layerTiles: 'tiles',
      objectCount: 'objects',
    },
    statusBar: {
      pathValid: 'SDV path valid',
      pathMissing: 'Path not validated',
      scanned: 'Scanned',
      hover: 'Hover',
      coordinates: 'Coordinates',
    },
    common: {
      none: 'None',
      yes: 'Yes',
      no: 'No',
      dimensions: 'Dimensions',
      tileSize: 'Tile size',
      tilesets: 'Tilesets',
      objectGroups: 'Object groups',
      path: 'Path',
      orientation: 'Orientation',
      renderOrder: 'Render order',
      format: 'Format',
      tile: 'Tile',
      pixel: 'Pixel',
      gid: 'GID',
      layer: 'Layer',
      tileId: 'Tile ID',
      tileProperties: 'Tile properties',
      type: 'Type',
      bounds: 'Bounds',
      executable: 'Executable',
      unpackedMaps: 'Unpacked maps',
      xnbMaps: 'XNB maps',
      visibleLayers: 'Visible layers',
      visibleObjects: 'Visible objects',
      objectLabel: (id) => `Object ${id}`,
    },
    messages: {
      browserHostPrompt: 'Run this screen inside the Tauri desktop host to access the local Stardew Valley directory.',
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
      loadedMapAssets: (count, format) => `Loaded ${count} ${format.toUpperCase()} map assets.`,
      loadedMapAssetsWithActiveMap: (count, format, mapName) =>
        `Loaded ${count} ${format.toUpperCase()} map assets. ${mapName} is active.`,
    },
    viewportLabels: {
      loadPrompt: 'Load a TMX map and this becomes the pan-able, zoomable main viewport.',
      zoomOut: 'Zoom out',
      oneToOne: '1:1',
      fit: 'Fit',
      zoomIn: 'Zoom in',
      fitMap: 'Fit map',
      setOneToOne: 'Original scale',
      centerView: 'Center view',
      resetPan: 'Reset pan',
      addObjectHere: 'Add object here',
      inspectHover: 'Inspect hover data',
      unavailable: 'Unavailable',
      tilesLabel: 'tiles',
      tilesetsLoadedLabel: (loaded, total) => `Tilesets ${loaded}/${total}`,
      layersVisibleLabel: (visible, total) => `Layers ${visible}/${total}`,
      objectGroupsVisibleLabel: (visible, total) => `Object groups ${visible}/${total}`,
      zoomLabel: (zoom) => `${Math.round(zoom * 100)}%`,
      failedToLoadTilesetImage: (path) => `Failed to load tileset image: ${path}`,
    },
    moduleBlueprints: {
      characters: {
        title: 'Character Editor',
        state: 'Reserved',
        summary: 'Roster, portraits, schedules, dialogue bindings, and relationships will converge here.',
        focusTitle: 'Portrait / Schedule Focus',
        listTitle: 'Roster',
        inspectorTitle: 'Linked Parameters',
        list: ['Abigail', 'Lewis', 'Robin', 'Wizard'],
        lanes: ['Portrait + emotions', 'Schedule timeline', 'Dialogue relations', 'Festival conditions'],
        bullets: ['Bidirectional map anchors', 'NPC spawn validation', 'Weather and season conditions'],
        nodes: [],
      },
      buildings: {
        title: 'Building Editor',
        state: 'Reserved',
        summary: 'Footprints, entry points, interior mapping, and upgrade stages will reuse the same dock system.',
        focusTitle: 'Footprint / Entry Focus',
        listTitle: 'Building List',
        inspectorTitle: 'Upgrade Chain',
        list: ['Barn', 'Coop', 'Shop', 'Town Hall'],
        lanes: ['Footprint', 'Entry', 'Interior mapping', 'Upgrade stage'],
        bullets: ['Collision footprint checks', 'Entry visualization', 'Upgrade diff preview'],
        nodes: [],
      },
      items: {
        title: 'Item Editor',
        state: 'Reserved',
        summary: 'Definitions, atlases, shop rules, drops, and rewards will share one dense editing surface.',
        focusTitle: 'Atlas / Definition Focus',
        listTitle: 'Catalog',
        inspectorTitle: 'Distribution Rules',
        list: ['Seeds', 'Quest Item', 'Craftable', 'Festival Reward'],
        lanes: ['Definition', 'Icon atlas', 'Shop rules', 'Drops + rewards'],
        bullets: ['Atlas coordinate preview', 'Rarity and value balancing', 'Reward source chains'],
        nodes: [],
      },
      events: {
        title: 'Event Graph',
        state: 'Reserved',
        summary: 'Trigger, Condition, Action, and Dialogue will work as a graph linked back into the map viewport.',
        focusTitle: 'Node Graph',
        listTitle: 'Node Catalog',
        inspectorTitle: 'Execution Rules',
        list: ['Trigger', 'Condition', 'Action', 'Dialogue'],
        lanes: ['Map trigger', 'Conditional branch', 'Action node', 'Dialogue node'],
        bullets: ['Bidirectional links to map objects', 'Time and relationship conditions', 'Graph-to-inspector write-back'],
        nodes: [
          { title: 'Town Entry', detail: 'Trigger' },
          { title: 'Festival Gate', detail: 'Condition' },
          { title: 'Mayor Intro', detail: 'Dialogue' },
          { title: 'Reward Mail', detail: 'Action' },
        ],
      },
    },
  },
}
