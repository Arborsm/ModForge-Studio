const STORAGE_THEME = 'modforge-website-theme'
const STORAGE_LOCALE = 'modforge-website-locale'

const messages = {
  zh: {
    skip: '跳到主要内容',
    brandTag: '专业模组创作工作区',
    navFeatures: '能力',
    navWorkbench: '工作台',
    navLauncher: '启动器',
    navPlatforms: '平台',
    navSource: '源码',
    navDownload: '获取应用',
    heroEyebrow: '星露谷物语 · 桌面工作台',
    heroTitle: '在同一张工坊桌上，管模组、读资源、写补丁。',
    heroLead:
      'ModForge Studio 把模组库管理、游戏资源检视、Content Patcher 创作与桌面启动流程收进一个专业工作区。像在田园工坊里开工，工具都在手边。',
    heroCtaPrimary: '开始使用',
    heroCtaSecondary: '看看工作台',
    metaMods: '模组库',
    metaModsDesc: '扫描 · 启用 · 安装',
    metaAssets: '资源检视',
    metaAssetsDesc: '地图 · 事件 · 角色',
    metaCp: 'Content Patcher',
    metaCpDesc: '草稿 · 追踪 · 导出',
    mockMode: 'Workbench',
    mockProject: 'Valley Night Market',
    mockRail: 'Studio Desk',
    mockNavDesk: '工作台首页',
    mockNavAssets: '资源',
    mockNavMap: '地图',
    mockNavEvents: '事件',
    mockNavMods: '模组',
    mockPatches: '补丁就绪',
    mockCrumb: 'Project Lobby / 夜市草稿',
    mockStatus: '诊断通过',
    mockInspire: '近期灵感',
    mockItem1: '码头灯串事件',
    mockItem2: '渔夫小屋传送点',
    mockItem3: '姜岛礼物表',
    mockCanvas: '舞台预览',
    mockTrace: '补丁追踪',
    mockCaption: '示意界面：Studio Desk 三栏创作桌 · 灵感 / 舞台 / 追踪',
    shotWorkbench: 'Workbench 实机界面',
    shotLauncher: 'Launcher 模组库（开发 mock）',
    featEyebrow: '工坊能力',
    featTitle: '不是五个分散工具，是一条连贯流水线。',
    featLead: '从安装到检视，从草稿到导出，每一步都落在同一套桌面运行时里，减少在文件夹与网页之间来回切换。',
    feat1Title: '模组库与启动流',
    feat1Body: '扫描本地 SMAPI 模组、启用/禁用、安装备份与包管理。启动器侧还能对接 Nexus 发现、下载队列与更新比对。',
    feat1c1: 'Installed Library',
    feat1c2: 'Download queue',
    feat1c3: 'Update keys',
    feat2Title: '资源与世界数据',
    feat2Body: '检视地图、事件、角色、物品、建筑与存档。把游戏世界当目录来读，而不是当黑盒。',
    feat3Title: 'Content Patcher 创作',
    feat3Body: '结构化草稿、变更注册表、动态 Token、自定义地点与导出指纹。面向真实补丁管线，而不是纯文本堆砌。',
    feat4Title: '事件图与脚本诊断',
    feat4Body: '事件命令按对话、移动、视觉、逻辑等分类编排；舞台预览与诊断把时间轴和错误原因放在同一视野。',
    feat4l1: 'Event Timeline',
    feat4l2: 'Script diagnostics',
    feat4l3: 'Continuity sheet',
    wbEyebrow: 'Workbench',
    wbTitle: '三栏创作桌：灵感、心跳、世界圣经。',
    wbBody:
      'Studio Desk 把近期灵感放在左侧，项目心跳与工作区入口放在中间，世界规则、Token 与导出中心放在右侧。从 Project Lobby 进入地图、角色、建筑、物品、事件或模组工作区，各自独立编辑，又共享同一项目上下文。',
    wbSpec1t: '工作区模式',
    wbSpec1d: 'map · characters · buildings · items · events · mods',
    wbSpec2t: '面板',
    wbSpec2d: 'Assets · Viewport · Event Timeline · Item Catalog',
    wbSpec3t: '导出',
    wbSpec3d: 'Export Center · 指纹与补丁目录',
    deskL: '灵感',
    deskC: '项目心跳',
    deskR: '世界圣经',
    deskHeart: 'Valley Night Market',
    deskHeartSub: '12 patches · 3 diagnostics clear',
    lbLib: 'Installed Library',
    lbMissing: '缺依赖 2',
    lbQueue: '下载队列',
    lnEyebrow: 'Launcher',
    lnTitle: '模组、更新与下载任务，收在同一个壳层视图。',
    lnBody:
      'Library 管本地安装库；Discover 搜 Nexus 并排队下载；Updates 用 UpdateKeys 对照线上版本；Configuration 管理游戏路径、Nexus API 与诊断。状态优先：启用数、缺失依赖、队列进度和路由健康一目了然。',
    lnC1: 'Pack presets 与隐藏模组',
    lnC2: '安装备份与摘要',
    lnC3: 'Nexus 网络诊断与 API Key',
    plEyebrow: '桌面优先',
    plTitle: 'Linux、macOS、Windows 同一套 Rust 后端能力。',
    plLead:
      '前端 React 工作区；Linux 走 Electron 宿主，macOS / Windows 走 Tauri v2。宿主命令统一经 Host Runtime 调度，业务层不直接碰平台 API。',
    plWin: 'Tauri 打包 · MSI / NSIS',
    plMac: 'Tauri v2 桌面路径',
    plLinux: 'Electron + Rust sidecar',
    ctaEyebrow: '开源 · 早期开发',
    ctaTitle: '在工坊里坐下，从源码或发行包开工。',
    ctaBody: '项目仍在活跃开发中。克隆仓库后用 Vite+ 启动完整桌面应用；发行包可从仓库 Release 获取（以仓库说明为准）。',
    ctaGithub: '查看仓库',
    ctaTop: '回到顶部',
    footerTag: '星露谷物语模组创作与管理工作台',
    footerLicense: '许可证 GPL-3.0-or-later',
    footerNote: 'Stardew Valley 归 ConcernedApe 所有；本站为非官方工具介绍。',
    docTitle: 'ModForge Studio · 星露谷模组工作台',
    docDesc: 'ModForge Studio — 面向《星露谷物语》的桌面端模组创作与管理工作台。',
  },
  en: {
    skip: 'Skip to content',
    brandTag: 'Professional mod authoring workspace',
    navFeatures: 'Features',
    navWorkbench: 'Workbench',
    navLauncher: 'Launcher',
    navPlatforms: 'Platforms',
    navSource: 'Source',
    navDownload: 'Get the app',
    heroEyebrow: 'Stardew Valley · Desktop workbench',
    heroTitle: 'One workshop desk for mods, assets, and patches.',
    heroLead:
      'ModForge Studio brings mod library management, game asset inspection, Content Patcher authoring, and desktop launch workflows into one workspace. Tools stay close, like a warm studio bench.',
    heroCtaPrimary: 'Get started',
    heroCtaSecondary: 'Tour the workbench',
    metaMods: 'Mod library',
    metaModsDesc: 'Scan · enable · install',
    metaAssets: 'Asset inspection',
    metaAssetsDesc: 'Maps · events · characters',
    metaCp: 'Content Patcher',
    metaCpDesc: 'Drafts · traces · export',
    mockMode: 'Workbench',
    mockProject: 'Valley Night Market',
    mockRail: 'Studio Desk',
    mockNavDesk: 'Studio Desk',
    mockNavAssets: 'Assets',
    mockNavMap: 'Map',
    mockNavEvents: 'Events',
    mockNavMods: 'Mods',
    mockPatches: 'Patches ready',
    mockCrumb: 'Project Lobby / Night Market draft',
    mockStatus: 'Diagnostics clear',
    mockInspire: 'Recent sparks',
    mockItem1: 'Pier lantern event',
    mockItem2: 'Fisherman cabin warp',
    mockItem3: 'Ginger Island gifts',
    mockCanvas: 'Stage preview',
    mockTrace: 'Patch trace',
    mockCaption: 'Illustrative UI: Studio Desk · sparks / stage / trace',
    shotWorkbench: 'Workbench from a live build',
    shotLauncher: 'Launcher library (dev mock)',
    featEyebrow: 'Workshop capabilities',
    featTitle: 'Not five loose tools. One continuous pipeline.',
    featLead:
      'From install to inspection, draft to export, each step stays inside the same desktop runtime so you spend less time hopping between folders and browser tabs.',
    feat1Title: 'Library and launch flow',
    feat1Body:
      'Scan local SMAPI mods, enable or disable them, manage installs, backups, and packs. The launcher side also covers Nexus discovery, download queues, and update comparison.',
    feat1c1: 'Installed Library',
    feat1c2: 'Download queue',
    feat1c3: 'Update keys',
    feat2Title: 'Assets and world data',
    feat2Body: 'Inspect maps, events, characters, items, buildings, and saves. Read the game world as a catalog instead of a black box.',
    feat3Title: 'Content Patcher authoring',
    feat3Body:
      'Structured drafts, change registry, dynamic tokens, custom locations, and export fingerprints. Built for a real patch pipeline, not a text dump.',
    feat4Title: 'Event graph and diagnostics',
    feat4Body:
      'Event commands group by dialogue, movement, visuals, logic, and more. Stage preview and diagnostics keep timeline and failure reasons in one view.',
    feat4l1: 'Event Timeline',
    feat4l2: 'Script diagnostics',
    feat4l3: 'Continuity sheet',
    wbEyebrow: 'Workbench',
    wbTitle: 'A three-part creation desk: sparks, heartbeat, world bible.',
    wbBody:
      'Studio Desk keeps recent sparks on the left, project heartbeat and workspace entries in the middle, and world rules, tokens, and export in the right rail. From Project Lobby open map, character, building, item, event, or mod workspaces that edit independently while sharing one project context.',
    wbSpec1t: 'Workspace modes',
    wbSpec1d: 'map · characters · buildings · items · events · mods',
    wbSpec2t: 'Panels',
    wbSpec2d: 'Assets · Viewport · Event Timeline · Item Catalog',
    wbSpec3t: 'Export',
    wbSpec3d: 'Export Center · fingerprints and patch catalog',
    deskL: 'Sparks',
    deskC: 'Heartbeat',
    deskR: 'World bible',
    deskHeart: 'Valley Night Market',
    deskHeartSub: '12 patches · 3 diagnostics clear',
    lbLib: 'Installed Library',
    lbMissing: '2 missing deps',
    lbQueue: 'Download queue',
    lnEyebrow: 'Launcher',
    lnTitle: 'Mods, updates, and downloads in one shell view.',
    lnBody:
      'Library manages the local install set. Discover searches Nexus and queues downloads. Updates compares versions via UpdateKeys. Configuration owns game paths, Nexus API, and diagnostics. Operational state stays visible: enabled mods, missing deps, queue progress, and route health.',
    lnC1: 'Pack presets and hidden mods',
    lnC2: 'Install backups and summaries',
    lnC3: 'Nexus network diagnostics and API key',
    plEyebrow: 'Desktop first',
    plTitle: 'Linux, macOS, and Windows share one Rust backend.',
    plLead:
      'React powers the workspace UI. Linux uses an Electron host; macOS and Windows use Tauri v2. Host commands route through Host Runtime so business code never calls platform APIs directly.',
    plWin: 'Tauri packages · MSI / NSIS',
    plMac: 'Tauri v2 desktop path',
    plLinux: 'Electron + Rust sidecar',
    ctaEyebrow: 'Open source · early development',
    ctaTitle: 'Sit down at the bench. Start from source or a release build.',
    ctaBody:
      'The project is in active early development. Clone the repo and start the full desktop app with Vite+. Release packages come from repository releases when available.',
    ctaGithub: 'View repository',
    ctaTop: 'Back to top',
    footerTag: 'Desktop workbench for Stardew Valley mods',
    footerLicense: 'License GPL-3.0-or-later',
    footerNote: 'Stardew Valley is by ConcernedApe. This site is an unofficial tool intro.',
    docTitle: 'ModForge Studio · Stardew Valley mod workbench',
    docDesc: 'ModForge Studio is a desktop workbench for creating, inspecting, and managing Stardew Valley mods.',
  },
}

