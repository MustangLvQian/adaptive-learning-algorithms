#!/usr/bin/env node
/**
 * CLI for the compliance kit.
 *
 * Usage:
 *   node tools/compliance-kit/src/cli.mjs licenses [--manifests a,b] [--node-modules a,b] [--out FILE]
 *   node tools/compliance-kit/src/cli.mjs copyright [--dirs src,tools] [--name X] [--version V1.0] [--owner Y] [--out DIR]
 *   node tools/compliance-kit/src/cli.mjs snapshot [DIR] [--out DIR]
 *   node tools/compliance-kit/src/cli.mjs verify [DIR] --manifest FILE
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { buildInventory, renderInventoryMarkdown } from './licenses.mjs'
import {
  gatherSourceLines,
  paginate,
  renderSubmission,
  selectSubmission,
} from './copyright-pages.mjs'
import {
  combinedHash,
  renderChecksumFile,
  snapshotFiles,
  verifySnapshot,
} from './content-snapshot.mjs'

const flags = (argv) => {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]
  }
  return out
}
const list = (value, fallback) => (value ? value.split(',').map((s) => s.trim()) : fallback)
const today = () => new Date().toISOString().slice(0, 10)

function licenses(argv) {
  const args = flags(argv)
  const root = process.cwd()
  const manifestPaths = list(args.manifests, ['package.json'])
  const manifests = manifestPaths.map((p) => {
    const full = resolve(p)
    return { manifest: JSON.parse(readFileSync(full, 'utf8')), path: relative(root, full) }
  })
  const nodeModulesDirs = list(args['node-modules'], ['node_modules']).map((d) => resolve(d))

  const inventory = buildInventory({ manifests, nodeModulesDirs, fs, path })
  const markdown = renderInventoryMarkdown({
    inventory,
    generatedAt: new Date().toISOString(),
  })
  const out = resolve(args.out ?? 'THIRD_PARTY_LICENSES.md')
  writeFileSync(out, markdown, 'utf8')
  console.log(`Wrote ${relative(root, out)}`)
  console.log(
    `  direct deps: ${inventory.direct.length}, installed: ${inventory.installed.size}, ` +
      `flagged: ${inventory.flagged.length}, unknown: ${inventory.unknown.length}`,
  )
}

function copyright(argv) {
  const args = flags(argv)
  const root = process.cwd()
  const linesPerPage = Number(args.lines ?? 50)
  const pkg = existsSync(resolve('package.json'))
    ? JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    : {}
  const softwareName = args.name ?? `${pkg.name ?? 'Software'} ${pkg.version ?? ''}`.trim()
  const version = args.version ?? `V${pkg.version ?? '1.0'}`
  const owner = args.owner ?? '(copyright holder)'

  const dirs = list(args.dirs, ['src', 'tools'])
  const extensions = new Set(
    list(args.ext, ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.wxml', '.wxss', '.css', '.ps1', '.sh']),
  )
  const lines = gatherSourceLines({
    root,
    dirs,
    extensions,
    skipDirs: new Set(['node_modules', 'dist', '.git', 'test', 'tests']),
    skipFilePattern: /\.(test|spec)\./,
    fs,
    path,
  })
  const pages = paginate(lines, linesPerPage)
  const selection = selectSubmission(pages, {})
  const body = renderSubmission({
    selection,
    totalPages: pages.length,
    linesPerPage,
    softwareName,
    version,
    owner,
  })

  const outDir = resolve(args.out ?? join('copyright-materials', today()))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'source-program-SUBMIT.txt'), body, 'utf8')
  console.log(`Wrote ${relative(root, outDir)}`)
  console.log(
    `  code lines: ${lines.length}, pages: ${pages.length}, submit: ${selection.submittedCount}`,
  )
}

function snapshot(argv) {
  const args = flags(argv)
  const positional = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out')
  const dir = resolve(positional[0] ?? 'content')
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`)
    process.exitCode = 2
    return
  }
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(dir, e.name))
    .sort()
  const entries = snapshotFiles({ files, root: dir, fs, path })
  const combined = combinedHash(entries)
  const outDir = resolve(args.out ?? join('copyright-snapshots', today()))
  mkdirSync(outDir, { recursive: true })
  const name = (args.slug ?? 'content') + '-' + today()
  writeFileSync(join(outDir, `${name}.sha256.txt`), renderChecksumFile(entries), 'utf8')
  writeFileSync(
    join(outDir, `${name}.manifest.json`),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scope: relative(process.cwd(), dir).replace(/\\/g, '/'),
        fileCount: entries.length,
        combinedSha256: combined,
        files: entries,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  console.log(`Snapshot written to ${relative(process.cwd(), outDir)}`)
  console.log(`  files: ${entries.length}`)
  console.log(`  combinedSha256: ${combined}`)
}

function verify(argv) {
  const args = flags(argv)
  const positional = argv.filter((a) => !a.startsWith('--') && a !== args.manifest)
  const dir = resolve(positional[0] ?? '.')
  if (!args.manifest) {
    console.error('verify requires --manifest FILE')
    process.exitCode = 2
    return
  }
  const manifest = JSON.parse(readFileSync(resolve(args.manifest), 'utf8'))
  const mismatches = verifySnapshot({ entries: manifest.files, root: dir, fs, path })
  if (mismatches.length === 0) {
    console.log(`OK: ${manifest.files.length} files match ${args.manifest}`)
    return
  }
  for (const m of mismatches) console.error(`  ${m.reason}: ${m.relPath}`)
  process.exitCode = 1
}

const main = () => {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === '--help' || command === '-h') {
    console.log('Usage: node tools/compliance-kit/src/cli.mjs <licenses|copyright|snapshot|verify> [options]')
    return
  }
  const table = { licenses, copyright, snapshot, verify }
  if (!table[command]) {
    console.error(`Unknown command: ${command}`)
    process.exitCode = 2
    return
  }
  table[command](rest)
}

main()
