import type { LauncherInstallBackupSummary } from './launcherContracts'

/**
 * 安装备份卡片的纯展示逻辑：把时间戳、主 mod 名称等后端字段转成
 * 对话框可直接渲染的字符串。不读写状态、无副作用。
 */

/**
 * 把备份创建时间（epoch 毫秒）格式化为 `YYYY-MM-DD HH:mm`（UTC），
 * 非法输入返回 null，由调用方决定隐藏或回退。
 */
export function formatInstallBackupTimestamp(createdAtMs: number | null | undefined): string | null {
  if (typeof createdAtMs !== 'number' || !Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    return null
  }
  const date = new Date(createdAtMs)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * 备份卡片主标题：新备份显示主 mod 名称，旧备份（无 metadata 上下文字段）
 * 回退为 backupId，保证列表里任何备份都可辨识。
 */
export function resolveInstallBackupTitle(backup: Pick<LauncherInstallBackupSummary, 'primaryModName' | 'backupId'>): string {
  const name = backup.primaryModName?.trim()
  return name ? name : backup.backupId
}

/**
 * 版本 pill 文案，如 `v1.2.3`；无版本时返回 null。
 */
export function formatInstallBackupVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim()
  return trimmed ? `v${trimmed}` : null
}
