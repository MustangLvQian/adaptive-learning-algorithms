#!/usr/bin/env node
/**
 * CLI for the pitfall guardrails.
 *
 * Usage:
 *   node tools/pitfall-guardrails/src/cli.mjs [registryPath] [--run]
 *
 * With no path it reads `docs/pitfalls.md`. Without `--run` it only validates
 * the registry (every record has a guard, no duplicate IDs, no guard points at
 * a command that is not in the guard-commands table). With `--run` it then runs
 * every guard command and fails if any of them fails.
 *
 * Exit codes: 0 ok, 1 a validation problem or a failed guard, 2 registry missing.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseRegistry, planGuards, validateRegistry } from './registry.mjs'
import { runGuards } from './run.mjs'

const parseArgs = (argv) => {
  const args = { registry: 'docs/pitfalls.md', run: false, help: false }
  const rest = []
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--run') args.run = true
    else rest.push(arg)
  }
  if (rest[0]) args.registry = rest[0]
  return args
}

const usage = `Pitfall guardrails

Usage:
  node tools/pitfall-guardrails/src/cli.mjs [registryPath] [--run]

Options:
  --run       Also run every guard command (default: validate only)
  -h, --help  Show this help

Registry format: see examples/pitfalls.example.md`

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }
  const registryPath = resolve(args.registry)
  if (!existsSync(registryPath)) {
    console.error(`Registry not found: ${registryPath}`)
    process.exitCode = 2
    return
  }

  const { pitfalls, commands } = parseRegistry(readFileSync(registryPath, 'utf8'))
  const problems = validateRegistry({ pitfalls, commands })

  if (problems.length > 0) {
    console.error(`Registry problems (${problems.length}):`)
    for (const problem of problems) console.error(`  ${problem.id}: ${problem.message}`)
    process.exitCode = 1
    return
  }

  const manual = pitfalls.filter((p) => p.guardKind === 'manual').length
  const plan = planGuards(pitfalls)
  console.log(
    `${pitfalls.length} records, ${plan.length} guard commands, ${manual} manual ` +
      `(${commands.length} commands declared)`,
  )
  for (const { command, ids } of plan) {
    console.log(`  guard  ${command}  [${ids.join(', ')}]`)
  }

  if (!args.run) {
    console.log('Validation only. Re-run with --run to execute the guards.')
    return
  }

  console.log('')
  const results = runGuards(plan, { cwd: process.cwd() })
  let failed = 0
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL'
    console.log(`${status}  ${result.command}  [${result.ids.join(', ')}]`)
    if (!result.ok) {
      failed += 1
      for (const line of String(result.output).trim().split(/\r?\n/).slice(-20)) {
        console.log(`      ${line}`)
      }
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} guard command(s) failed`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${results.length} guard commands passed`)
  }
}

main()
