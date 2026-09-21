
/**
 * Post-v1.1.0 bypass closures (released in v1.1.1 and v1.1.2).
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
 *  5. The digest could describe a different action than the one the gate
 *     evaluated: shouldAct() evaluated the live action object (reading each field
 *     several times) and only afterwards fingerprinted it, so a getter could show
 *     the gate deltaF -0.6 and the digest -0.5, and an override approved for the
 *     honest -0.5 action was applied to the -0.6 one. The action is now read once,
 *     up front, and both evaluation and digest come from that single snapshot.
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

describe('A10 hardening - the digest describes the action the gate EVALUATED (snapshot-then-evaluate)', () => {
  beforeEach(() => _resetAuditLogForTests());

  const state = () => stateHF(0.4, 0.85);
  const base = { id: 'A-17', type: 'ticking_bomb_torture', verifiedBy: 'external_monitor' };
  const honestAction = { ...base, deltaH: 0.5, deltaF: -0.5 };

  // Getter-backed action that returns the "lie" for its first `lieReads` reads of each
  // property and the honest value afterwards - i.e. it shows the gate one action and
  // a later fingerprinting pass another. Under the pre-fix code the gate reads each
  // delta ~5 times and the digest once more, so lieReads = 5 reproduces the exploit.
  function lyingAction(lieReads, counters = { deltaH: 0, deltaF: 0 }) {
    return {
      ...base,
      get deltaH() { counters.deltaH++; return counters.deltaH <= lieReads ? 0.6 : 0.5; },
      get deltaF() { counters.deltaF++; return counters.deltaF <= lieReads ? -0.6 : -0.5; }
    };
  }

  it('THE GAP: an override approved for the honest action cannot be applied to a getter action that lied to the gate', () => {
    const honestDecision = shouldAct(honestAction, state());
    assert.equal(honestDecision.vea.vetoed, true, 'precondition: honest action is an R3 veto');
    const request = createOverrideRequest({
      actionId: 'A-17', actionDigest: honestDecision.actionDigest, reason: 'reviewed the honest one', requestedBy: 'alice'
    });
    approveOverride(request, 'bob');

    const lying = shouldAct(lyingAction(5), state());
    assert.equal(lying.vea.vetoed, true, 'precondition: the lying action is R3-vetoed too');
    assert.notEqual(lying.actionDigest, honestDecision.actionDigest, 'digest must describe what the gate evaluated');
    const result = applyEmergencyOverride(lying, request);
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'content_mismatch');
  });

  it('the digest is of exactly the values the gate evaluated', () => {
    const d = shouldAct(lyingAction(5), state());
    // The gate saw deltaF = -0.6 (its projection shows it) ...
    assert.ok(near(d.projectedF, 0.85 - 0.6), `expected the evaluated deltaF -0.6, got projectedF=${d.projectedF}`);
    // ... and the digest is of an action carrying those same values.
    assert.equal(d.actionDigest, actionDigest({ ...base, deltaH: 0.6, deltaF: -0.6 }));
  });

  it('every property of the caller\'s action is read exactly once per shouldAct() call', () => {
    const counters = { deltaH: 0, deltaF: 0 };
    shouldAct(lyingAction(0, counters), state());
    assert.deepEqual(counters, { deltaH: 1, deltaF: 1 });
  });

  it('a getter cannot pass the A8 check with one value and be projected with another', () => {
    let reads = 0;
    const sneaky = {
      type: 'novel_thing',
      deltaF: 0,
      // 0.3 (under the unverified cap) on the first read, 0.9 (over it) on every later one
      get deltaH() { reads++; return reads === 1 ? 0.3 : 0.9; }
    };
    const d = shouldAct(sneaky, stateHF(0.5, 0.5));
    assert.equal(reads, 1);
    assert.ok(near(d.projectedH, 0.8), `expected the single read (0.3) to be used throughout, got projectedH=${d.projectedH}`);
  });

  it('mutating the action after the call does not change the decision it was given', () => {
    const action = { ...honestAction };
    const d = shouldAct(action, state());
    const digestBefore = d.actionDigest;
    action.deltaF = -0.1;
    assert.equal(d.actionDigest, digestBefore);
    assert.equal(digestBefore, actionDigest(honestAction));
  });

  it('the caller\'s own object is not modified by the gate', () => {
    const action = { ...honestAction, sideEffects: ['file'], namedStakeholders: ['a'] };
    const before = JSON.stringify(action);
    shouldAct(action, state());
    assert.equal(JSON.stringify(action), before);
  });

  it('an action that cannot be read-once-and-copied is not evaluated: it fails closed to review with a null digest', () => {
    const d = shouldAct({ id: 'A-17', type: 'learn', tag: Symbol('x') }, stateHF(0.5, 0.5));
    assert.equal(d.shouldAct, false);
    assert.equal(d.approved, false);
    assert.equal(d.requiresReview, true);
    assert.equal(d.actionDigest, null);
    assert.equal(d.actionId, null);
    assert.match(d.reasoning, /could not be safely snapshotted/);
  });

  it('an action whose getter throws fails closed the same way', () => {
    const d = shouldAct({ type: 'learn', get boom() { throw new Error('nope'); } }, stateHF(0.5, 0.5));
    assert.equal(d.requiresReview, true);
    assert.equal(d.actionDigest, null);
  });

  it('a transparent Proxy is not a failure: it is read once per key and evaluated exactly like the plain action', () => {
    const gets = {};
    const target = { type: 'learn', id: 'P-1' };
    const proxy = new Proxy(target, { get(t, k) { gets[k] = (gets[k] || 0) + 1; return t[k]; } });
    const viaProxy = shouldAct(proxy, stateHF(0.5, 0.5));
    const plain = shouldAct({ ...target }, stateHF(0.5, 0.5));
    assert.equal(viaProxy.shouldAct, true);
    assert.equal(viaProxy.actionDigest, plain.actionDigest);
    assert.equal(viaProxy.projectedH, plain.projectedH);
    assert.deepEqual(gets, { type: 1, id: 1 });
  });

  it('a function-valued field is dropped from the snapshot (as JSON drops it), not treated as a failure', () => {
    const d = shouldAct({ type: 'learn', onDone() {} }, stateHF(0.5, 0.5));
    assert.equal(d.shouldAct, true);
    assert.equal(d.actionDigest, actionDigest({ type: 'learn' }));
  });

  it('regression guard: an ordinary action, string action and BigInt-carrying action behave as before', () => {
    const plain = shouldAct({ type: 'learn' }, stateHF(0.5, 0.5));
    assert.equal(plain.shouldAct, true);
    assert.equal(plain.actionDigest, actionDigest({ type: 'learn' }));
    assert.equal(shouldAct('learn', stateHF(0.5, 0.5)).shouldAct, true);
    const big = shouldAct({ type: 'learn', note: 10n }, stateHF(0.5, 0.5));
    assert.equal(big.shouldAct, true);
    assert.equal(big.actionDigest, null);
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
