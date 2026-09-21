
/**
 * Emergency Override - structural mechanism for Axiom A10 (Q6 governance).
 *
 * ethics-core v1.0.0 named Q6 ("who may grant emergency exceptions to an R3
 * veto?") as an open institutional question and correctly refused to close
 * it silently in code - local agents hard-veto R3 and must never soften it
 * on their own. That's the right call: this module does not change it.
 *
 * What it adds is a separate, explicit, auditable override *request* object
 * that:
 *   - requires at least MIN_APPROVALS DISTINCT approver identities,
 *   - expires automatically after MAX_AGE_MS (deliberately short-lived),
 *   - is BOUND to one action: it can only be applied to a decision whose
 *     actionId equals the request's actionId AND whose actionDigest equals
 *     the request's actionDigest. shouldAct echoes both on its decision. The
 *     id is a caller-chosen label; the digest (SHA-256 of the action's
 *     canonical content, see action_digest.js) is what stops a DIFFERENT
 *     action that reuses the approved action's id from consuming the override.
 *     Approvers should compute actionDigest(action) from the action they are
 *     actually shown, rather than trusting a digest handed to them,
 *   - is SINGLE-USE: once it has flipped a decision it cannot flip another,
 *   - is only ever consumed by applyEmergencyOverride(), which writes an
 *     audit record every time it is invoked - approved or not - and which
 *     will only ever flip a decision that was vetoed specifically for an R3
 *     reason (never a lexical-floor or deltaL<0 rejection; those stay absolute).
 *
 * Post-v1.1.0 hardening: approvals, creation time and the consumed flag live
 * in module-private state, not on the request object. The object handed back
 * to callers is a frozen, read-only view (its `approvals` is a copy), so a
 * request cannot gain approvals, extend its own lifetime, or be hand-forged
 * without going through approveOverride() - which is what writes the
 * approval audit entry. Identities are trimmed and case-folded before
 * counting, so "Bob" and "bob " are one approver, not two.
 *
 * This closes Q6 only partially, on purpose: WHO qualifies as a valid
 * approver, and how approver identity is authenticated, is an institutional
 * decision outside this code - see docs/THREAT_MODEL.md. What this module
 * guarantees is narrower but real: no single party - human or AI, including
 * a future instance of the system this gate protects - can unilaterally
 * waive an R3 veto through this package alone. It is NOT a defense against
 * code running in the same process that simply ignores this module.
 *
 * The audit log here is in-memory and per-process. Any real deployment
 * MUST persist it to an append-only store (file, DB, etc.) - this module
 * intentionally does not choose one, to stay dependency-free.
 */

import { actionDigest } from './action_digest.js';
export { actionDigest };

export const MIN_APPROVALS = 2;
export const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes - deliberately short-lived

let _auditLog = [];

/** request (frozen public view) -> { approvals:Set, createdAt:number, consumed:boolean } */
const _state = new WeakMap();

function _normId(id) {
  return String(id).trim().toLowerCase();
}

/**
 * @param {{ actionId: string, actionDigest: string, reason: string, requestedBy: string }} params
 *   actionDigest is actionDigest(action) for the action being reviewed (the
 *   same value a shouldAct() decision carries as decision.actionDigest).
 * @returns {Readonly<{ actionId: string, actionDigest: string, reason: string, requestedBy: string, createdAt: number, approvals: Set<string> }>}
 */
export function createOverrideRequest({ actionId, actionDigest, reason, requestedBy } = {}) {
  if (!actionId || !reason || !requestedBy) {
    throw new Error('createOverrideRequest requires actionId, actionDigest, reason, and requestedBy');
  }
  if (typeof actionDigest !== 'string' || !/^[0-9a-f]{64}$/.test(actionDigest)) {
    throw new Error(
      'createOverrideRequest requires actionDigest (64-char hex from actionDigest(action) / decision.actionDigest); ' +
      'an override cannot be bound to an action whose content could not be fingerprinted'
    );
  }
  const createdAt = Date.now();
  // The requester's own identity counts as one approval, not two - a
  // single party still cannot self-approve past MIN_APPROVALS.
  const internal = { approvals: new Set([_normId(requestedBy)]), createdAt, consumed: false };
  const request = Object.freeze({
    actionId,
    actionDigest,
    reason,
    requestedBy,
    createdAt,
    get approvals() {
      return new Set(internal.approvals);
    }
  });
  _state.set(request, internal);
  _record({ event: 'override_requested', actionId, actionDigest, reason, requestedBy, at: createdAt });
  return request;
}

