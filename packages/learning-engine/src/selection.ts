import {
  DEFAULT_PRACTICE_LIMIT,
  daysBetween,
  normalizeIntervals,
  normalizeKey,
} from './intervals.ts'
import { deriveTargetDifficulty, TARGET_DIFFICULTY_WINDOW } from './calibration.ts'
import type {
  Confidence,
  ConfidenceRating,
  GradedRecord,
  PracticeItem,
  PracticeRecord,
  SupportedRecord,
} from './types.ts'

export interface SelectionOptions {
  /** The reference day, `YYYY-MM-DD`. */
  today: string
  /** Expanding interval ladder in days. Default `[1, 3, 7, 14]`. */
  intervals?: readonly number[]
  /** Maximum items to select. Defaults to 5. */
  limit?: number
  /** Include attempts recorded today. Default `false` (only prior days). */
  includeToday?: boolean
  /** Prefer items from this bank when filling the quota. */
  preferredBankId?: string
  /**
   * Restrict difficulty calibration to records from this bank. Useful when one
   * event log serves several skills and only this bank is the skill's evidence.
   */
  difficultyBankId?: string
  /**
   * Grade range used when calibrating up or down.
   * Default `{ min: 3, max: 6 }`.
   */
  gradeRange?: { min: number; max: number }
}

/** Identity used to attribute a record that has no explicit `itemId`. */
const recordQuestionKey = (record: PracticeRecord): string => {
  if (record.itemId) return record.itemId
  const key = normalizeKey(record.key)
  if (key) return key
  return record.id ?? ''
}

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

const resolvePracticeConfidence = (
  record: GradedRecord | SupportedRecord,
  confidenceBySession: Map<string, Confidence>,
): Confidence | undefined => {
  if (record.kind === 'supported' && record.support) {
    if (record.support === 'independent') return 3
    if (record.support === 'with-hint') return 2
    if (record.support === 'revisit') return 1
    return undefined
  }
  return confidenceBySession.get(sessionKey(record.date, record.sessionId))
}

