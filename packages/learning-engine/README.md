# @adaptive-learning/learning-engine

A dependency-free engine that decides **what a learner should practice today**,
and in what order. Pure functions over an event log and an item catalogue — no
storage, no clock, no framework.

```ts
import { selectPracticeItems } from '@adaptive-learning/learning-engine'

const today = selectPracticeItems(items, records, ratings, {
  today: '2026-01-10',
  intervals: [1, 3, 7, 14],
  limit: 5,
  preferredBankId: 'unit-1',
  difficultyBankId: 'unit-1',
})
```

## What it does

### 1. Calibrate difficulty from first objective outcomes

`deriveTargetDifficulty` looks at the learner's **eight most recent first
objective outcomes** (one per question per day, and only where no hint was
used) and returns the difficulty to aim for:

- fewer than five data points → neutral (`2`);
- accuracy below 55% → easier (`1`);
- accuracy 80% or higher → harder (`3`);
- otherwise → neutral (`2`).

First outcomes matter: a learner who guesses wrong, then retries and gets it
right, should not have that success counted as if they knew it. **Hinted days
are excluded entirely**, so help does not inflate the estimate.

### 2. Rank items into a stable priority

Each item gets a priority from its history:

| Priority | Meaning |
| --- | --- |
| `0` | Needs help: last answer wrong, an open-ended last attempt was `with-hint`/`revisit`, a hint came after the last attempt, or the last session's confidence was `1` |
| `1` | Due now, according to the spaced-repetition ladder |
| `2` | New — never attempted |
| `3` | Scheduled ahead |

Within `3`, the soonest due comes first. Every priority level then falls back to
"closest to the target difficulty", emptiest history, then input order, so the
result is deterministic and testable.

### 3. Fill the daily quota with a stated policy

`selectPracticeItems` fills the quota in a fixed order:

1. up to **two** "needs help" items lead;
2. a share of the quota (about 40%) is reserved for **due reviews**;
3. the rest is biased toward the **preferred bank** (60% when difficulty is
   neutral, 40% when calibrating);
4. one item from a **same-grade, different-topic** bank is included;
5. if the learner is clearly off-target, one item **one grade up or down** is
   included;
6. the remaining slots are filled, preferring the current grade.

Items are identified by `(bankId, id)`, so two banks may reuse the same id.

### 4. Order tasks and summarize mastery

- `orderTasksByDifficulty(tasks, results)` puts the skills a learner recently
  struggled with first.
- `summarizeSkillMastery(results)` turns recent task results into a coarse level
  (`0` unknown, `1` needs practice, `2` practicing, `3` steady). It is
  deliberately conservative: `steady` needs at least three results and
  net-positive evidence; `needs practice` needs at least two results and
  net-negative evidence.

## Records

The engine consumes three kinds of `PracticeRecord`:

```ts
{ kind: 'graded',    itemId, bankId, date, correct: true }
{ kind: 'supported', itemId, bankId, date, support: 'independent' }
{ kind: 'hint',      itemId, bankId, date }
```

`graded` is for checkable items, `supported` for open-ended ones, `hint` for
help requests. Records without an `itemId` are matched by `key` (the focus
word), but only when that key is unambiguous within its bank — otherwise a
key-only record is ignored rather than attributed to the wrong item.

## API

- `selectPracticeItems(items, records, ratings, options) → T[]`
- `orderTasksByDifficulty(tasks, results, window?) → T[]`
- `summarizeSkillMastery(results, window?) → SkillMastery`
- `deriveTargetDifficulty(recentOutcomes) → 1 | 2 | 3`
- helpers `normalizeIntervals`, `normalizeKey`, `daysBetween`
- constants `DEFAULT_PRACTICE_LIMIT`, `DEFAULT_REVIEW_INTERVALS`, `TARGET_DIFFICULTY_WINDOW`

## License

MIT.
