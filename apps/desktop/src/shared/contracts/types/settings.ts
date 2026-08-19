/** Settings window navigation category — appearance, loading, view, interaction, launcher, ai, or debug. */
export type SettingsWindowCategory = 'appearance' | 'loading' | 'view' | 'interaction' | 'launcher' | 'ai' | 'debug'

/** Tab within the AI settings category — engine, generative, machine-translation, semantic, or usage. */
export type AiSettingsTab = 'engine' | 'generative' | 'machine-translation' | 'semantic' | 'usage'

/** Identifies both the settings category and an optional destination within it. */
export type SettingsWindowTarget = {
  category: SettingsWindowCategory
  aiTab?: AiSettingsTab
}
