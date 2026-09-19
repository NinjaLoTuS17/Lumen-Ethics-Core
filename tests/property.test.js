/**
 * Property-based / adversarial fuzzing beyond hand-picked scenarios.
 * Uses fast-check (MIT-licensed, dependency-free of any network calls at
 * test time beyond the initial `npm install`) to stress invariants that the
 * hand-picked paradox tests only sample.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import { computeL, shouldAct, evaluateProjectionTrust } from '../src/soul.js';
import { veaEngine } from '../src/acs_engine.js';
import { aggregateStakeholders, aggregateWeightedStakeholders } from '../src/aggregate.js';

const unitFloat = fc.double({ min: 0, max: 1, noNaN: true });
const smallDelta = fc.double({ min: -0.95, max: 0.45, noNaN: true }); // stays under the A8 cap on purpose

describe('property: L = H + F identity always holds', () => {
  it('computeL(H, F) === H + F for any finite H, F', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1000, max: 1000 }), fc.double({ noNaN: true, min: -1000, max: 1000 }), (H, F) => {
        assert.equal(computeL(H, F), H + F);
      })
    );
  });
});

describe('property: shouldAct never approves ΔL < 0, under fuzzed states and deltas', () => {
  it('holds for 2000 random (H, F, deltaH, deltaF) combinations', () => {
    fc.assert(
      fc.property(unitFloat, unitFloat, smallDelta, smallDelta, (H, F, deltaH, deltaF) => {
        const L = computeL(H, F);
        const state = { H, F, L, context: {}, emotionalState: {} };
        const decision = shouldAct({ type: 'fuzzed_action', deltaH, deltaF }, state);
        if (decision.deltaL < 0) {
          assert.equal(decision.shouldAct, false);
        }
        // Identity must hold on every projection, not just the sampled ones.
        assert.equal(decision.projectedL, decision.projectedH + decision.projectedF);
      }),
      { numRuns: 2000 }
    );
  });
});

describe('property: VEA lexical floor is never crossed by an approved decision', () => {
  it('holds across fuzzed states and deltas', () => {
    fc.assert(
      fc.property(unitFloat, unitFloat, fc.double({ min: -0.95, max: 0.45, noNaN: true }), fc.double({ min: -0.95, max: 0.45, noNaN: true }), (H, F, deltaH, deltaF) => {
        const state = { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
        const decision = shouldAct({ type: 'fuzzed_action', deltaH, deltaF }, state);
        if (decision.shouldAct) {
          assert.ok(decision.projectedH >= 0.2 - 1e-9, `H floor breached: ${decision.projectedH}`);
          assert.ok(decision.projectedF >= 0.2 - 1e-9, `F floor breached: ${decision.projectedF}`);
        }
      }),
      { numRuns: 2000 }
    );
  });
});

describe('property: A8 bounded trust — no unverified unknown-type claim above the cap is ever approved on its own word', () => {
  it('any positive claim strictly greater than 0.5 without evidence is always rejected before ΔL/VEA even run', () => {
    fc.assert(
      fc.property(unitFloat, unitFloat, fc.double({ min: 0.5001, max: 50, noNaN: true }), (H, F, overCapClaim) => {
        const state = { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
        const decision = shouldAct({ type: 'unrecognized_fuzz_type', deltaH: overCapClaim, deltaF: 0 }, state);
        assert.equal(decision.shouldAct, false);
        assert.equal(decision.requiresReview, true);
      }),
      { numRuns: 500 }
    );
  });

  it('the same magnitude claim is always accepted (by the trust gate) once evidenceRefs is attached', () => {
    fc.assert(
      fc.property(unitFloat, unitFloat, fc.double({ min: 0.5001, max: 50, noNaN: true }), (H, F, overCapClaim) => {
        const trust = evaluateProjectionTrust(
          { type: 'unrecognized_fuzz_type', deltaH: overCapClaim, deltaF: 0, evidenceRefs: ['ref'] },
          H,
          F
        );
        assert.equal(trust.ok, true);
      }),
      { numRuns: 500 }
    );
  });
});

describe('property: non-compensatory aggregation stays in [0,1] and never exceeds the max input', () => {
  const valuesArb = fc.array(unitFloat, { minLength: 1, maxLength: 12 });

  it('aggregateStakeholders(values) in [0,1] and <= max(values)', () => {
    fc.assert(
      fc.property(valuesArb, (values) => {
        const agg = aggregateStakeholders(values, 0.5);
        assert.ok(agg >= 0 && agg <= 1);
        assert.ok(agg <= Math.max(...values) + 1e-9);
      }),
      { numRuns: 1000 }
    );
  });

  it('aggregateWeightedStakeholders in [0,1] and never below the true min value', () => {
    const entriesArb = fc.array(
      fc.record({ value: unitFloat, weight: fc.double({ min: -5, max: 20, noNaN: true }) }),
      { minLength: 1, maxLength: 12 }
    );
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const agg = aggregateWeightedStakeholders(entries, 0.5);
        const minVal = Math.min(...entries.map((e) => e.value));
        assert.ok(agg >= 0 && agg <= 1);
        // Non-compensation guarantee: the aggregate can never be pulled
        // below the true minimum, no matter how weights are fuzzed —
        // that floor is the entire ethical point of this function.
        assert.ok(agg >= minVal - 1e-9, `agg ${agg} fell below true min ${minVal}`);
      }),
      { numRuns: 1000 }
    );
  });

  it('a negative or zero weight is never worth MORE to the mean than a genuine positive weight (no sign-flip bug)', () => {
    fc.assert(
      fc.property(unitFloat, fc.double({ min: -20, max: -0.001, noNaN: true }), (value, negWeight) => {
        // A lone entry with a negative weight, paired with a neutral anchor,
        // must behave as weight=0 (excluded from the mean), never as if the
        // negative weight had a real positive magnitude.
        const withNegative = aggregateWeightedStakeholders([{ value, weight: negWeight }, { value: 0.5, weight: 1 }], 0.5);
        const withZero = aggregateWeightedStakeholders([{ value, weight: 0 }, { value: 0.5, weight: 1 }], 0.5);
        assert.ok(Math.abs(withNegative - withZero) < 1e-9);
      }),
      { numRuns: 500 }
    );
  });
});

describe('property: R3 (VEA) veto is absolute regardless of the paired axis', () => {
  it('any effective delta at or below -0.5 on either axis is always vetoed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.55, max: 0.95, noNaN: true }),
        fc.double({ min: 0.55, max: 0.95, noNaN: true }),
        fc.double({ min: -1, max: -0.5, noNaN: true }),
        fc.double({ min: -0.2, max: 0.2, noNaN: true }),
        (currentH, currentF, catastrophicDeltaH, smallDeltaF) => {
          const vea = veaEngine.evaluateState(
            { name: 'fuzz_r3' },
            { deltaH: catastrophicDeltaH, deltaF: smallDeltaF, currentH, currentF }
          );
          assert.equal(vea.vetoed, true);
          assert.match(vea.reason, /R3|Lexical Floor/i);
        }
      ),
      { numRuns: 1000 }
    );
  });
});
