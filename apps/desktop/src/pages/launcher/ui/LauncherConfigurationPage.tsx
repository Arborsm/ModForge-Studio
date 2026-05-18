import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  Check,
  ChevronDown,
  Code2,
  Crown,
  Database,
  Download,
  FolderOpen,
  HelpCircle,
  Image,
  KeyRound,
  MessageSquare,
  Network,
  RefreshCw,
  ScrollText,
  Server,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { cx } from '@shared/lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/localeContext'
import { reportAppEvent, type AppEventLevel } from '@shared/lib/observability'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import {
  clearLauncherImageCache,
  type LauncherNexusDiagnosticsResult,
  loadLauncherNexusDiagnostics,
  restartLauncherNexusDiagnostics,
  setLauncherNexusForceOffline,
  type LauncherNexusRouteSnapshot,
} from '@features/launcher/api'
import { canUseDesktopHost } from '@shared/lib/desktop'
import {
  getLauncherWarningState,
  readCachedLauncherConfigurationApiKeyStatus,
  readCachedLauncherConfigurationDiagnostics,
  readCachedLauncherConfigurationLibraryScan,
  readCachedLauncherConfigurationRuntimeInfo,
  readCachedLauncherConfigurationSsoStatus,
  useLauncherDownloads,
  useLauncherPort,
  useLauncherSettings,
  writeCachedLauncherConfigurationApiKeyStatus,
  writeCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationLibraryScan,
  writeCachedLauncherConfigurationRuntimeInfo,
  writeCachedLauncherConfigurationSsoStatus,
} from '@features/launcher'
import type { LauncherCopy } from '@locales/schema'
import type { LauncherRuntimeInfo, ValidateApiKeyResult } from '@features/launcher/model/launcherContracts'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'

type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>
type ConfigStepTone = 'ok' | 'warn' | 'danger'
type ConfigStep = {
  id: string
  label: string
  detail: string
  tone: ConfigStepTone
}
type ApiRouteTone = 'ok' | 'warn' | 'danger' | 'loading'
type ConfigRouteId = 'nexusApi' | 'publicGraphql' | 'nexusImages' | 'smapi' | 'privateGraphql'
type NexusApiAccountStatus = {
  apiKeyStatus: ValidateApiKeyResult | null
  apiKeyError: string | null
  apiKeyChecking: boolean
  ssoAuthorized: boolean
  ssoStarting: boolean
  refreshApiKeyStatus: (options?: { force?: boolean; forceNonPremium?: boolean }) => Promise<void>
  startSso: () => Promise<void>
}

function createLoadingRoute(routeId: ConfigRouteId, label: string): LauncherNexusRouteSnapshot {
  return {
    routeId,
    label,
    endpoint: '',
    status: 'loading',
    attempts: 0,
    maxAttempts: 0,
    available: false,
    message: '',
  }
}

function getDefaultConfigRoutes(copy: LauncherCopy): LauncherNexusRouteSnapshot[] {
  return [
    createLoadingRoute('publicGraphql', copy.settings.nexusApiGraphql),
    createLoadingRoute('nexusImages', copy.settings.nexusApiImageCdn),
    createLoadingRoute('smapi', 'SMAPI'),
    createLoadingRoute('privateGraphql', 'Nexus Private GraphQL'),
    createLoadingRoute('nexusApi', copy.settings.nexusApiRest),
  ]
}

function getDisplayedConfigRoutes(routes: LauncherNexusRouteSnapshot[], copy: LauncherCopy) {
  const routesById = new Map(routes.map((route) => [route.routeId, route]))
  return getDefaultConfigRoutes(copy).map((fallbackRoute) => routesById.get(fallbackRoute.routeId) ?? fallbackRoute)
}

