import { AiLocalizationView } from '../../tools/ai-localization'
import { useWorkbenchEnvironment } from '../../model/workbenchModuleContexts'
export default function AiLocalizationModuleRuntime() {
  const environment = useWorkbenchEnvironment()
  return (
    <AiLocalizationView
      gameDirectory={environment.directoryInfo?.rootPath}
      onOpenAiSettings={environment.onOpenSettings ? () => environment.onOpenSettings?.('ai') : undefined}
    />
  )
}
