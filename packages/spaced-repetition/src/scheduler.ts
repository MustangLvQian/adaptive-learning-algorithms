import {
  DEFAULT_REVIEW_LIMIT,
  daysBetween,
  normalizeIntervals,
} from './intervals.ts'
import type { ReviewAttempt, Confidence, ConfidenceRating } from './types.ts'

const normalizeKey = (key: string | undefined): string =>
  (key ?? '').trim().toLocaleLowerCase()

const sessionKey = (date: string, sessionId: string | undefined): string =>
  JSON.stringify([date, sessionId ?? null])

const latestConfidenceBySession = (
  ratings: ConfidenceRating[],
): Map<string, Confidence> => {
  const latest = new Map<string, ConfidenceRating>()
  for (const rating of ratings) {
    const key = sessionKey(rating.date, rating.sessionId)
    const saved = latest.get(key)
    if (!saved || (saved.occurredAt ?? '') < (rating.occurredAt ?? '')) {
      latest.set(key, rating)
    }
  }
  const result = new Map<string, Confidence>()
  for (const [key, rating] of latest) result.set(key, rating.confidence)
  return result
}

const resolveConfidence = (
  attempt: ReviewAttempt,
  confidenceBySession: Map<string, Confidence>,
): Confidence | undefined => {
  if (attempt.responseSupport === 'independent') return 3
  if (attempt.responseSupport === 'with-hint') return 2
  if (attempt.responseSupport === 'revisit') return 1
  if (attempt.responseSupport === 'unreported') return undefined
  return confidenceBySession.get(sessionKey(attempt.date, attempt.sessionId))
}

export interface ScheduleOptions {
  /** The reference day, `YYYY-MM-DD`. */
  today: string
  /** Expanding interval ladder in days. Default `[1, 3, 7, 14]`. */
  intervals?: readonly number[]
}

export interface ItemSchedule {
  /** True until the item has at least one prior encounter. */
  isNew: boolean
  /** Days until the item is next due; `<= 0` means due now. `0` when new. */
  dueInDays: number
  /** The interval (in days) currently assigned to the item. */
  intervalDays: number
  /** Consecutive successful days counted by the scheduler. */
  streak: number
  /** The most recent encounter day, or `''` when new. */
  lastStudiedOn: string
}

/**
 * Collapse multiple encounters on the same day to the latest one. The schedule
 * advances or resets at most once per day, so repeating a word three times in
 * one session counts once.
 */
const latestPerDay = (attempts: ReviewAttempt[]): ReviewAttempt[] => {
  const byDay = new Map<string, ReviewAttempt>()
  for (const attempt of attempts) byDay.set(attempt.date, attempt)
  return [...byDay.values()]
}

/**
 * Compute the schedule for a single item.
 *
 * Walk the item's day-collapsed history in order and maintain an interval:
 *
 * - a wrong answer resets the streak and returns to the first interval;
 * - a successful day advances one rung on the ladder, capped at the top;
 * - self-rated confidence `1` drops the interval back to the first rung, and
 *   `2` caps it at the second rung;
 * - an open-ended encounter only advances the item when it was reported
 *   `independent` (or with confidence `3`); `with-hint`, `revisit` and
 *   `unreported` reset it, because the learner did not retrieve it alone.
 *
 * Encounters dated on or after `today` are ignored, so a schedule is stable for
 * the whole of a study day.
 */
export const computeSchedule = (
  attempts: ReviewAttempt[],
  ratings: ConfidenceRating[],
  options: ScheduleOptions,
): ItemSchedule => {
  const intervals = normalizeIntervals(options.intervals)
  const history = attempts
    .filter((attempt) => attempt.date < options.today)
    .sort((left, right) =>
      (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    )
  const spaced = latestPerDay(history)

  if (spaced.length === 0) {
    return {
      isNew: true,
      dueInDays: 0,
      intervalDays: intervals[0],
      streak: 0,
      lastStudiedOn: '',
    }
  }

  const confidenceBySession = latestConfidenceBySession(ratings)
  let streak = 0
  let interval = intervals[0]

  for (const attempt of spaced) {
    const confidence = resolveConfidence(attempt, confidenceBySession)

    if (attempt.correct === false) {
      streak = 0
      interval = intervals[0]
      continue
    }

    if (attempt.correct === undefined) {
      if (confidence === undefined || confidence === 1 || confidence === 2) {
        streak = 0
        interval = intervals[0]
        continue
      }
    }

    streak += 1
    interval = intervals[Math.min(streak - 1, intervals.length - 1)]
    if (confidence === 1) interval = intervals[0]
    if (confidence === 2 && intervals.length > 1) {
      interval = Math.min(interval, intervals[1])
    }
  }

  const last = spaced[spaced.length - 1]
  return {
    isNew: false,
    dueInDays: interval - daysBetween(last.date, options.today),
    intervalDays: interval,
    streak,
    lastStudiedOn: last.date,
  }
}

export interface SelectOptions extends ScheduleOptions {
  /** Maximum items to return. Defaults to 5. */
  limit?: number
}

export interface ScheduledItem<T extends { id: string; key: string }> {
  item: T
  schedule: ItemSchedule
  /** Rank bucket: `0` due now, `1` new, `2` scheduled ahead. */
  status: 0 | 1 | 2
}

const statusOf = (schedule: ItemSchedule): 0 | 1 | 2 =>
  schedule.isNew ? 1 : schedule.dueInDays <= 0 ? 0 : 2

/**
 * Rank many items and return the first `limit`.
 *
 * The order is fixed and intentional: **due items first** (oldest last-studied
 * first, so the most neglected come up), then **new items**, then items
 * **scheduled ahead** (soonest due first). Ties fall back to the input order,
 * so the result is deterministic.
 *
 * `attempts` may contain every item's history in one array; they are grouped by
 * key internally. Ratings are matched per attempt by `date` + `sessionId`.
 */
export const selectDueItems = <T extends { id: string; key: string }>(
  items: T[],
  attempts: ReviewAttempt[],
  ratings: ConfidenceRating[],
  options: SelectOptions,
): ScheduledItem<T>[] => {
  const limit = options.limit ?? DEFAULT_REVIEW_LIMIT
  if (limit <= 0) return []

  const attemptsByKey = new Map<string, ReviewAttempt[]>()
  for (const attempt of attempts) {
    const key = normalizeKey(attempt.key)
    const bucket = attemptsByKey.get(key)
    if (bucket) bucket.push(attempt)
    else attemptsByKey.set(key, [attempt])
  }

  const ranked = items.map((item, index) => {
    const schedule = computeSchedule(
      attemptsByKey.get(normalizeKey(item.key)) ?? [],
      ratings,
      options,
    )
    return { item, index, schedule, status: statusOf(schedule) }
  })

  ranked.sort((left, right) => {
    if (left.status !== right.status) return left.status - right.status
    if (
      left.status === 2 &&
      left.schedule.dueInDays !== right.schedule.dueInDays
    ) {
      return left.schedule.dueInDays - right.schedule.dueInDays
    }
    const byLastStudied = left.schedule.lastStudiedOn.localeCompare(
      right.schedule.lastStudiedOn,
    )
    if (byLastStudied !== 0) return byLastStudied
    return left.index - right.index
  })

  return ranked.slice(0, limit).map(({ item, schedule, status }) => ({
    item,
    schedule,
    status,
  }))
}

/** True when the schedule says the item should be reviewed today. */
export const isDue = (schedule: ItemSchedule): boolean =>
  !schedule.isNew && schedule.dueInDays <= 0