const nexusModsBbcodeSample = String.raw`[center][url=https://twitter.com/FlashShifter][/url][/center][center] [/center][center][url=https://twitter.com/FlashShifter][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385311-241093688.png[/img]    [/url]
<br />[color=#b6b6b6][i]The world of Stardew Valley is awe-inspiring. Relationships, farming, fishing, adventuring...All made by just one person, who has given us the gift of so many memories with this game. But the problem with memories is that we'll never experience that world for the first time again.
<br />
<br />I aim to give you, the player, that sense of adventure and unknown once more. Through this mod, I want to immerse you in the world ConcernedApe created.
<br />[/i]
<br />-Flash[/color][/center]
<br />
<br />
<br />
<br />[size=3][center]Stardew Valley Expanded (SVE) stays as true to the source material as it can- from new areas and expanded dialogue and events, to the portraits for a brand new set of characters. My goal, as a modder hobbyist, is this: "Give the player the magical feeling they had when they first played Stardew Valley". To experience that magic as ConcernedApe intended, I recommend playing through vanilla Stardew Valley before jumping into SVE’s expanded world. For players who have already played Stardew Valley: think back to when you first walked into the Secret Woods, completed an elaborate quest, experienced Shane’s six heart event, or met Abigail for the first time. Stardew Valley is full of those inspired moments that enchant you and draw you into its world. By taking that world and expanding it, I hope to create more of those moments, so you can always find something new when you make your way back to the valley. Starting a new save file is required![/center][/size]
<br />[size=3]
<br />
<br />[/size][center][size=3] [img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385406-1987767487.png[/img] [/size]
<br />[size=3]Please read the Installation Guide on GitHub![/size]
<br />[size=3][url=https://github.com/FlashShifter/StardewValleyExpanded/wiki/Install-guide]Click Me![/url] [/size]
<br />
<br />[size=3]Known bugs, common errors, mod compatibility and troubleshooting on GitHub![/size]
<br />[size=3][url=https://github.com/FlashShifter/StardewValleyExpanded/wiki/Troubleshooting]Click Me![/url][/size][/center]
<br />
<br />
<br />
<br />[center][size=3] [img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385470-1829474198.png[/img]   [/size]
<br />[size=3]Follow me on [/size][url=https://twitter.com/FlashShifter][size=3]Twitter[/size][/url][size=3]  for sneak peeks and updates![/size]
<br />
<br />[size=3]Join the [/size][url=https://www.reddit.com/r/StardewValleyExpanded/][size=3]Stardew Valley Expanded Subreddit[/size][/url][size=3]  and participate in discussions with other players!
<br />
<br />Join the [url=https://discord.com/invite/svexpanded]Stardew Valley Expanded Discord Server[/url][/size][/center][size=3]   
<br />[/size]
<br />
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385458-1214125993.png[/img]   [/size]
<br />[size=3]SVE is a free expansion for ConcernedApe's Stardew Valley. Countless hours of brand-new content has been added to the game. There are regular content updates, bug fixes, and transparent communication with the community. Developing SVE requires a lot of time. [/size]
<br />
<br />[size=3]Please consider donating to me directly via[/size][size=4] [url=https://www.paypal.com/paypalme2/FlashShifter?locale.x=en_US&amp;fbclid=IwAR3ezr4RKIEXNbjgT1OxdU6dgmLhIdTjhhIhvurkDo0Hyv3tyQfRrsgM1jY]PayPal[/url][/size][/center]
<br />
<br />
<br />
<br />
<br />[center][size=3][img width=425,height=250]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385431-1482639146.png[/img] [/size]
<br />[size=3] SVE adds over a dozen new fully-fledged NPCs, and many other characters. These NPCs come with dynamic dialogue, schedules, back-story, personalities, animations, events, and more. [/size][/center]
<br />
<br />
<br />
<br />[center][size=3][img]https://i.postimg.cc/BnM1J0b4/New-Character-Events.png[/img] [/size]
<br />[size=3]SVE events aim to expand the story of Stardew's characters and the lore of the world. Players can visit the [url=https://stardewvalleyexpanded.wiki.gg/]Stardew Valley Expanded Wiki[/url]  [/size][size=3]for details on how to trigger the new events. SVE as of Version 1.15 adds over 278 new events.[/size][/center]
<br />
<br />
<br />
<br />[center][size=3] [img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385463-2024977734.png[/img]  [/size]
<br />[size=3]SVE features an expanded Joja storyline! What will the fate of Pelican Town be if you, the player, side with Joja and allow a corporate takeover of the valley?[/size][/center]
<br />
<br />
<br />
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385419-880329289.png[/img]   [/size]
<br />[size=3]SVE adds an additional three farm maps to choose from (optional).[/size]
<br />
<br />[color=#e69138][size=4][b]Frontier Farm[/b][/size][/color]
<br />[size=3]The recommended farm map for Stardew Valley Expanded. it features an expansive plot of land bordering the 'Ferngill Republic Frontier'. Many different wild trees are rooted here, there's several new questlines, and there's secrets to discover. Players start with one pear tree.
<br />[/size][spoiler]
<br />[img]https://i.ibb.co/J5wg2M8/Farm-map-with-debris.png[/img] 
<br />[/spoiler][/center]
<br />
<br />[center][color=#e69138][size=4][b]Grandpa's Farm[/b][/size][/color]
<br />[size=3]A humble farm map. [b]Replaces the standard farm layout[/b]. Modestly sized farmland, tillable grass, multiple questlines, different landmark locations, shortcuts to surrounding areas, and secrets to discover. Grandpas Farm comes with a sandbox layout configuration for players wanting full control on map design.[/size]
<br />
<br />[spoiler]
<br />[b]Farm map with debris[/b]
<br />[spoiler]
<br />[img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385791-2014750724.png[/img] 
<br />[/spoiler]
<br />
<br />[b]Farm map with no debris[/b]
<br />[spoiler]
<br /> [img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385795-1040711272.png[/img] 
<br />[/spoiler][/center]
<br />[/spoiler]
<br />
<br />[center][color=#e69138][size=4][b]Immersive Farm 2 Remastered[/b][/size][/color]
<br />[size=3]A huge plot of land optimized for multiplayer or solo players looking for a challenge. Features tillable grass, a questline, and secrets. Comes with many configurations![/size][/center][center]
<br />[spoiler]
<br />[size=3][b]Farm map with debris[/b][/size]
<br />[spoiler]
<br />[img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385556-344242399.png[/img]  
<br />[/spoiler]
<br />
<br />[size=3][b]Farm map with no debris[/b][/size]
<br />[spoiler]
<br />[size=3] [img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385560-1043636426.png[/img] [/size] 
<br />[/spoiler]
<br />[size=3][/size][/center]
<br />[/spoiler]
<br />
<br />
<br />[center][size=3][img]https://i.postimg.cc/k4tVNRcg/New-Locations.png[/img]     [/size]
<br />[size=3]SVE adds 58 new locations. Some areas must be unlocked through progression and quests. The [url=https://stardewvalleyexpanded.wiki.gg/]Stardew Valley Expanded Wiki[/url]  [/size][size=3]has more information on some of the new areas.[/size][/center][size=3]
<br />[/size]
<br />
<br />
<br />[center][size=3][img]https://i.postimg.cc/yNyMhc32/Location-Messages.png[/img]   [/size]
<br />[size=3]All maps - vanilla and new, interior and exterior - are now filled with location messages for you to discover and experience. There are over 900 throughout the world![/size][/center]
<br />
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385446-999942014.png[/img]  [/size]
<br />[size=3]A configuration file is generated within the [CP] Stardew Valley Expanded, [CP] Immersive Farm 2 Remastered, and [CP] Grandpa's Farm folders when the game is run at least once. Configurations can be toggled at will on already existing saves. The spoiler tab has detailed information on all possible configurations. Players can change the way they wish to experience their SVE play throughs![/size][/center][center]
<br />[spoiler]
<br />[color=#e69138][size=4][b]STARDEW VALLEY EXPANDED CONFIGURATIONS[/b][/size][/color]
<br />
<br />[b][size=3]Seasonal Edits[/size][/b]
<br />[size=3]Default =“True”[/size]
<br />[size=3]Adds leaves to all building roofs during fall and snow to many objects during winter (fences, stop signs, plants, etc). Automatically adjusts colors if players have Starblue Valley or Eemie recolors installed.[/size]
<br />[size=3] [/size]
<br />[b][size=3]Replace Default/Hardwood Fences[/size][/b]
<br />[size=3]Default =“True”[/size]
<br />[size=3]Replaces the standard and hardwood fences with the matching static fences found throughout exterior locations. Automatically adjusts colors if players have Starblue Valley or Eemie recolors installed.[/size]
<br />[size=3] [/size]
<br />[b][size=3]Immersive Shadows[/size][/b]
<br />[size=3]Default = "True"[/size]
<br />[size=3]Adds shadows to buildings and large objects in the world.
<br />
<br />[b][size=3]Mist Effects[/size][/b]
<br />[size=3]Default = "True"[/size]
<br />[size=3]Adds mist during rainy days to many maps. This does impact performance, so disable this if you're experiencing lag on rainy days.[/size][/size]
<br />
<br />[b][size=3]Original Mines Entrance[/size][/b]
<br />[size=3]Default = "False"[/size]
<br />[size=3]Adds back the original mine entrance at the mountain, cutting down time it takes players to walk to the mines.
<br />
<br />[b][size=3]Disable SVE Joja Shop[/size][/b]
<br />[size=3]Default = "False"[/size]
<br />[size=3]Removes SVE Joja Shop patches, giving other mods editing the vanilla shop priority.[/size][/size]
<br />
<br />[b][size=3]Remove Objects From Grandpas Shed[/size][/b]
<br />[size=3]Default = "False"[/size]
<br />[size=3]Once players complete the quest, they can opt in to remove all static objects from the interior.
<br />
<br />[b][size=3]Remove Southern Cactuses From Desert[/size][/b]
<br />[size=3]Default = "False"[/size]
<br />[size=3]Removes a number of catuses in Calico Desert, allowing easier placement of objects such as kegs.[/size][/size]
<br />[b]
<br />[/b][size=3][b]Alternative Craftables[/b]
<br />Default = "False"
<br />Changes the design of the furnace, kiln, beehives, kegs, seed machine, cheese machine, and mayonnaise machine.[/size]
<br />
<br />[b][size=3]Balanced Crafting[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Crafting requires more/different resources. Some craftables are easier to make. Recommended if players are using the “Automation” mod and/or IF2R to balance resource intake.[/size]
<br />[size=3] [/size]
<br />[b][size=3]Harder Building Construction[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Constructing buildings cost more resources and money.[/size]
<br />[size=3] [/size]
<br />[b][size=3]Stronger Monsters[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Monsters receive a significant buff in damage dealt to players (double), with slight increases in HP. Shadow Brutes and Mummies have large HP and damage buffs.
<br />
<br />[/size][b][size=3]SVE Community Bundles[/size][/b]
<br />[size=3]Default =“True”[/size]
<br />[size=3]Items from SVE are not automatically included in the Community Center bundles.
<br />
<br />[b][size=3]Hard SVE Community Bundles[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Increases the difficulty of Community Center bundles with SVE items.
<br />
<br />[/size][b][size=3]Reduce Crimson Badlands Monster Spawns[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />Lowers the number of monsters in the badlands, making the area easier to explore and helps minimize lag.
<br />
<br />[b][size=3]Retextured Farmhouse Kitchen[/size][/b]
<br />[size=3]Default =“True”[/size]
<br />[size=3]The farmhouse kitchen graphics are given a cleaner texture.
<br />
<br />[/size][b][size=3]Remove Winery Decorations[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]The bar and seating area in the buildable Winery are removed.[/size][/size]
<br />[size=3] [/size]
<br />[b][size=3]Older Sophia Portraits[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Makes Sophia's portraits look older!
<br />
<br />[b]Shorter Path To Blue Moon Vineyard[/b]
<br />Default = "False"
<br />Pushes the warp point from Cindersap Forest &gt; Blue Moon Vineyard closer to Fairhaven Farm, cutting down on travel time.[/size]
<br />
<br />[b][size=3]Mature Events[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Adds an additional 10 events that contain extremely serious topics, dark undertones, and moral ambiguity. If players wish to play SVE with these events, they must consent via toggling the configuration to “true”.
<br />
<br />[b][size=3]Use Galdoran Theme All Times[/size][/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Changes the Stardew Valley region UI to the Galdoran region UI in all locations.
<br />
<br />[b]Disable Galdoran Theme[/b]
<br />[size=3]Default =“False”[/size]
<br />[size=3]Disables the Galdoran UI in all locations. Useful if players have a mod already editing the UI.[/size][/size][/size]
<br />[size=3] [/size]
<br />[color=#e69138][size=4][b]GRANDPA'S FARM CONFIGURATIONS
<br />
<br />[/b][/size][/color][size=3][b]Sandbox Layout[/b]
<br />Default = “False”
<br />Turns the farmland into a huge dirt field, similar to the standard farm. Perfect for players who want full control over map design.
<br />
<br />[b]Remove Fences[/b]
<br />Default = "False"
<br />Removes pre-built fences on the farm.
<br />
<br />[b]Remove Grass Stretch[/b]
<br />Default = "False"
<br />Removes the long bit of grass adjacent to the dirt crop field.
<br />
<br />[b]Grass Crop Field[/b]
<br />Default = "False"
<br />Changes the large dirt field to grass.
<br />
<br />[b]Heavy Debris[/b]
<br />Default = "False"
<br />Fills the farm landscape with a plethora of resources.
<br />[b]
<br />Remove Land Expansion Pond
<br />[/b]Default = "False"
<br />Removes the south east pond on the farmland accessible after buying the property deed.
<br />
<br />[b]Larger Bridge To Grandpas Shed[/b]
<br />Default = "False"
<br />Extends the patched bridge height by 1 tile, making it connect better with player-laid paths that are 2 tiles in height.
<br />
<br />[b]Larger Greenhouse[/b]
<br />Default = "False"
<br />Makes the greenhouse slightly bigger, with designated fruit tree spots.
<br />
<br />[b]Remove Greenhouse Objects[/b]
<br />Default = "False"
<br />Removes static objects, such as plants and barrels, from the greenhouse interior.[/size]
<br />
<br />[b][color=#e69138][size=4]IMMERSIVE FARM 2 REMASTERED CONFIGURATIONS[/size][/color][/b]
<br />
<br />[b][size=3]Farm Sand Box Layout[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Transforms IF2R into a more standard farm map, excluding predetermined crop fields, shed building, and static fences. There’s an image of this version in the IF2R section. The configuration file is located within the [CP] IF2R Folder. Players may set this configuration to “true” on existing SVE saves using IF2R.[/size]
<br />
<br />[b][size=3]Farm-Light Debris[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Balances resource intake and makes the farmland more manageable. Must be toggled to true before save file creation to take effect.[/size]
<br />
<br />[b][size=3]DirtCropField1, DirtCropField2, DirtCropField3…[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Crop fields can be toggled between grass and dirt variants.[/size]
<br />
<br />[b][size=3]Remove Fences In Front Of Shed[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the fences in-between the shed and crop field 6.[/size]
<br />
<br />[b][size=3]Remove Farm Animal Area Fences[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the fencing in the middle of IF2R.[/size]
<br />
<br />[b][size=3]Remove Fences Left Of Crop Field 1[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the fences beside the river.[/size]
<br />
<br />[b][size=3]Remove Central Cherry Blossom Tree And Water Trough[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the large pink tree and water trough below the fenced animal area[/size]
<br />
<br />[b][size=3]Remove Fences From Backyard[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes all fences around the farmhouse.[/size]
<br />
<br />[b][size=3]Remove Table From Backyard[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the table and chair under the blossom tree.[/size]
<br />
<br />[b][size=3]Remove Pet House From Backyard[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the pet house. Useful if players are using a recolor that doesn’t match the color palette/design.[/size]
<br />
<br />[b][size=3]Remove Flowerbed From Backyard[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the flowerbeds above the farmhouse.[/size]
<br />
<br />[b][size=3]Remove Minecart System[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes the minecarts around the farmland.[/size]
<br />
<br />[b][size=3]Remove Objects From Greenhouse[/size][/b]
<br />[size=3]Default = “False”[/size]
<br />[size=3]Removes static plants, boxes, flowers, and barrels from the IF2R greenhouse interior.[/size]
<br />
<br />[size=3] [/size]
<br />[size=3][/spoiler][/size][/center]
<br />
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385423-147396219.png[/img]    [/size]
<br />[size=3]43 new fish are introduced in SVE! Details on where to catch them, difficulty, sale price, and more can be found on the [url=https://stardewvalleyexpanded.wiki.gg/]Stardew Valley Expanded Wiki[/url] [/size][/center]
<br />[center][/center]
<br />[center][size=3]  [/size][/center]
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385454-991174073.png[/img]  [/size]
<br />[size=3]Immersive custom forage spawn locations throughout the world, in every map. Some forage/objects are one-time spawns and others spawn in specific areas. After playing for 2+ years, many spawns are buffed and new ones will appear. [/size][/center]
<br />
<br />
<br />
<br />
<br />[center][size=3] [img width=425,height=250]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385402-235940300.png[/img] [/size]
<br />[size=3]The future of SVE is bright! Here is what players can expect in future updates:[/size]
<br />[size=3] [/size]
<br />[spoiler]
<br />
<br />[size=3]New villages, towns, and cities[/size]
<br />[size=3]New fully-fledged NPCs[/size]
<br />[size=3]New maps[/size]
<br />[size=3]New festivals[/size]
<br />[size=3]New music[/size]
<br />[size=3]Dungeons[/size]
<br />[size=3]More character events[/size]
<br />[size=3]Lore and character arcs[/size]
<br />[size=3]New desktop wallpapers[/size]
<br />[size=3][/size][/center]
<br />[/spoiler]
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385467-608615976.png[/img]  [/size]
<br />[size=3]Have a question? Check these frequently asked questions first! Your question may have been answered![/size]
<br />[size=3][url=https://github.com/FlashShifter/StardewValleyExpanded/wiki/FAQs]Click Here![/url][/size][/center][size=3][url=https://github.com/FlashShifter/StardewValleyExpanded/wiki/FAQs]
<br />
<br />
<br />
<br />
<br />[/url][/size][center][size=3][url=https://github.com/FlashShifter/StardewValleyExpanded/wiki/FAQs][img]https://i.postimg.cc/HnXxhFGM/Compatibility-And-Modder-Resources.png[/img][/url][/size]
<br />[size=3]Stardew Valley Expanded is compatible with other expansions such as Ridgeside Village, East Scarp, Downtown Zuzu City, Boarding House, and Mineral Town! Generally speaking, SVE is compatible with the vast majority of other mods. There's also many resources available to new aspiring modders and guides to make their mods compatible with Stardew Valley Expanded and other expansion mods. The link below has more information:
<br />
<br />[/size][url=https://linktr.ee/sdvmodding][size=3]Stardew Valley Expanded Compatibility Form and Modder Resources[/size][/url][/center] 
<br />
<br />
<br />[center][/center]
<br />
<br />[center][size=3][img]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385450-1648113139.png[/img]  
<br />[/size][spoiler]
<br />[size=5][url=https://twitter.com/ConcernedApe]ConcernedApe[/url] [/size]
<br />[size=4][b]Creator of Stardew Valley
<br />
<br />[/b][/size]- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
<br />
<br />[b][size=4]Stardew Valley Expanded Co-Developers:[/size][/b]
<br />
<br />[url=https://forums.nexusmods.com/index.php?/user/2679113-poltergeister/][size=4]Poltergeister[/size][/url][size=3] [/size]
<br />[size=3]Portrait Artist[/size]
<br />
<br />[url=https://twitter.com/iKeychain][size=4]iKeychain[/size][/url][size=3] [/size]
<br />[size=3]Object Artist[/size]
<br />
<br />[url=https://www.nexusmods.com/stardewvalley/users/56561342][size=4]EscaMMC[/size][/url][size=3] [/size]
<br />[size=3]C# Programming[/size]
<br />
<br />[url=https://next.nexusmods.com/profile/spacechase0/about-me?gameId=1303][size=4]spacechase0[/size][/url] 
<br />[size=3]C# Programming[/size]
<br />
<br />[size=4][url=https://bsky.app/profile/helloitsmouse.bsky.social]Mouse[/url] [/size]
<br />[size=3]Dialogue and Revisions[/size]
<br />
<br />[color=#e69138][size=4][b]Jessie#4755[/b][/size][/color]
<br />[size=3]Json Coder and i18n[/size]
<br />
<br />[size=3]- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -[/size]
<br />
<br />[b][size=4]Other Contributors:[/size][/b]
<br />
<br />[url=https://next.nexusmods.com/profile/xNytax/about-me?gameId=1303][size=3]xNytax[/size][/url][size=3] [/size]
<br />[size=3]SVE Community Contributor
<br />
<br />[size=3][url=https://next.nexusmods.com/profile/6480/mods?gameId=1303]6480 [/url] [/size]
<br />[size=3]Object Art Edits[/size][/size]
<br />
<br />[size=3][url=https://www.nexusmods.com/stardewvalley/users/41168370]HopeWasHere[/url] [/size]
<br />[size=3]Portrait Artist
<br />
<br />[size=3][url=https://www.nexusmods.com/stardewvalley/users/58947071]CherrySymphony [/url] [/size]
<br />[/size][size=3]Portrait Art Edits[/size]
<br />
<br />[size=3][url=https://www.nexusmods.com/stardewvalley/users/29644045]Coldazrael[/url] [/size]
<br />[size=3]Corrupt Monster Art[/size]
<br />
<br />[url=https://www.nexusmods.com/stardewvalley/users/2984576][size=3]halloikbenzander[/size][/url]
<br />[size=3]Original author of Immersive Farm 2.[/size][/center][/spoiler]
`

