import type { PluginManagerCopy } from '../../../model/workbench/plugin-manager'

const pluginManager: PluginManagerCopy = {
  title: 'Compat Plugin Manager',
  reload: 'Reload',
  reloading: 'Reloading...',
  openPluginDirectory: 'Open plugin directory',
  noPlugins: 'No compat plugins found',
  noPluginsDetail: 'No compat plugins were found in the plugin root directory. Plugins live under apps/desktop/compat-plugins/.',
  loadError: 'Load error',
  pluginId: 'Plugin ID',
  pluginName: 'Name',
  pluginType: 'Type',
  typeDataPack: 'Data pack',
  typeCodePack: 'Code pack',
  targets: 'Targets',
  pages: 'Pages',
  format: 'Format',
  error: 'Error',
  reloadSuccess: 'Reloaded successfully',
  reloadError: 'Reload failed',
  trustNotice: 'Code-pack plugins run in full-trust mode',
  trustNoticeDetail: 'Code-pack plugins have the same permissions as the host application. Only install plugins from trusted sources.',
  sdkVersion: 'SDK version',
  entryFile: 'Entry file',
  loadDiagnostics: 'Load diagnostics',
  diagnosticPhaseImport: 'Import',
  diagnosticPhaseSdkVersion: 'SDK version',
  diagnosticPhaseOther: 'Other',
  noDiagnostics: 'No diagnostics',
}

export default pluginManager
