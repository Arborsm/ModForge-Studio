/** Copy for the plugin manager module (plugin-manager). Owned by the plugin manager workspace slice. */
export type PluginManagerCopy = {
  title: string
  reload: string
  reloading: string
  openPluginDirectory: string
  /** Toast shown when the plugin directory cannot be opened. */
  openPluginDirectoryError: string
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
  /** Reload result summary: "Reloaded N plugins" (no failures). */
  reloadResultSuccess: (count: number) => string
  /** Reload result summary: "Reloaded N plugins, M failed" (failures present). */
  reloadResultWithFailures: (loaded: number, failed: number) => string
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
  /** Asset schema contribution count label. */
  assetSchemas: string
  /** Condition syntax contribution count label. */
  conditionSyntax: string
  /** i18n locale count label. */
  locales: string
  /** Search placeholder for filtering plugins by name/id/targets. */
  searchPlaceholder: string
  /** Filter: all types. */
  filterAll: string
  /** Filter: data-pack only. */
  filterDataPack: string
  /** Filter: code-pack only. */
  filterCodePack: string
  /** Filter: enabled only. */
  filterEnabled: string
  /** Filter: disabled only. */
  filterDisabled: string
  /** Filter: errors only. */
  filterErrors: string
  /** Filter label for type group. */
  filterType: string
  /** Filter label for status group. */
  filterStatus: string
  /** Sort label. */
  sortLabel: string
  /** Sort: by name. */
  sortByName: string
  /** Sort: by ID. */
  sortById: string
  /** Sort: by status (enabled first, then disabled, then errors). */
  sortByStatus: string
  /** Sort: by target mod. */
  sortByTarget: string
  /** Enable plugin (tooltip/aria-label for the toggle switch). */
  enable: string
  /** Disable plugin (tooltip/aria-label for the toggle switch). */
  disable: string
  /** Delete plugin button label. */
  delete: string
  /** Delete confirmation dialog title. */
  deleteConfirmTitle: string
  /** Delete confirmation dialog body: "Delete <name>?" */
  deleteConfirmBody: (name: string) => string
  /** Delete confirmation dialog confirm button. */
  deleteConfirmAction: string
  /** Delete confirmation dialog cancel button. */
  deleteConfirmCancel: string
  /** Toast shown when a plugin is deleted successfully. */
  deleteSuccess: string
  /** Toast shown when a plugin deletion fails. */
  deleteError: string
  /** Toast shown when a plugin is enabled. */
  enableSuccess: string
  /** Toast shown when a plugin is disabled. */
  disableSuccess: string
  /** Toast shown when toggling a plugin fails. */
  toggleError: string
  /** Expand details button aria-label. */
  expandDetails: string
  /** Collapse details button aria-label. */
  collapseDetails: string
  /** Details section: description label. */
  description: string
  /** Details section: author label. */
  author: string
  /** Details section: version label. */
  version: string
  /** Details section: category label. */
  category: string
  /** Details section: tags label. */
  tags: string
  /** Details section: pages list title. */
  pagesList: string
  /** Details section: asset schemas list title. */
  assetSchemasList: string
  /** Details section: condition syntax list title. */
  conditionSyntaxList: string
  /** Details section: i18n locales list title. */
  localesList: string
  /** Label shown when a field has no value. */
  notSpecified: string
  /** Disabled plugin row label/badge. */
  disabledBadge: string
  /** Asset schema chip: "N fields" count suffix. */
  fieldCount: (count: number) => string
  /** Condition syntax chip: "N keys" count suffix. */
  keyCount: (count: number) => string
}
