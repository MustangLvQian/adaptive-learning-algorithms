/**
 * Self-rated recall confidence.
 *
 * `1` means the learner needed help, `2` means they were unsure, `3` means they
 * were sure. A low rating never advances an item as far as an unaided success.
 */
export type Confidence = 1 | 2 | 3

/**
 * How independently an open-ended item was answered. Open-ended items (speaking,
 * writing) cannot be machine-graded, so the app reports support instead.
 */
export type ResponseSupport =
  | 'independent'
  | 'with-hint'
  | 'revisit'
  | 'unreported'

/** An item that participates in spaced review. */
export interface ReviewItem {
  /** Stable identifier, returned unchanged in the results. */
  id: string
  /**
   * Normalized learning key — for a vocabulary app this is the focus word.
   * Items that share a key share review history. Matching is case-insensitive
   * and whitespace-trimmed.
   */
  key: string
}

/**
 * One graded or supported encounter with an item.
 *
 * Set `correct` for objectively checkable items (multiple choice, dictation).
 * Set `responseSupport` for open-ended items that cannot be machine-graded. An
 * encounter with neither is treated conservatively as not-yet-learned.
 *
 * Supply the full attempt history: the scheduler itself ignores encounters
 * dated on or after `today`, and collapses multiple encounters on the same day
 * to the latest one.
 */
export interface ReviewAttempt {
  /** Learning key of the item that was practiced. */
  key: string
  /** Calendar day of the encounter, `YYYY-MM-DD`. */
  date: string
  /** ISO timestamp; orders encounters that share a `date`. */
  occurredAt?: string
  /** Objective correctness for checkable items. */
  correct?: boolean
  /** Reported support level for open-ended items. */
  responseSupport?: ResponseSupport
  /**
   * Session this encounter belongs to. Lets a separate {@link ConfidenceRating}
   * attach to the encounter without needing to be passed inline.
   */
  sessionId?: string
}

/**
 * A self-rated confidence for a practice session. It is matched to attempts by
 * `date` + `sessionId`; when several ratings share a session, the latest one
 * (by `occurredAt`) wins.
 */
export interface ConfidenceRating {
  date: string
  sessionId?: string
  occurredAt?: string
  confidence: Confidence
}
