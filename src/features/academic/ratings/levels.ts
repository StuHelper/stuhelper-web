import type { Recommendation } from '../api'

/** The five rating dimensions in contract order, with their translated level names. */
export const dimensionNames = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const
export type DimensionName = (typeof dimensionNames)[number]

export const dimensionLabelKeys: Record<DimensionName, string> = {
  recommendation: 'browse.recommendation',
  quality: 'browse.dimQuality',
  difficulty: 'browse.dimDifficulty',
  workload: 'browse.dimWorkload',
  grading: 'browse.dimGrading',
}

/** Level 0 means "not enough data"; 1-5 are the five bands. No exact score is shown anywhere. */
export const levelKeys: Record<DimensionName, readonly string[]> = {
  recommendation: ['browse.levelNone', 'browse.levelStronglyNot', 'browse.levelNotRecommended', 'browse.levelAverage', 'browse.levelRecommended', 'browse.levelStrongly'],
  quality: ['browse.levelNone', 'browse.levelVeryPoor', 'browse.levelPoor', 'browse.levelAverage', 'browse.levelGood', 'browse.levelVeryGood'],
  difficulty: ['browse.levelNone', 'browse.levelVeryEasy', 'browse.levelEasy', 'browse.levelModerate', 'browse.levelHard', 'browse.levelVeryHard'],
  workload: ['browse.levelNone', 'browse.levelVeryLittle', 'browse.levelLittle', 'browse.levelModerate', 'browse.levelMuch', 'browse.levelVeryMuch'],
  grading: ['browse.levelNone', 'browse.gradingVeryPoor', 'browse.gradingPoor', 'browse.levelAverage', 'browse.gradingGood', 'browse.gradingVeryGood'],
}

/**
 * The server publishes four recommendation bands (fewer than the configured minimum of
 * reviews is "unrated"). They map onto the top four of the five recommendation levels so
 * the same faces and words are used everywhere.
 */
export const recommendationLevel: Record<Recommendation, number> = {
  unrated: 0,
  not_recommended: 2,
  average: 3,
  recommended: 4,
  strongly_recommended: 5,
}
