#!/usr/bin/env node
/**
 * CLI for the Mini Program template linter.
 *
 * Usage:
 *   node tools/check-templates/src/cli.mjs [rootDir] [--assets <dir>]
 *
 * Defaults to the current directory and `<root>/assets` for SVG assets.
 * Exits 1 if any problem is found, so it can gate a commit.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { checkTemplates } from './lint.mjs'

const parseArgs = (argv) => {
  const args = { root: '.', assets: null, help: false }
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--assets') args.assets = argv[++i]
    else rest.push(arg)
  }
  if (rest[0]) args.root = rest[0]
  return args
}

const usage = `Mini Program template linter (WXSS / WXML / SVG)

Usage:
  node tools/check-templates/src/cli.mjs [rootDir] [--assets <dir>]

Options:
  --assets <dir>   Directory to scan for .svg assets (default: <rootDir>/assets)
  -h, --help       Show this help`

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }
  const root = resolve(args.root)
  const assets = args.assets ? resolve(args.assets) : null
  const { counts, problems } = checkTemplates({
    root,
    assetsDir: assets,
    fs: { readdirSync, readFileSync },
    path: { join, relative },
  })

  if (problems.length > 0) {
    console.error('WXSS / WXML / SVG problems:')
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line}  ${p.message}`)
    }
    process.exitCode = 1
    return
  }
  console.log(
    `WXSS ${counts.wxss} files, WXML ${counts.wxml} files, ` +
      `${counts.svg} SVG assets OK`,
  )
}

main()
