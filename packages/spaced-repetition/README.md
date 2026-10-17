# @adaptive-learning/spaced-repetition

A small, dependency-free spaced-repetition scheduler. Pure functions over plain
data — no storage, no clock, no framework.

```ts
import { selectDueItems } from '@adaptive-learning/spaced-repetition'

const due = selectDueItems(items, attempts, ratings, {
  today: '2026-01-10',
  intervals: [1, 3, 7, 14], // optional, this is the default
  limit: 5,                // optional, this is the default
})
```

## The rule set

Given an item's attempt history, the scheduler collapses it to the **latest
encounter per day** and walks it in order, maintaining one interval:

| Event | Effect |
| --- | --- |
| Wrong answer | streak → 0, interval → first rung |
| Correct answer | streak + 1, interval → next rung (capped at the top) |
| Self-rated confidence `1` | interval → first rung (even if correct) |
| Self-rated confidence `2` | interval capped at the second rung |
| Open-ended `independent` | advances like a correct answer |
| Open-ended `with-hint` / `revisit` / `unreported` | treated as not retrieved: streak → 0 |

Then `dueInDays = interval - daysSince(lastEncounter)`. `dueInDays <= 0` means
the item is due now.

Encounters dated on or after `today` are ignored, so a schedule is stable for the
whole of a study day.

## Ranking

`selectDueItems` returns items in a fixed order:

1. **Due** — `dueInDays <= 0`, oldest last-studied first (the most neglected come
   up first).
2. **New** — never seen.
3. **Scheduled ahead** — soonest due first.

Ties fall back to the input order, so results are deterministic and easy to test.

## Why confidence is separate from correctness

A learner can answer correctly and still not own the word. A `1` rating pulls the
item straight back to the first rung, and a `2` prevents it from jumping to the
long interval. Correctness alone would let a lucky guess buy two weeks of
forgetting.

Confidence can be attached in two ways:

- inline on the attempt (`responseSupport`), for open-ended items;
- as a separate `ConfidenceRating`, matched by `date` + `sessionId`, when the
  rating is collected at the end of a session rather than per item.

## API

- `computeSchedule(attempts, ratings, { today, intervals? }) → ItemSchedule`
- `selectDueItems(items, attempts, ratings, { today, intervals?, limit? }) → ScheduledItem<T>[]`
- `isDue(schedule) → boolean`
- `normalizeIntervals(intervals?) → number[]`, `daysBetween(from, to) → number`
- constants `DEFAULT_REVIEW_INTERVALS`, `DEFAULT_REVIEW_LIMIT`

Keys are matched case-insensitively after trimming. Items are not mutated.

## License

MIT.