function hasConfiguredPath(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function countConfiguredPaths(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return [settings.gamePath, settings.modsPath, settings.downloadPath].filter(hasConfiguredPath).length
}

function hasWarningDiagnostics(routes: LauncherNexusRouteSnapshot[]) {
  return routes.some((route) => route.status === 'warning' || !route.available)
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '0' : new Intl.NumberFormat().format(value)
}

function getPercent(value: number | null | undefined, total: number) {
  if (value == null) {
    return 0
  }

  return Math.max(0, Math.min(100, (value / total) * 100))
}

function formatPercent(percent: number) {
  if (percent <= 0) {
    return '0%'
  }

  if (percent >= 100) {
    return '100%'
  }

  if (percent > 99) {
    return `${Math.floor(percent)}%`
  }

  const rounded = Math.round(percent)
  return `${Math.max(1, rounded)}%`
}

function formatResetCountdown(timestampSeconds: number | null | undefined, copy: LauncherCopy) {
  if (timestampSeconds == null) {
    return null
  }

  const remainingMs = timestampSeconds * 1000 - Date.now()
  if (remainingMs <= 0) {
    return copy.settings.nexusQuotaResetIn(copy.settings.nexusQuotaDurationMinutes(0))
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const duration =
    hours > 0 ? copy.settings.nexusQuotaDurationHoursMinutes(hours, minutes) : copy.settings.nexusQuotaDurationMinutes(minutes)

  return copy.settings.nexusQuotaResetIn(duration)
}

function getNextUtcMidnightTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0) / 1000
}

function getNextHourTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0) / 1000
}

function getQuotaDetail(limit: string, resetAt: number | null | undefined, fallbackResetAt: () => number, copy: LauncherCopy) {
  const resetDetail = formatResetCountdown(resetAt ?? fallbackResetAt(), copy)
  return resetDetail == null ? limit : `${limit} · ${resetDetail}`
}

function getDiagnosticsAgeLabel(timestamp: number | null, copy: LauncherCopy) {
  if (timestamp == null) {
    return copy.settings.configurationDiagnosticsJustNow
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  return minutes <= 0 ? copy.settings.configurationDiagnosticsJustNow : copy.settings.configurationDiagnosticsMinutesAgo(minutes)
}

function getConfigurationDiagnosticsApiKeySignature(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return settings.nexusApiKey?.trim() ?? ''
}

function getRouteTone(route: LauncherNexusRouteSnapshot | undefined): ApiRouteTone {
  if (!route) {
    return 'loading'
  }

  if (route.status === 'loading') {
    return 'loading'
  }

  if (route.available && route.status === 'success') {
    return 'ok'
  }

  return route.status === 'warning' ? 'warn' : 'danger'
}

function getRouteStatusLabel(tone: ApiRouteTone, copy: LauncherCopy) {
  if (tone === 'ok') {
    return copy.settings.nexusApiAvailable
  }

  if (tone === 'warn') {
    return copy.settings.nexusApiSlow
  }

  if (tone === 'loading') {
    return copy.configuration.nexusDiagnosticsLoadingState
  }

  return copy.settings.nexusApiUnavailable
}

function getRouteDisplayName(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  if (route.routeId === 'nexusApi') {
    return copy.settings.nexusApiRest
  }

  if (route.routeId === 'publicGraphql') {
    return copy.settings.nexusApiGraphql
  }

  if (route.routeId === 'nexusImages') {
    return copy.settings.nexusApiImageCdn
  }

  return route.label
}

function getRouteDescription(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  const responsibilities = copy.configuration.nexusDiagnosticsRouteResponsibilities
  if (route.routeId === 'publicGraphql') {
    return responsibilities.publicGraphql
  }

  if (route.routeId === 'privateGraphql') {
    return responsibilities.privateGraphql
  }

  if (route.routeId === 'nexusApi') {
    return responsibilities.nexusApi
  }

  if (route.routeId === 'nexusImages') {
    return responsibilities.nexusImages
  }

  if (route.routeId === 'smapi') {
    return responsibilities.smapi
  }

  return responsibilities.fallback
}

function getRouteRowTone(route: LauncherNexusRouteSnapshot | undefined, account: NexusApiAccountStatus, isAuthorized: boolean) {
  if (route?.routeId === 'nexusApi') {
    const restTone: ApiRouteTone = account.apiKeyError ? 'danger' : account.apiKeyChecking ? 'loading' : getRouteTone(route)
    return isAuthorized ? restTone : 'danger'
  }

  const routeTone = getRouteTone(route)
  if (routeTone === 'loading') {
    return 'loading'
  }

  if (route?.routeId === 'nexusImages') {
    return routeTone === 'ok' ? 'ok' : 'warn'
  }

  if (route?.routeId === 'publicGraphql' && routeTone === 'danger') {
    return 'warn'
  }

  return routeTone
}

function getRouteIcon(routeId: string) {
  if (routeId === 'nexusApi') {
    return <Database className="h-4 w-4" />
  }

  if (routeId === 'privateGraphql') {
    return <KeyRound className="h-4 w-4" />
  }

  if (routeId === 'nexusImages') {
    return <Image className="h-4 w-4" />
  }

  if (routeId === 'smapi') {
    return <Server className="h-4 w-4" />
  }

  return <Network className="h-4 w-4" />
}

function getInitials(name: string) {
  const cleaned = name.trim()
  if (!cleaned) {
    return 'NX'
  }

  const words = cleaned.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
  }

  return cleaned.slice(0, 2).toUpperCase()
}

function getStepIcon(tone: ConfigStepTone) {
  if (tone === 'danger') {
    return <X className="h-3.5 w-3.5" />
  }

  if (tone === 'warn') {
    return <AlertTriangle className="h-3.5 w-3.5" />
  }

  return <Check className="h-3.5 w-3.5" />
}

