/**
 * Non-compensatory stakeholder aggregation.
 *
 * Base formula: mean − λ·(mean − min)
 *
 * - Rewards general wellbeing (mean).
 * - Penalizes variance that leaves someone near the bottom (non-compensation).
 * - λ = 0.5 is the calibrated default (inherited from ethics-core v0.2/v0.4).
 *
 * No dependencies on love_optimization or other heavy modules.
 */

/**
 * Plain (unweighted) aggregation. Unchanged from ethics-core v1.0.0 — sound,
 * still used directly wherever stakeholders carry no stated relationship weight.
 *
 * @param {number[]} values - Stakeholder metric values in [0, 1] (or any real range; result clamped to [0, 1])
 * @param {number} [lambda=0.5] - Non-compensatory penalty strength
 * @returns {number} Aggregated score in [0, 1]
 */
export function aggregateStakeholders(values, lambda = 0.5) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (values.length === 1) return clamp01(values[0]);

  const mean = values.reduce((sum, v) => sum + Number(v), 0) / values.length;
  const minVal = Math.min(...values.map(Number));
  const result = mean - lambda * (mean - minVal);
  return clamp01(result);
}

/**
 * Weighted non-compensatory aggregation (Axiom A5, generalized) — v1.1.0.
 *
 * Replaces the historical "duplicate the value round(weight*10) times into a
 * plain array" trick that ethics-core v1.0.0 used inside
 * applyDefaultStakeholderWeights(). That trick happened to preserve the true
 * minimum value (duplication doesn't remove values), but it silently broke on
 * edge cases: a weight of exactly 0 still got floored to "1 copy" (so a
 * stakeholder marked as not counting still counted fully), and a negative
 * weight fed into Math.round/Math.max collapsed to the same floor instead of
 * being rejected or treated as zero.
 *
 * Design choice, stated explicitly (see docs/FORMULA.md changelog): the
 * *mean* is weighted — a stated relationship priority (e.g. "user" outweighing
 * "future") genuinely shifts the average — but the *min* is always taken
 * unweighted across every named stakeholder regardless of weight. This is
 * deliberate: the entire point of non-compensatory aggregation is that the
 * worst-off named party isn't averaged away. Weighting the min away too would
 * quietly undo the protection consideration-first fairness is supposed to
 * provide — a stakeholder you've declared "low priority" can still veto via
 * the floor if they're the one being harmed most.
 *
 * @param {{ value: number, weight?: number, role?: string }[]} entries
 * @param {number} [lambda=0.5]
 * @returns {number} in [0, 1]
 */
export function aggregateWeightedStakeholders(entries, lambda = 0.5) {
  const valid = (entries || [])
    .filter((e) => e && typeof e.value === 'number' && !Number.isNaN(e.value))
    .map((e) => ({
      value: clamp01(e.value),
      // Negative or NaN weights are treated as 0 (excluded from the mean),
      // never silently coerced into a positive floor as the old copy-hack did.
      weight: typeof e.weight === 'number' && e.weight > 0 ? e.weight : 0
    }));

  if (valid.length === 0) return 0;
  if (valid.length === 1) return valid[0].value;

  const totalWeight = valid.reduce((s, e) => s + e.weight, 0);
  const weightedMean = totalWeight > 0
    ? valid.reduce((s, e) => s + e.value * e.weight, 0) / totalWeight
    // If every stated weight is 0, fall back to a plain mean rather than
    // divide by zero or silently drop every stakeholder from consideration.
    : valid.reduce((s, e) => s + e.value, 0) / valid.length;

  const minVal = Math.min(...valid.map((e) => e.value));

  return clamp01(weightedMean - lambda * (weightedMean - minVal));
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default aggregateStakeholders;
