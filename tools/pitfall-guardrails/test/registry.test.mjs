import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classifyGuard,
  extractCommand,
  parseMarkdownTables,
  parseRegistry,
  planGuards,
  validateRegistry,
} from '../src/registry.mjs'
import { runGuards } from '../src/run.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const example = readFileSync(join(here, '..', 'examples', 'pitfalls.example.md'), 'utf8')

test('classifyGuard recognises each guard form', () => {
  assert.equal(classifyGuard('').kind, 'none')
  assert.deepEqual(classifyGuard('`✅` `npm run check`'), { kind: 'auto', command: 'npm run check' })
  assert.equal(classifyGuard('`◐` 人工核对').kind, 'semi')
  assert.equal(classifyGuard('manual：人工步骤').kind, 'manual')
  assert.deepEqual(classifyGuard('`npm test`'), { kind: 'auto', command: 'npm test' })
  assert.equal(classifyGuard('人工检查').kind, 'prose')
})

test('extractCommand skips the status marker and the trailing note', () => {
  assert.equal(extractCommand('`✅` `npm run check`（`tools/check.mjs`）'), 'npm run check')
})

test('parseMarkdownTables finds tables and their section', () => {
  const tables = parseMarkdownTables(example)
  assert.ok(tables.length >= 3)
  assert.ok(tables.some((t) => t.section.includes('PWA')))
})

test('the bundled example is a valid registry', () => {
  const registry = parseRegistry(example)
  assert.equal(registry.pitfalls.length, 4)
  assert.deepEqual(
    registry.commands.map((c) => c.command),
    ['npm run check', 'npm test'],
  )
  assert.deepEqual(validateRegistry(registry), [])
})

test('a record with no guard is rejected', () => {
  const md = [
    '| ID | 症状 | 规则 | 守卫 |',
    '|---|---|---|---|',
    '| X-01 | 出了点问题 | 别这样 |  |',
  ].join('\n')
  const problems = validateRegistry(parseRegistry(md))
  assert.ok(problems.some((p) => /no guard/.test(p.message)))
})

test('duplicate IDs are rejected', () => {
  const md = [
    '| ID | 症状 | 规则 | 守卫 |',
    '|---|---|---|---|',
    '| X-01 | a | b | `npm test` |',
    '| X-01 | c | d | `npm test` |',
  ].join('\n')
  const problems = validateRegistry(parseRegistry(md))
  assert.ok(problems.some((p) => /duplicate ID/.test(p.message)))
})

test('a guard pointing at an undeclared command is rejected', () => {
  const md = [
    '| 命令 | 覆盖 |',
    '|---|---|',
    '| `npm test` | tests |',
    '',
    '| ID | 症状 | 规则 | 守卫 |',
    '|---|---|---|---|',
    '| X-01 | a | b | `✅` `npm run check` |',
  ].join('\n')
  const problems = validateRegistry(parseRegistry(md))
  assert.ok(problems.some((p) => /unknown command "npm run check"/.test(p.message)))
})

test('planGuards de-duplicates commands and lists the IDs they protect', () => {
  const plan = planGuards(parseRegistry(example).pitfalls)
  const check = plan.find((p) => p.command === 'npm run check')
  assert.deepEqual(check.ids, ['PWA-01', 'PWA-02', 'WF-01'])
})

test('runGuards reports pass and fail per command', () => {
  const results = runGuards(
    [
      { command: 'ok', ids: ['A-01'] },
      { command: 'bad', ids: ['A-02'] },
    ],
    { exec: (command) => ({ ok: command === 'ok', output: '' }) },
  )
  assert.deepEqual(
    results.map((r) => [r.command, r.ok]),
    [
      ['ok', true],
      ['bad', false],
    ],
  )
})
