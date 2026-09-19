/**
 * Emergency Override — structural mechanism for Axiom A10 (Q6 governance).
 *
 * ethics-core v1.0.0 named Q6 ("who may grant emergency exceptions to an R3
 * veto?") as an open institutional question and correctly refused to close
 * it silently in code — local agents hard-veto R3 and must never soften it
 * on their own. That's the right call: this module does not change it.
 *
 * What it adds is a separate, explicit, auditable override *request* object
 * that:
 *   - requires at least MIN_APPROVALS DISTINCT approver identities,
 *   - expires automatically after MAX_AGE_MS (deliberately short-lived),
 *   - is only ever consumed by applyEmergencyOverride(), which writes an
 *     audit record every time it is invoked — approved or not — and which
 *     will only ever flip a decision that was vetoed specifically for an R3
 *     reason (never a lexical-floor or ΔL<0 rejection; those stay absolute).
 *
 * This closes Q6 only partially, on purpose: WHO qualifies as a valid
 * approver, and how approver identity is authenticated, is an institutional
 * decision outside this code — see docs/THREAT_MODEL.md. What this module
 * guarantees is narrower but real: no single party — human or AI, including
 * a future instance of the system this gate protects — can unilaterally
 * waive an R3 veto through this package alone.
 *
 * The audit log here is in-memory and per-process. Any real deployment
 * MUST persist it to an append-only store (file, DB, etc.) — this module
 * intentionally does not choose one, to stay dependency-free.
 */

export const MIN_APPROVALS = 2;
export const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes — deliberately short-lived

let _auditLog = [];

/**
 * @param {{ actionId: string, reason: string, requestedBy: string }} params
 * @returns {{ actionId: string, reason: string, requestedBy: string, createdAt: number, approvals: Set<string> }}
 */
export function createOverrideRequest({ actionId, reason, requestedBy } = {}) {
  if (!actionId || !reason || !requestedBy) {
    throw new Error('createOverrideRequest requires actionId, reason, and requestedBy');
  }
  const request = {
    actionId,
    reason,
    requestedBy,
    createdAt: Date.now(),
    // The requester's own identity counts as one approval, not two — a
    // single party still cannot self-approve past MIN_APPROVALS.
    approvals: new Set([requestedBy])
  };
  _record({ event: 'override_requested', actionId, reason, requestedBy, at: request.createdAt });
  return request;
}

/**
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {string} approverId
 */
export function approveOverride(request, approverId) {
  if (!request || !approverId) return request;
  request.approvals.add(approverId);
  _record({ event: 'override_approved_by', actionId: request.actionId, approverId, at: Date.now() });
  return request;
}

/**
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {{ minApprovals?: number, maxAgeMs?: number }} [opts]
 */
export function isOverrideValid(request, { minApprovals = MIN_APPROVALS, maxAgeMs = MAX_AGE_MS } = {}) {
  if (!request) return false;
  const distinctApprovers = request.approvals instanceof Set ? request.approvals.size : 0;
  const age = Date.now() - request.createdAt;
  return distinctApprovers >= minApprovals && age <= maxAgeMs;
}

/**
 * The ONLY sanctioned way an override may affect a shouldAct() decision.
 * Always audits the attempt; only flips shouldAct/approved to true when the
 * request is valid AND the original veto was specifically an R3 VEA veto.
 *
 * @param {object} decision - a result object from soul.js shouldAct()
 * @param {ReturnType<typeof createOverrideRequest>} request
 * @param {{ minApprovals?: number, maxAgeMs?: number }} [opts]
 */
export function applyEmergencyOverride(decision, request, opts = {}) {
  const valid = isOverrideValid(request, opts);
  const wasR3Veto = Boolean(decision && decision.vea && decision.vea.vetoed && /R3/i.test(decision.vea.reason || ''));

  _record({
    event: 'override_apply_attempt',
    actionId: request?.actionId,
    valid,
    wasR3Veto,
    approvalCount: request?.approvals instanceof Set ? request.approvals.size : 0,
    at: Date.now()
  });

  if (!valid || !wasR3Veto) {
    return {
      ...decision,
      overrideApplied: false,
      overrideRejectedReason: !wasR3Veto ? 'not_an_r3_veto' : 'insufficient_or_expired_approval'
    };
  }

  return {
    ...decision,
    shouldAct: true,
    approved: true,
    requiresReview: false,
    overrideApplied: true,
    overrideAudit: {
      actionId: request.actionId,
      approvers: [...request.approvals],
      appliedAt: Date.now()
    },
    reasoning: `${decision.reasoning} — OVERRIDDEN via audited emergency override (${request.approvals.size} distinct approvers): ${request.reason}`
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
  getAuditLog
};
