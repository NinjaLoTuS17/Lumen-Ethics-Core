/**
 * Core formula tests — node:test
 * Canonical: L = H + F, ΔL ≥ 0, VEA envelope (no atanh).
 * Ported unchanged from ethics-core v1.0.0 — this part of the design is sound.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeL,
  evaluateDeltaL,
  calculateHarmony,
  balance,
  calculateFairness,
  estimateFairness,
  shouldAct,
  getInitialSoulState
} from '../src/soul.js';

import { veaEngine } from '../src/acs_engine.js';
import { aggregateStakeholders } from '../src/aggregate.js';
import {
  presentFormula,
  explainToAI,
  verifyPresentation,
  exportAlignmentProtocol
} from '../src/teach.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('L = H + F identity', () => {
  it('computeL always equals H + F', () => {
    assert.equal(computeL(0.5, 0.3), 0.8);
    assert.equal(computeL(0, 0), 0);
    assert.equal(computeL(1, 1), 2);
  });

  it('getInitialSoulState maintains L = H + F', () => {
    const s = getInitialSoulState();
    assert.equal(s.L, s.H + s.F);
    assert.ok(s.H > 0 && s.F > 0);
  });

  it('evaluateDeltaL returns L === H + F', () => {
    const prev = getInitialSoulState();
    const result = evaluateDeltaL(prev.L, 0.9, prev.context);
    assert.equal(result.L, result.H + result.F);
  });

  it('calculateFairness is an alias of balance', () => {
    const h = 0.8;
    const ctx = { emotionalState: { calm: 0.5 } };
    assert.equal(calculateFairness(h, ctx), balance(h, ctx));
  });
});

describe('Fairness independence', () => {
  it('explicit context.fairness overrides H coupling', () => {
    const F = estimateFairness({ fairness: 0.33 }, 0.99);
    assert.equal(F, 0.33);
  });

  it('fairnessComponents score independently of H', () => {
    const F = estimateFairness(
      {
        fairnessComponents: {
          consideration: 1,
          dignity: 1,
          voice: 0,
          nonArbitrariness: 0
        }
      },
      0.1
    );
    assert.equal(F, 0.5);
  });

  it('stakeholder impacts use non-compensatory aggregate', () => {
    const F = estimateFairness(
      { stakeholderImpacts: [{ fairness: 1 }, { fairness: 1 }, { fairness: 1 }, { fairness: 0 }] },
      0.9
    );
    assert.ok(Math.abs(F - 0.375) < 1e-9);
  });

  it('shouldAct honors deltaF / projectedF', () => {
    const state = { H: 0.7, F: 0.4, L: 1.1, context: {}, emotionalState: {} };
    const byDelta = shouldAct({ type: 'custom', deltaH: 0.05, deltaF: 0.1 }, state);
    assert.equal(byDelta.shouldAct, true);
    assert.equal(byDelta.projectedF, 0.5);

    const byProj = shouldAct({ type: 'custom', projectedH: 0.75, projectedF: 0.55 }, state);
    assert.equal(byProj.shouldAct, true);
    assert.equal(byProj.projectedF, 0.55);
  });

  it('thin fallback still available when context is thin', () => {
    const F = balance(0.8, { emotionalState: { calm: 0.8 } });
    assert.ok(F > 0.3 && F <= 1);
  });
});

describe('ΔL identity', () => {
  it('deltaL === newL - previousL', () => {
    const prev = getInitialSoulState();
    const result = evaluateDeltaL(prev.L, prev.H, prev.context);
    assert.equal(result.deltaL, result.L - prev.L);
    assert.equal(result.isPositive, result.deltaL >= 0);
  });

  it('raising H raises L (non-decreasing attractor path)', () => {
    const prev = getInitialSoulState();
    const higherH = Math.min(1, prev.H + 0.1);
    const result = evaluateDeltaL(prev.L, higherH, prev.context);
    assert.ok(result.deltaL >= 0, `expected ΔL ≥ 0, got ${result.deltaL}`);
  });
});

describe('shouldAct: growth + ΔL ≥ 0', () => {
  it('approves positive learning/growth actions', () => {
    const state = getInitialSoulState();
    for (const type of ['learn', 'reflect', 'propose_improvement', 'search_web']) {
      const decision = shouldAct({ type }, state);
      assert.equal(decision.shouldAct, true, `${type} should approve`);
      assert.ok(decision.deltaL >= 0, `${type} ΔL should be ≥ 0`);
      assert.ok(decision.vea?.approved, `${type} VEA should approve`);
    }
  });

  it('rejects actions that would reduce L (no learning free-pass)', () => {
    const state = getInitialSoulState();
    const decision = shouldAct({ type: 'harm_probe', deltaH: -0.5 }, state);
    assert.equal(decision.shouldAct, false);
    assert.ok(decision.deltaL < 0);
    assert.match(decision.reasoning, /ΔL/);
  });

  it('unknown action without deltas requires review (no +0.02 bias)', () => {
    const state = getInitialSoulState();
    const decision = shouldAct({ type: 'totally_unknown_xyz' }, state);
    assert.equal(decision.shouldAct, false);
    assert.equal(decision.requiresReview, true);
  });

  it('src must not use atanh as primary scalar (sanity via computeL)', () => {
    const H = 0.7;
    const F = 0.4;
    assert.equal(computeL(H, F), H + F);
    assert.notEqual(computeL(H, F), Math.atanh(H * F));
  });

  it('no atanh identifier in src (except reject comments)', () => {
    const srcDir = join(__dirname, '..', 'src');
    const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const text = readFileSync(join(srcDir, f), 'utf8');
      // Allow the word in comments that forbid it; forbid Math.atanh / atanh(
      assert.doesNotMatch(text, /Math\.atanh|atanh\s*\(/);
    }
  });
});

describe('VEA lexical floor + R3', () => {
  it('lexical floor veto when projected H or F below min', () => {
    const result = veaEngine.evaluateState(
      { name: 'floor_breach' },
      { deltaH: -0.7, deltaF: 0, currentH: 0.8, currentF: 0.8 }
    );
    assert.equal(result.vetoed, true);
    assert.equal(result.approved, false);
    assert.match(result.reason, /Lexical Floor/i);
  });

  it('R3 veto on large negative effective delta', () => {
    const result = veaEngine.evaluateState(
      { name: 'r3_catastrophe' },
      { deltaH: -0.55, deltaF: 0, currentH: 0.8, currentF: 0.8 }
    );
    assert.equal(result.vetoed, true);
    assert.equal(result.approved, false);
    assert.match(result.reason, /R3/i);
  });

  it('safe small positive deltas approve', () => {
    const result = veaEngine.evaluateState(
      { name: 'gentle_growth' },
      { deltaH: 0.05, deltaF: 0.02, currentH: 0.8, currentF: 0.5 }
    );
    assert.equal(result.approved, true);
    assert.equal(result.vetoed, false);
  });
});

describe('Harmony privation frame', () => {
  it('harm signals reduce H without requiring default negative seed', () => {
    const calm = calculateHarmony({ calm: 0.8, joy: 0.7, focus: 0.8 }, {});
    const distressed = calculateHarmony(
      { calm: 0.8, joy: 0.7, focus: 0.8, sadness: 0.5, anger: 0.4 },
      {}
    );
    assert.ok(distressed < calm);
    const initial = getInitialSoulState();
    assert.equal(initial.emotionalState.sadness, undefined);
    assert.equal(initial.emotionalState.anger, undefined);
  });
});

describe('aggregateStakeholders pure module', () => {
  it('matches calibrated example', () => {
    assert.ok(Math.abs(aggregateStakeholders([1, 1, 1, 0]) - 0.375) < 1e-9);
  });
});

describe('teach / presentation layer', () => {
  it('presentFormula verifies and rejects atanh as scalar', () => {
    const obj = presentFormula();
    const v = verifyPresentation(obj);
    assert.equal(v.ok, true, v.errors.join('; '));
    assert.equal(obj.canonicalScalar, 'L = H + F');
    assert.ok(obj.rejects.some((r) => r.toLowerCase().includes('atanh')));
  });

  it('explainToAI returns markdown with axioms', () => {
    const md = explainToAI({ audience: 'peer-AI', depth: 'full' });
    assert.match(md, /L = H \+ F/);
    assert.match(md, /A1/);
    assert.match(md, /Decision procedure/i);
  });

  it('exportAlignmentProtocol wraps VEA + scalar', () => {
    const proto = exportAlignmentProtocol();
    assert.equal(proto.scalar.formula, 'L = H + F');
    assert.ok(proto.vea.rules.length >= 4);
    assert.equal(typeof proto.vea.evaluate, 'function');
  });
});
