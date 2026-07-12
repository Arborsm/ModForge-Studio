import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  try {
    await page.goto('http://127.0.0.1:5177/', { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: 'prototype/i18n-redesign-home.png' })
    console.log('screenshot saved: prototype/i18n-redesign-home.png')
  } catch (error) {
    console.error('failed to screenshot web dev:', error)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
