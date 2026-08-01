export type PixelRgba = readonly [number, number, number, number]

/** Parses the native colour input's `#rrggbb` value into opaque RGBA channels. */
export function parsePixelColor(value: string): PixelRgba {
  const match = /^#([0-9a-f]{6})$/iu.exec(value)
  if (!match) return [0, 0, 0, 255]
  const packed = Number.parseInt(match[1] ?? '000000', 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255, 255]
}

/** Writes one pixel into a copied RGBA buffer so undo history stays immutable. */
export function setPixel(buffer: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: PixelRgba) {
  const next = new Uint8ClampedArray(buffer)
  if (x < 0 || y < 0 || x >= width || y >= height) return next
  const offset = (y * width + x) * 4
  next.set(color, offset)
  return next
}

/** Flood-fills one connected colour region using an iterative scan. */
export function fillPixels(buffer: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: PixelRgba) {
  const next = new Uint8ClampedArray(buffer)
  if (x < 0 || y < 0 || x >= width || y >= height) return next
  const start = (y * width + x) * 4
  const target: PixelRgba = [next[start] ?? 0, next[start + 1] ?? 0, next[start + 2] ?? 0, next[start + 3] ?? 0]
  if (target.every((channel, index) => channel === color[index])) return next
  const stack = [y * width + x]
  while (stack.length > 0) {
    const pixel = stack.pop() as number
    const offset = pixel * 4
    if (!target.every((channel, index) => next[offset + index] === channel)) continue
    next.set(color, offset)
    const px = pixel % width
    const py = Math.floor(pixel / width)
    if (px > 0) stack.push(pixel - 1)
    if (px + 1 < width) stack.push(pixel + 1)
    if (py > 0) stack.push(pixel - width)
    if (py + 1 < height) stack.push(pixel + width)
  }
  return next
}

/** Formats an RGBA pixel for the native colour input. */
export function pixelColorToHex(color: PixelRgba): string {
  return `#${color
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}
