import type { GuidesCopy } from '../../model'

const guides: GuidesCopy = {
  controls: {
    previous: '上一步',
    next: '下一步',
    skip: '跳过',
    finish: '完成',
    stepCounter: (current, total) => `${current} / ${total}`,
    anchorClickHint: '点击高亮区域继续',
  },
  replayPendingTitle: '指引将在进入对应页面后播放',
  replayPendingDescription: (guideTitle) => `打开「${guideTitle}」所在页面后会自动开始指引。`,
  definitions: {
    'launcher-library': {
      title: '模组库',
      steps: {
        welcome: {
          title: '欢迎使用模组库',
          description: '这里管理你已安装的全部星露谷模组：浏览、搜索、排序、启停和更新都从这里开始。',
        },
        'nav-tabs': {
          title: '页面导航',
          description: '在模组库、发现、更新和诊断之间切换。徽章会提示可用更新和下载进度。',
        },
        'library-toolbar': {
          title: '搜索与视图',
          description: '按名称搜索模组，调整排序和网格密度，或切换列表/网格视图。',
        },
        'pack-sidebar': {
          title: '合集侧栏',
          description: '用合集和文件夹组织模组，支持拖拽归类，批量管理一组模组。',
        },
        'mod-grid': {
          title: '模组网格',
          description: '每张卡片显示封面、版本和状态。拖拽卡片可排序或移入合集，右键打开更多操作。',
        },
        'mod-detail': {
          title: '模组详情',
          description: '选中模组后在这里查看简介、依赖和文件，执行更新、回滚或卸载。',
        },
      },
    },
    'launcher-discover': {
      title: '发现模组',
      steps: {
        welcome: {
          title: '发现新模组',
          description: '直接检索 Nexus Mods 上的星露谷模组，找到后一键下载到模组库。',
        },
        'discover-search': {
          title: '搜索模组',
          description: '输入关键词搜索 Nexus Mods，回车或点击按钮开始检索。',
        },
        'discover-toolbar': {
          title: '筛选与排序',
          description: '按时间范围、排序方式和每页数量过滤结果，找到最合适的模组。',
        },
        'discover-results': {
          title: '结果与下载',
          description: '浏览模组卡片查看简介，点击下载即可加入下载队列并自动安装。',
        },
      },
    },
    'launcher-updates': {
      title: '模组更新',
      steps: {
        welcome: {
          title: '保持模组最新',
          description: '这里汇总所有可更新的模组，逐一手动更新或批量处理。',
        },
        'updates-check': {
          title: '检查更新',
          description: '手动刷新更新列表，查看每个模组的当前版本与最新版本。',
        },
        'updates-list': {
          title: '更新列表',
          description: '查看更新日志，选择立即更新或忽略某个版本。',
        },
      },
    },
    'launcher-configuration': {
      title: '启动器诊断',
      steps: {
        welcome: {
          title: '诊断启动器',
          description: '游戏路径、Nexus 账号和诊断选项都在这里维护。',
        },
        'config-game': {
          title: '游戏与路径',
          description: '设置星露谷游戏目录和 SMAPI 路径，这是安装与启动模组的基础。',
        },
        'config-nexus': {
          title: 'Nexus 账号',
          description: '登录 Nexus Mods 账号以启用下载、更新检查和收藏同步。',
        },
        'config-diagnostics': {
          title: '诊断信息',
          description: '排查连接或解析问题时，在这里查看各服务的诊断结果。',
        },
      },
    },
    'workbench-home': {
      title: '工作台',
      steps: {
        welcome: {
          title: '欢迎使用工作台',
          description: '工作台是制作星露谷模组的地方：管理项目、编辑内容、生成本地化文件。',
        },
        'workbench-nav': {
          title: '模块导航',
          description: '按职能浏览项目仪表盘、内容编辑器和工具，点击进入对应模块。',
        },
        'workbench-modules': {
          title: '项目与模块',
          description: '打开或创建模组项目，进入事件、物品、角色等内容编辑工作区。',
        },
      },
    },
    'workbench-translation': {
      title: '本地化中心',
      steps: {
        welcome: {
          title: '本地化中心',
          description: '为模组生成和维护多语言翻译，利用知识库和官方语料保持一致性。',
        },
        'translation-views': {
          title: '翻译视图',
          description: '在 AI 本地化、知识中心、官方语料和质量历史之间切换。',
        },
        'translation-knowledge': {
          title: '知识与语料',
          description: '沉淀术语和常用译法，让每次翻译都复用已有成果。',
        },
      },
    },
  },
}

export default guides
