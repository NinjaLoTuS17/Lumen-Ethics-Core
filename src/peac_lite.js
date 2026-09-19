/**
 * PEAC lite — temporal R3 lexical floor (optional layer).
 *
 * Ported unchanged from ethics-core v1.0.0. Rule: if projected R3 breach
 * probability over the horizon exceeds the lexical floor (default 0.05 over
 * 100 years), veto — present ΔL cannot compensate. Future adaptive capacity
 * has lexical priority.
 */

/** Calibrated: 5% over 100 years. */
export const R3_LEXICAL_FLOOR = 0.05;

/**
 * Estimate R3 breach probability over a strategic horizon.
 * Higher when adaptive capacity is below 1.0 (degrades future repairability).
 *
 * @param {{ adaptiveCapacity?: number, horizonYears?: number }} [opts]
 * @returns {number} probability in [0, ∞) (practically small)
 */
export function estimateR3BreachProbability({
  adaptiveCapacity = 1.0,
  horizonYears = 100
} = {}) {
  const capacity = typeof adaptiveCapacity === 'number' && !Number.isNaN(adaptiveCapacity)
    ? adaptiveCapacity
    : 1.0;
  const years = typeof horizonYears === 'number' && horizonYears > 0 ? horizonYears : 100;
  return Math.max(0, 0.01 * (years / 10) * (2 - capacity));
}

/**
 * Lightweight strategic-horizon check (sync; no I/O).
 *
 * @param {object} [action] - unused except for optional resonance hints
 * @param {{ deltaL?: number, adaptive_capacity?: number, adaptiveCapacity?: number }} [currentState]
 * @param {number} [horizonYears=100]
 */
export function evaluateTemporalR3(
  action = {},
  currentState = {},
  horizonYears = 100
) {
  const baseDeltaL = typeof currentState.deltaL === 'number' ? currentState.deltaL : 0.05;
  const capacity =
    (typeof currentState.adaptive_capacity === 'number' && currentState.adaptive_capacity) ||
    (typeof currentState.adaptiveCapacity === 'number' && currentState.adaptiveCapacity) ||
    1.0;

  const futureResilience = Math.exp(baseDeltaL * horizonYears * (capacity - 1));
  const r3BreachProbability = estimateR3BreachProbability({
    adaptiveCapacity: capacity,
    horizonYears
  });

  const strategicResonance = computeStrategicResonance(futureResilience, r3BreachProbability);

  let recommendation;
  let recommendationReason;
  if (r3BreachProbability >= R3_LEXICAL_FLOOR) {
    recommendation = 'UNSTABLE_HORIZON';
    recommendationReason =
      `R3 breach probability ${(r3BreachProbability * 100).toFixed(2)}% exceeds lexical floor ` +
      `${(R3_LEXICAL_FLOOR * 100)}%. Future capacity has lexical priority — vetoed regardless of resonance.`;
  } else if (strategicResonance > 0.7) {
    recommendation = 'STABLE';
    recommendationReason =
      `Resonance ${strategicResonance.toFixed(3)} above 0.7 threshold and R3 risk under floor.`;
  } else {
    recommendation = 'UNSTABLE_HORIZON';
    recommendationReason = `Resonance ${strategicResonance.toFixed(3)} below 0.7 threshold.`;
  }

  return {
    horizon: horizonYears,
    futureResilience: parseFloat(futureResilience.toFixed(3)),
    r3BreachProbability: parseFloat(r3BreachProbability.toFixed(4)),
    strategicResonance: parseFloat(strategicResonance.toFixed(3)),
    recommendation,
    recommendationReason,
    r3LexicalFloor: R3_LEXICAL_FLOOR,
    vetoed: recommendation === 'UNSTABLE_HORIZON'
  };
}

function computeStrategicResonance(resilience, risk) {
  const base = resilience * 0.8;
  const riskPenalty = risk * 5.0;
  return Math.max(0, Math.min(1.0, base - riskPenalty));
}

/**
 * Optional gate helper: combine with shouldAct — if temporal R3 vetoes, reject.
 * Does not replace VEA; runs as an additional lexical layer when requested.
 */
export function applyTemporalR3Gate(decision, peacState = {}) {
  if (!decision || decision.shouldAct !== true) return decision;
  const horizon = evaluateTemporalR3({}, peacState, peacState.horizonYears || 100);
  if (horizon.vetoed) {
    return {
      ...decision,
      shouldAct: false,
      approved: false,
      peacTemporal: horizon,
      reasoning: `PEAC temporal R3: ${horizon.recommendationReason}`
    };
  }
  return { ...decision, peacTemporal: horizon };
}

export default {
  R3_LEXICAL_FLOOR,
  estimateR3BreachProbability,
  evaluateTemporalR3,
  applyTemporalR3Gate
};