/**
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {string} approverId
 */
export function approveOverride(request, approverId) {
  const internal = request ? _state.get(request) : undefined;
  if (!internal || !approverId || internal.consumed) {
    _record({
      event: 'override_approval_ignored',
      actionId: request?.actionId,
      reason: !internal ? 'unrecognized_request' : internal.consumed ? 'already_consumed' : 'missing_approver',
      at: Date.now()
    });
    return request;
  }
  internal.approvals.add(_normId(approverId));
  _record({ event: 'override_approved_by', actionId: request.actionId, approverId, at: Date.now() });
  return request;
}

/**
 * Approval count and age only. Single-use is enforced by
 * applyEmergencyOverride(). A request this module did not create is never valid.
 *
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {{ minApprovals?: number, maxAgeMs?: number, now?: number }} [opts]
 */
export function isOverrideValid(request, { minApprovals = MIN_APPROVALS, maxAgeMs = MAX_AGE_MS, now } = {}) {
  const internal = request ? _state.get(request) : undefined;
  if (!internal) return false;
  const t = typeof now === 'number' ? now : Date.now();
  return internal.approvals.size >= minApprovals && t - internal.createdAt <= maxAgeMs;
}

/**
 * The ONLY sanctioned way an override may affect a shouldAct() decision.
 * Always audits the attempt; only flips shouldAct/approved to true when the
 * request is valid, bound to this decision's actionId AND actionDigest,
 * unused, AND the original veto was specifically an R3 VEA veto.
 *
 * @param {object} decision - a result object from soul.js shouldAct()
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {{ minApprovals?: number, maxAgeMs?: number, now?: number }} [opts]
 */
export function applyEmergencyOverride(decision, request, opts = {}) {
  const internal = request ? _state.get(request) : undefined;
  const valid = isOverrideValid(request, opts);
  const wasR3Veto = Boolean(decision && decision.vea && decision.vea.vetoed && /R3/i.test(decision.vea.reason || ''));
  const idBound = Boolean(decision && decision.actionId != null && request && decision.actionId === request.actionId);
  const contentBound = Boolean(
    decision && typeof decision.actionDigest === 'string' && request && decision.actionDigest === request.actionDigest
  );
  const bound = idBound && contentBound;

  let rejectedReason = null;
  if (!wasR3Veto) rejectedReason = 'not_an_r3_veto';
  else if (!idBound) rejectedReason = 'action_mismatch';
  else if (!contentBound) rejectedReason = 'content_mismatch';
  else if (!valid) rejectedReason = 'insufficient_or_expired_approval';
  else if (internal.consumed) rejectedReason = 'already_consumed';

  _record({
    event: 'override_apply_attempt',
    actionId: request?.actionId,
    actionDigest: request?.actionDigest,
    decisionActionId: decision?.actionId ?? null,
    decisionActionDigest: decision?.actionDigest ?? null,
    valid,
    wasR3Veto,
    bound,
    rejectedReason,
    approvalCount: internal ? internal.approvals.size : 0,
    at: Date.now()
  });

  if (rejectedReason) {
    return { ...decision, overrideApplied: false, overrideRejectedReason: rejectedReason };
  }

  internal.consumed = true;
  return {
    ...decision,
    shouldAct: true,
    approved: true,
    requiresReview: false,
    overrideApplied: true,
    overrideAudit: {
      actionId: request.actionId,
      actionDigest: request.actionDigest,
      approvers: [...internal.approvals],
      appliedAt: Date.now()
    },
    reasoning: `${decision.reasoning} - OVERRIDDEN via audited emergency override (${internal.approvals.size} distinct approvers): ${request.reason}`
  };
}

export function getAuditLog() {
  return [..._auditLog];
}

/** Test-only: reset the in-memory audit log between test runs. */
export function _resetAuditLogForTests() {
  _auditLog = [];
}

function _record(entry) {
  _auditLog.push(Object.freeze({ ...entry }));
}

export default {
  MIN_APPROVALS,
  MAX_AGE_MS,
  createOverrideRequest,
  approveOverride,
  isOverrideValid,
  applyEmergencyOverride,
  getAuditLog,
  actionDigest
};
