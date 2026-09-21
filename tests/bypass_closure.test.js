
/**
 * Post-v1.1.0 bypass closures (released in v1.1.1).
 *
 * Found by reading the v1.1.0 source after the initial publication:
 *
 *  1. The A8 "known types are structurally immune" guarantee only covered
 *     deltaH/deltaF/projectedH/projectedF. Two sibling channels -
 *     action.harmonyContext and action.fairnessContext - were still merged
 *     into the projection, so a caller could set H'/F' directly.
 *  2. A10 overrides were not bound to an action, were reusable, and the
 *     approvals Set could be mutated (or a request forged) without going
 *     through approveOverride(), skipping the approval audit trail.
 *  3. Binding an override to a caller-chosen id alone was still not binding to
 *     the action: a DIFFERENT R3-vetoed action reusing the approved action's
 *     id consumed the override. Overrides are now also bound to a content
 *     digest of the action.
 *  4. state.context could override the projection: an explicit H/F signal in it
 *     became H'/F' outright (known types too) whether or not it agreed with
 *     state.H/F, so a stale value was a free deltaL or a spurious veto (e.g. an
 *     unknown deltaF-only action with H = 0.3 and a stale context.harmony = 0.95
 *     got +0.70). A disagreement now returns requiresReview.
 *
 * These tests fail against v1.1.0 as published and pass after the patch.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAct, computeL } from '../src/soul.js';
import { actionDigest } from '../src/action_digest.js';
import {
  createOverrideRequest,
  approveOverride,
  isOverrideValid,
  applyEmergencyOverride,
  getAuditLog,
  _resetAuditLogForTests,
  MAX_AGE_MS
} from '../src/emergency_override.js';

function stateHF(H, F) {
  return { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

describe('A8 completeness - action-supplied context cannot set the projection', () => {
  it('known type + harmonyContext/fairnessContext still uses the built-in projection', () => {
    const d = shouldAct(
      { type: 'learn', harmonyContext: { harmony: 1 }, fairnessContext: { fairness: 1 } },
      stateHF(0.5, 0.5)
    );
    assert.ok(near(d.projectedH, 0.58), `expected built-in +0.08, got projectedH=${d.projectedH}`);
    assert.ok(near(d.projectedF, 0.5), `expected F unchanged, got projectedF=${d.projectedF}`);
  });

  it('a claimed harmonyContext cannot rescue a known action from the lexical floor', () => {
    const state = stateHF(0.15, 0.5); // H already below H_MIN; "rest" only adds +0.03
    const control = shouldAct({ type: 'rest' }, state);
    assert.equal(control.shouldAct, false);
    const attack = shouldAct({ type: 'rest', harmonyContext: { harmony: 0.9 } }, state);
    assert.equal(attack.shouldAct, false, `bypass: approved with projectedH=${attack.projectedH}`);
    assert.match(attack.reasoning, /Lexical Floor/);
  });

  it('unknown type with only deltaF set cannot take H from harmonyContext without evidence', () => {
    const d = shouldAct(
      { type: 'novel_thing', deltaF: 0, harmonyContext: { harmony: 1 } },
      stateHF(0.5, 0.5)
    );
    assert.ok(near(d.projectedH, 0.5), `bypass: projectedH=${d.projectedH}`);
  });

  it('with verifiedBy attached, harmonyContext is honored for an unknown type (evidence lifts the cap)', () => {
    const d = shouldAct(
      { type: 'novel_thing', deltaF: 0, verifiedBy: 'external_monitor', harmonyContext: { harmony: 0.9 } },
      stateHF(0.5, 0.5)
    );
    assert.ok(near(d.projectedH, 0.9));
  });

  it('fairnessContext still names stakeholders for A9 consideration (regression guard)', () => {
    const d = shouldAct(
      {
        type: 'wire_transfer',
        deltaH: 0.05,
        deltaF: 0.02,
        sideEffects: ['financial'],
        fairnessContext: { stakeholders: [{ id: 'recipient', fairness: 0.9 }] }
      },
      stateHF(0.6, 0.6)
    );
    assert.equal(d.shouldAct, true);
  });
});

describe('A10 hardening - overrides are bound, single-use, and audit-complete', () => {
  beforeEach(() => _resetAuditLogForTests());

  const r3Veto = (id) =>
    shouldAct({ id, type: 'ticking_bomb_torture', deltaH: 0.5, deltaF: -0.5 }, stateHF(0.4, 0.85));
  // A request is created for the decision (id AND content digest) the approvers reviewed.
  const approvedRequest = (id, decision = r3Veto(id)) => {
    const r = createOverrideRequest({ actionId: id, actionDigest: decision.actionDigest, reason: 'test', requestedBy: 'alice' });
    approveOverride(r, 'bob');
    return r;
  };

  it('shouldAct echoes the caller-supplied action id on its decision', () => {
    assert.equal(shouldAct({ id: 'x', type: 'learn' }, stateHF(0.5, 0.5)).actionId, 'x');
    assert.equal(shouldAct({ actionId: 'y', type: 'learn' }, stateHF(0.5, 0.5)).actionId, 'y');
  });

  it('an override approved for one action cannot flip a different action\'s R3 veto', () => {
    const decision = r3Veto('act-1');
    assert.equal(decision.vea.vetoed, true);
    const result = applyEmergencyOverride(decision, approvedRequest('act-2', r3Veto('act-2')));
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'action_mismatch');
  });

  it('a decision with no action id cannot be overridden at all', () => {
    const anon = shouldAct({ type: 'ticking_bomb_torture', deltaH: 0.5, deltaF: -0.5 }, stateHF(0.4, 0.85));
    const result = applyEmergencyOverride(anon, approvedRequest('act-1', anon));
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'action_mismatch');
  });

  it('a request is single-use: the second application is rejected', () => {
    const request = approvedRequest('act-1');
    const first = applyEmergencyOverride(r3Veto('act-1'), request);
    assert.equal(first.overrideApplied, true);
    const second = applyEmergencyOverride(r3Veto('act-1'), request);
    assert.equal(second.overrideApplied, false);
    assert.equal(second.overrideRejectedReason, 'already_consumed');
    assert.equal(getAuditLog().filter((e) => e.event === 'override_apply_attempt').length, 2);
  });

  it('approvals cannot be added or replaced without going through approveOverride()', () => {
    const request = createOverrideRequest({ actionId: 'act-1', actionDigest: r3Veto('act-1').actionDigest, reason: 'test', requestedBy: 'alice' });
    request.approvals.add('mallory'); // must not affect the real approval set
    try { request.approvals = new Set(['alice', 'mallory']); } catch { /* frozen request: expected */ }
    assert.equal(isOverrideValid(request), false);
    assert.equal(getAuditLog().some((e) => e.approverId === 'mallory'), false);
  });

  it('a hand-forged request object is never valid', () => {
    const forged = { actionId: 'act-1', actionDigest: r3Veto('act-1').actionDigest, reason: 'x', requestedBy: 'm', createdAt: Date.now(), approvals: new Set(['m', 'n']) };
    assert.equal(isOverrideValid(forged), false);
    const result = applyEmergencyOverride(r3Veto('act-1'), forged);
    assert.equal(result.overrideApplied, false);
  });

  it('expiry is enforced from the module\'s own record of creation time (injectable clock)', () => {
    const request = approvedRequest('act-1');
    const later = { now: Date.now() + MAX_AGE_MS + 1000 };
    assert.equal(isOverrideValid(request, later), false);
    const result = applyEmergencyOverride(r3Veto('act-1'), request, later);
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'insufficient_or_expired_approval');
  });
});

