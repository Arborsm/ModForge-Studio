import { MapBrowserRuntime } from '../MapBrowserRuntime'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export default function MapBrowserModuleRuntime() {
  const { locale, theme, copy, environment, moduleState } = useWorkbenchRuntimeInputs()
  return (
    <MapBrowserRuntime
      copy={copy}
      locale={locale}
      theme={theme}
      accentColor={environment.accentColor}
      desktopHost={environment.desktopHost}
      active={environment.active}
      directoryInfo={environment.directoryInfo}
      heavyWorkspaceReady={environment.heavyWorkspaceReady}
      workspaceLayoutRef={moduleState.layoutRef}
      workspaceLayoutStorageKey={moduleState.persistenceKey}
      workspaceLayouts={moduleState.layouts}
      onPersistStateChange={moduleState.onPersistStateChange}
      onLayoutMetaChange={moduleState.onLayoutMetaChange}
      onDirectoryInvalid={environment.onDirectoryInvalid}
    />
  )
}
