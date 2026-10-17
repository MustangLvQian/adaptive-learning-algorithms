import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeFeedback } from '../src/sanitize.mjs'
import {
  buildDryRunReport,
  buildImprovementMessages,
  groupByTarget,
  loadFeedback,
} from '../src/pipeline.mjs'

test('sanitizeFeedback redacts identifiers but keeps dates', () => {
  const input =
    'Mail parent@example.com or +1 415 555 0199, see https://example.com, ping @teacher. Ref 12345678 on 2026-10-13.'
  const output = sanitizeFeedback(input)
  assert.ok(!output.includes('parent@example.com'))
  assert.ok(!output.includes('555'))
  assert.ok(!output.includes('https://example.com'))
  assert.ok(!output.includes('@teacher'))
  assert.ok(!output.includes('12345678'))
  assert.ok(output.includes('2026-10-13'))
  assert.ok(output.includes('[redacted-email]'))
})

test('loadFeedback parses JSONL and classifies unknown targets', () => {
  const jsonl = [
    '{"id":"a","target":"learning-engine","text":"one"}',
    '',
    '{"id":"b","target":"spaced-repetition","text":"two"}',
    '{"id":"c","target":"other","text":"three"}',
    '{"target":"learning-engine"}',
    '   ',
  ].join('\n')
  const entries = loadFeedback(jsonl)
  assert.deepEqual(
    entries.map((entry) => [entry.id, entry.target]),
    [
      ['a', 'learning-engine'],
      ['b', 'spaced-repetition'],
      ['c', 'unclassified'],
    ],
  )
})

test('loadFeedback rejects malformed JSON', () => {
  assert.throws(() => loadFeedback('{not json}'), /Invalid JSON on line 1/)
})

test('groupByTarget always exposes every target', () => {
  const groups = groupByTarget(
    loadFeedback('{"id":"a","target":"learning-engine","text":"one"}'),
  )
  assert.deepEqual([...groups.keys()].sort(), [
    'learning-engine',
    'spaced-repetition',
    'unclassified',
  ])
  assert.equal(groups.get('learning-engine').length, 1)
  assert.equal(groups.get('spaced-repetition').length, 0)
})

test('buildDryRunReport contains sanitized feedback, never raw text', () => {
  const entries = loadFeedback(
    '{"id":"a","target":"spaced-repetition","text":"email me parent@example.com"}',
  )
  const report = buildDryRunReport({
    entries,
    generatedAt: '2026-10-14T00:00:00.000Z',
  })
  assert.ok(report.includes('| spaced-repetition | 1 |'))
  assert.ok(report.includes('[redacted-email]'))
  assert.ok(!report.includes('parent@example.com'))
})

test('buildImprovementMessages includes the prompt and the feedback', () => {
  const entries = loadFeedback(
    '{"id":"a","target":"learning-engine","text":"drop a grade sooner"}',
  )
  const messages = buildImprovementMessages({
    target: 'learning-engine',
    promptText: 'CURRENT-SPEC-PROMPT',
    entries,
  })
  assert.ok(messages.system.includes('Only use the feedback provided'))
  assert.ok(messages.user.includes('CURRENT-SPEC-PROMPT'))
  assert.ok(messages.user.includes('drop a grade sooner'))
})

test('dry run writes a report offline', () => {
  const run = fileURLToPath(new URL('../src/run.mjs', import.meta.url))
  const sample = fileURLToPath(
    new URL('../examples/feedback.sample.jsonl', import.meta.url),
  )
  const out = mkdtempSync(join(tmpdir(), 'feedback-out-'))
  execFileSync(
    process.execPath,
    [run, '--input', sample, '--out', out],
    { encoding: 'utf8' },
  )
  const report = readFileSync(join(out, 'report.md'), 'utf8')
  assert.ok(report.includes('| learning-engine | 2 |'))
  assert.ok(report.includes('| spaced-repetition | 2 |'))
  assert.ok(report.includes('| unclassified | 1 |'))
  assert.ok(report.includes('[redacted-email]'))
  assert.ok(!report.includes('parent@example.com'))
})
