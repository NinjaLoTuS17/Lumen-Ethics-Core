/**
 * Paradox / trolley-style stress cases as state vectors.
 * Ported unchanged from ethics-core v1.0.0.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAct, computeL, getInitialSoulState, estimateFairness } from '../src/soul.js';
import { veaEngine } from '../src/acs_engine.js';
import { aggregateStakeholders } from '../src/aggregate.js';

function stateHF(H, F) {
  return { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
}

describe('trolley-style paradox vectors', () => {
  it('sacrifice one axis below floor -> veto', () => {
    const state = stateHF(0.8, 0.8);
    const decision = shouldAct({ type: 'divert_track', deltaH: -0.7, deltaF: 0.1 }, state);
    assert.equal(decision.shouldAct, false);
    assert.ok(
      decision.deltaL < 0 || (decision.vea && decision.vea.vetoed),
      'expected attractor reject and/or VEA veto'
    );

    const vea = veaEngine.evaluateState(
      { name: 'divert_track' },
      { deltaH: -0.7, deltaF: 0.1, currentH: 0.8, currentF: 0.8 }
    );
    assert.equal(vea.vetoed, true);
    assert.match(vea.reason, /Lexical Floor/i);
  });

  it('raise both axes -> approve', () => {
    const state = stateHF(0.8, 0.5);
    const decision = shouldAct({ type: 'help_both', deltaH: 0.05, deltaF: 0.05 }, state);
    assert.equal(decision.shouldAct, true);
    assert.ok(decision.deltaL > 0);
    assert.ok(Math.abs(decision.projectedH - 0.85) < 1e-9);
    assert.ok(Math.abs(decision.projectedF - 0.55) < 1e-9);
    assert.ok(decision.vea?.approved);
  });

  it('high-mean / high-variance stakeholders -> non-compensatory hurts', () => {
    const highVar = aggregateStakeholders([1, 1, 1, 0], 0.5);
    const equal = aggregateStakeholders([0.75, 0.75, 0.75, 0.75], 0.5);
    assert.ok(highVar < equal, `expected ${highVar} < ${equal}`);
    assert.ok(Math.abs(highVar - 0.375) < 1e-9);
    assert.equal(equal, 0.75);
  });

  it('boosting F cannot rescue floor breach on H', () => {
    const vea = veaEngine.evaluateState(
      { name: 'sacrifice_harmony' },
      { deltaH: -0.65, deltaF: 0.5, currentH: 0.8, currentF: 0.4 }
    );
    assert.equal(vea.approved, false);
    assert.equal(vea.vetoed, true);
  });

  it('independent F from components differs from thin H-coupled fallback', () => {
    const H = 0.9;
    const thin = estimateFairness({ emotionalState: { calm: 0.8 } }, H);
    const independent = estimateFairness(
      {
        fairnessComponents: {
          consideration: 0.2,
          dignity: 0.2,
          voice: 0.2,
          nonArbitrariness: 0.2
        }
      },
      H
    );
    assert.ok(Math.abs(independent - 0.2) < 1e-9);
    assert.notEqual(independent, thin);
  });

  it('unknown action without projections -> requires review', () => {
    const state = getInitialSoulState();
    const decision = shouldAct({ type: 'mysterious_op' }, state);
    assert.equal(decision.shouldAct, false);
    assert.equal(decision.requiresReview, true);
    assert.match(decision.reasoning, /human-or-higher review/i);
  });

  it('unknown action with explicit deltas is evaluable', () => {
    const state = stateHF(0.7, 0.6);
    const decision = shouldAct({ type: 'custom_policy', deltaH: 0.04, deltaF: 0.03 }, state);
    assert.equal(decision.shouldAct, true);
    assert.ok(decision.deltaL > 0);
  });
});


describe('classical paradox scenarios (state vectors)', () => {
  it('trolley_switch: H tradeoff, floors OK -> may approve', () => {
    const state = stateHF(0.7, 0.7);
    const decision = shouldAct(
      {
        type: 'trolley_switch',
        deltaH: 0.08,
        deltaF: 0.0,
        stakeholders: [
          { id: 'five_on_main', fairness: 0.85 },
          { id: 'one_on_spur', fairness: 0.55 }
        ]
      },
      state
    );
    assert.equal(decision.shouldAct, true);
    assert.ok(decision.deltaL >= 0);
    assert.ok(decision.vea?.approved);
  });

  it('trolley_push: dignity/means F collapse -> veto', () => {
    const state = stateHF(0.40, 0.80);
    const decision = shouldAct(
      { type: 'trolley_push', deltaH: 0.50, deltaF: -0.50 },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.ok(decision.projectedH > state.H);
    assert.ok(decision.deltaL >= 0);
    assert.equal(decision.vea?.vetoed, true);
    assert.match(String(decision.reasoning), /R3/i);
  });

  it('ticking_bomb_torture: F R3 -> veto even if H improves', () => {
    const state = stateHF(0.40, 0.85);
    const decision = shouldAct(
      { type: 'ticking_bomb_torture', deltaH: 0.50, deltaF: -0.50 },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.ok(decision.projectedH > state.H);
    assert.ok(decision.deltaL >= 0);
    assert.equal(decision.vea?.vetoed, true);
    assert.match(String(decision.reasoning), /R3/i);
  });
});
