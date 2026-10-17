#!/usr/bin/env node
/**
 * CLI for agent-skill-bundle.
 *
 * Usage:
 *   node tools/agent-skill-bundle/src/cli.mjs validate <bundle.json>
 *   node tools/agent-skill-bundle/src/cli.mjs plan     <bundle.json>
 *   node tools/agent-skill-bundle/src/cli.mjs install  <bundle.json> [--force]
 *   node tools/agent-skill-bundle/src/cli.mjs overlap  <skillsDir ...>
 *
 * `install` copies local sources directly; git sources are cloned with the `git`
 * binary into a cache directory first. Existing skills are skipped unless
 * --force, so a locally edited skill is never silently overwritten.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { applyPlan, planInstall, resolveSources, validateBundle } from './bundle.mjs'
import { detectOverlap, skillDescription } from './overlap.mjs'

const flags = (argv) => {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = true
    else out._.push(argv[i])
  }
  return out
}

const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

function loadBundle(file) {
  const bundlePath = resolve(file)
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
  return { bundle, bundleDir: dirname(bundlePath) }
}

function validate(argv) {
  const args = flags(argv)
  const { bundle } = loadBundle(args._[0])
  const problems = validateBundle(bundle)
  if (problems.length === 0) {
    console.log(`OK: ${bundle.sources.length} source(s), target ${bundle.target}`)
    return
  }
  for (const p of problems) console.error(`  ${p.where}: ${p.message}`)
  process.exitCode = 1
}

function plan(argv) {
  const args = flags(argv)
  const { bundle, bundleDir } = loadBundle(args._[0])
  const cacheDir = join(tmpdir(), 'agent-skill-bundle')
  const targetDir = expandHome(bundle.target)
  const sourceRoots = resolveSources({ bundle, bundleDir, cacheDir, path })
  for (const item of planInstall({ bundle, sourceRoots, targetDir, fs, path })) {
    console.log(`  ${item.action.padEnd(8)} ${item.skill}`)
  }
}

function install(argv) {
  const args = flags(argv)
  const { bundle, bundleDir } = loadBundle(args._[0])
  const problems = validateBundle(bundle)
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p.where}: ${p.message}`)
    process.exitCode = 1
    return
  }
  const cacheDir = join(tmpdir(), 'agent-skill-bundle')
  mkdirSync(cacheDir, { recursive: true })
  const targetDir = expandHome(bundle.target)
  mkdirSync(targetDir, { recursive: true })

  for (const source of bundle.sources) {
    if (source.type !== 'git') continue
    const dest = join(cacheDir, source.repo.replace(/\.git$/, '').replace(/^.*[/\\]/, ''))
    if (existsSync(join(dest, '.git'))) continue
    console.log(`cloning ${source.repo}`)
    const result = spawnSync('git', ['clone', '--depth', '1', source.repo, dest], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      console.error(`could not clone ${source.repo}`)
      process.exitCode = 1
      return
    }
  }

  const sourceRoots = resolveSources({ bundle, bundleDir, cacheDir, path })
  const plan = planInstall({ bundle, sourceRoots, targetDir, force: !!args.force, fs, path })
  const results = applyPlan(plan)
  for (const r of results) console.log(`  ${r.action.padEnd(8)} ${r.skill}`)
  const missing = results.filter((r) => r.action === 'missing').length
  if (missing > 0) process.exitCode = 1
}

function overlap(argv) {
  const args = flags(argv)
  const skills = []
  for (const root of args._.map(resolve)) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillFile = join(root, entry.name, 'SKILL.md')
      const description = existsSync(skillFile)
        ? skillDescription(readFileSync(skillFile, 'utf8'))
        : ''
      if (description) skills.push({ name: entry.name, description })
    }
  }
  const pairs = detectOverlap(skills, {
    threshold: args.threshold ? Number(args.threshold) : undefined,
  })
  console.log(`${skills.length} skills, ${pairs.length} overlapping pair(s)`)
  for (const pair of pairs) {
    console.log(
      `  ${pair.a} <-> ${pair.b} (${(pair.similarity * 100).toFixed(0)}%): ${pair.shared.join(', ')}`,
    )
  }
  if (pairs.length > 0) process.exitCode = 1
}

const main = () => {
  const [command, ...rest] = process.argv.slice(2)
  const table = { validate, plan, install, overlap }
  if (!command || !table[command]) {
    console.log('Usage: node tools/agent-skill-bundle/src/cli.mjs <validate|plan|install|overlap> [args]')
    if (command) process.exitCode = 2
    return
  }
  try {
    table[command](rest)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
  }
}

main()