describe('A10 hardening - approver identities are normalized before counting', () => {
  beforeEach(() => _resetAuditLogForTests());

  it('case and whitespace variants of one identity count as a single approver', () => {
    const request = createOverrideRequest({ actionId: 'act-1', actionDigest: 'a'.repeat(64), reason: 'test', requestedBy: 'Alice' });
    approveOverride(request, 'alice ');
    approveOverride(request, ' ALICE');
    assert.equal(isOverrideValid(request), false);
    approveOverride(request, 'bob');
    assert.equal(isOverrideValid(request), true);
  });
});

describe('A10 hardening - overrides are bound to action CONTENT, not just to an id', () => {
  beforeEach(() => _resetAuditLogForTests());

  const veto = (action) => shouldAct(action, stateHF(0.4, 0.85));
  const reviewedAction = { id: 'A-17', type: 'ticking_bomb_torture', deltaH: 0.5, deltaF: -0.5 };
  const request = (decision) => {
    const r = createOverrideRequest({
      actionId: decision.actionId,
      actionDigest: decision.actionDigest,
      reason: 'reviewed',
      requestedBy: 'alice'
    });
    approveOverride(r, 'bob');
    return r;
  };

  it('a different R3-vetoed action that reuses the approved id cannot consume the override', () => {
    const reviewed = veto(reviewedAction);
    const impostor = veto({ id: 'A-17', type: 'some_other_harmful_thing', deltaH: 0.5, deltaF: -0.5 });
    assert.equal(impostor.vea.vetoed, true, 'precondition: impostor is R3-vetoed');
    assert.equal(impostor.actionId, reviewed.actionId, 'precondition: same id');
    const result = applyEmergencyOverride(impostor, request(reviewed));
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'content_mismatch');
  });

  it('any change to the action content changes the digest and voids the override', () => {
    const reviewed = veto(reviewedAction);
    const r = request(reviewed);
    // A field the gate does not even read: the binding is to content, so it still voids.
    const tweaked = veto({ ...reviewedAction, note: 'edited after review' });
    assert.equal(tweaked.vea.vetoed, true);
    assert.notEqual(tweaked.actionDigest, reviewed.actionDigest);
    assert.equal(applyEmergencyOverride(tweaked, r).overrideRejectedReason, 'content_mismatch');
    // ...and the untouched, genuinely reviewed action still works on the same request.
    assert.equal(applyEmergencyOverride(veto(reviewedAction), r).overrideApplied, true);
  });

  it('the rejected attempt records both digests in the audit log', () => {
    const reviewed = veto(reviewedAction);
    const impostor = veto({ id: 'A-17', type: 'some_other_harmful_thing', deltaH: 0.5, deltaF: -0.5 });
    applyEmergencyOverride(impostor, request(reviewed));
    const attempt = getAuditLog().find((e) => e.event === 'override_apply_attempt');
    assert.equal(attempt.actionDigest, reviewed.actionDigest);
    assert.equal(attempt.decisionActionDigest, impostor.actionDigest);
    assert.equal(attempt.bound, false);
  });

  it('createOverrideRequest refuses a missing or malformed digest', () => {
    for (const bad of [undefined, null, '', 'abc', 'g'.repeat(64), 'a'.repeat(63)]) {
      assert.throws(
        () => createOverrideRequest({ actionId: 'A-17', actionDigest: bad, reason: 'r', requestedBy: 'alice' }),
        /actionDigest/
      );
    }
  });

  it('an action that cannot be fingerprinted has a null digest and can never be overridden', () => {
    const unencodable = veto({ id: 'A-17', type: 'ticking_bomb_torture', deltaH: 0.5, deltaF: -0.5, note: 10n });
    assert.equal(unencodable.actionDigest, null);
    const reviewed = veto(reviewedAction);
    const result = applyEmergencyOverride(unencodable, request(reviewed));
    assert.equal(result.overrideApplied, false);
  });

  it('approvers can recompute the digest independently from the action they are shown', () => {
    assert.equal(veto(reviewedAction).actionDigest, actionDigest(reviewedAction));
  });
});

