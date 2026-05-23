# Launcher Download TODOs

## Chrome manual download bridge

- Investigate a Chrome/Chromium extension bridge for non-Premium Nexus users.
- Goal: when the desktop app opens a Nexus manual download page, the extension can detect the target mod/file page, click the expected manual download flow when permitted by Nexus UI/session state, and report back whether the browser download started.
- The app should keep the current manual-page fallback as the baseline behavior. The extension bridge must be opt-in, respect Nexus terms and user session state, and fail closed by leaving the browser page open for manual action.
- Open questions: extension-app transport, browser support scope, how to identify the exact file variant safely, and how to surface extension availability in diagnostics.

## Download concurrency note

- Keep the launcher-side direct download scheduler at 3 concurrent downloads unless product testing shows it should change.
- Current Nexus docs/research in this repo mention API request quotas and that non-Premium download speed is shared across simultaneous downloads, but they do not document a recommended client download concurrency number.
- Non-Premium/manual fallback opens the Nexus file-specific popup URL for each affected file (`DownloadPopUp?id=<fileId>&game_id=1303` for Stardew Valley). Do not use a global time cooldown; it would block valid consecutive manual downloads.
