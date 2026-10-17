import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveTargetDifficulty,
  orderTasksByDifficulty,
  summarizeSkillMastery,
} from '../src/index.ts'
import type { TaskResult } from '../src/index.ts'

test('deriveTargetDifficulty stays neutral without enough evidence', () => {
  assert.equal(deriveTargetDifficulty([]), 2)
  assert.equal(deriveTargetDifficulty([true, false, true, false]), 2)
})

test('deriveTargetDifficulty drops when accuracy is low', () => {
  assert.equal(
    deriveTargetDifficulty([false, false, false, false, true]),
    1,
  )
  assert.equal(
    deriveTargetDifficulty([true, false, true, false, false]),
    1,
  )
})

test('deriveTargetDifficulty rises when accuracy is high', () => {
  assert.equal(
    deriveTargetDifficulty([true, true, true, true, true]),
    3,
  )
  assert.equal(
    deriveTargetDifficulty([true, true, true, true, false]),
    3,
  )
  assert.equal(
    deriveTargetDifficulty([true, true, true, false, false]),
    2,
  )
})

test('orderTasksByDifficulty surfaces recently weak skills first', () => {
  const tasks = [{ skill: 'a' }, { skill: 'b' }, { skill: 'c' }]
  const results: TaskResult[] = [
    { skill: 'a', correct: false },
    { skill: 'b', correctCount: 5, questionCount: 5 },
    { skill: 'c', correctCount: 7, questionCount: 10 },
  ]
  assert.deepEqual(
    orderTasksByDifficulty(tasks, results).map((task) => task.skill),
    ['a', 'c', 'b'],
  )
})

test('summarizeSkillMastery is conservative', () => {
  assert.deepEqual(summarizeSkillMastery([]), {
    level: 0,
    evidence: 0,
    sampleSize: 0,
  })
  assert.equal(
    summarizeSkillMastery([
      { skill: 'x', correct: false },
      { skill: 'x', correct: false },
    ]).level,
    1,
  )
  assert.equal(
    summarizeSkillMastery([
      { skill: 'x', correct: true },
      { skill: 'x', correct: true },
      { skill: 'x', correct: true },
    ]).level,
    3,
  )
  assert.equal(
    summarizeSkillMastery([
      { skill: 'x', correct: true },
      { skill: 'x', correct: false },
      { skill: 'x', correct: true },
    ]).level,
    2,
  )
})
