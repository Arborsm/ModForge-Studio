# Event Command To-Do List

Updated: 2026-03-27

Scope:
- Source of truth for preview support: `apps/desktop/src/lib/events/commandCatalog.ts`
- Vanilla reference: `tmp.Event.cs`, `Event.DefaultCommands.*`
- Status meanings:
- `Stage`: the event preview now applies dedicated stage logic.
- `HUD`: the command is represented by visible preview feedback (toast / chip / overlay), but doesn't mutate real save state.
- `Stage+HUD`: applies stage logic and also emits visible confirmation.
- `No source`: no direct `DefaultCommands` method was found from the current decompile; kept as catalog-level fallback.

Result:
- No catalog command is left as a silent no-op in the preview.
- Every command now resolves to either dedicated stage logic or an explicit HUD fallback.

| Command | Vanilla source | Status | Preview note |
| --- | --- | --- | --- |
| action | `DefaultCommands.Action` | HUD | Visible fallback notice only. |
| addBigProp | `DefaultCommands.AddBigProp` | HUD | Visible fallback notice only. |
| addConversationTopic | `DefaultCommands.AddConversationTopic` | HUD | Toasts topic/state change, no real save mutation. |
| addCookingRecipe | `DefaultCommands.AddCookingRecipe` | HUD | Toasts recipe unlock, no real save mutation. |
| addCraftingRecipe | `DefaultCommands.AddCraftingRecipe` | HUD | Toasts recipe unlock, no real save mutation. |
| addFloorProp | `DefaultCommands.AddFloorProp` | HUD | Visible fallback notice only. |
| addItem | `DefaultCommands.AddItem` | HUD | Bottom-left toast with item icon when resolvable and signed count. |
| addLantern | `DefaultCommands.AddLantern` | HUD | Visible fallback notice only. |
| addObject | `DefaultCommands.AddObject` | Stage+HUD | Renders object icon on the stage tile and emits confirmation toast. |
| addProp | `DefaultCommands.AddProp` | HUD | Visible fallback notice only. |
| addQuest | `DefaultCommands.AddQuest` | HUD | Toasts quest state change, no real save mutation. |
| addSpecialOrder | `DefaultCommands.AddSpecialOrder` | HUD | Toasts order state change, no real save mutation. |
| addTemporaryActor | `DefaultCommands.AddTemporaryActor` | Stage+HUD | Adds a temporary actor into preview actor state and emits confirmation toast. |
| advancedMove | `DefaultCommands.AdvancedMove` | HUD | Visible fallback notice only. |
| ambientLight | `DefaultCommands.AmbientLight` | Stage | Applies ambient screen tint chip/overlay in preview. |
| animalNaming | `DefaultCommands.AnimalNaming` | HUD | Visible fallback notice only. |
| animate | `DefaultCommands.Animate` | Stage | Uses dedicated actor animation playback. |
| attachCharacterToTempSprite | `DefaultCommands.AttachCharacterToTempSprite` | HUD | Visible fallback notice only. |
| awardFestivalPrize | `DefaultCommands.AwardFestivalPrize` | HUD | Visible fallback notice only. |
| beginSimultaneousCommand | `DefaultCommands.BeginSimultaneousCommand` | HUD | Visible fallback notice only; preview never silently drops it. |
| broadcastEvent | `DefaultCommands.BroadcastEvent` | HUD | Visible fallback notice only. |
| catQuestion | `DefaultCommands.CatQuestion` | HUD | Visible fallback notice only. |
| cave | `DefaultCommands.Cave` | HUD | Visible fallback notice only. |
| changeLocation | `DefaultCommands.ChangeLocation` | Stage | Changes staged TMX map and keeps playback moving. |
| changeMapTile | `DefaultCommands.ChangeMapTile` | HUD | Visible fallback notice only. |
| changeName | `DefaultCommands.ChangeName` | HUD | Visible fallback notice only. |
| changePortrait | `DefaultCommands.ChangePortrait` | Stage | Switches portrait suffix candidates used by dialogue portrait rendering. |
| changeSprite | `DefaultCommands.ChangeSprite` | Stage | Switches sprite suffix candidates used by actor sprite loading. |
| changeToTemporaryMap | `DefaultCommands.ChangeToTemporaryMap` | Stage | Changes staged TMX map and clears stage effects like vanilla temp-map transition. |
| changeYSourceRectOffset | `DefaultCommands.ChangeYSourceRectOffset` | HUD | Visible fallback notice only. |
| characterSelect | No source | HUD | Catalog fallback only; explicit notice keeps it from becoming a silent no-op. |
| cutscene | `DefaultCommands.Cutscene` | HUD | Visible fallback notice only. |
| doAction | `DefaultCommands.DoAction` | HUD | Visible fallback notice only. |
| dump | `DefaultCommands.Dump` | HUD | Toasts state change, no real save mutation. |
| elliotbooktalk | `DefaultCommands.ElliottBookTalk` | HUD | Catalog spelling is kept, preview uses explicit fallback notice. |
| emote | `DefaultCommands.Emote` | HUD | Visible fallback notice only. |
| end | `DefaultCommands.End` | Stage | Ends current branch or shows dialogue-ending page payload. |
| endSimultaneousCommand | `DefaultCommands.EndSimultaneousCommand` | HUD | Visible fallback notice only. |
| eventSeen | `DefaultCommands.EventSeen` | HUD | Toasts event flag mutation, no real save mutation. |
| extendSourceRect | `DefaultCommands.ExtendSourceRect` | HUD | Visible fallback notice only. |
| eyes | `DefaultCommands.Eyes` | HUD | Visible fallback notice only. |
| faceDirection | `DefaultCommands.FaceDirection` | Stage | Applies facing update and wait timing. |
| fade | `DefaultCommands.Fade` | Stage | Uses preview fade overlay for `fade` / `unfade`. |
| farmerAnimation | `DefaultCommands.FarmerAnimation` | HUD | Visible fallback notice only. |
| farmerEat | `DefaultCommands.FarmerEat` | HUD | Visible fallback notice only. |
| fork | `DefaultCommands.Fork` | Stage | Branches into target event with current fork flag handling. |
| friendship | `DefaultCommands.Friendship` | HUD | Toasts friendship delta, no real save mutation. |
| globalFade | `DefaultCommands.GlobalFade` | Stage | Applies strong fade-to-black overlay. |
| globalFadeToClear | `DefaultCommands.GlobalFadeToClear` | Stage | Clears fade overlay. |
| glow | `DefaultCommands.Glow` | Stage | Uses colored flash/glow overlay in preview. |
| grandpaCandles | `DefaultCommands.GrandpaCandles` | HUD | Visible fallback notice only. |
| grandpaEvaluation | `DefaultCommands.GrandpaEvaluation` | HUD | Visible fallback notice only. |
| grandpaEvaluation2 | `DefaultCommands.GrandpaEvaluation2` | HUD | Visible fallback notice only. |
| halt | `DefaultCommands.Halt` | HUD | Visible fallback notice only. |
| hideShadow | `DefaultCommands.HideShadow` | HUD | Visible fallback notice only. |
| hospitaldeath | `DefaultCommands.HospitalDeath` | HUD | Visible fallback notice only. |
| ignoreCollisions | `DefaultCommands.IgnoreCollisions` | HUD | Visible fallback notice only. |
| ignoreEventTileOffset | `DefaultCommands.IgnoreEventTileOffset` | HUD | Visible fallback notice only. |
| ignoreMovementAnimation | `DefaultCommands.IgnoreMovementAnimation` | HUD | Visible fallback notice only. |
| itemAboveHead | `DefaultCommands.ItemAboveHead` | Stage+HUD | Renders hold-up object above farmer and shows icon toast. |
| jump | `DefaultCommands.Jump` | HUD | Visible fallback notice only. |
| loadActors | `DefaultCommands.LoadActors` | HUD | Visible fallback notice only. |
| makeInvisible | `DefaultCommands.MakeInvisible` | HUD | Visible fallback notice only. |
| mail | `DefaultCommands.Mail` | HUD | Toasts mail state change, no real save mutation. |
| mailReceived | `DefaultCommands.AddMailReceived` | HUD | Alias resolved against vanilla; toast only, no real save mutation. |
| mailToday | `DefaultCommands.MailToday` | HUD | Toasts mail state change, no real save mutation. |
| message | `DefaultCommands.Message` | Stage | Uses dedicated message panel playback. |
| minedeath | `DefaultCommands.MineDeath` | HUD | Visible fallback notice only. |
| money | `DefaultCommands.Money` | HUD | Toasts signed gold delta. |
| move | `DefaultCommands.Move` | Stage | Uses actor movement interpolation and blocking semantics. |
| pause | `DefaultCommands.Pause` | Stage | Uses playback wait timing. |
| playMusic | `DefaultCommands.PlayMusic` | Stage | Updates music status chip and logs cue change. |
| playSound | `DefaultCommands.PlaySound` | Stage | Updates sound status chip and logs cue change. |
| playerControl | `DefaultCommands.PlayerControl` | HUD | Visible fallback notice only. |
| positionOffset | `DefaultCommands.PositionOffset` | Stage | Applies offset interpolation to actor render state. |
| proceedPosition | `DefaultCommands.ProceedPosition` | HUD | Visible fallback notice only. |
| question | `DefaultCommands.Question` | Stage | Uses dedicated branch-choice overlay with fork flag support. |
| questionAnswered | `DefaultCommands.QuestionAnswered` | HUD | Toasts dialogue-question flag change, no real save mutation. |
| quickQuestion | `DefaultCommands.QuickQuestion` | Stage | Uses dedicated branch-choice overlay and inline branch command parsing. |
| removeItem | `DefaultCommands.RemoveItem` | HUD | Bottom-left toast with item icon when resolvable and signed count. |
| removeObject | `DefaultCommands.RemoveObject` | Stage+HUD | Removes matching staged object tile effect and emits confirmation toast. |
| removeQuest | `DefaultCommands.RemoveQuest` | HUD | Toasts quest state change, no real save mutation. |
| removeSpecialOrder | `DefaultCommands.RemoveSpecialOrder` | HUD | Toasts order state change, no real save mutation. |
| removeSprite | `DefaultCommands.RemoveSprite` | Stage | Uses stage-effect removal logic already present. |
| removeTemporarySprites | `DefaultCommands.RemoveTemporarySprites` | Stage | Uses stage-effect removal logic already present. |
| removeTile | `DefaultCommands.RemoveTile` | HUD | Visible fallback notice only. |
| replaceWithClone | `DefaultCommands.ReplaceWithClone` | HUD | Visible fallback notice only. |
| resetVariable | `DefaultCommands.ResetVariable` | HUD | Visible fallback notice only. |
| rustyKey | `DefaultCommands.RustyKey` | HUD | Toasts state change, no real save mutation. |
| screenFlash | `DefaultCommands.ScreenFlash` | Stage | Uses transient white flash overlay with alpha support. |
| setRunning | `DefaultCommands.SetRunning` | HUD | Visible fallback notice only. |
| setSkipActions | `DefaultCommands.SetSkipActions` | HUD | Visible fallback notice only. |
| shake | `DefaultCommands.Shake` | HUD | Visible fallback notice only. |
| showFrame | `DefaultCommands.ShowFrame` | Stage | Sets actor frame immediately. |
| skippable | `DefaultCommands.Skippable` | HUD | Visible fallback notice only. |
| speak | `DefaultCommands.Speak` | Stage | Uses dedicated dialogue page playback. |
| specificTemporarySprite | `DefaultCommands.SpecificTemporarySprite` | Stage | Uses dedicated special temp-sprite resolver already present. |
| speed | `DefaultCommands.Speed` | HUD | Visible fallback notice only. |
| splitSpeak | `DefaultCommands.SplitSpeak` | Stage | Uses dedicated dialogue page playback. |
| startJittering | `DefaultCommands.StartJittering` | HUD | Visible fallback notice only. |
| stopAdvancedMoves | `DefaultCommands.StopAdvancedMoves` | HUD | Visible fallback notice only. |
| stopAnimation | `DefaultCommands.StopAnimation` | Stage | Stops actor animation and restores vanilla-like fallback frame. |
| stopGlowing | `DefaultCommands.StopGlowing` | Stage | Clears preview glow overlay. |
| stopJittering | `DefaultCommands.StopJittering` | HUD | Visible fallback notice only. |
| stopMusic | `DefaultCommands.StopMusic` | Stage | Clears music status chip. |
| stopRunning | `DefaultCommands.StopRunning` | HUD | Visible fallback notice only. |
| stopSound | `DefaultCommands.StopSound` | Stage | Updates sound status chip and stop cue log. |
| stopSwimming | `DefaultCommands.StopSwimming` | HUD | Visible fallback notice only. |
| swimming | `DefaultCommands.Swimming` | HUD | Visible fallback notice only. |
| switchEvent | `DefaultCommands.SwitchEvent` | Stage | Switches active command stream into target event. |
| temporarySprite | `DefaultCommands.TemporarySprite` | Stage | Uses stage-effect creation already present. |
| temporaryAnimatedSprite | `DefaultCommands.TemporaryAnimatedSprite` | Stage | Uses stage-effect creation already present. |
| textAboveHead | `DefaultCommands.TextAboveHead` | HUD | Visible fallback notice only. |
| tossConcession | `DefaultCommands.TossConcession` | HUD | Visible fallback notice only. |
| translateName | `DefaultCommands.TranslateName` | HUD | Visible fallback notice only. |
| tutorialMenu | `DefaultCommands.TutorialMenu` | HUD | Visible fallback notice only. |
| updateMinigame | `DefaultCommands.UpdateMinigame` | HUD | Visible fallback notice only. |
| viewport | `DefaultCommands.Viewport` | Stage | Updates preview camera focus and keeps map stage in sync. |
| waitForAllStationary | `DefaultCommands.WaitForAllStationary` | Stage | Holds playback until actor movement settles, then continues. |
| waitForOtherPlayers | `DefaultCommands.WaitForOtherPlayers` | Stage | Advances immediately in single-user preview and emits explicit notice. |
| warp | `DefaultCommands.Warp` | Stage | Repositions actor immediately. |
| warpFarmers | `DefaultCommands.WarpFarmers` | HUD | Visible fallback notice only. |

Follow-up priorities:
- Upgrade HUD-only actor commands (`emote`, `jump`, `swimming`, `setRunning`) into actor-level stage rendering if we need closer visual parity.
- Upgrade HUD-only map/property commands (`addProp`, `addBigProp`, `addLantern`, `changeMapTile`, `removeTile`) into stage object rendering if festival scenes require it.
- Keep this file in sync whenever a command moves from `HUD` to `Stage`.
