import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { applyPlan, planInstall, resolveSources, validateBundle } from '../src/bundle.mjs'
import { detectOverlap, jaccard, skillDescription, tokenize } from '../src/overlap.mjs'

const validBundle = {
  target: '~/.agents/skills',
  sources: [
    { type: 'local', path: '.agents/skills', skills: ['ycx-verify'] },
    { type: 'git', repo: 'https://github.com/example/skills', sub: 'skills', skills: ['animate'] },
  ],
}

test('validateBundle accepts a well-formed bundle', () => {
  assert.deepEqual(validateBundle(validBundle), [])
})

test('validateBundle rejects a duplicated skill across sources', () => {
  const bundle = {
    target: 'x',
    sources: [
      { type: 'local', path: 'a', skills: ['dup'] },
      { type: 'git', repo: 'r', skills: ['dup'] },
    ],
  }
  assert.ok(validateBundle(bundle).some((p) => /declared twice/.test(p.message)))
})

test('validateBundle rejects a bad source type and a missing target', () => {
  const problems = validateBundle({ sources: [{ type: 'ftp', path: 'a', skills: ['x'] }] })
  assert.ok(problems.some((p) => /missing "target"/.test(p.message)))
  assert.ok(problems.some((p) => /type must be/.test(p.message)))
})

test('resolveSources maps local to the bundle dir and git to the cache', () => {
  const roots = resolveSources({
    bundle: validBundle,
    bundleDir: '/repo',
    cacheDir: '/cache',
    path,
  })
  assert.equal(roots[0], path.join('/repo', '.agents/skills'))
  assert.ok(roots[1].startsWith(path.join('/cache', '')))
})

test('planInstall classifies install / skip / missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-'))
  const base = join(root, 'src')
  const target = join(root, 'target')
  mkdirSync(join(base, 'good'), { recursive: true })
  writeFileSync(join(base, 'good', 'SKILL.md'), '---\nname: good\n---\n')
  mkdirSync(join(base, 'new'), { recursive: true })
  writeFileSync(join(base, 'new', 'SKILL.md'), '---\nname: new\n---\n')
  mkdirSync(join(target, 'good'), { recursive: true })
  writeFileSync(join(target, 'good', 'SKILL.md'), 'existing')

  const bundle = { target, sources: [{ type: 'local', path: 'src', skills: ['good', 'new', 'ghost'] }] }
  const plan = planInstall({ bundle, sourceRoots: [base], targetDir: target, fs, path })
  const bySkill = Object.fromEntries(plan.map((p) => [p.skill, p.action]))
  assert.deepEqual(bySkill, { good: 'skip', new: 'install', ghost: 'missing' })
})

test('applyPlan copies only install entries', () => {
  const copied = []
  const results = applyPlan(
    [
      { skill: 'a', from: 'fa', to: 'ta', action: 'install' },
      { skill: 'b', from: 'fb', to: 'tb', action: 'skip' },
    ],
    { copy: (from, to) => copied.push([from, to]) },
  )
  assert.deepEqual(copied, [['fa', 'ta']])
  assert.equal(results.find((r) => r.skill === 'b').copied, false)
})

test('tokenize drops stopwords and short words', () => {
  const tokens = tokenize('Use this skill when the user asks for a chart')
  assert.ok(tokens.has('chart'))
  assert.ok(!tokens.has('the'))
  assert.ok(!tokens.has('use'))
})

test('detectOverlap flags two competing descriptions and ignores a distinct one', () => {
  const skills = [
    {
      name: 'review-animations',
      description: 'Review animation code against a craft bar and flag jank and timing issues',
    },
    {
      name: 'audit-motion',
      description: 'Review motion code against a craft bar and flag timing and easing issues',
    },
    { name: 'send-email', description: 'Send an email summary of the week' },
  ]
  const pairs = detectOverlap(skills, { threshold: 0.5, minShared: 3 })
  assert.equal(pairs.length, 1)
  assert.deepEqual([pairs[0].a, pairs[0].b].sort(), ['audit-motion', 'review-animations'])
})

test('jaccard and skillDescription behave', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1)
  assert.equal(jaccard(new Set(), new Set()), 0)
  const text = '---\nname: x\ndescription: >\n  line one\n  line two\n---\n'
  assert.equal(skillDescription(text), 'line one line two')
})
