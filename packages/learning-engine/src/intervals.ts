/** The default expanding interval ladder, in days. */
export const DEFAULT_REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14]

/** Default number of items selected per skill per day. */
export const DEFAULT_PRACTICE_LIMIT = 5

/**
 * Keep only positive integer intervals, preserving order. Falls back to
 * {@link DEFAULT_REVIEW_INTERVALS} when nothing valid is supplied.
 */
export const normalizeIntervals = (
  intervals?: readonly number[],
): number[] => {
  const valid = (intervals ?? []).filter(
    (interval) => Number.isInteger(interval) && interval > 0,
  )
  return valid.length > 0 ? [...valid] : [...DEFAULT_REVIEW_INTERVALS]
}

/** Trim and lowercase a learning key so matching is case-insensitive. */
export const normalizeKey = (key: string | undefined): string =>
  (key ?? '').trim().toLocaleLowerCase()

const MS_PER_DAY = 86_400_000

/** Whole calendar days from `from` to `to`, measured at UTC noon. */
export const daysBetween = (from: string, to: string): number => {
  const start = Date.parse(`${from}T12:00:00Z`)
  const end = Date.parse(`${to}T12:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / MS_PER_DAY)
}
