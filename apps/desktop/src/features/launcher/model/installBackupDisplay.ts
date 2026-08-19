import type { LauncherInstallBackupSummary } from './launcherContracts'

/**
 * @file Install backup card display helpers: timestamp/version/title formatting
 * for the restore dialog.
 */

/**
 * Formats the backup creation timestamp (epoch ms) as `YYYY-MM-DD HH:mm` (UTC);
 * returns null for invalid input so the caller can hide or fall back.
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
 * Backup card main title: new backups show the primary mod name; older backups
 * (without metadata context fields) fall back to backupId so every backup in
 * the list remains identifiable.
 */
export function resolveInstallBackupTitle(backup: Pick<LauncherInstallBackupSummary, 'primaryModName' | 'backupId'>): string {
  const name = backup.primaryModName?.trim()
  return name ? name : backup.backupId
}

/**
 * Version pill text, e.g. `v1.2.3`; returns null when no version is present.
 */
export function formatInstallBackupVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim()
  return trimmed ? `v${trimmed}` : null
}
