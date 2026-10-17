#!/usr/bin/env node
/**
 * CLI for the audio kit.
 *
 * Usage:
 *   node tools/audio-kit/src/cli.mjs chime [--out a.wav,b.wav] [--duration 0.62] [--base 784]
 *   node tools/audio-kit/src/cli.mjs manifest <dir> [--out manifest.json]
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { synthesizeChime } from './chime.mjs'
import { buildAudioManifest } from './manifest.mjs'

const flags = (argv) => {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]
  }
  return out
}

function chime(argv) {
  const args = flags(argv)
  const buffer = synthesizeChime({
    duration: args.duration ? Number(args.duration) : undefined,
    baseHz: args.base ? Number(args.base) : undefined,
  })
  const outs = (args.out ?? 'magic-chime.wav').split(',').map((s) => s.trim())
  for (const out of outs) {
    writeFileSync(resolve(out), buffer)
    console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(1)} KB)`)
  }
}

function manifest(argv) {
  const args = flags(argv)
  const positional = argv.filter((a) => !a.startsWith('--') && a !== args.out && a !== args.id)
  const dir = resolve(positional[0] ?? 'audio')
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`)
    process.exitCode = 2
    return
  }
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && extname(e.name) === '.wav')
    .map((e) => ({ id: basename(e.name, '.wav'), path: e.name }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const { manifest: built, missing } = buildAudioManifest({ entries, root: dir, fs, path })
  const out = resolve(args.out ?? join(dir, 'manifest.json'))
  writeFileSync(out, JSON.stringify(built, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${out} (${built.length} entries)`)
  if (missing.length > 0) {
    console.error(`Missing files: ${missing.join(', ')}`)
    process.exitCode = 1
  }
}

const main = () => {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === '--help' || command === '-h') {
    console.log('Usage: node tools/audio-kit/src/cli.mjs <chime|manifest> [options]')
    return
  }
  const table = { chime, manifest }
  if (!table[command]) {
    console.error(`Unknown command: ${command}`)
    process.exitCode = 2
    return
  }
  table[command](rest)
}

main()
