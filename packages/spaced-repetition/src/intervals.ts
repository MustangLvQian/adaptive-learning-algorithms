/** The default expanding interval ladder, in days. */
export const DEFAULT_REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14]

/** Default daily review quota. */
export const DEFAULT_REVIEW_LIMIT = 5

/**
 * Keep only positive integer intervals, preserving the given order. Falls back
 * to {@link DEFAULT_REVIEW_INTERVALS} when nothing valid is supplied, so a
 * malformed configuration can never produce a zero-length ladder.
 */
export const normalizeIntervals = (
  intervals?: readonly number[],
): number[] => {
  const valid = (intervals ?? []).filter(
    (interval) => Number.isInteger(interval) && interval > 0,
  )
  return valid.length > 0 ? [...valid] : [...DEFAULT_REVIEW_INTERVALS]
}

const MS_PER_DAY = 86_400_000

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`), measured at UTC
 * noon for timezone-independent rounding.
 */
export const daysBetween = (from: string, to: string): number => {
  const start = Date.parse(`${from}T12:00:00Z`)
  const end = Date.parse(`${to}T12:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / MS_PER_DAY)
}
