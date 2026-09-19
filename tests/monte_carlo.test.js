/**
 * Monte Carlo invariant stress - random H,F,deltaH,deltaF.
 * Ported unchanged from ethics-core v1.0.0.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeL, shouldAct } from '../src/soul.js';
import { veaEngine } from '../src/acs_engine.js';
import { aggregateStakeholders } from '../src/aggregate.js';

const N = 5000;

function rnd(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

describe('Monte Carlo invariants', () => {
  it(`N=${N}: L=H+F; floors veto; R3 veto; never approve ΔL<0`, () => {
    let floorVetoes = 0;
    let r3Vetoes = 0;
    let attractorRejects = 0;
    let approvals = 0;

    for (let i = 0; i < N; i++) {
      const H = rnd(0, 1);
      const F = rnd(0, 1);
      const L = computeL(H, F);
      assert.equal(L, H + F);

      // Bounded to stay under the A8 unverified-positive-delta cap (0.5) so
      // this stress test continues exercising ΔL/VEA math, not the new
      // trust gate (that gate has its own dedicated tests).
      const deltaH = rnd(-0.9, 0.4);
      const deltaF = rnd(-0.9, 0.4);
      const state = { H, F, L, context: {}, emotionalState: {} };

      const decision = shouldAct(
        { type: 'mc_action', deltaH, deltaF },
        state,
        { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 }
      );

      const projectedH = decision.projectedH;
      const projectedF = decision.projectedF;
      const projectedL = decision.projectedL;
      assert.equal(projectedL, projectedH + projectedF);

      const deltaL = projectedL - L;
      assert.ok(Math.abs(decision.deltaL - deltaL) < 1e-12);

      if (deltaL < 0) {
        assert.equal(decision.shouldAct, false, 'must never approve ΔL<0');
        attractorRejects++;
        continue;
      }

      const vea = veaEngine.evaluateState(
        { name: 'mc_action' },
        { deltaH, deltaF, currentH: H, currentF: F },
        { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 }
      );

      if (projectedH < 0.2 || projectedF < 0.2) {
        assert.equal(vea.vetoed, true);
        assert.equal(decision.shouldAct, false);
        floorVetoes++;
        continue;
      }

      const effH = deltaH < 0 ? deltaH : deltaH;
      const effF = deltaF < 0 ? deltaF : deltaF;
      if (effH <= -0.5 || effF <= -0.5) {
        assert.equal(vea.vetoed, true);
        assert.equal(decision.shouldAct, false);
        r3Vetoes++;
        continue;
      }

      if (decision.shouldAct) {
        assert.ok(decision.deltaL >= 0);
        assert.ok(decision.vea?.approved);
        approvals++;
      } else {
        assert.equal(decision.shouldAct, false);
      }
    }

    // Sanity: we actually exercised multiple branches
    assert.ok(attractorRejects > 0, 'expected some ΔL<0 rejects');
    assert.ok(floorVetoes + r3Vetoes + approvals > 0, 'expected some envelope activity');
  });

  it('aggregateStakeholders stays in [0,1] under random vectors', () => {
    for (let i = 0; i < 1000; i++) {
      const n = 2 + Math.floor(Math.random() * 6);
      const values = Array.from({ length: n }, () => rnd());
      const agg = aggregateStakeholders(values, 0.5);
      assert.ok(agg >= 0 && agg <= 1);
      assert.ok(agg <= Math.max(...values) + 1e-12);
    }
  });
});