function preferredTheme() {
  const stored = localStorage.getItem(STORAGE_THEME)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function preferredLocale() {
  const stored = localStorage.getItem(STORAGE_LOCALE)
  if (stored === 'zh' || stored === 'en') return stored
  const lang = (navigator.language || 'zh').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_THEME, theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#16130f' : '#f4efe4'
  const toggle = document.getElementById('theme-toggle')
  if (toggle) {
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
  }
}

function applyLocale(locale) {
  const dict = messages[locale] || messages.zh
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  document.documentElement.dataset.locale = locale
  localStorage.setItem(STORAGE_LOCALE, locale)

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (key && dict[key] != null) el.textContent = dict[key]
  })

  if (dict.docTitle) document.title = dict.docTitle
  const desc = document.querySelector('meta[name="description"]')
  if (desc && dict.docDesc) desc.setAttribute('content', dict.docDesc)

  const label = document.getElementById('locale-label')
  if (label) label.textContent = locale === 'zh' ? 'EN' : '中文'

  const localeToggle = document.getElementById('locale-toggle')
  if (localeToggle) {
    localeToggle.setAttribute('aria-label', locale === 'zh' ? 'Switch to English' : '切换到中文')
  }
}

function setupReveal() {
  const nodes = document.querySelectorAll('[data-reveal]')
  if (!nodes.length) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((node) => node.classList.add('is-in'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )

  nodes.forEach((node) => io.observe(node))
}

function setupPointerGlow() {
  const glow = document.querySelector('.pointer-glow')
  if (!glow) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!window.matchMedia('(pointer: fine)').matches) return

  let raf = 0
  let x = window.innerWidth * 0.5
  let y = window.innerHeight * 0.2

  const paint = () => {
    raf = 0
    document.documentElement.style.setProperty('--mx', `${x}px`)
    document.documentElement.style.setProperty('--my', `${y}px`)
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      x = event.clientX
      y = event.clientY
      if (!raf) raf = requestAnimationFrame(paint)
    },
    { passive: true },
  )
}

function wireControls() {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  })

  document.getElementById('locale-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.locale === 'zh' ? 'en' : 'zh'
    applyLocale(next)
  })
}

function boot() {
  applyTheme(preferredTheme())
  applyLocale(preferredLocale())
  wireControls()
  setupReveal()
  setupPointerGlow()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
