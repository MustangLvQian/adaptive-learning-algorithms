#!/usr/bin/env node
/**
 * CLI for the PWA service worker guard.
 *
 * Usage:
 *   node tools/check-service-worker/src/cli.mjs [--sw <path>] [--public <dir>] [--index <path>]
 *
 * Defaults match a Vite PWA: `public/sw.js`, assets under `public/`, and `/`
 * resolved to `index.html` at the project root.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkServiceWorker } from './check.mjs'

const parseArgs = (argv) => {
  const args = {
    sw: 'public/sw.js',
    publicDir: 'public',
    index: 'index.html',
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--sw') args.sw = argv[++i]
    else if (arg === '--public') args.publicDir = argv[++i]
    else if (arg === '--index') args.index = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const usage = `PWA service worker guard

Usage:
  node tools/check-service-worker/src/cli.mjs [options]

Options:
  --sw <path>      Path to the service worker (default: public/sw.js)
  --public <dir>   Public asset directory (default: public)
  --index <path>   File that "/" resolves to (default: index.html)
  -h, --help       Show this help`

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }
  const swPath = resolve(args.sw)
  if (!existsSync(swPath)) {
    console.error(`Service worker not found: ${swPath}`)
    process.exitCode = 1
    return
  }
  const publicDir = resolve(args.publicDir)
  const index = resolve(args.index)

  const resolveAsset = (url) =>
    url === '/' ? index : join(publicDir, url.replace(/^\//, ''))

  const { problems, summary } = checkServiceWorker({
    swSource: readFileSync(swPath, 'utf8'),
    resolveAsset,
    exists: existsSync,
  })

  if (problems.length > 0) {
    console.error('Service worker problems:')
    for (const problem of problems) console.error(`  ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(
    `Service worker OK (${summary.cacheName}, ${summary.coreCount} precached assets)`,
  )
}

main()
