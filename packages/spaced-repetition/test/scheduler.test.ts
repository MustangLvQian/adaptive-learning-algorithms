import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeSchedule,
  daysBetween,
  isDue,
  normalizeIntervals,
  selectDueItems,
} from '../src/index.ts'
import type { ConfidenceRating, ReviewAttempt } from '../src/index.ts'

const item = (id: string) => ({ id, key: id })
const attempt = (
  key: string,
  date: string,
  extra: Partial<ReviewAttempt> = {},
): ReviewAttempt => ({ key, date, ...extra })

test('normalizes intervals, falling back to the default ladder', () => {
  assert.deepEqual(normalizeIntervals(), [1, 3, 7, 14])
  assert.deepEqual(normalizeIntervals([]), [1, 3, 7, 14])
  assert.deepEqual(normalizeIntervals([0, -2, 2.5]), [1, 3, 7, 14])
  assert.deepEqual(normalizeIntervals([5, 10]), [5, 10])
})

test('daysBetween counts whole calendar days', () => {
  assert.equal(daysBetween('2026-01-09', '2026-01-10'), 1)
  assert.equal(daysBetween('2026-01-10', '2026-01-10'), 0)
  assert.equal(daysBetween('2026-01-01', '2026-01-10'), 9)
})

test('an item with no prior attempts is new', () => {
  const schedule = computeSchedule([], [], { today: '2026-01-10' })
  assert.equal(schedule.isNew, true)
  assert.equal(schedule.lastStudiedOn, '')
  assert.equal(schedule.streak, 0)
  assert.equal(isDue(schedule), false)
})

test('a correct answer advances one rung per successful day', () => {
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true }),
      attempt('apple', '2026-01-04', { correct: true }),
      attempt('apple', '2026-01-08', { correct: true }),
    ],
    [],
    { today: '2026-01-11' },
  )
  assert.equal(schedule.streak, 3)
  assert.equal(schedule.intervalDays, 7)
  assert.equal(schedule.dueInDays, 7 - 3)
  assert.equal(schedule.lastStudiedOn, '2026-01-08')
})

test('a wrong answer resets the streak to the first interval', () => {
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true }),
      attempt('apple', '2026-01-02', { correct: false }),
    ],
    [],
    { today: '2026-01-10' },
  )
  assert.equal(schedule.streak, 0)
  assert.equal(schedule.intervalDays, 1)
  assert.equal(schedule.dueInDays, 1 - 8)
  assert.equal(isDue(schedule), true)
})

test('confidence 1 caps the interval at the first rung', () => {
  const ratings: ConfidenceRating[] = [
    { date: '2026-01-03', sessionId: 's1', confidence: 1 },
  ]
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true }),
      attempt('apple', '2026-01-02', { correct: true }),
      attempt('apple', '2026-01-03', { correct: true, sessionId: 's1' }),
    ],
    ratings,
    { today: '2026-01-04' },
  )
  assert.equal(schedule.streak, 3)
  assert.equal(schedule.intervalDays, 1)
})

test('confidence 2 caps the interval at the second rung', () => {
  const ratings: ConfidenceRating[] = [
    { date: '2026-01-03', sessionId: 's1', confidence: 2 },
  ]
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true }),
      attempt('apple', '2026-01-02', { correct: true }),
      attempt('apple', '2026-01-03', { correct: true, sessionId: 's1' }),
    ],
    ratings,
    { today: '2026-01-04' },
  )
  assert.equal(schedule.streak, 3)
  assert.equal(schedule.intervalDays, 3)
})

test('independent open-ended recall advances the item', () => {
  const schedule = computeSchedule(
    [
      attempt('speak', '2026-01-01', { correct: true }),
      attempt('speak', '2026-01-02', { responseSupport: 'independent' }),
    ],
    [],
    { today: '2026-01-04' },
  )
  assert.equal(schedule.streak, 2)
  assert.equal(schedule.intervalDays, 3)
})

