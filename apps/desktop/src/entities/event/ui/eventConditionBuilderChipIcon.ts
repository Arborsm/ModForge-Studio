import {
  CalendarDays,
  Clock,
  CloudLightning,
  CloudRain,
  Code2,
  Coins,
  Flag,
  Flower2,
  Heart,
  Mail,
  PackageSearch,
  Snowflake,
  Sun,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { EventPreconditionParser } from '../model/preconditionSemantics'
import type { ConditionCategory, ConditionChip, WeatherId } from './eventConditionBuilderModel'

export const CONDITION_CATEGORY_ICONS = {
  world: Clock,
  social: UsersRound,
  player: UserRound,
  story: Flag,
  query: Code2,
} satisfies Record<ConditionCategory, typeof Clock>

export const CONDITION_WEATHER_ICONS = {
  sunny: Sun,
  rainy: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  greenRain: Flower2,
} satisfies Record<WeatherId, typeof Sun>

export function iconForConditionChip(chip: ConditionChip) {
  if (chip.id === 'weather:greenRain') {
    return Flower2
  }

  const parser = new EventPreconditionParser()
  const parsed = parser.parseOne(chip.code)

  if (parsed.canonicalKey === 'Time') {
    return Clock
  }
  if (parsed.canonicalKey === 'Season' || parsed.canonicalKey === 'DayOfMonth' || parsed.canonicalKey === 'DayOfWeek') {
    return CalendarDays
  }
  if (parsed.canonicalKey === 'Weather') {
    const weather = parsed.args[0]?.toLowerCase()
    if (weather === 'rainy' || weather === 'rain') {
      return CloudRain
    }
    if (weather === 'storm') {
      return CloudLightning
    }
    if (weather === 'snow') {
      return Snowflake
    }
    return Sun
  }
  if (
    parsed.canonicalKey === 'Friendship' ||
    parsed.canonicalKey === 'Dating' ||
    parsed.canonicalKey === 'Spouse' ||
    parsed.canonicalKey === 'Roommate'
  ) {
    return Heart
  }
  if (parsed.canonicalKey === 'HasMoney' || parsed.canonicalKey === 'EarnedMoney') {
    return Coins
  }
  if (parsed.canonicalKey === 'HasItem' || parsed.canonicalKey === 'Shipped') {
    return PackageSearch
  }
  if (parsed.canonicalKey === 'LocalMail' || parsed.canonicalKey === 'HostMail' || parsed.canonicalKey === 'HostOrLocalMail') {
    return Mail
  }
  if (parsed.canonicalKey === 'GameStateQuery') {
    return Code2
  }
  return CONDITION_CATEGORY_ICONS[chip.category]
}
