/**
 * Manifest-level validation for a draft's `projectMetadata`.
 *
 * SMAPI rejects packs whose manifest is malformed (empty UniqueID, non-semver
 * Version), and update checks silently stop working for misshapen UpdateKeys.
 * These rules run before export so the author finds out in the workbench,
 * not in the SMAPI console.
 */

import type { AssetIssue } from '@entities/asset-schema'
import type { CpMakerDraft } from './types'

type ManifestMetadata = CpMakerDraft['projectMetadata']

/** SMAPI semantic versions allow prerelease/build suffixes (`1.0.0-beta.1`). */
const SEMVER_LIKE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]*)?$/
/** Update keys look like `Nexus:12345` or `GitHub:owner/repo`. */
const UPDATE_KEY_SHAPE = /^[A-Za-z][A-Za-z0-9]*:\S+$/
/** The conventional `Author.ModName` unique-id shape (no whitespace, one dot). */
const UNIQUE_ID_SHAPE = /^[^\s.]+\.[^\s]+$/

function versionShapeIssue(field: string, value: string): AssetIssue {
  return {
    severity: 'warning',
    code: 'manifestVersionShape',
    messageKey: 'manifest.versionShape',
    path: ['manifest', field],
    params: { field, value },
  }
}

/** Collects manifest findings for the draft metadata, in field order. */
export function collectManifestIssues(metadata: ManifestMetadata): AssetIssue[] {
  const issues: AssetIssue[] = []

  if (metadata.projectName.trim() === '') {
    issues.push({
      severity: 'error',
      code: 'manifestNameMissing',
      messageKey: 'manifest.nameMissing',
      path: ['manifest', 'Name'],
    })
  }

  const uniqueId = metadata.projectUniqueId.trim()
  if (uniqueId === '') {
    issues.push({
      severity: 'error',
      code: 'manifestUniqueIdMissing',
      messageKey: 'manifest.uniqueIdMissing',
      path: ['manifest', 'UniqueID'],
    })
  } else if (!UNIQUE_ID_SHAPE.test(uniqueId)) {
    issues.push({
      severity: 'warning',
      code: 'manifestUniqueIdShape',
      messageKey: 'manifest.uniqueIdShape',
      path: ['manifest', 'UniqueID'],
      params: { value: uniqueId },
    })
  }

  if (!SEMVER_LIKE.test(metadata.projectVersion.trim())) {
    issues.push({
      severity: 'error',
      code: 'manifestVersionInvalid',
      messageKey: 'manifest.versionInvalid',
      path: ['manifest', 'Version'],
      params: { value: metadata.projectVersion },
    })
  }

  if (metadata.projectAuthor.trim() === '') {
    issues.push({
      severity: 'warning',
      code: 'manifestAuthorMissing',
      messageKey: 'manifest.authorMissing',
      path: ['manifest', 'Author'],
    })
  }

  if (metadata.contentPackForUniqueId.trim() === '') {
    issues.push({
      severity: 'error',
      code: 'manifestContentPackForMissing',
      messageKey: 'manifest.contentPackForMissing',
      path: ['manifest', 'ContentPackFor'],
    })
  }

  if (metadata.contentPackForMinimumVersion && !SEMVER_LIKE.test(metadata.contentPackForMinimumVersion.trim())) {
    issues.push(versionShapeIssue('ContentPackFor.MinimumVersion', metadata.contentPackForMinimumVersion))
  }
  if (metadata.minimumApiVersion && !SEMVER_LIKE.test(metadata.minimumApiVersion.trim())) {
    issues.push(versionShapeIssue('MinimumApiVersion', metadata.minimumApiVersion))
  }

  for (const updateKey of metadata.updateKeys ?? []) {
    if (!UPDATE_KEY_SHAPE.test(updateKey.trim())) {
      issues.push({
        severity: 'warning',
        code: 'manifestUpdateKeyShape',
        messageKey: 'manifest.updateKeyShape',
        path: ['manifest', 'UpdateKeys'],
        params: { value: updateKey },
      })
    }
  }

  const seenDependencyIds = new Set<string>()
  const dependencies = metadata.dependencies ?? []
  for (const [index, dependency] of dependencies.entries()) {
    const dependencyId = dependency.uniqueId.trim()
    if (dependencyId === '') {
      issues.push({
        severity: 'error',
        code: 'manifestDependencyUniqueIdMissing',
        messageKey: 'manifest.dependencyUniqueIdMissing',
        path: ['manifest', 'Dependencies', index],
        params: { index: index + 1 },
      })
      continue
    }
    const dedupeKey = dependencyId.toLowerCase()
    if (seenDependencyIds.has(dedupeKey)) {
      issues.push({
        severity: 'warning',
        code: 'manifestDependencyDuplicate',
        messageKey: 'manifest.dependencyDuplicate',
        path: ['manifest', 'Dependencies', index],
        params: { uniqueId: dependencyId },
      })
    }
    seenDependencyIds.add(dedupeKey)
    if (dependency.minimumVersion && !SEMVER_LIKE.test(dependency.minimumVersion.trim())) {
      issues.push(versionShapeIssue(`Dependencies[${index}].MinimumVersion`, dependency.minimumVersion))
    }
  }

  return issues
}
