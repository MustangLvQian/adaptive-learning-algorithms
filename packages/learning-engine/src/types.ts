/** Self-rated recall confidence: `1` needed help, `2` unsure, `3` sure. */
export type Confidence = 1 | 2 | 3

/** How independently an open-ended item was answered. */
export type ResponseSupport =
  | 'independent'
  | 'with-hint'
  | 'revisit'
  | 'unreported'

/** An item that can be scheduled for practice. */
export interface PracticeItem {
  /** Stable identifier, unique within its bank. */
  id: string
  /** Collection the item belongs to (a topic, unit or vocabulary list). */
  bankId?: string
  /** Grade/level of the item's source, used for difficulty calibration. */
  grade?: number
  /** Normalized learning key, e.g. the focus word. */
  key?: string
  /** Authored difficulty, roughly `1` (easy) to `3` (hard). */
  difficulty?: number
}

interface RecordBase {
  /** Optional event id; last-resort identity when no item id or key is set. */
  id?: string
  itemId?: string
  key?: string
  bankId?: string
  /** Calendar day, `YYYY-MM-DD`. */
  date: string
  /** ISO timestamp; orders records that share a `date`. */
  occurredAt?: string
  /** Session the record belongs to, for confidence matching. */
  sessionId?: string
}

/** An objectively checked attempt (multiple choice, dictation, ...). */
export interface GradedRecord extends RecordBase {
  kind: 'graded'
  correct: boolean
}

/** An open-ended attempt (speaking, writing) with no machine grade. */
export interface SupportedRecord extends RecordBase {
  kind: 'supported'
  support?: ResponseSupport
}

/** A recorded hint request. */
export interface HintRecord extends RecordBase {
  kind: 'hint'
}

export type PracticeRecord = GradedRecord | SupportedRecord | HintRecord

/**
 * A self-rated confidence for a session, matched to attempts by `date` +
 * `sessionId` when the attempt carries no inline `support`.
 */
export interface ConfidenceRating {
  date: string
  sessionId?: string
  occurredAt?: string
  confidence: Confidence
}