export const selectPracticeItems = <T extends PracticeItem>(
  items: T[],
  records: PracticeRecord[],
  ratings: ConfidenceRating[],
  options: SelectionOptions,
): T[] => {
  const limit = options.limit ?? DEFAULT_PRACTICE_LIMIT
  if (limit <= 0 || items.length === 0) return []

  const intervals = normalizeIntervals(options.intervals)
  const today = options.today
  const gradeRange = options.gradeRange ?? { min: 3, max: 6 }

  const priorRecords = records
    .filter(
      (record) =>
        record.date < today ||
        (options.includeToday === true && record.date === today),
    )
    .sort((left, right) =>
      (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    )

  // Count how many items share a (bank, key) pair, so key-only records are only
  // attributed to an item when the key is unambiguous within its bank.
  const legacyItemCounts = new Map<string, number>()
  for (const item of items) {
    const key = normalizeKey(item.key)
    if (!key) continue
    const composite = JSON.stringify([item.bankId ?? null, key])
    legacyItemCounts.set(composite, (legacyItemCounts.get(composite) ?? 0) + 1)
  }

  const confidenceBySession = latestConfidenceBySession(ratings)

  const difficultyRecords = options.difficultyBankId
    ? priorRecords.filter((record) => record.bankId === options.difficultyBankId)
    : priorRecords

  const hintedQuestionSessions = new Set<string>()
  for (const record of difficultyRecords) {
    if (record.kind !== 'hint') continue
    hintedQuestionSessions.add(
      JSON.stringify([
        record.bankId ?? null,
        recordQuestionKey(record),
        record.date,
      ]),
    )
  }

  // First objective outcome per question per day, ignoring days where a hint
  // was used: a hinted success is not unaided evidence of mastery.
  const firstOutcomeBySession = new Map<string, GradedRecord>()
  for (const record of difficultyRecords) {
    if (record.kind !== 'graded') continue
    const key = JSON.stringify([
      record.bankId ?? null,
      recordQuestionKey(record),
      record.date,
    ])
    if (!hintedQuestionSessions.has(key) && !firstOutcomeBySession.has(key)) {
      firstOutcomeBySession.set(key, record)
    }
  }

  const latestOutcomeByQuestion = new Map<string, GradedRecord>()
  for (const record of firstOutcomeBySession.values()) {
    const composite = JSON.stringify([
      record.bankId ?? null,
      recordQuestionKey(record),
    ])
    const previous = latestOutcomeByQuestion.get(composite)
    if (!previous || (previous.occurredAt ?? '') < (record.occurredAt ?? '')) {
      latestOutcomeByQuestion.set(composite, record)
    }
  }

  const recentOutcomes = [...latestOutcomeByQuestion.values()]
    .sort((left, right) =>
      (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    )
    .slice(-TARGET_DIFFICULTY_WINDOW)
    .map((record) => record.correct)
  const targetDifficulty = deriveTargetDifficulty(recentOutcomes)

  const recordsForItem = (item: T): PracticeRecord[] => {
    const itemKey = normalizeKey(item.key)
    return priorRecords.filter((record) => {
      if (record.itemId) {
        return record.itemId === item.id && record.bankId === item.bankId
      }
      if (record.bankId !== item.bankId) return false
      if (!itemKey) return false
      const composite = JSON.stringify([item.bankId ?? null, itemKey])
      if (legacyItemCounts.get(composite) !== 1) return false
      return normalizeKey(record.key) === itemKey
    })
  }

  type Ranked = {
    item: T
    index: number
    priority: number
    dueIn: number
    lastDate: string
    difficultyFit: number
  }

  const ranked: Ranked[] = items.map((item, index) => {
    const history = recordsForItem(item)
    const attempts = history.filter(
      (record): record is GradedRecord | SupportedRecord =>
        record.kind === 'graded' || record.kind === 'supported',
    )
    const attemptsByDay = new Map<string, GradedRecord | SupportedRecord>()
    for (const attempt of attempts) attemptsByDay.set(attempt.date, attempt)
    const spacedAttempts = [...attemptsByDay.values()]
    const hints = history.filter((record) => record.kind === 'hint')
    const hintedDays = new Set(hints.map((record) => record.date))
    const difficultyFit = Math.abs((item.difficulty ?? 2) - targetDifficulty)

    if (attempts.length === 0) {
      return {
        item,
        index,
        priority: hints.length > 0 ? 0 : 2,
        dueIn: 0,
        lastDate: '',
        difficultyFit,
      }
    }

    let streak = 0
    let interval = intervals[0]
    for (const attempt of spacedAttempts) {
      if (hintedDays.has(attempt.date)) {
        streak = 0
        interval = intervals[0]
        continue
      }
      const confidence = resolvePracticeConfidence(attempt, confidenceBySession)
      if (attempt.kind === 'graded') {
        if (attempt.correct !== true) {
          streak = 0
          interval = intervals[0]
          continue
        }
      } else if (confidence === undefined || confidence === 1 || confidence === 2) {
        streak = 0
        interval = intervals[0]
        continue
      }
      streak += 1
      interval = intervals[Math.min(streak - 1, intervals.length - 1)]
      if (confidence === 1) interval = intervals[0]
      if (confidence === 2 && intervals.length > 1) {
        interval = Math.min(interval, intervals[1])
      }
    }

    const lastAttempt = spacedAttempts[spacedAttempts.length - 1]
    const lastHint = hints[hints.length - 1]
    const dueIn = interval - daysBetween(lastAttempt.date, today)
    const lastConfidence = resolvePracticeConfidence(
      lastAttempt,
      confidenceBySession,
    )
    const needsHelp =
      lastAttempt.kind === 'graded'
        ? lastAttempt.correct !== true
        : lastAttempt.support === 'with-hint' ||
          lastAttempt.support === 'revisit'
    const hintedAfterAttempt =
      lastHint !== undefined &&
      (lastHint.occurredAt ?? '') > (lastAttempt.occurredAt ?? '')
    const hintedInLastSession = hints.some(
      (hint) => hint.date === lastAttempt.date,
    )

    return {
      item,
      index,
      priority:
        needsHelp ||
        hintedAfterAttempt ||
        hintedInLastSession ||
        lastConfidence === 1
          ? 0
          : dueIn <= 0
            ? 1
            : 3,
      dueIn,
      lastDate: lastAttempt.date,
      difficultyFit,
    }
  })

  ranked.sort(
    (left, right) =>
      left.priority - right.priority ||
      (left.priority === 3 ? left.dueIn - right.dueIn : 0) ||
      left.difficultyFit - right.difficultyFit ||
      left.lastDate.localeCompare(right.lastDate) ||
      left.index - right.index,
  )

  const candidateKey = (item: T): string =>
    JSON.stringify([item.bankId ?? null, item.id])
  const selected: Ranked[] = []
  const selectedKeys = new Set<string>()
  const add = (candidate: Ranked): void => {
    const key = candidateKey(candidate.item)
    if (selected.length >= limit || selectedKeys.has(key)) return
    selected.push(candidate)
    selectedKeys.add(key)
  }

  // 1. Up to two "needs help" items lead the session.
  ranked
    .filter((candidate) => candidate.priority === 0)
    .slice(0, Math.min(2, limit))
    .forEach(add)

  // 2. Reserve part of the quota for due reviews.
  const dueReviewSlots = Math.min(
    limit - selected.length,
    Math.max(1, Math.floor(limit * 0.4)),
  )
  ranked
    .filter((candidate) => candidate.priority === 1)
    .slice(0, dueReviewSlots)
    .forEach(add)

  // 3. Fill toward the preferred bank/collection.
  const preferred = ranked.filter(
    (candidate) =>
      options.preferredBankId !== undefined &&
      candidate.item.bankId === options.preferredBankId &&
      !selectedKeys.has(candidateKey(candidate.item)),
  )
  const preferredTarget = Math.min(
    limit,
    Math.max(
      selected.length,
      Math.ceil(limit * (targetDifficulty === 2 ? 0.6 : 0.4)),
    ),
  )
  for (const candidate of preferred) {
    if (selected.length >= preferredTarget) break
    add(candidate)
  }

  const preferredGrade = items.find(
    (item) => item.bankId === options.preferredBankId,
  )?.grade

  // 4. Include one item from a same-grade, different-topic bank.
  if (preferredGrade !== undefined) {
    const alternate = ranked.find(
      (candidate) =>
        candidate.item.grade === preferredGrade &&
        candidate.item.bankId !== options.preferredBankId &&
        !selectedKeys.has(candidateKey(candidate.item)),
    )
    if (alternate) add(alternate)
  }

  // 5. Calibrate up or down one grade when the learner is clearly off-target.
  const calibratedGrade =
    preferredGrade === undefined
      ? null
      : targetDifficulty === 1
        ? Math.max(gradeRange.min, preferredGrade - 1)
        : targetDifficulty === 3
          ? Math.min(gradeRange.max, preferredGrade + 1)
          : null
  if (calibratedGrade !== null) {
    const calibrated = ranked.find(
      (candidate) =>
        candidate.item.grade === calibratedGrade &&
        !selectedKeys.has(candidateKey(candidate.item)),
    )
    if (calibrated) add(calibrated)
  }

  // 6. Fill the rest, preferring the current grade when one is known.
  for (const candidate of ranked) {
    if (
      preferredGrade === undefined ||
      candidate.item.grade === preferredGrade
    ) {
      add(candidate)
    }
  }

  return selected.map(({ item }) => item)
}
