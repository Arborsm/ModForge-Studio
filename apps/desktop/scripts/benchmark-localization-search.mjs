#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_DB = `${homedir()}/.config/ModForge Studio/ai/official-localization.sqlite3`
const DEFAULT_QUERIES = ['Active on Main Menu', 'Welcome to Pelican Town', 'The valley looks beautiful today']
const OFFICIAL_LOCALES = ['en-US', 'de-DE', 'es-ES', 'fr-FR', 'hu-HU', 'it-IT', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'zh-CN']

function usage() {
  console.log(`Usage: node ./scripts/benchmark-localization-search.mjs [options]

Options:
  --db <path>          Official localization SQLite path
  --iterations <n>     Measured runs per scenario (default: 12)
  --query <text>       Replace the default query set (repeatable)
  --json               Print machine-readable JSON
  --help               Show this help

Examples:
  node ./scripts/benchmark-localization-search.mjs
  node ./scripts/benchmark-localization-search.mjs --iterations 30 --query "Active on Main Menu"
`)
}

function parseArgs(argv) {
  const options = { db: DEFAULT_DB, iterations: 12, queries: [], json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help') return { help: true }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--db' || arg === '--iterations' || arg === '--query') {
      const value = argv[index + 1]
      if (!value) throw new Error(`${arg} requires a value`)
      index += 1
      if (arg === '--db') options.db = value
      else if (arg === '--iterations') options.iterations = Number.parseInt(value, 10)
      else options.queries.push(value)
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 3 || options.iterations > 500) {
    throw new Error('--iterations must be between 3 and 500')
  }
  options.queries = options.queries.length ? options.queries : DEFAULT_QUERIES
  return options
}

function hasActiveGeneration(db) {
  return Number(db.prepare('SELECT EXISTS(SELECT 1 FROM official_generations WHERE active=1) AS indexed').get().indexed) === 1
}

function querySql({ limit = 5 }) {
  return `
    SELECT COUNT(*) AS matches
    FROM official_texts_fts f
    JOIN official_texts s ON s.id=f.rowid
    JOIN official_units u ON u.id=s.unit_id
    JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
    JOIN official_texts t ON t.unit_id=u.id AND t.locale=:targetLocale
    WHERE f.text MATCH :ftsQuery
      AND (:sourceLocale IN ('','default') OR s.locale=:sourceLocale)
      AND u.generation_id=(SELECT id FROM official_generations WHERE active=1)
      AND u.searchable=1 AND u.prompt_eligible=1
    LIMIT ${limit};
  `
}

const scenarios = [
  {
    id: 'explicit-en',
    label: '明确英文源 en-US',
    sourceLocale: 'en-US',
    targetLocale: 'zh-CN',
  },
  {
    id: 'explicit-zh',
    label: '明确中文源 zh-CN',
    sourceLocale: 'zh-CN',
    targetLocale: 'en-US',
  },
  {
    id: 'default-wildcard',
    label: 'default 未知源语言（多语言一次查询）',
    sourceLocale: 'default',
    targetLocale: 'zh-CN',
  },
]

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
}

function benchmarkScenario(db, scenario, queries, iterations) {
  const samples = []
  let matches = 0
  const statement = db.prepare(querySql({ limit: 5 }))
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const query = queries[iteration % queries.length]
    const ftsQuery = query
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `"${token.replaceAll('"', '""')}"`)
      .join(' OR ')
    const started = performance.now()
    const output = statement.all({
      sourceLocale: scenario.sourceLocale,
      targetLocale: scenario.targetLocale,
      ftsQuery,
    })
    const elapsed = performance.now() - started
    samples.push(elapsed)
    matches += Number(output[0]?.matches ?? 0)
  }
  return {
    ...scenario,
    iterations,
    averageMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    averageMatches: matches / iterations,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }
  if (!existsSync(options.db)) throw new Error(`SQLite database not found: ${options.db}`)
  let database
  try {
    const databaseUri = options.db.startsWith('file:') ? options.db : `file:${encodeURI(options.db)}?immutable=1`
    database = new DatabaseSync(databaseUri, { readOnly: true })
    database.prepare('SELECT 1').get()
  } catch (error) {
    throw new Error(`The SQLite database must be readable by Node: ${error.message}`)
  }

  const indexed = hasActiveGeneration(database)
  const started = performance.now()
  const results = indexed ? scenarios.map((scenario) => benchmarkScenario(database, scenario, options.queries, options.iterations)) : []
  const report = {
    database: options.db,
    indexed,
    locales: OFFICIAL_LOCALES,
    queries: options.queries,
    results,
    totalMs: performance.now() - started,
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  console.log(`Official localization search benchmark`)
  console.log(`Database: ${options.db}`)
  console.log(`Index: ${indexed ? 'ready' : 'not built'}`)
  if (!indexed) {
    console.log('No active generation; query benchmark skipped.')
    database.close()
    return
  }
  console.table(
    results.map(({ id, label, p50Ms, p95Ms, averageMs, minMs, maxMs, averageMatches }) => ({
      scenario: id,
      label,
      p50: `${p50Ms.toFixed(2)} ms`,
      p95: `${p95Ms.toFixed(2)} ms`,
      average: `${averageMs.toFixed(2)} ms`,
      range: `${minMs.toFixed(2)}-${maxMs.toFixed(2)} ms`,
      avgMatches: averageMatches.toFixed(1),
    })),
  )
  console.log(`Measured ${options.iterations} runs per scenario over ${options.queries.length} query texts.`)
  database.close()
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