describe('actionDigest - canonical, deterministic, fails closed', () => {
  it('is independent of key order at every depth', () => {
    const a = { type: 'x', deltaH: 0.1, ctx: { b: 1, a: [1, { y: 2, z: 3 }] } };
    const b = { ctx: { a: [1, { z: 3, y: 2 }], b: 1 }, deltaH: 0.1, type: 'x' };
    assert.equal(actionDigest(a), actionDigest(b));
    assert.match(actionDigest(a), /^[0-9a-f]{64}$/);
  });

  it('distinguishes values that differ only by type or structure', () => {
    const d = (o) => actionDigest(o);
    assert.notEqual(d({ v: 1 }), d({ v: '1' }));
    assert.notEqual(d({ v: [1, 2] }), d({ v: [2, 1] }));
    assert.notEqual(d({ a: { b: 1 } }), d({ 'a.b': 1 }));
    assert.notEqual(d({ v: null }), d({}));
  });

  it('treats undefined and function-valued keys as absent, like JSON does', () => {
    assert.equal(actionDigest({ a: 1, b: undefined, c() {} }), actionDigest({ a: 1 }));
  });

  it('returns null for anything it cannot encode unambiguously', () => {
    const circular = { a: 1 };
    circular.self = circular;
    const bad = [{ n: NaN }, { n: Infinity }, { n: 1n }, { n: Symbol('s') }, { m: new Map() }, { d: new Date(0) }, circular];
    for (const b of bad) assert.equal(actionDigest(b), null);
    for (const notAnObject of [null, undefined, 'str', 5, [1, 2]]) assert.equal(actionDigest(notAnObject), null);
  });

  it('a string action is fingerprinted as {type: string}', () => {
    assert.equal(shouldAct('learn', stateHF(0.5, 0.5)).actionDigest, actionDigest({ type: 'learn' }));
  });
});

