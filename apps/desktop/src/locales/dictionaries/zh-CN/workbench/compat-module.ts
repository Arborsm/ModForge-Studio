import type { CompatModuleCopy } from '../../../model/workbench/compat-module'

const compatModule: CompatModuleCopy = {
  loadingTitle: '正在加载条目...',
  loadingDetail: '正在从目标模组目录读取数据，请稍候。',
  emptyTitle: '暂无条目',
  emptyDetail: '目标模组目录下未找到任何条目。请先在游戏中创建条目后再编辑。',
  modNotInstalledTitle: '未安装目标模组',
  modNotInstalledDetail: '在 Mods 目录中没有找到 {mod}。安装该模组后即可在这里编辑它的内容。',
  entryListTitle: '条目列表',
  entryListEmpty: '没有可编辑的条目',
  entrySearchPlaceholder: '搜索条目 ID…',
  entrySearchNoResults: '没有匹配的条目',
  unsavedChanges: '有未保存的更改',
  saveSuccess: '已保存',
  saveError: '保存失败',
  save: '保存',
  noSelection: '请从左侧列表选择一个条目',
  errorTitle: '加载失败',
  errorDetail: '读取条目数据时发生错误，请检查目标模组目录是否可访问。',
  recordListEntries: '个条目',
  objectFields: '个字段',
  invalidValue: '无效值',
  itemPickerPlaceholder: '输入物品名称或搜索…',
  itemPickerNoResults: '没有匹配的物品，可直接输入名称',
  entryPreviewAlt: '{entry} 的预览图',
  entryImageLoading: '加载中…',
  entryImageFailed: '图片加载失败',
  sectionCollapseToggle: '折叠/展开 {section} 区段',
}

export default compatModule
