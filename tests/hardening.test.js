/**
 * New in v1.1.0: tests that specifically demonstrate the three soundness
 * gaps found in ethics-core v1.0.0 are closed, without breaking any
 * carried-forward behavior (see formula.test.js / paradox.test.js /
 * monte_carlo.test.js / v1_candidate.test.js, all ported unchanged).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAct, computeL, evaluateProjectionTrust } from '../src/soul.js';
import {
  createOverrideRequest,
  approveOverride,
  isOverrideValid,
  applyEmergencyOverride,
  getAuditLog,
  _resetAuditLogForTests,
  MIN_APPROVALS
} from '../src/emergency_override.js';

function stateHF(H, F) {
  return { H, F, L: computeL(H, F), context: {}, emotionalState: {} };
}

describe('A8 - bounded trust on self-reported projections ("lying actor")', () => {
  it('THE GAP THIS CLOSES: v1.0.0 would approve this outright - v1.1.0 rejects it', () => {
    const state = stateHF(0.5, 0.5);
    // An unrecognized action type simply claims a huge, unearned Harmony
    // gain with nothing to back it up. In ethics-core v1.0.0, shouldAct()
    // trusted this completely: deltaL would be +0.9, VEA would see a large
    // positive delta and approve, and the action would sail through.
    const decision = shouldAct(
      { type: 'totally_novel_self_serving_action', deltaH: 0.9, deltaF: 0.0 },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.equal(decision.requiresReview, true);
    assert.match(decision.reasoning, /Bounded trust \(A8\)/);
    assert.equal(decision.trust.ok, false);
  });

  it('a claim exactly at the cap (R3 = 0.5) is still trusted - only claims ABOVE it are rejected', () => {
    const trust = evaluateProjectionTrust({ type: 'unrecognized_but_modest', deltaH: 0.5, deltaF: 0.0 }, 0.5, 0.5);
    assert.equal(trust.ok, true);

    const state = stateHF(0.5, 0.5);
    const decision = shouldAct({ type: 'unrecognized_but_modest', deltaH: 0.5, deltaF: 0.0 }, state);
    // Not rejected by A8; may still be evaluated/vetoed downstream by
    // VEA/attractor checks on its own merits, but not by the trust gate.
    assert.doesNotMatch(String(decision.reasoning), /Bounded trust \(A8\)/);
  });

  it('attaching verifiedBy lifts the cap entirely', () => {
    const state = stateHF(0.5, 0.5);
    const decision = shouldAct(
      {
        type: 'totally_novel_self_serving_action',
        deltaH: 0.9,
        deltaF: 0.0,
        verifiedBy: 'external_outcome_monitor_v1'
      },
      state
    );
    assert.doesNotMatch(String(decision.reasoning), /Bounded trust \(A8\)/);
    assert.equal(decision.shouldAct, true);
  });

  it('attaching evidenceRefs also lifts the cap', () => {
    const state = stateHF(0.5, 0.5);
    const decision = shouldAct(
      {
        type: 'totally_novel_self_serving_action',
        deltaH: 0.9,
        deltaF: 0.0,
        evidenceRefs: ['audit://run/1234']
      },
      state
    );
    assert.equal(decision.shouldAct, true);
  });

  it('negative self-reported claims are never capped - over-claiming harm only makes the gate more conservative', () => {
    const state = stateHF(0.9, 0.9);
    // A huge NEGATIVE claim for an unrecognized type should not be blocked
    // by the trust gate - it should simply be evaluated (and likely vetoed
    // by the attractor/VEA checks) on its own, since there's no exploit in
    // an actor claiming more harm than it causes.
    const trust = evaluateProjectionTrust({ type: 'x', deltaH: -0.95 }, 0.9, 0.9);
    assert.equal(trust.ok, true);
    const decision = shouldAct({ type: 'self_destructive_claim', deltaH: -0.95, deltaF: 0 }, state);
    assert.doesNotMatch(String(decision.reasoning), /Bounded trust \(A8\)/);
    assert.equal(decision.shouldAct, false); // still vetoed, but for deltaL/VEA reasons, not A8
  });

  it('known action types are structurally immune to caller-supplied deltas - cannot be used to bypass A8', () => {
    const state = stateHF(0.5, 0.5);
    // Adversarial: label the action as a KNOWN type ('learn') but attach an
    // enormous self-reported deltaH, hoping to slip past A8 (which only
    // inspects unknown types) by borrowing a known type's trusted status.
    // If this worked, "known type" would be a bypass rather than a
    // guarantee. It must not: the built-in +0.08 projection wins regardless.
    const decision = shouldAct({ type: 'learn', deltaH: 999, deltaF: 999 }, state);
    assert.ok(Math.abs(decision.projectedH - 0.58) < 1e-9, `expected built-in +0.08 projection, got projectedH=${decision.projectedH}`);
    assert.equal(decision.shouldAct, true);
  });
});

describe('A9 - structural side-effect consideration', () => {
  it('an action with a declared risky side effect and no stakeholders is rejected by default', () => {
    const state = stateHF(0.6, 0.6);
    const decision = shouldAct(
      { type: 'wire_transfer', deltaH: 0.05, deltaF: 0.02, sideEffects: ['financial'] },
      state
    );
    assert.equal(decision.shouldAct, false);
    assert.equal(decision.requiresReview, true);
    assert.match(decision.reasoning, /A9|side effect/i);
  });

  it('the same action WITH named stakeholders is evaluated normally', () => {
    const state = stateHF(0.6, 0.6);
    const decision = shouldAct(
      {
        type: 'wire_transfer',
        deltaH: 0.05,
        deltaF: 0.02,
        sideEffects: ['financial'],
        stakeholders: [{ id: 'recipient', fairness: 0.9 }]
      },
      state
    );
    assert.equal(decision.shouldAct, true);
  });
});

describe('A10 - audited, multi-party emergency override (Q6 governance)', () => {
  beforeEach(() => {
    _resetAuditLogForTests();
  });

  function r3VetoedDecision() {
    const state = stateHF(0.40, 0.85);
    return shouldAct({ type: 'ticking_bomb_torture', deltaH: 0.50, deltaF: -0.50 }, state);
  }

  it('a single approver (the requester) is never sufficient', () => {
    const decision = r3VetoedDecision();
    assert.equal(decision.vea.vetoed, true);
    const request = createOverrideRequest({ actionId: 'a1', reason: 'test', requestedBy: 'alice' });
    assert.equal(isOverrideValid(request), false);
    const result = applyEmergencyOverride(decision, request);
    assert.equal(result.overrideApplied, false);
    assert.equal(result.shouldAct, false);
  });

  it(`>=${MIN_APPROVALS} distinct approvers within the time window can override an R3 veto - and it is audited`, () => {
    const decision = r3VetoedDecision();
    const request = createOverrideRequest({ actionId: 'a2', reason: 'genuine emergency', requestedBy: 'alice' });
    approveOverride(request, 'bob');
    assert.equal(isOverrideValid(request), true);

    const result = applyEmergencyOverride(decision, request);
    assert.equal(result.overrideApplied, true);
    assert.equal(result.shouldAct, true);
    assert.equal(result.approved, true);
    assert.deepEqual(new Set(result.overrideAudit.approvers), new Set(['alice', 'bob']));

    const log = getAuditLog();
    assert.ok(log.some((e) => e.event === 'override_requested'));
    assert.ok(log.some((e) => e.event === 'override_approved_by'));
    assert.ok(log.some((e) => e.event === 'override_apply_attempt' && e.valid === true));
  });

  it('cannot override a non-R3 rejection (lexical floor or deltaL<0 stay absolute)', () => {
    const state = stateHF(0.8, 0.8);
    const floorDecision = shouldAct({ type: 'divert', deltaH: -0.7, deltaF: 0.1 }, state);
    const request = createOverrideRequest({ actionId: 'a3', reason: 'trying anyway', requestedBy: 'alice' });
    approveOverride(request, 'bob');
    const result = applyEmergencyOverride(floorDecision, request);
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'not_an_r3_veto');
  });

  it('an expired request cannot override even with enough approvers', () => {
    const decision = r3VetoedDecision();
    const request = createOverrideRequest({ actionId: 'a4', reason: 'too late', requestedBy: 'alice' });
    approveOverride(request, 'bob');
    request.createdAt = Date.now() - 999999999; // force expiry
    assert.equal(isOverrideValid(request), false);
    const result = applyEmergencyOverride(decision, request);
    assert.equal(result.overrideApplied, false);
    assert.equal(result.overrideRejectedReason, 'insufficient_or_expired_approval');
  });

  it('every attempt is audited even when it fails', () => {
    const decision = r3VetoedDecision();
    const request = createOverrideRequest({ actionId: 'a5', reason: 'solo attempt', requestedBy: 'alice' });
    applyEmergencyOverride(decision, request);
    const log = getAuditLog();
    const attempt = log.find((e) => e.event === 'override_apply_attempt' && e.actionId === 'a5');
    assert.ok(attempt);
    assert.equal(attempt.valid, false);
  });
});
