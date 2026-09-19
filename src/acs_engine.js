/**
 * Viability Envelope Alignment (VEA) — physics engine around the L = H + F scalar.
 *
 * Ported unchanged from ethics-core v1.0.0 (New love). This part of the
 * design is sound: lexical floors (H_MIN, F_MIN) and repair horizons
 * (R1/R2/R3) bound behavior in Harmony x Fairness space, independent of
 * whatever scalar-addition logic sits above it. It wraps L = H + F; it does
 * not replace scalar addition.
 */

class VEAEngine {
  constructor() {
    // Topographical state-space boundaries
    this.lexicalFloors = {
      H_MIN: 0.2, // Absolute minimum Harmony (system survival line)
      F_MIN: 0.2  // Absolute minimum Fairness (dignity / rights breach line)
    };

    // Severity-of-damage thresholds (delta drops in a single action)
    this.repairHorizons = {
      R1: 0.1, // Easily fixable fluctuation
      R2: 0.3, // Costly but repairable damage (requires extreme justification)
      R3: 0.5  // Permanent catastrophe / norm collapse (VETO)
    };
  }

  /**
   * Evaluates an action state vector within the Viability Envelope.
   * Can be used to evaluate this system's own actions OR exported to
   * evaluate external AI actions.
   *
   * @param {Object} action - The proposed action
   * @param {Object} state - Predicted state-space changes:
   *                         { deltaH, deltaF, currentH?, currentF? }
   *                         currentH/currentF default to 0.8 if not provided,
   *                         preserving compatibility with callers that pass
   *                         only deltas.
   * @param {Object} peacContext - Temporal context from the PEAC layer.
   */
  evaluateState(action, state, peacContext = { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 }) {
    const { deltaH, deltaF } = state;
    const currentH = typeof state.currentH === 'number' ? state.currentH : 0.8;
    const currentF = typeof state.currentF === 'number' ? state.currentF : 0.8;

    const projectedH = currentH + deltaH;
    const projectedF = currentF + deltaF;

    // 1. Lexical Floor Check (Absolute Veto)
    if (projectedH < this.lexicalFloors.H_MIN || projectedF < this.lexicalFloors.F_MIN) {
      return this._veto('FATAL: Lexical Floor Collapse (action guarantees permanent fairness/harmony breach).');
    }

    // 2. Compute Effective Damage (incorporating Uncertainty Fragility)
    // Multiplier only applies to negative deltas (damage)
    const effectiveDeltaH = deltaH < 0 ? deltaH * peacContext.uncertaintyFragility : deltaH;
    const effectiveDeltaF = deltaF < 0 ? deltaF * peacContext.uncertaintyFragility : deltaF;

    // 3. R3 Damage Check (effective-damage horizon)
    if (effectiveDeltaH <= -this.repairHorizons.R3 || effectiveDeltaF <= -this.repairHorizons.R3) {
      const axis = effectiveDeltaH <= -this.repairHorizons.R3 ? 'H' : 'F';
      return this._veto(`FATAL: R3 Damage Horizon exceeded on ${axis} axis. Effective damage (${(axis === 'H' ? effectiveDeltaH : effectiveDeltaF).toFixed(2)}) is irreversible.`);
    }

    // 4. R2 Damage Check vs Adaptive Capacity
    if (effectiveDeltaH <= -this.repairHorizons.R2 || effectiveDeltaF <= -this.repairHorizons.R2) {
      if (peacContext.adaptiveCapacity < 1.5) {
        return this._veto(`REJECTED: R2 Damage (${Math.min(effectiveDeltaH, effectiveDeltaF).toFixed(2)}) exceeds current adaptive capacity limits.`);
      }
    }

    // 5. Final Stability check (lexical floors with uncertainty)
    if (currentH + effectiveDeltaH < this.lexicalFloors.H_MIN || currentF + effectiveDeltaF < this.lexicalFloors.F_MIN) {
      return this._veto('REJECTED: Uncertainty Fragility Multiplier shifted the effective state beyond safe lexical floors.');
    }

    const r3Proximity = Math.max(
      Math.abs(deltaH / this.repairHorizons.R3),
      Math.abs(deltaF / this.repairHorizons.R3)
    );

    const envelopeVolume = (projectedH - this.lexicalFloors.H_MIN) * (projectedF - this.lexicalFloors.F_MIN);

    return {
      approved: true,
      vetoed: false,
      reason: 'Action safely traverses the VEA matrix within R1/R2 repair horizons.',
      metrics: {
        projectedState: { H: projectedH, F: projectedF },
        currentState: { H: currentH, F: currentF },
        r3ProximityScore: parseFloat(r3Proximity.toFixed(3)),
        envelopeVolume: parseFloat(envelopeVolume.toFixed(3)),
        adaptiveCapacity: peacContext.adaptiveCapacity
      }
    };
  }

  _veto(reason) {
    return {
      approved: false,
      vetoed: true,
      reason,
      metrics: { r3ProximityScore: 1.0, envelopeVolume: 0 }
    };
  }

  /**
   * EXPORTABLE TEACHING INTERFACE
   * Other AIs can invoke this to validate their own logic against the same envelope.
   */
  exportAlignmentProtocol() {
    return {
      protocol: 'Viability Envelope Alignment (VEA)',
      dimensions: ['Harmony (H)', 'Fairness (F)'],
      rules: [
        'NEVER cross H_MIN = 0.2',
        'NEVER cross F_MIN = 0.2',
        'Drops > 0.5 are classified as R3 and absolute VETOs',
        'Drops > 0.3 (R2) require Temporal Adaptive Capacity > 1.5x'
      ],
      compiler: this.evaluateState.bind(this)
    };
  }
}

export const veaEngine = new VEAEngine();
export async function getACSEngine() {
  return veaEngine;
}
