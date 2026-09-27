// 0–1 score → "x.x" on the /10 scale. Clamped: normalization can overshoot 1 by epsilon
// (RatingProgressBox warns on it), which would otherwise render an impossible "10.1".
export const formatBadgeScore = (score: number) => (Math.min(1, score) * 10).toFixed(1);