function ConfigCompletionRail({ title, steps }: { title: string; steps: ConfigStep[] }) {
  return (
    <LoadingMotionReveal
      itemId="launcher-config-completion-rail"
      index={3}
      as="section"
      className="launcher-config-rail-panel launcher-config-completion-rail"
      data-testid="launcher-config-completion-rail"
    >
      <div className="launcher-config-rail-title">{title}</div>
      <div className="launcher-config-stepper">
        {steps.map((step, index) => (
          <LoadingMotionRevealItem
            key={step.id}
            index={index}
            as="div"
            className={cx('launcher-config-step', `launcher-config-step-${step.tone}`)}
            data-testid={`launcher-config-${step.id}-step`}
          >
            <span className="launcher-config-step-mark" aria-hidden="true">
              {getStepIcon(step.tone)}
            </span>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigDownloadDefaults({
  settings,
  copy,
  yesLabel,
  noLabel,
}: {
  settings: ReturnType<typeof useLauncherSettings>['settings']
  copy: LauncherCopy
  yesLabel: string
  noLabel: string
}) {
  const defaults = [
    {
      label: copy.toggles.autoCheckModUpdates,
      checked: settings.autoCheckModUpdates,
    },
    {
      label: copy.toggles.autoInstallDownloads,
      checked: settings.autoInstallDownloads,
    },
    {
      label: copy.toggles.keepDownloadedArchives,
      checked: settings.keepDownloadedArchives,
    },
  ]

  return (
    <LoadingMotionReveal
      itemId="launcher-config-download-defaults"
      index={5}
      as="section"
      className="launcher-config-rail-panel launcher-config-download-defaults"
      data-testid="launcher-config-download-defaults"
    >
      <div className="launcher-config-rail-title">{copy.settings.downloadDefaultsTitle}</div>
      <div className="launcher-config-defaults">
        {defaults.map((item, index) => (
          <LoadingMotionRevealItem key={item.label} index={index} as="div" className="launcher-config-default-row">
            <span>{item.label}</span>
            <span
              className={cx('launcher-config-mini-switch', item.checked && 'launcher-config-mini-switch-active')}
              aria-label={item.checked ? yesLabel : noLabel}
            >
              <span aria-hidden="true" />
            </span>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigAccountCard({ account, copy }: { account: NexusApiAccountStatus; copy: LauncherCopy }) {
  const accountName = account.apiKeyStatus?.userName ?? 'Nexus'
  const accountStatus = account.apiKeyError ? copy.settings.nexusApiUnavailable : copy.settings.nexusNormalStatus
  const isPremium = account.apiKeyStatus?.isPremium === true
  const tierLabel = isPremium ? copy.diagnostics.premiumActive : copy.diagnostics.premiumFree

  return (
    <LoadingMotionReveal
      itemId="launcher-config-account-card"
      index={4}
      as="section"
      className="launcher-config-account-row"
      data-testid="launcher-config-account-card"
    >
      <div className="launcher-config-account-cover" aria-hidden="true" />
      <div className="launcher-config-account-card">
        <div className="launcher-config-avatar-wrap">
          <span className="launcher-config-avatar">{getInitials(accountName)}</span>
          <span
            className={cx('launcher-config-online-dot', account.apiKeyError && 'launcher-config-online-dot-danger')}
            title={accountStatus}
          />
        </div>
        <div className="launcher-config-account-meta">
          <strong>{accountName}</strong>
          <span
            className={cx('launcher-config-tier-badge', isPremium ? 'launcher-config-premium-badge' : 'launcher-config-tier-badge-free')}
            title={tierLabel}
          >
            {isPremium ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {isPremium ? tierLabel.toUpperCase() : tierLabel}
          </span>
        </div>
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigPanelHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="launcher-config-panel-head">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions ? <div className="launcher-config-panel-actions">{actions}</div> : null}
    </div>
  )
}

function ConfigPathPanel({
  settingsState,
  copy,
  browseLabel,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  copy: LauncherCopy
  browseLabel: string
}) {
  const launcherPort = useLauncherPort()
  const rows = [
    {
      field: 'gamePath' as const,
      label: copy.fields.gamePath,
      value: settingsState.settings.gamePath,
    },
    {
      field: 'modsPath' as const,
      label: copy.fields.modsPath,
      value: settingsState.settings.modsPath,
    },
    {
      field: 'downloadPath' as const,
      label: copy.fields.downloadPath,
      value: settingsState.settings.downloadPath,
    },
  ]

  return (
    <section className="launcher-config-panel launcher-config-paths" aria-label={copy.settings.pathsTitle}>
      <ConfigPanelHeader title={copy.settings.pathsTitle} description={copy.settings.pathsHint} />
      <div className="launcher-config-path-list">
        {rows.map((row, index) => (
          <LoadingMotionRevealItem key={row.field} index={index} as="div" className="launcher-config-path-row">
            <div className="launcher-config-path-label">
              <strong>{row.label}</strong>
            </div>
            <div className="launcher-config-path-field">
              <span className="launcher-config-path-text" data-testid={`launcher-config-${row.field}-value`}>
                {row.value?.trim() || copy.settings.pathNotConfigured}
              </span>
              <div className="launcher-config-path-actions">
                <button
                  type="button"
                  className="launcher-config-icon-button"
                  aria-label={`${row.label} ${browseLabel}`}
                  title={browseLabel}
                  onClick={() => void settingsState.pickDirectory(row.field, row.label)}
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                {row.value ? (
                  <button
                    type="button"
                    className="launcher-config-icon-button"
                    aria-label={`${row.label} ${copy.actions.openFolder}`}
                    title={copy.actions.openFolder}
                    onClick={() => void launcherPort.openPath({ path: row.value! })}
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </section>
  )
}

function applyForcedNonPremiumStatus(status: ValidateApiKeyResult | null, forceNonPremium: boolean) {
  return status && forceNonPremium ? { ...status, isPremium: false } : status
}

function useNexusApiAccountStatus(settingsState: ReturnType<typeof useLauncherSettings>, forceNonPremium: boolean): NexusApiAccountStatus {
  const launcherPort = useLauncherPort()
  const { settings, refresh } = settingsState
  const [apiKeyStatus, setApiKeyStatus] = useState<ValidateApiKeyResult | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeyChecking, setApiKeyChecking] = useState(false)
  const [ssoAuthorized, setSsoAuthorized] = useState(false)
  const [ssoStarting, setSsoStarting] = useState(false)
  const apiKeySignature = getConfigurationDiagnosticsApiKeySignature(settings)
  const hasApiKey = Boolean(apiKeySignature)
  const applyDebugAccountTier = useCallback(
    (status: ValidateApiKeyResult | null, overrideForceNonPremium = forceNonPremium) =>
      applyForcedNonPremiumStatus(status, overrideForceNonPremium),
    [forceNonPremium],
  )

  const writeApiKeyStatusCache = useCallback(
    (status: ValidateApiKeyResult | null, error: string | null, overrideForceNonPremium = forceNonPremium) => {
      writeCachedLauncherConfigurationApiKeyStatus(
        {
          status: applyDebugAccountTier(status, overrideForceNonPremium),
          error,
        },
        {
          apiKeySignature,
        },
      )
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium],
  )

  const refreshApiKeyStatus = useCallback(
    async (options: { force?: boolean; forceNonPremium?: boolean } = {}) => {
      const effectiveForceNonPremium = options.forceNonPremium ?? forceNonPremium
      if (!hasApiKey) {
        setApiKeyStatus(null)
        setApiKeyError(null)
        return
      }

      if (!options.force) {
        const cached = readCachedLauncherConfigurationApiKeyStatus({
          apiKeySignature,
        })
        if (cached) {
          setApiKeyStatus(applyDebugAccountTier(cached.status, effectiveForceNonPremium))
          setApiKeyError(cached.error)
          return
        }
      }

      setApiKeyChecking(true)
      setApiKeyError(null)
      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey(), effectiveForceNonPremium)
        setApiKeyStatus(nextStatus)
        writeApiKeyStatusCache(nextStatus, null, effectiveForceNonPremium)
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        setApiKeyStatus(null)
        setApiKeyError(errorMessage)
        writeApiKeyStatusCache(null, errorMessage, effectiveForceNonPremium)
      } finally {
        setApiKeyChecking(false)
      }
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium, hasApiKey, launcherPort, writeApiKeyStatusCache],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!hasApiKey) {
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationApiKeyStatus({
        apiKeySignature,
      })
      if (cached) {
        if (!cancelled) {
          setApiKeyStatus(applyDebugAccountTier(cached.status))
          setApiKeyError(cached.error)
        }
        return
      }

      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey())
        writeApiKeyStatusCache(nextStatus, null)
        if (!cancelled) {
          setApiKeyStatus(nextStatus)
          setApiKeyError(null)
        }
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        writeApiKeyStatusCache(null, errorMessage)
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(errorMessage)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [apiKeySignature, applyDebugAccountTier, hasApiKey, launcherPort, writeApiKeyStatusCache])

  useEffect(() => {
    let cancelled = false

    const loadSso = async () => {
      const cached = readCachedLauncherConfigurationSsoStatus()
      if (cached) {
        if (!cancelled) {
          setSsoAuthorized(cached.snapshot.status === 'authorized')
        }
        return
      }

      try {
        const snapshot = await launcherPort.getNexusSsoStatus()
        writeCachedLauncherConfigurationSsoStatus(snapshot)
        if (!cancelled) {
          setSsoAuthorized(snapshot.status === 'authorized')
        }
      } catch {
        if (!cancelled) {
          setSsoAuthorized(false)
        }
      }
    }

    void loadSso()

    return () => {
      cancelled = true
    }
  }, [launcherPort])

  const startSso = useCallback(async () => {
    setSsoStarting(true)
    try {
      await launcherPort.startNexusSso()
      const snapshot = await launcherPort.getNexusSsoStatus()
      writeCachedLauncherConfigurationSsoStatus(snapshot)
      setSsoAuthorized(snapshot.status === 'authorized')
      if (snapshot.status === 'authorized') {
        await refresh()
        await refreshApiKeyStatus({ force: true })
      }
    } catch (nextError) {
      setApiKeyError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSsoStarting(false)
    }
  }, [launcherPort, refresh, refreshApiKeyStatus])

  return {
    apiKeyStatus,
    apiKeyError,
    apiKeyChecking,
    ssoAuthorized,
    ssoStarting,
    refreshApiKeyStatus,
    startSso,
  }
}

function ConfigMetric({
  title,
  value,
  percent,
  limit,
  warn,
}: {
  title: string
  value: string
  percent: number
  limit: string
  warn?: boolean
}) {
  return (
    <div className={cx('launcher-config-dash-metric', warn && 'launcher-config-dash-metric-warn')}>
      <div className="launcher-config-metric-head">
        <span>{title}</span>
        <span>{formatPercent(percent)}</span>
      </div>
      <div className="launcher-config-metric-value">{value}</div>
      <div className={cx('launcher-config-progress', warn && 'launcher-config-progress-warn')}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="launcher-config-micro">{limit}</div>
    </div>
  )
}

function ConfigApiRow({
  index,
  routeId,
  name,
  description,
  statusLabel,
  tone,
  resolved,
  children,
}: {
  index: number
  routeId: ConfigRouteId
  name: string
  description: string
  statusLabel: string
  tone: ApiRouteTone
  resolved: boolean
  children: ReactNode
}) {
  return (
    <LoadingMotionRevealItem
      index={index}
      as="div"
      className={cx('launcher-config-api-row', `launcher-config-api-row-${tone}`, resolved && 'launcher-config-api-row-resolved')}
    >
      <div className="launcher-config-api-name">
        <span
          className={cx('launcher-config-api-icon', `launcher-config-api-icon-${routeId}`, `launcher-config-api-icon-${tone}`)}
          aria-hidden="true"
        >
          {children}
        </span>
        <h3>{name}</h3>
      </div>
      <div className="launcher-config-api-desc">{description}</div>
      <span className={cx('launcher-config-status-tag', `launcher-config-status-tag-${tone}`)}>{statusLabel}</span>
    </LoadingMotionRevealItem>
  )
}

function ConfigNexusPanel({
  settingsState,
  account,
  copy,
  routes,
  diagnosticsRefreshing,
  onRefreshDiagnostics,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  account: NexusApiAccountStatus
  copy: LauncherCopy
  routes: LauncherNexusRouteSnapshot[]
  diagnosticsRefreshing: boolean
  onRefreshDiagnostics: () => void
}) {
  const hasApiKey = Boolean(settingsState.settings.nexusApiKey?.trim())
  const isAuthorized = Boolean(account.apiKeyStatus || account.ssoAuthorized || hasApiKey)
  const dailyPercent = getPercent(account.apiKeyStatus?.dailyRemaining, 20_000)
  const hourlyPercent = getPercent(account.apiKeyStatus?.hourlyRemaining, 500)
  const dailyLimit = getQuotaDetail(
    copy.settings.nexusQuotaDailyLimit,
    account.apiKeyStatus?.dailyResetAt,
    getNextUtcMidnightTimestampSeconds,
    copy,
  )
  const hourlyLimit = getQuotaDetail(
    copy.settings.nexusQuotaHourlyLimit,
    account.apiKeyStatus?.hourlyResetAt,
    getNextHourTimestampSeconds,
    copy,
  )
  const displayedRoutes = getDisplayedConfigRoutes(routes, copy)

  return (
    <section
      className="launcher-config-panel launcher-config-nexus"
      aria-label={copy.settings.nexusAccessTitle}
      data-testid="launcher-config-nexus"
    >
      <ConfigPanelHeader
        title={copy.settings.nexusAccessTitle}
        description={isAuthorized ? copy.settings.nexusAccessHint : copy.settings.nexusGuestSubtitle}
        actions={
          <div className="launcher-config-actions">
            <button
              type="button"
              className="launcher-config-button launcher-config-button-brand"
              disabled={account.ssoStarting}
              onClick={() => void account.startSso()}
            >
              {isAuthorized ? copy.settings.nexusReauthorize : copy.settings.nexusSignInAction}
            </button>
            <button
              type="button"
              className="launcher-config-button"
              disabled={!hasApiKey}
              onClick={() => settingsState.updateField('nexusApiKey', null)}
            >
              {copy.settings.nexusClearApiKeyAction}
            </button>
            <button
              type="button"
              className="launcher-config-icon-button launcher-config-panel-icon-button launcher-config-refresh-button"
              aria-busy={diagnosticsRefreshing}
              aria-label={copy.configuration.nexusDiagnosticsTitle}
              title={copy.configuration.nexusDiagnosticsTitle}
              onClick={onRefreshDiagnostics}
            >
              <RefreshCw className={cx('h-3.5 w-3.5', diagnosticsRefreshing && 'animate-spin')} aria-hidden="true" />
            </button>
            <span className="launcher-config-help" title={copy.settings.nexusAccessHint}>
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        }
      />

      {isAuthorized ? (
        <div className="launcher-config-dashboard">
          <div className="launcher-config-dash-metrics">
            <ConfigMetric
              title={copy.settings.nexusQuotaDaily}
              value={formatNumber(account.apiKeyStatus?.dailyRemaining)}
              percent={dailyPercent}
              limit={dailyLimit}
            />
            <ConfigMetric
              title={copy.settings.nexusQuotaHourly}
              value={formatNumber(account.apiKeyStatus?.hourlyRemaining)}
              percent={hourlyPercent}
              limit={hourlyLimit}
              warn
            />
          </div>
        </div>
      ) : null}

      {!isAuthorized ? (
        <div className="launcher-config-guest-hero">
          <div>
            <h3>{copy.settings.nexusGuestTitle}</h3>
            <p>{copy.settings.nexusGuestSubtitle}</p>
          </div>
          <div className="launcher-config-actions">
            <button
              type="button"
              className="launcher-config-button launcher-config-button-primary"
              disabled={account.ssoStarting}
              onClick={() => void account.startSso()}
            >
              {copy.settings.nexusSignInAction}
            </button>
            <button
              type="button"
              className="launcher-config-button"
              onClick={() => settingsState.updateField('nexusApiKey', settingsState.settings.nexusApiKey ?? '')}
            >
              {copy.settings.nexusPasteApiKeyAction}
            </button>
          </div>
        </div>
      ) : null}

      <div className="launcher-config-api-list">
        {displayedRoutes.map((route, index) => {
          const tone = getRouteRowTone(route, account, isAuthorized)
          return (
            <ConfigApiRow
              key={route.routeId}
              index={index}
              routeId={route.routeId as ConfigRouteId}
              name={getRouteDisplayName(route, copy)}
              description={getRouteDescription(route, copy)}
              tone={tone}
              statusLabel={getRouteStatusLabel(tone, copy)}
              resolved={route.status !== 'loading'}
            >
              {getRouteIcon(route.routeId)}
            </ConfigApiRow>
          )
        })}
      </div>

      {account.apiKeyError ? <p className="launcher-config-api-error">{`Log: ${account.apiKeyError}`}</p> : null}
    </section>
  )
}

function NotificationTestButtons({ labels, debugEnabled }: { labels: DebugButtonGroup; debugEnabled: boolean }) {
  const notify = (level: AppEventLevel, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug notification test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      keyValues: {
        source: 'launcher-configuration-page',
        kind: 'notification-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => notify('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => notify('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-success"
        onClick={() => notify('success', labels.success)}
      >
        {labels.success}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => notify('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => notify('error', labels.error)}
      >
        {labels.error}
      </button>
    </div>
  )
}

function LogTestButtons({ labels, debugEnabled }: { labels: DebugLogButtonGroup; debugEnabled: boolean }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug log test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      notify: false,
      keyValues: {
        source: 'launcher-configuration-page',
        kind: 'log-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => logOnly('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => logOnly('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => logOnly('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => logOnly('error', labels.error)}
      >
        {labels.error}
      </button>
    </div>
  )
}

type LauncherConfigurationPageProps = {
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  settingsState: ReturnType<typeof useLauncherSettings>
  downloads: ReturnType<typeof useLauncherDownloads>
}

function DebugModeSwitch({
  checked,
  title,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  checked: boolean
  title: string
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()

  return (
    <section className="launcher-debug-tool-card">
      <div className="launcher-debug-tool-header launcher-debug-tool-header-center">
        <div className="launcher-debug-setting">
          <span className="launcher-debug-setting-icon launcher-debug-icon-debug-mode" aria-hidden="true">
            <Bug className="h-4 w-4" />
          </span>
          <div className="launcher-debug-setting-copy">
            <h2 id={titleId} className="launcher-debug-tool-title">
              {title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          className={cx('settings-switch', checked && 'settings-switch-active')}
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          title={checked ? disabledLabel : enabledLabel}
          onClick={onToggle}
        >
          <span className="settings-switch-copy">{checked ? disabledLabel : enabledLabel}</span>
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </button>
      </div>
    </section>
  )
}

function DebugToolCard({
  title,
  subtitle,
  icon,
  iconClassName,
  headerActions,
  children,
  tone,
}: {
  title: string
  subtitle?: string
  icon: ReactNode
  iconClassName?: string
  headerActions?: ReactNode
  children?: ReactNode
  tone?: 'danger' | 'warning'
}) {
  return (
    <section className={cx('launcher-debug-tool-card', (tone === 'danger' || tone === 'warning') && 'launcher-debug-tool-card-danger')}>
      <div className="launcher-debug-tool-header">
        <div className="launcher-debug-tool-copy">
          {icon ? (
            <span className={cx('launcher-debug-tool-badge', iconClassName)} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="launcher-debug-tool-text">
            <h2 className="launcher-debug-tool-title">{title}</h2>
            {subtitle ? <p className="launcher-debug-tool-subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <div className="launcher-debug-tool-header-side">
          {headerActions ? <div className="launcher-debug-tool-header-actions">{headerActions}</div> : null}
        </div>
      </div>
      {children != null ? <div className="launcher-debug-tool-tray">{children}</div> : null}
    </section>
  )
}

function DebugSectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="launcher-debug-section-title">{children}</h3>
}

export function LauncherConfigurationPage({
  debugEnabled,
  onToggleDebugMode,
  onLauncherDiagnosticsUpdate,
  settingsState,
  downloads,
}: LauncherConfigurationPageProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const settingsCopy = useSettingsMenuCopy()
  const commonCopy = rootCopy.common
  const [debugToolsExpanded, setDebugToolsExpanded] = useState(false)
  const [bbcodePreviewExpanded, setBbcodePreviewExpanded] = useState(false)
  const [diagnosticRoutes, setDiagnosticRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const [lastDiagnosticsAt, setLastDiagnosticsAt] = useState<number | null>(null)
  const [diagnosticsRefreshing, setDiagnosticsRefreshing] = useState(false)
  const [forceOffline, setForceOffline] = useState(() => getAppUiStateSnapshot().launcher.forceOffline)
  const [forceOfflineBusy, setForceOfflineBusy] = useState(false)
  const [forceNonPremium, setForceNonPremium] = useState(() => getAppUiStateSnapshot().launcher.forceNonPremium)
  const [forceNonPremiumBusy, setForceNonPremiumBusy] = useState(false)
  const [diagnosticsPollNonce] = useState(0)
  const [diagnosticsRestartNonce, setDiagnosticsRestartNonce] = useState(0)
  const [installedModCount, setInstalledModCount] = useState<number | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<LauncherRuntimeInfo | null>(null)
  const launcherPort = useLauncherPort()
  const account = useNexusApiAccountStatus(settingsState, forceNonPremium)
  const warningState = getLauncherWarningState(settingsState.settings)
  const configuredPaths = countConfiguredPaths(settingsState.settings)
  const hasCredentials = !warningState.missingCredentials
  const warningDiagnostics = hasWarningDiagnostics(diagnosticRoutes)
  const stepItems: ConfigStep[] = [
    {
      id: 'paths',
      label: copy.settings.stepPaths,
      detail: copy.settings.configuredPathsSummary(configuredPaths, 3),
      tone: configuredPaths === 3 ? 'ok' : configuredPaths > 0 ? 'warn' : 'danger',
    },
    {
      id: 'nexus',
      label: copy.settings.stepNexus,
      detail: hasCredentials ? copy.settings.nexusReady : copy.settings.nexusMissing,
      tone: hasCredentials ? 'ok' : 'danger',
    },
    {
      id: 'downloads',
      label: copy.settings.stepDownloads,
      detail: settingsState.settings.autoCheckModUpdates ? copy.settings.downloadsReady : copy.settings.downloadsLimited,
      tone: settingsState.settings.autoCheckModUpdates ? 'ok' : 'warn',
    },
    {
      id: 'diagnostics',
      label: copy.settings.stepDiagnostics,
      detail: warningDiagnostics ? copy.settings.diagnosticsReview : copy.settings.diagnosticsHealthy,
      tone: warningDiagnostics ? 'warn' : 'ok',
    },
  ]
  const readyStepCount = stepItems.filter((step) => step.tone === 'ok').length
  const issueStepCount = stepItems.length - readyStepCount
  const overallStatus = issueStepCount > 0 ? copy.settings.configurationNeedsReview : copy.settings.configurationReady
  const modCountLabel =
    installedModCount == null
      ? copy.settings.configurationInstalledModsUnknown
      : copy.settings.configurationInstalledMods(installedModCount)
  const diagnosticsAgeLabel = getDiagnosticsAgeLabel(lastDiagnosticsAt, copy)
  const headerStatusLine = copy.settings.configurationStatusLine(overallStatus, modCountLabel, diagnosticsAgeLabel)
  const gameVersion = runtimeInfo?.gameVersion ?? null
  const smapiVersion = runtimeInfo?.smapiVersion ?? null
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const diagnosticsApiKeySignature = getConfigurationDiagnosticsApiKeySignature(settingsState.settings)
  const handleDiagnosticsUpdate = useCallback(
    (diagnostics: LauncherNexusDiagnosticsResult) => {
      setDiagnosticRoutes(diagnostics.routes)
      setLastDiagnosticsAt(Date.now())
      onLauncherDiagnosticsUpdate?.(diagnostics)
    },
    [onLauncherDiagnosticsUpdate],
  )
  useEffect(() => {
    let disposed = false
    const modsPath = settingsState.settings.modsPath?.trim()

    const loadInstalledModCount = async () => {
      if (!modsPath) {
        if (!disposed) {
          setInstalledModCount(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationLibraryScan({ modsPath })
      if (cached) {
        if (!disposed) {
          setInstalledModCount(cached.result.mods.length)
        }
        return
      }

      try {
        const result = await launcherPort.scanLibrary({ modsPath })
        writeCachedLauncherConfigurationLibraryScan(result, { modsPath })
        if (!disposed) {
          setInstalledModCount(result.mods.length)
        }
      } catch {
        if (!disposed) {
          setInstalledModCount(null)
        }
      }
    }

    void loadInstalledModCount()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.modsPath])
  useEffect(() => {
    let disposed = false
    const gamePath = settingsState.settings.gamePath?.trim() ?? ''

    const loadRuntimeInfo = async () => {
      const cached = readCachedLauncherConfigurationRuntimeInfo({ gamePath })
      if (cached) {
        if (!disposed) {
          setRuntimeInfo(cached.info)
        }
        return
      }

      try {
        const info = await launcherPort.loadRuntimeInfo()
        writeCachedLauncherConfigurationRuntimeInfo(info, { gamePath })
        if (!disposed) {
          setRuntimeInfo(info)
        }
      } catch {
        if (!disposed) {
          setRuntimeInfo(null)
        }
      }
    }

    void loadRuntimeInfo()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.gamePath])
  useEffect(() => {
    if (!canUseDesktopHost()) {
      return
    }

    let disposed = false
    let timeoutId: number | null = null
    let shouldRestartDiagnostics = diagnosticsRestartNonce > 0
    const cachedDiagnostics = shouldRestartDiagnostics
      ? null
      : readCachedLauncherConfigurationDiagnostics({
          apiKeySignature: diagnosticsApiKeySignature,
        })

    const poll = async () => {
      if (cachedDiagnostics) {
        setDiagnosticRoutes(cachedDiagnostics.diagnostics.routes)
        setLastDiagnosticsAt(cachedDiagnostics.cachedAt)
        onLauncherDiagnosticsUpdate?.(cachedDiagnostics.diagnostics)
        if (!cachedDiagnostics.shouldRefresh) {
          setDiagnosticsRefreshing(false)
          return
        }
      }

      try {
        const diagnostics = shouldRestartDiagnostics ? await restartLauncherNexusDiagnostics() : await loadLauncherNexusDiagnostics()
        shouldRestartDiagnostics = false
        if (disposed) {
          return
        }
        writeCachedLauncherConfigurationDiagnostics(diagnostics, {
          apiKeySignature: diagnosticsApiKeySignature,
        })
        handleDiagnosticsUpdate(diagnostics)
        setDiagnosticsRefreshing(false)
        if (diagnostics.routes.some((route) => route.status === 'loading')) {
          timeoutId = window.setTimeout(() => {
            void poll()
          }, 1000)
        }
      } catch {
        if (!disposed) {
          handleDiagnosticsUpdate({ routes: [] })
          setDiagnosticsRefreshing(false)
        }
      }
    }

    void poll()

    return () => {
      disposed = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [diagnosticsApiKeySignature, diagnosticsPollNonce, diagnosticsRestartNonce, handleDiagnosticsUpdate, onLauncherDiagnosticsUpdate])
  const handleRefreshDiagnostics = useCallback(() => {
    setDiagnosticsRefreshing(true)
    setDiagnosticRoutes(getDefaultConfigRoutes(copy))
    setDiagnosticsRestartNonce((value) => value + 1)
  }, [copy])
  const handleViewLogs = useCallback(() => {
    setDebugToolsExpanded(true)
    window.requestAnimationFrame(() => {
      document.querySelector('[data-loading-section="launcher-debug-logs"]')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }, [])
  const handleToggleForceOffline = useCallback(async () => {
    const nextForceOffline = !forceOffline
    setForceOfflineBusy(true)

    try {
      const diagnostics = await setLauncherNexusForceOffline(nextForceOffline)
      await applyAppUiStatePatch({
        launcher: {
          forceOffline: nextForceOffline,
        },
      })
      setForceOffline(nextForceOffline)
      writeCachedLauncherConfigurationDiagnostics(diagnostics as LauncherNexusDiagnosticsResult, {
        apiKeySignature: diagnosticsApiKeySignature,
      })
      handleDiagnosticsUpdate(diagnostics as LauncherNexusDiagnosticsResult)
      if (diagnostics.routes.some((route) => route.status === 'loading')) {
        handleRefreshDiagnostics()
      }
    } catch {
      // The config page should keep the last visible route state if the debug override fails.
    } finally {
      setForceOfflineBusy(false)
    }
  }, [diagnosticsApiKeySignature, forceOffline, handleDiagnosticsUpdate, handleRefreshDiagnostics])
  const handleToggleForceNonPremium = useCallback(async () => {
    const nextForceNonPremium = !forceNonPremium
    setForceNonPremiumBusy(true)

    try {
      await applyAppUiStatePatch({
        launcher: {
          forceNonPremium: nextForceNonPremium,
        },
      })
      setForceNonPremium(nextForceNonPremium)
      await account.refreshApiKeyStatus({
        force: true,
        forceNonPremium: nextForceNonPremium,
      })
    } catch {
      // Debug-only account tier override should keep the current visible state on failure.
    } finally {
      setForceNonPremiumBusy(false)
    }
  }, [account, forceNonPremium])
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-configuration-page">
      <div className="launcher-configuration-canvas">
        <LoadingMotionReveal itemId="launcher-configuration-header" index={0}>
          <header className="launcher-configuration-page-header">
            <div className="launcher-config-title-cluster">
              <div className="launcher-config-breadcrumb">{copy.settings.configurationBreadcrumb}</div>
              <h1 className="launcher-configuration-page-title">{copy.settings.configurationGameTitle}</h1>
              <p className="launcher-config-header-status">{headerStatusLine}</p>
            </div>
            <div className="launcher-config-header-actions">
              <div className="launcher-config-env-tags" aria-label={copy.settings.configurationGameTitle}>
                <span className="launcher-config-env-tag">
                  {gameVersion ? copy.settings.configurationGameVersionTag(gameVersion) : copy.settings.configurationVersionUnknown}
                </span>
                <span className="launcher-config-env-tag">
                  {smapiVersion ? copy.settings.configurationSmapiVersionTag(smapiVersion) : copy.settings.configurationVersionUnknown}
                </span>
              </div>
              <div className="launcher-config-header-button-group">
                <button
                  type="button"
                  className="launcher-config-button launcher-config-button-brand"
                  aria-busy={diagnosticsRefreshing}
                  onClick={handleRefreshDiagnostics}
                >
                  {copy.settings.configurationRunDiagnostics}
                </button>
                <button type="button" className="launcher-config-button" onClick={handleViewLogs}>
                  {copy.settings.configurationViewLogs}
                </button>
              </div>
            </div>
          </header>
        </LoadingMotionReveal>

        <div className="launcher-config-layout">
          <main className="launcher-config-main-column">
            <LoadingMotionReveal itemId="launcher-settings-panel" index={1}>
              <ConfigPathPanel settingsState={settingsState} copy={copy} browseLabel={rootCopy.controls.browse} />
            </LoadingMotionReveal>

            <LoadingMotionReveal itemId="launcher-config-network" index={2}>
              <ConfigNexusPanel
                settingsState={settingsState}
                account={account}
                copy={copy}
                routes={diagnosticRoutes}
                diagnosticsRefreshing={diagnosticsRefreshing}
                onRefreshDiagnostics={handleRefreshDiagnostics}
              />
            </LoadingMotionReveal>
          </main>

          <aside className="launcher-config-rail">
            <ConfigCompletionRail title={copy.settings.completionTitle} steps={stepItems} />
            <ConfigAccountCard account={account} copy={copy} />
            <ConfigDownloadDefaults settings={settingsState.settings} copy={copy} yesLabel={commonCopy.yes} noLabel={commonCopy.no} />
          </aside>
        </div>

        <section className="launcher-config-tools" aria-label={copy.configuration.moreToolsTitle}>
          <LoadingMotionReveal itemId="launcher-debug-tools-toggle" index={3}>
            <section className="launcher-debug-more-card">
              <div className="launcher-debug-tool-copy">
                <h2 className="launcher-debug-tool-title">{copy.configuration.moreToolsTitle}</h2>
              </div>
              <button
                type="button"
                className="control-button launcher-debug-more-button"
                aria-expanded={debugToolsExpanded}
                onClick={() => setDebugToolsExpanded((value) => !value)}
              >
                <span>{debugToolsExpanded ? copy.configuration.lessToolsAction : copy.configuration.moreToolsAction}</span>
                <ChevronDown className={cx('h-4 w-4', debugToolsExpanded && 'rotate-180')} aria-hidden="true" />
              </button>
            </section>
          </LoadingMotionReveal>

          {debugToolsExpanded ? (
            <div className="launcher-debug-tools-stack">
              <LoadingMotionReveal itemId="launcher-debug-overview" index={4}>
                <section className="launcher-debug-overview-card" aria-label={copy.configuration.moreToolsTitle}>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-primary">
                    <strong className="launcher-debug-overview-value">5</strong>
                    <span className="launcher-debug-overview-label">{copy.configuration.notificationsOverviewTitle}</span>
                  </div>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-neutral">
                    <strong className="launcher-debug-overview-value">4</strong>
                    <span className="launcher-debug-overview-label">{copy.configuration.logsOverviewTitle}</span>
                  </div>
                </section>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-state-group" index={5}>
                <DebugSectionTitle>{copy.configuration.debugToolsStateGroupTitle}</DebugSectionTitle>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-mode" index={5}>
                <DebugModeSwitch
                  checked={debugEnabled}
                  title={copy.configuration.debugOnlyTitle}
                  enabledLabel={settingsCopy.enableDebugModeLabel}
                  disabledLabel={settingsCopy.disableDebugModeLabel}
                  onToggle={onToggleDebugMode}
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-force-non-premium" index={6}>
                <DebugToolCard
                  title={copy.configuration.forceNonPremiumEnableButton}
                  icon={<Crown className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-account"
                  headerActions={
                    <button
                      type="button"
                      className={cx('settings-switch', forceNonPremium && 'settings-switch-active')}
                      role="switch"
                      aria-checked={forceNonPremium}
                      aria-label={copy.configuration.forceNonPremiumEnableButton}
                      title={
                        forceNonPremium ? copy.configuration.forceNonPremiumDisableButton : copy.configuration.forceNonPremiumEnableButton
                      }
                      disabled={!canUseDesktopHost() || forceNonPremiumBusy}
                      onClick={handleToggleForceNonPremium}
                    >
                      <span className="settings-switch-copy">
                        {forceNonPremium ? copy.configuration.forceNonPremiumEnabledLabel : copy.configuration.forceNonPremiumDisabledLabel}
                      </span>
                      <span className="settings-switch-track" aria-hidden="true">
                        <span className="settings-switch-thumb" />
                      </span>
                    </button>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-force-offline" index={7}>
                <DebugToolCard
                  title={copy.configuration.forceOfflineEnableButton}
                  icon={<Network className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-offline"
                  tone="danger"
                  headerActions={
                    <button
                      type="button"
                      className={cx('control-button launcher-config-danger-button', forceOffline && 'launcher-config-danger-button-active')}
                      disabled={!canUseDesktopHost() || forceOfflineBusy}
                      onClick={handleToggleForceOffline}
                    >
                      {forceOffline ? copy.configuration.forceOfflineDisableButton : copy.configuration.forceOfflineEnableButton}
                    </button>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-feedback-group" index={8}>
                <DebugSectionTitle>{copy.configuration.debugToolsFeedbackGroupTitle}</DebugSectionTitle>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-notifications" index={9}>
                <DebugToolCard
                  title={copy.configuration.notificationsTitle}
                  icon={<MessageSquare className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-notifications"
                  headerActions={<NotificationTestButtons labels={copy.configuration.notificationButtons} debugEnabled={debugEnabled} />}
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-logs" index={10}>
                <DebugToolCard
                  title={copy.configuration.logsTitle}
                  icon={<ScrollText className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-logs"
                  headerActions={<LogTestButtons labels={copy.configuration.logButtons} debugEnabled={debugEnabled} />}
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-modules-group" index={11}>
                <DebugSectionTitle>{copy.configuration.debugToolsModulesGroupTitle}</DebugSectionTitle>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-image-cache" index={12}>
                <DebugToolCard
                  title={copy.configuration.clearImageCacheTitle}
                  icon={<ScrollText className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-cache"
                  headerActions={
                    <button type="button" className="control-button" onClick={handleClearLauncherImageCache}>
                      {copy.configuration.clearImageCacheButton}
                    </button>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-bbcode-preview" index={13}>
                <DebugToolCard
                  title={copy.configuration.bbcodePreviewTitle}
                  icon={<Code2 className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-code"
                  headerActions={
                    <button
                      type="button"
                      className="control-button"
                      aria-expanded={bbcodePreviewExpanded}
                      onClick={() => setBbcodePreviewExpanded((value) => !value)}
                    >
                      {bbcodePreviewExpanded
                        ? copy.configuration.bbcodePreviewCollapseAction
                        : copy.configuration.bbcodePreviewExpandAction}
                    </button>
                  }
                >
                  {bbcodePreviewExpanded ? (
                    <div className="launcher-debug-bbcode-preview" data-testid="launcher-debug-bbcode-preview">
                      <NexusModsBbcode source={nexusModsBbcodeSample} />
                    </div>
                  ) : null}
                </DebugToolCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-simulation" index={14}>
                <DebugToolCard
                  title={copy.configuration.simulationTitle}
                  subtitle={copy.configuration.simulationParametersLabel}
                  icon={<Download className="h-4 w-4" />}
                  iconClassName="launcher-debug-icon-download"
                  headerActions={
                    <button
                      type="button"
                      className="control-button control-button-primary"
                      onClick={() => downloads.startDebugSimulation(copy.configuration.simulationTitle)}
                      disabled={debugSimulationActive}
                    >
                      {debugSimulationActive ? copy.configuration.simulationButtonRunning : copy.configuration.simulationButtonIdle}
                    </button>
                  }
                />
              </LoadingMotionReveal>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}
