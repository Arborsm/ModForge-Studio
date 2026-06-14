import type { ModuleBlueprintsCopy } from '../../../model/workbench'

const moduleblueprints: ModuleBlueprintsCopy = {
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
      {
        title: 'Town Entry',
        detail: 'Trigger',
      },
      {
        title: 'Festival Gate',
        detail: 'Condition',
      },
      {
        title: 'Mayor Intro',
        detail: 'Dialogue',
      },
      {
        title: 'Reward Mail',
        detail: 'Action',
      },
    ],
  },
}

export default moduleblueprints
