import type { Confidence } from './types.ts'

/**
 * How many recent first-objective outcomes feed difficulty calibration. Keep it
 * short: the engine should track a learner who is currently improving, not
 * their all-time average.
 */
export const TARGET_DIFFICULTY_WINDOW = 8

/** The difficulty the engine should aim for, from the outcomes it was given. */
export const deriveTargetDifficulty = (recentOutcomes: boolean[]): 1 | 2 | 3 => {
  const window = recentOutcomes.slice(-TARGET_DIFFICULTY_WINDOW)
  if (window.length < 5) return 2
  const average =
    window.reduce((sum, correct) => sum + (correct ? 1 : 0), 0) / window.length
  if (average < 0.55) return 1
  if (average >= 0.8) return 3
  return 2
}

/** One completed task result, used for ordering and mastery. */
export interface TaskResult {
  skill: string
  correctCount?: number
  questionCount?: number
  correct?: boolean
  confidence?: Confidence
}

const difficultyChange = (result: TaskResult): number => {
  const graded =
    typeof result.correctCount === 'number' &&
    typeof result.questionCount === 'number' &&
    result.questionCount > 0
      ? result.correctCount / result.questionCount
      : null
  if (graded === null) {
    if (result.correct === false || result.confidence === 1) return 1
    return -0.5
  }
  if (graded < 0.6 || result.confidence === 1) return 1
  if (graded >= 0.8) return -0.5
  return 0
}

/**
 * Order tasks so the skills a learner has recently struggled with come first,
 * and the ones they are finding easy move to the back. Ties keep the input
 * order, so the caller's default ordering still decides the baseline.
 */
export const orderTasksByDifficulty = <T extends { skill: string }>(
  tasks: T[],
  results: TaskResult[],
  window = 12,
): T[] => {
  const difficulty = new Map<string, number>()
  for (const task of tasks) difficulty.set(task.skill, 0)
  for (const result of results.slice(-window)) {
    difficulty.set(
      result.skill,
      (difficulty.get(result.skill) ?? 0) + difficultyChange(result),
    )
  }
  return [...tasks].sort(
    (left, right) =>
      (difficulty.get(right.skill) ?? 0) - (difficulty.get(left.skill) ?? 0),
  )
}

export interface SkillMastery {
  /** `0` unknown, `1` needs more practice, `2` practicing, `3` steady. */
  level: 0 | 1 | 2 | 3
  /** Accumulated evidence behind the level. */
  evidence: number
  /** How many recent results were considered. */
  sampleSize: number
}

/**
 * Summarize a skill's recent performance into a coarse level. Deliberately
 * conservative: `steady` requires at least three results and net-positive
 * evidence, and `needs more practice` at least two results and net-negative
 * evidence, so a single lucky or unlucky attempt does not move the label.
 */
export const summarizeSkillMastery = (
  results: TaskResult[],
  window = 5,
): SkillMastery => {
  const recent = results.slice(-window)
  if (recent.length === 0) return { level: 0, evidence: 0, sampleSize: 0 }

  const evidence = recent.reduce((score, result) => {
    const graded =
      typeof result.correctCount === 'number' &&
      typeof result.questionCount === 'number' &&
      result.questionCount > 0
        ? result.correctCount / result.questionCount
        : null
    if (graded !== null) {
      if (graded < 0.6 || result.confidence === 1) return score - 1
      if (graded >= 0.8) return score + 1
      return score
    }
    if (result.correct === false || result.confidence === 1) return score - 1
    if (result.correct === true || result.confidence === 3) return score + 1
    return score
  }, 0)

  if (recent.length >= 2 && evidence <= -2) {
    return { level: 1, evidence, sampleSize: recent.length }
  }
  if (recent.length >= 3 && evidence >= 2) {
    return { level: 3, evidence, sampleSize: recent.length }
  }
  return { level: 2, evidence, sampleSize: recent.length }
}
