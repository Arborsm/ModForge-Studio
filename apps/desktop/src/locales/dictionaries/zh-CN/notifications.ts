import type { NotificationCopy } from '../../model'

const notifications: NotificationCopy = {
  viewportLabel: '通知',
  dismissLabel: '关闭通知',
  actionHint: '按 Enter 执行操作',
  levels: {
    success: '成功',
    info: '信息',
    debug: '调试',
    warning: '警告',
    error: '错误',
  },
  ai: {
    settingsSaveFailedTitle: 'AI 设置未保存',
    modelListFailedTitle: '无法加载 AI 模型',
    connectionTestFailedTitle: 'AI 连接测试失败',
    cacheClearFailedTitle: '未能清空翻译缓存',
    cacheFailedTitle: '本地翻译缓存不可用',
    translationFailedTitle: 'AI 翻译失败',
    partialTranslationFailedTitle: '部分翻译失败',
    partialTranslationFailedDescription: (count) => `${count} 个条目未能翻译，成功结果仍保留在草稿中。`,
    retryAction: '重试',
    failureDescriptions: {
      'not-configured': '请先在设置中配置并选择默认 AI 档案。',
      authentication: '供应商拒绝了当前凭据，请检查 API Key 和账户权限。',
      model: '当前模型不可用，或供应商不支持该模型。',
      'rate-limit': '已触发供应商速率限制，请稍后重试。',
      timeout: '供应商未能在请求超时前响应。',
      network: '无法连接供应商，请检查端点和网络连接。',
      cache: '无法读取或更新本地翻译缓存，AI 供应商本身可能仍然可用。',
      'invalid-response': '供应商返回的结果不符合翻译格式要求。',
      'placeholder-mismatch': '供应商修改了受保护占位符，已丢弃不安全结果。',
      cancelled: '翻译已取消。',
      unknown: '请查看页面内错误详情后重试。',
    },
  },
}

export default notifications
