/** Sprite rendering: crops 16x16 tiles from the springobjects atlas and upscales. */

import type { PluginContext, PluginGameDataAsset } from '@modforge/plugin-sdk'
import { SPRITE_SIZE, RENDER_SCALE, SHOWCASE_SCALE, MAX_PAIRS, DIFFICULTIES, PREFERRED_ITEMS } from './constants.js'

export interface ItemEntry {
  key: string
  label: string
  name: string
  spriteIndex: number
  price: number | null
}

export interface CardFace {
  key: string
  label: string
  price: number | null
  emoji: string | null
  image: string | null
  showcaseImage: string | null
}

export interface FacesResult {
  faces: CardFace[]
  usedFallback: boolean
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = src
  })
}

/** Crops one 16x16 sprite from the atlas and returns it upscaled with smoothing off. */
function renderSprite(atlas: HTMLImageElement, columns: number, spriteIndex: number, scale = RENDER_SCALE): string {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE * scale
  canvas.height = SPRITE_SIZE * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  context.imageSmoothingEnabled = false
  context.drawImage(
    atlas,
    (spriteIndex % columns) * SPRITE_SIZE,
    Math.floor(spriteIndex / columns) * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL()
}

interface ParsedObject {
  Texture?: unknown
  SpriteIndex?: unknown
  Name?: string
  DisplayName?: string
  Price?: unknown
}

/** Picks card faces from parsed Data/Objects and renders their atlas sprites. */
function extractItemFaces(objects: Record<string, ParsedObject>, atlas: HTMLImageElement, count: number): CardFace[] {
  const columns = Math.max(1, Math.floor(atlas.width / SPRITE_SIZE))
  const items: ItemEntry[] = []
  for (const [id, data] of Object.entries(objects)) {
    if (!data || typeof data !== 'object') continue
    if (data.Texture && !String(data.Texture as string).endsWith('springobjects')) continue
    if (typeof data.SpriteIndex !== 'number' || !data.Name) continue
    items.push({
      key: id,
      label: data.DisplayName || data.Name,
      name: String(data.Name),
      spriteIndex: data.SpriteIndex,
      price: typeof data.Price === 'number' ? data.Price : null,
    })
  }
  const byName = new Map(items.map((item) => [item.name, item]))
  const chosen: ItemEntry[] = []
  for (const name of PREFERRED_ITEMS) {
    const hit = byName.get(name)
    if (hit && !chosen.includes(hit)) chosen.push(hit)
    if (chosen.length >= count) break
  }
  for (const item of items) {
    if (chosen.length >= count) break
    if (!chosen.includes(item)) chosen.push(item)
  }
  return chosen.slice(0, count).map((item) => ({
    key: item.key,
    label: item.label,
    price: item.price,
    emoji: null,
    image: renderSprite(atlas, columns, item.spriteIndex),
    showcaseImage: renderSprite(atlas, columns, item.spriteIndex, SHOWCASE_SCALE),
  }))
}

/** Loads card faces from the game, falling back to bundled emoji without one. */
export async function loadFaces(ctx: PluginContext, locale: string): Promise<FacesResult> {
  try {
    const [objectsAsset, atlasUrl] = await Promise.all([
      ctx.commands.invoke<PluginGameDataAsset>('loadGameDataAsset', { assetPath: 'Data/Objects', locale }),
      ctx.commands.invoke<string>('loadGameImage', { contentPath: 'Maps/springobjects', locale }),
    ])
    const atlas = await loadImage(atlasUrl)
    const faces = extractItemFaces(JSON.parse(objectsAsset.content) as Record<string, ParsedObject>, atlas, MAX_PAIRS)
    if (faces.length >= DIFFICULTIES.easy.pairs) return { faces, usedFallback: false }
    throw new Error('not enough item sprites')
  } catch {
    const raw = await ctx.commands.invoke<string>('readPluginAsset', { path: 'cards.json' })
    const faces: CardFace[] = (JSON.parse(raw) as { faces: string[] }).faces.map((emoji) => ({
      key: emoji,
      label: emoji,
      price: null,
      emoji,
      image: null,
      showcaseImage: null,
    }))
    return { faces, usedFallback: true }
  }
}
