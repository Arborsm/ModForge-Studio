import type { LauncherUpdatesCopy } from '../../../model/launcher'

const updates: LauncherUpdatesCopy = {
  title: '模组更新',
  subtitle: '基于 UpdateKeys 对已安装模组与 Nexus 页面做版本比对。',
  empty: '当前没有可用更新，或已安装模组缺少可识别的 Nexus UpdateKeys。',
  selectionSummary: (selected, total) => `已选择 ${selected} / ${total} 个更新`,
  availableCount: (count) => `(${count}个可用更新)`,
  toggleSelection: (allSelected) => (allSelected ? '取消全选' : '全选'),
  recheck: '重新检查',
  updateSelected: '一键更新所有勾选项',
  updateOne: '更新此项',
  expandDetails: '展开详情',
  viewChangelog: '更新日志',
  fetchDetails: '抓取详情',
  fetchChangelog: '抓取更新日志',
  openHomepage: '前往模组主页',
  openComments: '查看评论区',
  overviewTitle: '版本概览',
  releaseLabel: '发布时间',
  sizeLabel: '文件大小',
  detailsLoading: '正在加载模组详情...',
  detailsEmpty: '点击“抓取详情”后在这里显示模组摘要、作者和来源信息。',
  changelogTitle: (version) => (version ? `更新日志 (${version.startsWith('v') ? version : `v${version}`})` : '更新日志'),
  changelogLoading: '正在加载更新日志...',
  changelogEmpty: '这个版本没有可用的更新说明。',
  fetchDetailNotice: '正在抓取模组详情',
  fetchChangelogNotice: '正在抓取更新日志',
  releaseUnknown: '发布时间未知',
  sizeUnknown: '大小未知',
  checkingProgressTitle: '检查模组更新',
  checkingProgressDetail: (checked, total, currentModName) =>
    currentModName
      ? `正在检查 ${currentModName}（${checked}/${total || '?'}）`
      : total > 0
        ? `已检查 ${checked}/${total} 个模组`
        : '正在准备已安装模组',
  checkFailedTitle: '检查模组更新失败',
  checkFailedDetail: '这次检查没有完成，请重试。详细原因已通过通知显示。',
  issueLabel: '异常点',
  diagnosticsAction: '前往通路诊断',
  detailsExpandAction: '展开详情',
  detailsCollapseAction: '收起详情',
  copyLogsAction: '复制日志',
  blockedTitle: '自动更新检查已暂停',
  blockedDetail: '更新通路连续失败后，后台自动检查会先暂停，避免反复发送同样会失败的请求。',
}

export default updates
