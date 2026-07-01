import fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const GRAPHQL_ENDPOINT = 'https://api.nexusmods.com/v2/graphql'
const PUBLIC_CATALOG_GRAPHQL_REFERER = 'https://www.nexusmods.com/'
const PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER = 'GameModsListing'
const PUBLIC_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const DEFAULT_LEVELS = [1, 2, 4, 6, 8, 12, 16]
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_DISCOVER_COUNT = 40
const PUBLIC_CATALOG_GRAPHQL_QUERY = `
query ModsListing($count: Int = 0, $facets: ModsFacet, $filter: ModsFilter, $offset: Int, $postFilter: ModsFilter, $sort: [ModsSort!]) {
  mods(
    count: $count
    facets: $facets
    filter: $filter
    offset: $offset
    postFilter: $postFilter
    sort: $sort
    viewUserBlockedContent: false
  ) {
    nodes {
      modId
      name
      thumbnailUrl
      thumbnailBlurredUrl
    }
  }
}
`

function parseArgs(argv) {
  const options = {
    urls: [],
    urlsFile: null,
    discover: false,
    discoverCount: DEFAULT_DISCOVER_COUNT,
    levels: DEFAULT_LEVELS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    warmup: true,
    repeatUrls: false,
    includeBody: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      continue
    }
    const next = () => {
      index += 1
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`)
      }
      return argv[index]
    }

    switch (arg) {
      case '--url':
        options.urls.push(next())
        break
      case '--urls-file':
        options.urlsFile = next()
        break
      case '--discover':
        options.discover = true
        break
      case '--discover-count':
        options.discoverCount = parsePositiveInt(next(), arg)
        break
      case '--levels':
        options.levels = next()
          .split(',')
          .map((value) => parsePositiveInt(value.trim(), arg))
          .filter(Boolean)
        break
      case '--timeout-ms':
        options.timeoutMs = parsePositiveInt(next(), arg)
        break
      case '--no-warmup':
        options.warmup = false
        break
      case '--repeat-urls':
        options.repeatUrls = true
        break
      case '--headers-only':
        options.includeBody = false
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`)
  }
  return parsed
}

function printHelp() {
  console.log(`Usage:
  node ./scripts/probe-launcher-cover-api-concurrency.mjs --discover
  node ./scripts/probe-launcher-cover-api-concurrency.mjs --url https://staticdelivery.nexusmods.com/.../cover.jpg
  node ./scripts/probe-launcher-cover-api-concurrency.mjs --urls-file ./cover-urls.txt

Options:
  --discover              Fetch Stardew Valley cover URLs from the public Nexus discover GraphQL API.
  --discover-count N      Number of discover image URLs to collect. Default: ${DEFAULT_DISCOVER_COUNT}.
  --url URL               Add one cover/API URL to probe. Can be repeated.
  --urls-file PATH        Read URLs from a text file, one URL per line. Blank lines and # comments are ignored.
  --levels 1,2,4,8        Concurrency levels to test. Default: ${DEFAULT_LEVELS.join(',')}.
  --timeout-ms N          Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --no-warmup             Skip the single-request warmup.
  --repeat-urls           Reuse URLs when a level is higher than the URL count.
  --headers-only          Use HEAD requests instead of downloading the image body.
`)
}

function normalizeNexusUrl(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }
  return `https://www.nexusmods.com${trimmed}`
}

function buildPublicCatalogPayload(count, offset) {
  return {
    operationName: 'ModsListing',
    query: PUBLIC_CATALOG_GRAPHQL_QUERY,
    variables: {
      count,
      facets: {
        categoryName: [],
        languageName: [],
        tag: [],
      },
      filter: {
        adultContent: [{ op: 'EQUALS', value: false }],
        filter: [],
        gameDomainName: [{ op: 'EQUALS', value: 'stardewvalley' }],
        name: [],
      },
      offset,
      postFilter: {},
      sort: {
        createdAt: {
          direction: 'DESC',
        },
      },
    },
  }
}

