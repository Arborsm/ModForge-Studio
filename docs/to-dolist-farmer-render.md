# Farmer Render To-Do List

Reference sources:
- `docs/todo-handoff.md`
- `tmp.FarmerRenderer.cs`
- `tmp.FarmerSprite.cs`
- `.tmp_farmer_dump.cs`
- `tmp.Event.cs`

Completed:
- [x] Rebuilt the main farmer renderer path against `FarmerRenderer.draw()`.
- [x] Reordered body, pants, face skin, eyes, hair, accessories, hats, and arms to match the original draw order.
- [x] Split body-facing flip from generic actor flip so event animation mirroring does not misplace eyes, hair, or hats.
- [x] Gated eye drawing against the original `currentEyes + blinkTimer + tool` conditions.
- [x] Wired the `eyes` event command into runtime farmer render state.
- [x] Wired swimming state into runtime farmer render state.
- [x] Added swim half-body crop, vertical swim offset, head retention, and the water-ring overlay.
- [x] Suppressed shirt and hat layers while using bathing clothes.
- [x] Ported `rotationAdjustment` handling for shirt and accessory offsets.
- [x] Ported accessory 26 special Y-offset handling for the original frame cases.
- [x] Wired hat `hairDrawMode` branches: `normal`, `cover`, and `hide`.
- [x] Ported `Farmer.getHair()` obscured hairstyle mapping.
- [x] Loaded `HairData.json` metadata.
- [x] Wired alternate hair textures from `HairData.json`.
- [x] Wired `usesUniqueLeftSprite`.
- [x] Wired `coveredIndex` obscured hairstyle resolution.
- [x] Wired front-facing `isMask` hats as split upper/lower mask draws.
- [x] Split farmer rendering into explicit appearance assets and runtime render state.
- [x] Wired the event stage to the refactored farmer render state interface.
- [x] Wired `swimming` and `stopSwimming` commands as real state mutations instead of fallback notices.
- [x] Wired `FarmerSprite.AnimationFrame` per-frame `armOffset / xOffset / positionOffset / hideArms` through the event-stage animation model and renderer.
- [x] Wired `farmerAnimation` event playback to the original single-animation frame plan used by events (`97`).
- [x] Wired `farmerEat` through original eat/drink animation selection using `Objects.json -> IsDrink`.
- [x] Seeded event-stage farmer `timeOfDay` from real event preconditions instead of a fixed placeholder.
- [x] Ported the original slingshot-specific extra draw branch into the DOM renderer as a dedicated overlay path.
- [x] Build passes with `npm run build -w @modforge/desktop`.

Remaining:
- [x] Feed the remaining real upstream farmer state inputs that still don't exist in event-stage data flow: `isInBed`, `timeWentToBed`, and richer live tool/slingshot targeting state.

Notes:
- The remaining gap is no longer basic layer ordering. It is mostly about matching the original upstream `Farmer` and `FarmerSprite` runtime state more completely.
- Keep following original code paths first, and only add approximation logic when the upstream source path is confirmed.
- `isInBed` now comes from the current map's `Back` layer `Bed` tile property, matching the original `doesTileHaveProperty(..., "Bed", "Back")` path.
- `timeWentToBed` is now seeded from event `timeOfDay` once a farmer is actually on a detected bed tile, instead of staying at a fixed placeholder.
- Farmer tool state is now inferred not only from `farmerAnimation` / `farmerEat`, but also from live `showFrame` / `animate` frame sequences, and slingshot targeting fields now exist in runtime state flow instead of being renderer-only fallbacks.