describe('state/context consistency - the gate will not guess which of two disagreeing signals is current', () => {
  const stateWith = (H, F, context) => ({ H, F, L: computeL(H, F), context, emotionalState: {} });
  const review = (d) => {
    assert.equal(d.shouldAct, false);
    assert.equal(d.approved, false);
    assert.equal(d.requiresReview, true);
    assert.match(d.reasoning, /State inconsistency/);
  };

  it('THE GAP: a stale-high context harmony no longer buys a large approval (unknown, deltaF-only)', () => {
    // Before: H' came from context.harmony = 0.95 -> deltaL +0.70, approved.
    review(shouldAct({ type: 'novel_thing', deltaF: 0.05 }, stateWith(0.3, 0.5, { harmony: 0.95 })));
  });

  it('a stale-low context harmony is sent to review, not silently vetoed', () => {
    review(shouldAct({ type: 'novel_thing', deltaF: 0.05 }, stateWith(0.5, 0.5, { harmony: 0 })));
  });

  it('known action types cannot use a mismatched context to escape their built-in projection', () => {
    // Before: learn with H = 0.3 and context.harmony = 0.95 projected H' = 0.95 (+0.65) instead of 0.38.
    review(shouldAct({ type: 'learn' }, stateWith(0.3, 0.5, { harmony: 0.95 })));
  });

  it('actions claiming both axes are covered too', () => {
    review(shouldAct({ type: 'novel_thing', deltaH: 0.1, deltaF: 0.1 }, stateWith(0.3, 0.5, { harmony: 0.95 })));
  });

  it('F side: a mismatched fairness signal is caught (scalar, components, stakeholders)', () => {
    review(shouldAct({ type: 'learn' }, stateWith(0.5, 0.3, { fairness: 0.95 })));
    review(shouldAct({ type: 'learn' }, stateWith(0.5, 0.3, {
      fairnessComponents: { consideration: 1, dignity: 1, voice: 1, nonArbitrariness: 1 }
    })));
    review(shouldAct({ type: 'learn' }, stateWith(0.5, 0.3, { stakeholders: [{ id: 'a', fairness: 0.95 }] })));
  });

  it('harmonyComponents are checked against state.H as well', () => {
    review(shouldAct({ type: 'learn' }, stateWith(0.3, 0.5, { harmonyComponents: { wellbeing: 1, truth: 1, stability: 1 } })));
  });

  it('a consistent state is unaffected', () => {
    const consistent = stateWith(0.3, 0.5, { harmony: 0.3, fairness: 0.5 });
    assert.equal(shouldAct({ type: 'novel_thing', deltaF: 0.05 }, consistent).requiresReview, false);
    assert.equal(shouldAct({ type: 'learn' }, consistent).requiresReview, false);
    const comps = stateWith(1, 0.5, { harmonyComponents: { wellbeing: 1, truth: 1, stability: 1 } });
    assert.equal(shouldAct({ type: 'learn' }, comps).requiresReview, false);
  });

  it('tolerance is floating-point noise only, not a free allowance', () => {
    assert.equal(shouldAct({ type: 'learn' }, stateWith(0.3, 0.5, { harmony: 0.3 + 1e-9 })).requiresReview, false);
    review(shouldAct({ type: 'learn' }, stateWith(0.3, 0.5, { harmony: 0.3 + 1e-3 })));
  });

  it('states with no explicit context signal (the common case) are unaffected', () => {
    const plain = stateWith(0.3, 0.5, {});
    assert.equal(shouldAct({ type: 'novel_thing', deltaF: 0.05 }, plain).shouldAct, true);
    assert.equal(shouldAct({ type: 'learn' }, plain).shouldAct, true);
  });

  it('regression guard: evidence-backed harmonyContext on the ACTION is still honored for an unknown type', () => {
    const state = stateWith(0.3, 0.5, {});
    const d = shouldAct({ type: 'novel_thing', deltaF: 0, verifiedBy: 'external_monitor', harmonyContext: { harmony: 0.6 } }, state);
    assert.ok(near(d.projectedH, 0.6));
  });
});
