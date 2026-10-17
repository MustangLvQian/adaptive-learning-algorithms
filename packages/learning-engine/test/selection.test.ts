import { test } from 'node:test'
import assert from 'node:assert/strict'

import { selectPracticeItems } from '../src/index.ts'
import type { PracticeItem, PracticeRecord } from '../src/index.ts'

const item = (
  id: string,
  extra: Partial<PracticeItem> = {},
): PracticeItem => ({ id, key: id, ...extra })

test('the last wrong answer jumps to the front', () => {
  const items = [
    item('alpha', { bankId: 'b1', grade: 5 }),
    item('beta', { bankId: 'b1', grade: 5 }),
  ]
  const records: PracticeRecord[] = [
    { kind: 'graded', itemId: 'alpha', key: 'alpha', bankId: 'b1', date: '2026-01-05', correct: true },
    { kind: 'graded', itemId: 'alpha', key: 'alpha', bankId: 'b1', date: '2026-01-09', correct: false },
    { kind: 'graded', itemId: 'beta', key: 'beta', bankId: 'b1', date: '2026-01-09', correct: true },
  ]
  const selected = selectPracticeItems(items, records, [], {
    today: '2026-01-10',
    preferredBankId: 'b1',
    difficultyBankId: 'b1',
  })
  assert.deepEqual(selected.map((entry) => entry.id), ['alpha', 'beta'])
})

test('a hinted item leads the session', () => {
  const items = [
    item('gamma', { bankId: 'b1', grade: 5 }),
    item('delta', { bankId: 'b1', grade: 5 }),
  ]
  const records: PracticeRecord[] = [
    { kind: 'hint', itemId: 'gamma', bankId: 'b1', date: '2026-01-08' },
    { kind: 'graded', itemId: 'delta', key: 'delta', bankId: 'b1', date: '2026-01-09', correct: true },
  ]
  const selected = selectPracticeItems(items, records, [], {
    today: '2026-01-10',
    preferredBankId: 'b1',
    difficultyBankId: 'b1',
  })
  assert.deepEqual(selected.map((entry) => entry.id), ['gamma', 'delta'])
})

test('an open-ended hint on the last attempt marks the item as needing help', () => {
  const items = [item('eps', { bankId: 'b1', grade: 5 })]
  const records: PracticeRecord[] = [
    { kind: 'graded', itemId: 'eps', key: 'eps', bankId: 'b1', date: '2026-01-05', correct: true },
    { kind: 'supported', itemId: 'eps', key: 'eps', bankId: 'b1', date: '2026-01-06', support: 'with-hint' },
  ]
  const selected = selectPracticeItems(items, records, [], {
    today: '2026-01-10',
    preferredBankId: 'b1',
    difficultyBankId: 'b1',
  })
  assert.equal(selected[0]?.id, 'eps')
})

test('struggling calibrates down one grade', () => {
  const items = [
    item('p', { bankId: 'b1', grade: 5, difficulty: 2 }),
    item('e', { bankId: 'b2', grade: 4, difficulty: 2 }),
  ]
  const records: PracticeRecord[] = [1, 2, 3, 4, 5].map((n) => ({
    kind: 'graded' as const,
    itemId: `q${n}`,
    key: `q${n}`,
    bankId: 'b1',
    date: `2026-01-0${n}`,
    correct: false,
  }))
  const selected = selectPracticeItems(items, records, [], {
    today: '2026-01-10',
    preferredBankId: 'b1',
    difficultyBankId: 'b1',
  })
  assert.ok(selected.some((entry) => entry.id === 'e'))
})

test('doing well calibrates up one grade', () => {
  const items = [
    item('p', { bankId: 'b1', grade: 5, difficulty: 2 }),
    item('h', { bankId: 'b2', grade: 6, difficulty: 2 }),
  ]
  const records: PracticeRecord[] = [1, 2, 3, 4, 5].map((n) => ({
    kind: 'graded' as const,
    itemId: `q${n}`,
    key: `q${n}`,
    bankId: 'b1',
    date: `2026-01-0${n}`,
    correct: true,
  }))
  const selected = selectPracticeItems(items, records, [], {
    today: '2026-01-10',
    preferredBankId: 'b1',
    difficultyBankId: 'b1',
  })
  assert.ok(selected.some((entry) => entry.id === 'h'))
})

test('items matching the target difficulty come first', () => {
  const items = [
    item('easy', { difficulty: 1 }),
    item('fit', { difficulty: 2 }),
    item('hard', { difficulty: 3 }),
  ]
  const selected = selectPracticeItems(items, [], [], { today: '2026-01-10' })
  assert.equal(selected[0]?.id, 'fit')
})

test('the limit is respected', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id))
  const selected = selectPracticeItems(items, [], [], {
    today: '2026-01-10',
    limit: 2,
  })
  assert.deepEqual(selected.map((entry) => entry.id), ['a', 'b'])
})

test('includeToday decides whether today\'s signals count', () => {
  const items = [
    item('d', { bankId: 'b1', grade: 5 }),
    item('m', { bankId: 'b1', grade: 5 }),
  ]
  const records: PracticeRecord[] = [
    { kind: 'graded', itemId: 'd', key: 'd', bankId: 'b1', date: '2026-01-09', correct: true },
    { kind: 'hint', itemId: 'm', bankId: 'b1', date: '2026-01-10' },
  ]
  const base = { preferredBankId: 'b1', difficultyBankId: 'b1' }
  assert.deepEqual(
    selectPracticeItems(items, records, [], { ...base, today: '2026-01-10' }).map(
      (entry) => entry.id,
    ),
    ['d', 'm'],
  )
  assert.deepEqual(
    selectPracticeItems(items, records, [], {
      ...base,
      today: '2026-01-10',
      includeToday: true,
    }).map((entry) => entry.id),
    ['m', 'd'],
  )
})