test('a hint or revisit resets an open-ended item', () => {
  for (const support of ['with-hint', 'revisit', 'unreported'] as const) {
    const schedule = computeSchedule(
      [
        attempt('speak', '2026-01-01', { correct: true }),
        attempt('speak', '2026-01-02', { responseSupport: support }),
      ],
      [],
      { today: '2026-01-04' },
    )
    assert.equal(schedule.streak, 0, `support=${support}`)
    assert.equal(schedule.intervalDays, 1, `support=${support}`)
  }
})

test('multiple attempts on the same day collapse to the latest', () => {
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true, occurredAt: '09:00' }),
      attempt('apple', '2026-01-01', { correct: false, occurredAt: '10:00' }),
    ],
    [],
    { today: '2026-01-02' },
  )
  assert.equal(schedule.streak, 0)
  assert.equal(schedule.intervalDays, 1)
})

test('two correct answers on one day count once', () => {
  const schedule = computeSchedule(
    [
      attempt('apple', '2026-01-01', { correct: true, occurredAt: '09:00' }),
      attempt('apple', '2026-01-01', { correct: true, occurredAt: '10:00' }),
    ],
    [],
    { today: '2026-01-02' },
  )
  assert.equal(schedule.streak, 1)
  assert.equal(schedule.intervalDays, 1)
})

test('encounters dated today are ignored', () => {
  const schedule = computeSchedule(
    [attempt('apple', '2026-01-10', { correct: true })],
    [],
    { today: '2026-01-10' },
  )
  assert.equal(schedule.isNew, true)
})

test('a custom interval ladder is respected', () => {
  const schedule = computeSchedule(
    [attempt('apple', '2026-01-08', { correct: true })],
    [],
    { today: '2026-01-09', intervals: [5] },
  )
  assert.equal(schedule.intervalDays, 5)
  assert.equal(schedule.dueInDays, 4)
})

test('selectDueItems ranks due, then new, then scheduled ahead', () => {
  const items = [item('apple'), item('banana'), item('cherry'), item('date')]
  const attempts = [
    attempt('apple', '2026-01-09', { correct: true }),
    attempt('cherry', '2026-01-08', { correct: true }),
    attempt('date', '2026-01-05', { correct: true }),
    attempt('date', '2026-01-06', { correct: true }),
    attempt('date', '2026-01-07', { correct: true }),
  ]
  const selected = selectDueItems(items, attempts, [], {
    today: '2026-01-10',
  })
  assert.deepEqual(
    selected.map((entry) => entry.item.id),
    ['cherry', 'apple', 'banana', 'date'],
  )
  assert.deepEqual(
    selected.map((entry) => entry.status),
    [0, 0, 1, 2],
  )
})

test('scheduled-ahead items are ordered by soonest due', () => {
  const items = [item('p'), item('q')]
  const attempts = [
    attempt('p', '2026-01-08', { correct: true }),
    attempt('p', '2026-01-09', { correct: true }),
    attempt('q', '2026-01-07', { correct: true }),
    attempt('q', '2026-01-08', { correct: true }),
    attempt('q', '2026-01-09', { correct: true }),
  ]
  const selected = selectDueItems(items, attempts, [], { today: '2026-01-10' })
  assert.deepEqual(
    selected.map((entry) => entry.item.id),
    ['p', 'q'],
  )
  assert.deepEqual(
    selected.map((entry) => entry.schedule.dueInDays),
    [2, 6],
  )
})

test('the limit is respected and ties keep input order', () => {
  const items = [item('x'), item('y'), item('z')]
  assert.deepEqual(
    selectDueItems(items, [], [], { today: '2026-01-10', limit: 2 }).map(
      (entry) => entry.item.id,
    ),
    ['x', 'y'],
  )
  assert.deepEqual(
    selectDueItems(items, [], [], { today: '2026-01-10', limit: 0 }),
    [],
  )
})

test('ratings are matched by session and the latest rating wins', () => {
  const ratings: ConfidenceRating[] = [
    { date: '2026-01-03', sessionId: 's1', confidence: 3, occurredAt: '10:00' },
    { date: '2026-01-03', sessionId: 's1', confidence: 1, occurredAt: '11:00' },
  ]
  const schedule = computeSchedule(
    [attempt('apple', '2026-01-03', { correct: true, sessionId: 's1' })],
    ratings,
    { today: '2026-01-04' },
  )
  assert.equal(schedule.intervalDays, 1)
})
