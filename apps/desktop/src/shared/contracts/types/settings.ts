export type SettingsWindowCategory = 'appearance' | 'loading' | 'view' | 'interaction' | 'launcher' | 'ai' | 'debug'

export type AiSettingsTab = 'engine' | 'generative' | 'machine-translation' | 'semantic' | 'usage'

/** Identifies both the settings category and an optional destination within it. */
export type SettingsWindowTarget = {
  category: SettingsWindowCategory
  aiTab?: AiSettingsTab
}
