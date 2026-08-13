/**
 * Real game music cue names for the map `Music` property. These are the cue
 * names shipped in the vanilla XACT sound banks (and the ones the game's own
 * `MusicContext` / ambient logic triggers); they are the only reliable source
 * of music choices without an unpacked game directory, because the game does
 * not ship a localized display-name catalog for cues. Each entry is the literal
 * cue name a map writes into `Music`, so it doubles as both the display label
 * and the serialized value.
 */
export const GAME_MUSIC_COMMON_CUES: string[] = [
  'wavy',
  'woodsTheme',
  'saloon1',
  'spring1',
  'spring2',
  'spring3',
  'summer1',
  'summer2',
  'summer3',
  'fall1',
  'fall2',
  'fall3',
  'winter1',
  'winter2',
  'winter3',
  'libraryTheme',
  'marnieShop',
  'Submarine_Song',
  'night_market',
  'caldera',
  'IslandMusic',
  'fieldoffice',
  '50s',
  'christmas_theme',
  'movieTheater',
  'movie_wedding',
  'ragtime',
  'wizardSong',
  'tribal',
  'spaceMusic',
  'moonlightJellies',
  'starshoot',
  'tickTock',
  'showrunner_sound',
  '-desert',
  'elliotsPiano',
  'sampractice',
  'shaneTheme',
  'MarlonsTheme',
  'AbigailFlute',
  'heavy',
  'Cavern',
  'Crystal Bells',
  'Cloth',
  'XOR',
  'sappypiano',
  'Kindling in the Snow…',
  'jaunty',
]
