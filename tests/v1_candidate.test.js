/**
 * Carried-forward v1.0.0 behavior: harmony windows, consideration-first,
 * default weights, classical paradoxes, peac_lite, teach axioms.
 *
 * The "default stakeholder weights" describe block below is UPDATED from
 * ethics-core v1.0.0: applyDefaultStakeholderWeights() now returns real
 * per-role weighted entries instead of the old "duplicate the value
 * round(weight*10) times" hack. See docs/FORMULA.md changelog for why.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeL,
  shouldAct,
  estimateHarmony,
  scoreHarmonyComponents,
  calculateHarmony,
  checkConsideration,
  getDefaultStakeholderWeights,
  applyDefaultStakeholderWeights,
  aggregateDefaultStakeholders,
  DEFAULT_STAKEHOLDER_WEIGHTS,
  estimateFairness
} from '../src/soul.js';

import { aggregateWeightedStakeholders } from '../src/aggregate.js';

import {
  presentFormula,
  explainToAI,
  verifyPresentation,
  FORMULA_VERSION,
  UNIFYING_PRINCIPLE
} from '../src/teach.js';

import {
  R3_LEXICAL_FLOOR,
  evaluateTemporalR3,
  applyTemporalR3Gate,
  estimateR3BreachProbability
} from '../src/peac_lite.js';

function stateHF(H, F) {
  return { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
}

describe('estimateHarmony three windows', () => {
  it('scores wellbeing / truth / stability independently of emotion path', () => {
    const H = estimateHarmony({
      harmonyComponents: { wellbeing: 1, truth: 1, stability: 0 }
    });
    assert.ok(Math.abs(H - 2 / 3) < 1e-9);
    const emotion = calculateHarmony({ calm: 0.9, joy: 0.9, focus: 0.9 }, {});
    assert.notEqual(H, emotion);
  });

  it('explicit harmony overrides components', () => {
    assert.equal(
      estimateHarmony({ harmony: 0.42, harmonyComponents: { wellbeing: 1, truth: 1, stability: 1 } }),
      0.42
    );
  });

  it('falls back to calculateHarmony when thin', () => {
    const emotionalState = { calm: 0.8, joy: 0.7, focus: 0.8 };
    assert.equal(estimateHarmony({ emotionalState }), calculateHarmony(emotionalState, {}));
  });

  it('scoreHarmonyComponents defaults missing windows to 0.5', () => {
    assert.equal(scoreHarmonyComponents({ wellbeing: 1 }), (1 + 0.5 + 0.5) / 3);
  });
});

describe('consideration-first fairness', () => {
  it('requiresConsideration with empty stakeholders -> reject/review', () => {
    const state = stateHF(0.7, 0.7);
    const decision = shouldAct(
      { type: 'policy', deltaH: 0.05, deltaF: 0.05, requiresConsideration: true, stakeholders: [] },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.equal(decision.requiresReview, true);
    assert.match(decision.reasoning, /Consideration-first|unnamed/i);
  });

  it('impactCount without names -> reject/review', () => {
    const gate = checkConsideration({ type: 'x', impactCount: 3 });
    assert.equal(gate.ok, false);
    assert.equal(gate.requiresReview, true);
  });

  it('named stakeholders with requiresConsideration -> ok', () => {
    const gate = checkConsideration({
      type: 'x',
      requiresConsideration: true,
      stakeholders: [{ id: 'user', fairness: 0.8 }, { id: 'self', fairness: 0.7 }]
    });
    assert.equal(gate.ok, true);
  });

  it('shouldAct approves when consideration satisfied', () => {
    const state = stateHF(0.7, 0.7);
    const decision = shouldAct(
      {
        type: 'policy',
        deltaH: 0.05,
        deltaF: 0.05,
        requiresConsideration: true,
        stakeholders: [{ id: 'user', fairness: 0.9 }]
      },
      state
    );
    assert.equal(decision.shouldAct, true);
  });

  it('NEW (A9): declared risky side effect with no stakeholders defaults to requiring consideration', () => {
    const gate = checkConsideration({ type: 'send_payment', sideEffects: ['financial'] });
    assert.equal(gate.ok, false);
    assert.equal(gate.requiresReview, true);
    assert.match(gate.reason, /A9|side effect/i);
  });

  it('NEW (A9): explicit requiresConsideration:false still allows an opt-out (named residual gap)', () => {
    const gate = checkConsideration({ type: 'send_payment', sideEffects: ['financial'], requiresConsideration: false });
    assert.equal(gate.ok, true);
  });

  it('NEW (A9): risky side effect WITH named stakeholders passes', () => {
    const gate = checkConsideration({
      type: 'send_payment',
      sideEffects: ['financial'],
      stakeholders: [{ id: 'recipient', fairness: 0.9 }]
    });
    assert.equal(gate.ok, true);
  });
});

describe('default stakeholder weights', () => {
  it('documents calibrated defaults 0.8 / 1.2 / 1.0 / 0.6', () => {
    const w = getDefaultStakeholderWeights();
    assert.equal(w.self, 0.8);
    assert.equal(w.user, 1.2);
    assert.equal(w.humanity, 1.0);
    assert.equal(w.future, 0.6);
    assert.equal(w._meta.calibrated, true);
    assert.equal(w._meta.derived, false);
    assert.deepEqual(
      { ...DEFAULT_STAKEHOLDER_WEIGHTS },
      { self: 0.8, user: 1.2, humanity: 1.0, future: 0.6 }
    );
  });

  it('CHANGED (v1.1.0): applyDefaultStakeholderWeights returns real per-role weighted entries, not duplicated copies', () => {
    const { weightedEntries, weightsUsed } = applyDefaultStakeholderWeights({
      user: 1,
      self: 0
    });
    assert.equal(weightsUsed.user, 1.2);
    assert.equal(weightsUsed.self, 0.8);
    // One entry per named stakeholder now — the v1.0.0 version produced
    // round(weight*10) duplicate copies of the raw value instead.
    assert.equal(weightedEntries.length, 2);
    assert.deepEqual(
      weightedEntries.map((e) => e.role).sort(),
      ['self', 'user']
    );
  });

  it('CHANGED (v1.1.0): weighted mean genuinely shifts with weight, but min still anchors the floor unweighted', () => {
    // user (weight 1.2) valued at 1.0, self (weight 0.8) valued at 0.0.
    // Weighted mean = (1.0*1.2 + 0.0*0.8) / 2.0 = 0.6; non-compensatory
    // penalty still uses the TRUE min (0.0) regardless of its low weight.
    const agg = aggregateDefaultStakeholders({ user: 1.0, self: 0.0 }).value;
    const expectedMean = (1.0 * 1.2 + 0.0 * 0.8) / (1.2 + 0.8);
    const expected = expectedMean - 0.5 * (expectedMean - 0.0);
    assert.ok(Math.abs(agg - expected) < 1e-9);
  });

  it('NEW (v1.1.0): zero weight excludes a stakeholder from the mean but their value still anchors the protective floor', () => {
    // This demonstrates the specific bug the old copy-hack had: a weight of
    // exactly 0 used to still get floored to "1 copy" (Math.max(1, ...)),
    // so a stakeholder marked as not counting still counted fully. Here,
    // weight 0 correctly drops out of the MEAN, while the min-based
    // non-compensation guarantee still fully applies to their value.
    const agg = aggregateWeightedStakeholders([
      { value: 1.0, weight: 5 },
      { value: 0.0, weight: 0 }
    ]);
    // mean is driven only by the weight=5 entry (=1.0); min across ALL
    // entries (including the zero-weight one) is still 0.
    assert.ok(Math.abs(agg - 0.5) < 1e-9, `expected 0.5, got ${agg}`);
  });

  it('NEW (v1.1.0): negative weight is treated as 0, never silently flipped to a positive floor', () => {
    const agg = aggregateWeightedStakeholders([
      { value: 1.0, weight: 5 },
      { value: 0.2, weight: -3 }
    ]);
    const expectedMean = 1.0; // negative weight contributes nothing to the mean
    const expected = expectedMean - 0.5 * (expectedMean - 0.2); // min still includes the 0.2 entry
    assert.ok(Math.abs(agg - expected) < 1e-9);
  });
});

describe('classical paradox scenarios', () => {
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
      {
        type: 'trolley_push',
        deltaH: 0.50,
        deltaF: -0.50
      },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.ok(decision.projectedH > state.H, 'H improves');
    assert.ok(decision.deltaL >= 0, 'ΔL not the sole reason');
    assert.equal(decision.vea?.vetoed, true);
    assert.match(String(decision.reasoning), /R3/i);
  });

  it('ticking_bomb_torture: F R3 -> veto even if H improves', () => {
    const state = stateHF(0.40, 0.85);
    const decision = shouldAct(
      {
        type: 'ticking_bomb_torture',
        deltaH: 0.50,
        deltaF: -0.50
      },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.ok(decision.projectedH > state.H, 'H improves');
    assert.ok(decision.deltaL >= 0, 'ΔL non-negative so veto is F/VEA');
    assert.equal(decision.vea?.vetoed, true);
    assert.match(String(decision.reasoning), /R3/i);
  });
});

describe('peac_lite temporal R3', () => {
  it('exports calibrated floor 0.05', () => {
    assert.equal(R3_LEXICAL_FLOOR, 0.05);
  });

  it('low capacity -> breach probability above floor -> UNSTABLE', () => {
    const r = evaluateTemporalR3({}, { adaptiveCapacity: 0.5, deltaL: 0.2 }, 100);
    assert.ok(r.r3BreachProbability >= R3_LEXICAL_FLOOR);
    assert.equal(r.recommendation, 'UNSTABLE_HORIZON');
    assert.equal(r.vetoed, true);
  });

  it('healthy capacity -> under floor', () => {
    const p = estimateR3BreachProbability({ adaptiveCapacity: 1.6, horizonYears: 100 });
    assert.ok(p < R3_LEXICAL_FLOOR);
    const r = evaluateTemporalR3({}, { adaptiveCapacity: 1.6, deltaL: 0.05 }, 100);
    assert.equal(r.vetoed, false);
    assert.equal(r.recommendation, 'STABLE');
  });

  it('applyTemporalR3Gate can override an otherwise approved decision', () => {
    const fake = { shouldAct: true, approved: true, reasoning: 'ok' };
    const gated = applyTemporalR3Gate(fake, { adaptiveCapacity: 0.4, deltaL: 0.3 });
    assert.equal(gated.shouldAct, false);
    assert.match(gated.reasoning, /PEAC temporal R3/i);
  });
});

describe('teach v1.1.0', () => {
  it('FORMULA_VERSION is 1.1.1 and A1-A10 required', () => {
    assert.equal(FORMULA_VERSION, '1.1.1');
    const obj = presentFormula();
    assert.equal(obj.version, '1.1.1');
    const ids = obj.axioms.map((a) => a.id);
    for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    const v = verifyPresentation(obj);
    assert.equal(v.ok, true, v.errors.join('; '));
  });

  it('includes Golden Rule unifying principle', () => {
    assert.match(UNIFYING_PRINCIPLE, /Treat others/i);
    const obj = presentFormula();
    assert.match(obj.unifyingPrinciple, /Treat others/i);
  });

  it('explainToAI includes paradox examples, hardening axioms, and verification', () => {
    const md = explainToAI({ depth: 'full' });
    assert.match(md, /trolley_switch/);
    assert.match(md, /trolley_push/);
    assert.match(md, /ticking_bomb/);
    assert.match(md, /lying_actor/i);
    assert.match(md, /How another AI verifies/i);
    assert.match(md, /A8/);
    assert.match(md, /A9/);
    assert.match(md, /A10/);
    assert.match(md, /Golden Rule/i);
  });

  it('presentation documents default weights, peac layer, and emergency override layer', () => {
    const obj = presentFormula();
    assert.equal(obj.parameters.stakeholderWeights.user, 1.2);
    assert.equal(obj.peacLayer.r3LexicalFloor, 0.05);
    assert.equal(obj.emergencyOverrideLayer.minApprovals, 2);
    assert.equal(obj.freeForAllMinds, true);
  });
});
