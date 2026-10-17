#!/usr/bin/env node
/**
 * CLI for the Agent Skill linter.
 *
 * Usage:
 *   node tools/check-skills/src/cli.mjs [skillDir ...]
 *
 * With no arguments it scans the standard roots under $HOME and the current
 * directory. Exits 1 when a structural fault is found; description-quality
 * findings are printed as notes and do not fail the run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defaultRoots, discoverSkills, lintSkills } from './lint.mjs'

const parseArgs = (argv) => {
  const roots = []
  let help = false
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') help = true
    else roots.push(arg)
  }
  return { roots, help }
}

const usage = `Agent Skill linter

Usage:
  node tools/check-skills/src/cli.mjs [skillDir ...]

With no arguments, scans:
  $HOME/.agents/skills, $HOME/.config/opencode/skills,
  ./.opencode/skills, ./.agents/skills, ./.github/skills`

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }
  const fs = { existsSync, readdirSync, readFileSync }
  const path = { join }
  const roots = args.roots.length > 0 ? args.roots : defaultRoots(homedir(), process.cwd(), path)

  const scannedRoots = roots.filter((r) => existsSync(r))
  const skills = discoverSkills(roots, fs, path)
  const { rows, problems, notes } = lintSkills(skills, fs, path)

  console.log(`scanned ${rows.length} skills across ${scannedRoots.length} roots\n`)

  if (problems.length > 0) {
    console.log(`FAIL  frontmatter valid and discoverable: ${rows.length - problems.length}/${rows.length}`)
    for (const p of problems) console.log(`        ${p.where}: ${p.why}`)
  } else {
    console.log(`PASS  frontmatter valid and discoverable: ${rows.length}/${rows.length}`)
  }

  const live = rows.filter((r) => r.ok && !r.autoInvoke).length
  console.log(`      auto-invocable skills: ${live}`)

  if (notes.length > 0) {
    console.log('')
    for (const note of notes) console.log(note)
  }

  console.log('')
  if (problems.length > 0) {
    console.log(`${problems.length} FAILED`)
    process.exitCode = 1
  } else {
    console.log('ALL PASSED')
  }
}

main()
