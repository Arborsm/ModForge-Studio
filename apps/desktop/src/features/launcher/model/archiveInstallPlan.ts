import { isUpdateAvailable } from './versionCompare'

/**
 * Install state of one detected archive mod root, derived from the inspect
 * preview: 'new' (no installed mod with the same unique ID), 'update'
 * (archive version is newer), 'reinstall' (versions equal or unknown), or
 * 'downgrade' (archive version is older). Missing versions never produce an
 * update/downgrade label; an existing install with unknown versions is
 * treated as a reinstall.
 */
export type ArchiveInstallStatus = 'new' | 'update' | 'reinstall' | 'downgrade'

export type ArchiveInstallPlan = {
  status: ArchiveInstallStatus
  /** Installed version of the matched mod, when known. */
  fromVersion: string | null
  /** Version declared by the archive manifest, when known. */
  toVersion: string | null
}

/**
 * Plans the install state for one mod root before install: classifies the
 * new/update/reinstall/downgrade status and exposes the version pair for the
 * `from -> to` label. `hasExisting` is true when the inspect matched an
 * installed mod by unique ID; version comparison follows SMAPI semantics via
 * `isUpdateAvailable` (see versionCompare.ts).
 */
export function planArchiveModRootInstall(
  manifestVersion: string | null | undefined,
  existingVersion: string | null | undefined,
  hasExisting: boolean,
): ArchiveInstallPlan {
  const fromVersion = existingVersion?.trim() || null
  const toVersion = manifestVersion?.trim() || null

  if (!hasExisting) {
    return { status: 'new', fromVersion: null, toVersion }
  }
  if (!fromVersion || !toVersion) {
    return { status: 'reinstall', fromVersion, toVersion }
  }
  if (isUpdateAvailable(fromVersion, toVersion)) {
    return { status: 'update', fromVersion, toVersion }
  }
  if (isUpdateAvailable(toVersion, fromVersion)) {
    return { status: 'downgrade', fromVersion, toVersion }
  }
  return { status: 'reinstall', fromVersion, toVersion }
}

/**
 * True when every detected mod root in an archive already exists in the Mods
 * folder (update/reinstall/downgrade) — used to switch the confirm action from
 * "Install" to "Update". Archives with no mod roots keep the install label.
 */
export function isArchiveUpdateOnly(roots: ReadonlyArray<{ existingUniqueId?: string | null; manifestUniqueId?: string | null }>): boolean {
  return roots.length > 0 && roots.every((root) => Boolean(root.existingUniqueId))
}
