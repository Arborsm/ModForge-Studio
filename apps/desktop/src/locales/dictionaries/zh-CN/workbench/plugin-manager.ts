import type { PluginManagerCopy } from '../../../model/workbench/plugin-manager'

const pluginManager: PluginManagerCopy = {
  title: '兼容插件管理',
  reload: '重新加载',
  reloading: '正在重新加载...',
  openPluginDirectory: '打开插件目录',
  noPlugins: '未找到兼容插件',
  noPluginsDetail: '在插件根目录下未找到任何兼容插件。插件目录位于 apps/desktop/compat-plugins/。',
  loadError: '加载错误',
  pluginId: '插件 ID',
  pluginName: '名称',
  pluginType: '类型',
  typeDataPack: '数据包',
  typeCodePack: '代码包',
  targets: '目标模组',
  pages: '页面',
  format: '格式版本',
  error: '错误',
  reloadSuccess: '重新加载成功',
  reloadError: '重新加载失败',
  trustNotice: '代码包插件以全信任模式运行',
  trustNoticeDetail: '代码包插件拥有与宿主应用相同的权限。请仅安装来自可信来源的插件。',
}

export default pluginManager
