import { ProjectSettingsPage } from '@features/cp-maker'
import { useWorkbenchProject } from '../../model/workbenchModuleContexts'

/**
 * Project-structure settings: manifest, ConfigSchema, DynamicTokens,
 * CustomLocations and AliasTokenNames — the parts of the pack that are not
 * per-asset content. Edits write straight into the draft; the page's own
 * header handles saving.
 */
export default function ProjectSettingsModuleRuntime() {
  const project = useWorkbenchProject()

  if (project.activeDraft === null) {
    return null
  }

  return (
    <ProjectSettingsPage
      draft={project.activeDraft}
      isDirty={project.isDirty}
      onMetadataChange={project.updateMetadata}
      onConfigSchemaChange={project.setConfigSchema}
      onDynamicTokensChange={project.setDynamicTokens}
      onCustomLocationsChange={project.setCustomLocations}
      onAliasTokenNamesChange={project.setAliasTokenNames}
      onSaveDraft={() => void project.saveDraft()}
    />
  )
}
