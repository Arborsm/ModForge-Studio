import type { CpMakerDraft } from './types'

/**
 * Form-state shape of the manifest metadata shared by the create dialog and
 * the project properties dialog. Everything is a string (UpdateKeys is edited
 * one-per-line) so inputs stay controlled; conversion back to metadata trims
 * and drops empty optional values.
 */
export type ManifestMetadataFormValue = {
  projectName: string
  projectUniqueId: string
  projectAuthor: string
  projectVersion: string
  projectDescription: string
  contentPackForUniqueId: string
  contentPackForMinimumVersion: string
  minimumApiVersion: string
  /** One update key per line, e.g. `Nexus:12345`. */
  updateKeysText: string
  dependencies: Array<{ uniqueId: string; minimumVersion: string; isRequired: boolean }>
}

type ProjectMetadata = CpMakerDraft['projectMetadata']

/** Builds blank form state for a new project. */
export function emptyManifestFormValue(): ManifestMetadataFormValue {
  return {
    projectName: '',
    projectUniqueId: '',
    projectAuthor: '',
    projectVersion: '1.0.0',
    projectDescription: '',
    contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    contentPackForMinimumVersion: '',
    minimumApiVersion: '',
    updateKeysText: '',
    dependencies: [],
  }
}

/** Prefills form state from existing draft metadata (properties dialog). */
export function metadataToFormValue(metadata: Partial<ProjectMetadata>): ManifestMetadataFormValue {
  const empty = emptyManifestFormValue()
  return {
    projectName: metadata.projectName ?? empty.projectName,
    projectUniqueId: metadata.projectUniqueId ?? empty.projectUniqueId,
    projectAuthor: metadata.projectAuthor ?? empty.projectAuthor,
    projectVersion: metadata.projectVersion ?? empty.projectVersion,
    projectDescription: metadata.projectDescription ?? empty.projectDescription,
    contentPackForUniqueId: metadata.contentPackForUniqueId ?? empty.contentPackForUniqueId,
    contentPackForMinimumVersion: metadata.contentPackForMinimumVersion ?? '',
    minimumApiVersion: metadata.minimumApiVersion ?? '',
    updateKeysText: (metadata.updateKeys ?? []).join('\n'),
    dependencies: (metadata.dependencies ?? []).map((dependency) => ({
      uniqueId: dependency.uniqueId,
      minimumVersion: dependency.minimumVersion ?? '',
      isRequired: dependency.isRequired,
    })),
  }
}

/**
 * Converts form state into a metadata patch for `createDraft`/`updateMetadata`.
 * Optional fields come back `undefined` when blank so adapters can omit them.
 */
export function formValueToMetadata(value: ManifestMetadataFormValue): Partial<ProjectMetadata> {
  const optional = (text: string) => {
    const trimmed = text.trim()
    return trimmed === '' ? undefined : trimmed
  }
  const updateKeys = value.updateKeysText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const dependencies = value.dependencies
    .map((dependency) => ({
      uniqueId: dependency.uniqueId.trim(),
      minimumVersion: dependency.minimumVersion.trim(),
      isRequired: dependency.isRequired,
    }))
    .filter((dependency) => dependency.uniqueId !== '')

  return {
    projectName: value.projectName.trim(),
    projectUniqueId: value.projectUniqueId.trim(),
    projectAuthor: value.projectAuthor.trim(),
    projectVersion: value.projectVersion.trim() || '1.0.0',
    projectDescription: value.projectDescription.trim(),
    contentPackForUniqueId: value.contentPackForUniqueId.trim() || 'Pathoschild.ContentPatcher',
    contentPackForMinimumVersion: optional(value.contentPackForMinimumVersion),
    minimumApiVersion: optional(value.minimumApiVersion),
    updateKeys,
    dependencies,
  }
}

/**
 * Live-editing counterpart of `formValueToMetadata`: nothing is trimmed, so an
 * in-progress keystroke (a trailing space, a half-typed value) survives the
 * write-through to the draft. Emptiness is still mapped to `undefined` for the
 * optional fields, and whitespace-only update-key lines are dropped.
 */
export function formValueToMetadataLive(value: ManifestMetadataFormValue): Partial<ProjectMetadata> {
  return {
    projectName: value.projectName,
    projectUniqueId: value.projectUniqueId,
    projectAuthor: value.projectAuthor,
    projectVersion: value.projectVersion,
    projectDescription: value.projectDescription,
    contentPackForUniqueId: value.contentPackForUniqueId,
    contentPackForMinimumVersion: value.contentPackForMinimumVersion === '' ? undefined : value.contentPackForMinimumVersion,
    minimumApiVersion: value.minimumApiVersion === '' ? undefined : value.minimumApiVersion,
    updateKeys: value.updateKeysText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    dependencies: value.dependencies
      .filter((dependency) => dependency.uniqueId.trim() !== '')
      .map((dependency) => ({
        uniqueId: dependency.uniqueId,
        minimumVersion: dependency.minimumVersion === '' ? undefined : dependency.minimumVersion,
        isRequired: dependency.isRequired,
      })),
  }
}

/**
 * Derives the conventional `Author.Name` UniqueID from the name/author pair.
 * Returns an empty string when there is nothing to derive from, so the caller
 * can leave the field untouched instead of writing a placeholder.
 */
export function deriveUniqueId(projectName: string, projectAuthor: string): string {
  const author = projectAuthor.trim().replace(/\s+/g, '')
  const name = projectName.trim().replace(/\s+/g, '')
  if (author === '' || name === '') return ''
  return `${author}.${name}`
}
