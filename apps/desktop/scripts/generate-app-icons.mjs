import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const sourceSvg = path.join(repoRoot, 'docs/brand/logo/modforge-logo-primary.svg')
const iconRoot = path.join(desktopRoot, 'src-tauri/icons')
const publicRoot = path.join(desktopRoot, 'public')
const tempRoot = path.join(repoRoot, '.tmp/app-icons')

const pngIcons = new Map([
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
  ['Square30x30Logo.png', 30],
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square89x89Logo.png', 89],
  ['Square107x107Logo.png', 107],
  ['Square142x142Logo.png', 142],
  ['Square150x150Logo.png', 150],
  ['Square284x284Logo.png', 284],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
])

const icoSizes = [16, 24, 32, 48, 64, 256]
const icnsSizes = [16, 32, 64, 128, 256, 512, 1024]

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

function renderPng(outputPath, size) {
  run('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', outputPath, sourceSvg])
}

mkdirSync(iconRoot, { recursive: true })
mkdirSync(publicRoot, { recursive: true })
mkdirSync(tempRoot, { recursive: true })

for (const [filename, size] of pngIcons) {
  renderPng(path.join(iconRoot, filename), size)
}

const icoInputs = icoSizes.map((size) => {
  const outputPath = path.join(tempRoot, `icon-${size}.png`)
  renderPng(outputPath, size)
  return outputPath
})
run('magick', [...icoInputs, path.join(iconRoot, 'icon.ico')])

const icnsInputs = icnsSizes.map((size) => {
  const outputPath = path.join(tempRoot, `icon-${size}.png`)
  renderPng(outputPath, size)
  return outputPath
})
run('python', [
  '-c',
  `
from pathlib import Path
from PIL import Image
import sys

inputs = [Path(value) for value in sys.argv[1:-1]]
output = Path(sys.argv[-1])
base = Image.open(inputs[-1]).convert("RGBA")
images = [Image.open(value).convert("RGBA") for value in inputs[:-1]]
base.save(output, format="ICNS", append_images=images)
`,
  ...icnsInputs,
  path.join(iconRoot, 'icon.icns'),
])

copyFileSync(sourceSvg, path.join(publicRoot, 'favicon.svg'))
