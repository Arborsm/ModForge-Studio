/** Copy for the plugin manager module (plugin-manager). Owned by the plugin manager workspace slice. */
export type PluginManagerCopy = {
  title: string
  reload: string
  reloading: string
  openPluginDirectory: string
  noPlugins: string
  noPluginsDetail: string
  loadError: string
  pluginId: string
  pluginName: string
  pluginType: string
  typeDataPack: string
  typeCodePack: string
  targets: string
  pages: string
  format: string
  error: string
  reloadSuccess: string
  reloadError: string
  trustNotice: string
  trustNoticeDetail: string
  /** SDK version label for code-pack plugins. */
  sdkVersion: string
  /** Entry file label for code-pack plugins. */
  entryFile: string
  /** Load diagnostics section title. */
  loadDiagnostics: string
  /** Load diagnostic phase labels. */
  diagnosticPhaseImport: string
  diagnosticPhaseSdkVersion: string
  diagnosticPhaseOther: string
  /** Label shown when no load diagnostics are present. */
  noDiagnostics: string
}
