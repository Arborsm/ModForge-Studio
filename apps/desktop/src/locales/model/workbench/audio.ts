/** Copy for the audio browse workspace (browser rail + preview/detail). */
export type AudioPanelCopy = {
  browserTitle: string
  browserSubtitle: string
  browserPlaceholder: string
  browserEmptyFiltered: string
  browserEmptyMissing: string
  groupMusic: string
  groupSound: string
  statsAll: string
  statsMusic: string
  statsSound: string
  previewTitle: string
  previewEmpty: string
  previewLoading: string
  previewError: (message: string) => string
  play: string
  pause: string
  loop: string
  loopEnabled: string
  volume: string
  cueLabel: string
  kindLabel: string
  sourceLabel: string
  pathLabel: string
  formatLabel: string
  formatXact: string
  formatOgg: string
  formatWav: string
  formatMp3: string
  formatUnknown: string
  copyCue: string
  copyCueDone: string
  seekLabel: string
}
