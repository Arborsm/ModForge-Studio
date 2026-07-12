import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const mockPath = join(__dirname, '..', '..', '..', 'prototype', 'catalog-layout-mock.html')

async function runCase(page, { viewMode, width, height }) {
  return page.evaluate(
    ({ viewMode, width, height }) =>
      new Promise((resolve) => {
        document.getElementById('btn-' + viewMode).click()
        document.getElementById('widthRange').value = String(width)
        document.getElementById('widthRange').dispatchEvent(new Event('input', { bubbles: true }))
        document.getElementById('heightRange').value = String(height)
        document.getElementById('heightRange').dispatchEvent(new Event('input', { bubbles: true }))
        document.getElementById('renderComputed').checked = true
        document.getElementById('renderComputed').dispatchEvent(new Event('change', { bubbles: true }))

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const content = document.getElementById('content')
            const scroll = content.querySelector('.list-scroll, .grid-scroll')
            const item = scroll?.querySelector('[data-catalog-item]')
            const rect = item ? item.getBoundingClientRect() : { width: 0, height: 0 }
            const overflow = scroll.scrollHeight > scroll.clientHeight + 1 || scroll.scrollWidth > scroll.clientWidth + 1

            resolve({
              viewMode,
              width,
              height,
              clientWidth: scroll.clientWidth,
              clientHeight: scroll.clientHeight,
              itemWidth: rect.width,
              itemHeight: rect.height,
              pageSize: Number(document.getElementById('pageSize').textContent),
              rendered: Number(document.getElementById('rendered').textContent),
              columns: Number(document.getElementById('columns').textContent),
              rows: Number(document.getElementById('rows').textContent),
              scrollWidth: scroll.scrollWidth,
              scrollHeight: scroll.scrollHeight,
              overflow,
            })
          })
        })
      }),
    { viewMode, width, height },
  )
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto('file:///' + mockPath.replace(/\\/g, '/'))
  await page.waitForSelector('#content [data-catalog-item]')

  const sampleCases = [
    { viewMode: 'grid', width: 600, height: 500 },
    { viewMode: 'grid', width: 920, height: 600 },
    { viewMode: 'grid', width: 1200, height: 800 },
    { viewMode: 'list', width: 600, height: 500 },
    { viewMode: 'list', width: 920, height: 600 },
    { viewMode: 'list', width: 1200, height: 800 },
  ]

  console.log('Sample cases (mock CSS):\n')
  for (const testCase of sampleCases) {
    const r = await runCase(page, testCase)
    console.log(
      `${r.viewMode} ${r.width}x${r.height}: client=${r.clientWidth}x${r.clientHeight} item=${r.itemWidth.toFixed(1)}x${r.itemHeight.toFixed(1)} cols=${r.columns} rows=${r.rows} pageSize=${r.pageSize} rendered=${r.rendered} scroll=${r.scrollWidth}x${r.scrollHeight} overflow=${r.overflow}`,
    )
  }

  // Full sweep
  const cases = []
  for (const viewMode of ['grid', 'list']) {
    for (const width of [400, 600, 800, 920, 1000, 1200]) {
      for (const height of [300, 400, 500, 600, 700, 800, 900]) {
        cases.push({ viewMode, width, height })
      }
    }
  }

  const results = []
  for (const testCase of cases) {
    results.push(await runCase(page, testCase))
  }

  await browser.close()

  const overflows = results.filter((r) => r.overflow)
  const mismatches = results.filter((r) => r.rendered !== r.pageSize)

  console.log(`\nFull sweep: ${results.length} combinations`)
  console.log(`Overflows when rendering computed page size: ${overflows.length}`)
  console.log(`Rendered count != computed page size: ${mismatches.length}`)

  if (overflows.length) {
    console.log('\nFirst overflows:')
    for (const r of overflows.slice(0, 30)) {
      console.log(
        `  ${r.viewMode} ${r.width}x${r.height}: pageSize=${r.pageSize} rendered=${r.rendered} item=${r.itemWidth.toFixed(1)}x${r.itemHeight.toFixed(1)} scroll=${r.scrollWidth}x${r.scrollHeight} client=${r.clientWidth}x${r.clientHeight}`,
      )
    }
  }

  if (mismatches.length) {
    console.log('\nFirst rendered/computed mismatches:')
    for (const r of mismatches.slice(0, 30)) {
      console.log(`  ${r.viewMode} ${r.width}x${r.height}: computed=${r.pageSize} rendered=${r.rendered}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
