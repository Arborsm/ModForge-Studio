import { AiLocalizationView } from '../localization-center'
import { useWorkbenchEnvironment } from '../../model/workbenchModuleContexts'
import { requestAppSettings } from '@shared/lib/app-settings-events'
export default function AiLocalizationModuleRuntime() {
  const environment = useWorkbenchEnvironment()
  return (
    <AiLocalizationView
      gameDirectory={environment.directoryInfo?.rootPath}
      onOpenAiSettings={() => requestAppSettings({ category: 'ai', aiTab: 'semantic' })}
    />
  )
}
