import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  analyzeSkill,
  defaultRoots,
  discoverSkills,
  lintSkills,
  parseFrontmatter,
} from '../src/lint.mjs'

const skillText = (name, description) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

test('parseFrontmatter reads a folded block description', () => {
  const fm = parseFrontmatter(
    '---\nname: x\ndescription: >\n  line one\n  line two\n---\n',
  )
  assert.equal(fm.name, 'x')
  assert.equal(fm.description, 'line one line two')
})

test('analyzeSkill fails when SKILL.md is missing', () => {
  const row = analyzeSkill('x', null)
  assert.equal(row.ok, false)
  assert.match(row.why, /missing SKILL.md/)
})

test('analyzeSkill fails when the name does not match the folder', () => {
  const row = analyzeSkill('x', skillText('y', 'Use when testing.'))
  assert.equal(row.ok, false)
  assert.match(row.why, /!= folder/)
})

test('analyzeSkill flags a description with no trigger wording', () => {
  const row = analyzeSkill('x', skillText('x', 'Renders charts and graphs beautifully.'))
  assert.equal(row.ok, true)
  assert.equal(row.hasTrigger, false)
})

test('analyzeSkill recognises trigger wording', () => {
  const row = analyzeSkill('x', skillText('x', 'Use when the user asks for a chart.'))
  assert.equal(row.hasTrigger, true)
})

test('discoverSkills + lintSkills report the broken ones only', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-skills-'))
  mkdirSync(join(root, 'good'))
  writeFileSync(join(root, 'good', 'SKILL.md'), skillText('good', 'Use when asked to build.'))
  mkdirSync(join(root, 'mismatch'))
  writeFileSync(join(root, 'mismatch', 'SKILL.md'), skillText('other', 'Use when asked.'))
  mkdirSync(join(root, 'nofile'))

  const skills = discoverSkills([root], fs, path)
  const { rows, problems } = lintSkills(skills, fs, path)

  assert.equal(rows.length, 3)
  assert.equal(problems.length, 2)
  assert.ok(problems.some((p) => p.where === 'mismatch'))
  assert.ok(problems.some((p) => p.where === 'nofile'))
})

test('defaultRoots includes the standard locations', () => {
  const roots = defaultRoots('H', 'C', path)
  assert.ok(roots.some((r) => r.endsWith(join('.agents', 'skills'))))
  assert.ok(roots.some((r) => r.endsWith(join('.github', 'skills'))))
})