async function fetchDiscoverPage(count, offset, timeoutMs) {
  const response = await fetchWithTimeout(
    GRAPHQL_ENDPOINT,
    {
      method: 'POST',
      headers: {
        accept: '*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'content-type': 'application/json',
        origin: 'https://www.nexusmods.com',
        priority: 'u=1, i',
        referer: PUBLIC_CATALOG_GRAPHQL_REFERER,
        'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': PUBLIC_BROWSER_USER_AGENT,
        'x-graphql-operationname': PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER,
      },
      body: JSON.stringify(buildPublicCatalogPayload(count, offset)),
    },
    timeoutMs,
  )

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Discover GraphQL failed: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 300)}`)
  }
  const graphQlError = payload?.errors?.[0]?.message
  if (graphQlError) {
    throw new Error(`Discover GraphQL returned an error: ${graphQlError}`)
  }

  const nodes = Array.isArray(payload?.data?.mods?.nodes) ? payload.data.mods.nodes : []
  return nodes
}

async function fetchDiscoverUrls(count, timeoutMs) {
  const urls = []
  const seen = new Set()
  const pageSize = 80

  for (let offset = 0; urls.length < count; offset += pageSize) {
    const nodes = await fetchDiscoverPage(Math.min(pageSize, count - urls.length), offset, timeoutMs)
    if (!nodes.length) {
      break
    }
    for (const node of nodes) {
      const url = normalizeNexusUrl(node?.thumbnailUrl ?? node?.pictureUrl ?? node?.thumbnailBlurredUrl)
      if (!url || seen.has(url)) {
        continue
      }
      seen.add(url)
      urls.push(url)
      if (urls.length >= count) {
        break
      }
    }
  }

  return urls
}

async function readUrlsFile(path) {
  const content = await fs.readFile(path, 'utf8')
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function selectUrls(urls, count, repeatUrls) {
  if (urls.length >= count) {
    return urls.slice(0, count)
  }
  if (!repeatUrls) {
    return urls.slice()
  }
  const selected = []
  for (let index = 0; index < count; index += 1) {
    selected.push(urls[index % urls.length])
  }
  return selected
}

function errorMessage(error) {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause = error.cause
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? ` code=${cause.code}` : ''
    return `${error.message}; cause=${cause.name}: ${cause.message}${code}`
  }
  if (typeof cause === 'string') {
    return `${error.message}; cause=${cause}`
  }
  if (cause && typeof cause === 'object') {
    return `${error.message}; cause=${JSON.stringify(cause)}`
  }
  return error.message
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function probeOne(url, index, options) {
  const startedAt = performance.now()
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: options.includeBody ? 'GET' : 'HEAD',
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': PUBLIC_BROWSER_USER_AGENT,
        },
      },
      options.timeoutMs,
    )
    if (options.includeBody) {
      await response.arrayBuffer()
    }
    return {
      index,
      url,
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      contentLength: response.headers.get('content-length'),
      retryAfter: response.headers.get('retry-after'),
      error: null,
    }
  } catch (error) {
    return {
      index,
      url,
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      contentLength: null,
      retryAfter: null,
      error: errorMessage(error),
    }
  }
}

async function runLevel(urls, level, options) {
  let active = 0
  let maxActive = 0
  const startedAt = performance.now()
  const requests = urls.map(async (url, index) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    try {
      return await probeOne(url, index, options)
    } finally {
      active -= 1
    }
  })
  const results = await Promise.all(requests)
  const elapsedMs = performance.now() - startedAt
  return summarizeLevel(level, maxActive, elapsedMs, results)
}

function percentile(values, p) {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[index]
}

function summarizeLevel(level, maxActive, elapsedMs, results) {
  const durations = results.map((result) => result.durationMs).filter(Number.isFinite)
  const statusCounts = {}
  for (const result of results) {
    const key = String(result.status)
    statusCounts[key] = (statusCounts[key] ?? 0) + 1
  }
  const failures = results.filter((result) => !result.ok)
  return {
    level,
    requests: results.length,
    maxActive,
    ok: results.length - failures.length,
    failed: failures.length,
    statusCounts,
    elapsedMs: round(elapsedMs),
    throughputPerSecond: round(results.length / (elapsedMs / 1000)),
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    maxMs: round(durations.length ? Math.max(...durations) : 0),
    retryAfter: [...new Set(results.map((result) => result.retryAfter).filter(Boolean))],
    sampleErrors: failures.slice(0, 3).map((result) => ({
      status: result.status,
      error: result.error,
      url: result.url,
    })),
  }
}

function round(value) {
  return Number(value.toFixed(1))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const urls = [...options.urls]
  if (options.urlsFile) {
    urls.push(...(await readUrlsFile(options.urlsFile)))
  }
  if (options.discover) {
    const discovered = await fetchDiscoverUrls(options.discoverCount, options.timeoutMs)
    urls.push(...discovered)
    console.log(`Discovered ${discovered.length} Nexus cover URLs.`)
  }

  const normalizedUrls = [...new Set(urls.map(normalizeNexusUrl).filter(Boolean))]
  if (!normalizedUrls.length) {
    throw new Error('No URLs to probe. Pass --discover, --url, or --urls-file.')
  }

  console.log(
    JSON.stringify(
      {
        targetUrls: normalizedUrls.length,
        levels: options.levels,
        timeoutMs: options.timeoutMs,
        method: options.includeBody ? 'GET' : 'HEAD',
        repeatUrls: options.repeatUrls,
      },
      null,
      2,
    ),
  )

  if (options.warmup) {
    const warmup = await runLevel(selectUrls(normalizedUrls, 1, true), 1, options)
    console.log(`warmup ${JSON.stringify(warmup)}`)
  }

  const summaries = []
  for (const level of options.levels) {
    const selected = selectUrls(normalizedUrls, level, options.repeatUrls)
    if (selected.length < level) {
      console.warn(`Skipping level ${level}: only ${selected.length} unique URL(s). Use --repeat-urls to reuse them.`)
      continue
    }
    const summary = await runLevel(selected, level, options)
    summaries.push(summary)
    console.log(`level ${level} ${JSON.stringify(summary)}`)
  }

  console.table(
    summaries.map((summary) => ({
      level: summary.level,
      requests: summary.requests,
      maxActive: summary.maxActive,
      ok: summary.ok,
      failed: summary.failed,
      statuses: JSON.stringify(summary.statusCounts),
      elapsedMs: summary.elapsedMs,
      rps: summary.throughputPerSecond,
      p50Ms: summary.p50Ms,
      p95Ms: summary.p95Ms,
      maxMs: summary.maxMs,
    })),
  )

  const firstFailure = summaries.find((summary) => summary.failed > 0)
  if (firstFailure) {
    console.warn(`First failing level: ${firstFailure.level}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
