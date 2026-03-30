# Audio Preview To-Do List

Updated: 2026-03-27

Source notes:
- Command intent tracked in `commands.md` (playMusic/playSound/stopMusic/stopSound).
- Preview runtime lives in `apps/desktop/src/lib/app/eventStagePlayback.ts`.

Checklist:
- [x] Locate command intent in `commands.md` and confirm existing stage hooks.
- [x] Add Tauri commands to scan audio assets and load audio as data URLs.
- [x] Add frontend audio resolver and playback cache.
- [x] Wire event-stage playback to trigger music/sound start/stop.
- [x] Ensure stopSound without cue clears tracked sound and preview playback.
- [x] Parse XSB/XWB banks to resolve cue -> wave data for packed XACT audio.
- [x] Add XACT data URL loader and fallback when unpacked audio is missing.
- [x] Support compact wave banks and compute entry sizes from alignment.
- [x] Decode MS-ADPCM wave data to PCM for browser playback.
