import { AiLocalizationView } from '../localization-center'
import { useWorkbenchEnvironment } from '../../model/workbenchModuleContexts'
import { appCommands } from '@shared/lib/app-runtime/appCommands'
export default function AiLocalizationModuleRuntime() {
  const environment = useWorkbenchEnvironment()
  return (
    <AiLocalizationView
      gameDirectory={environment.directoryInfo?.rootPath}
      onOpenAiSettings={() => appCommands.dispatch({ type: 'navigation/open-settings', target: { category: 'ai', aiTab: 'semantic' } })}
    />
  )
}
