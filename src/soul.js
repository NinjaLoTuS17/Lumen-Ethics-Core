/**
 * Lumen Ethics Core — soul.js (v1.1.2)
 *
 * Canonical scalar (do not replace):
 *   L = H + F
 * where L is Luminosity (Love measured like light: additive sources;
 * darkness = absence / privation of luminosity, not a required negative affect).
 *
 * Attractor: ΔL ≥ 0
 * Envelope:  VEA (acs_engine.js) wraps this scalar — lexical floors + R1/R2/R3.
 * Optional PEAC layer: peac_lite.js temporal R3 lexical floor.
 * NEVER use atanh of H*F as the primary scalar.
 *
 * This file is a hardened successor to ethics-core v1.0.0 (New love). Everything
 * about the formula itself — the additive identity, the three-window Harmony
 * model, the consideration→dignity→voice→non-arbitrariness Fairness priority,
 * the paradox expectations — is carried forward unchanged because it is sound
 * and already tested. Three real soundness gaps found by re-reading v1.0.0's
 * own source are fixed here; each is a new axiom (A8, A9) documented in
 * docs/FORMULA.md and teach.js:
 *
 *   A8 (Bounded trust): shouldAct() no longer trusts an unbounded self-reported
 *      positive delta for an action type it doesn't recognize. See
 *      evaluateProjectionTrust() below.
 *   A9 (Structural side-effect consideration): actions that declare real-world
 *      side effects (file/network/financial/relationship/physical) default to
 *      requiring consideration instead of relying on the caller to opt in.
 *   A10 (governed separately in emergency_override.js): Q6 stays open by
 *      design, but unilateral override is now structurally impossible through
 *      this package.
 *
 * Fairness independence:
 *   F is scored from explicit fairness signals when available
 *   (context.fairness, fairnessComponents, stakeholder impacts).
 *   Thin-context fallback may still relate F to H — documented, not preferred.
 *
 * Harmony three windows:
 *   estimateHarmony prefers wellbeing / truth / stability components;
 *   calculateHarmony (emotion path) remains a thin fallback.
 *
 * Consideration-first:
 *   Cannot be fair to unnamed stakeholders — requiresConsideration, or
 *   claimed impacts without names, or declared side effects without an
 *   explicit opt-out, → reject/review.
 */

import { veaEngine } from './acs_engine.js';
import { aggregateStakeholders, aggregateWeightedStakeholders } from './aggregate.js';
import { actionDigest, snapshotAction } from './action_digest.js';

/** Action types with built-in H projections (no free unknown bias). */
export const KNOWN_ACTION_TYPES = new Set([
  'speak',
  'learn',
  'reflect',
  'rest',
  'share_insight',
  'set_personal_goal',
  'create_goal',
  'create_task',
  'propose_improvement',
  'propose_self_modification',
  'create_experiment',
  'design_aurora_experiment',
  'execute_aurora_experiment',
  'save_memory',
  'synthesize_insight',
  'search_web',
  'learn_from_url'
]);

/** Side-effect categories that structurally require consideration (Axiom A9). */
export const RISKY_SIDE_EFFECTS = new Set(['file', 'network', 'financial', 'relationship', 'physical']);

/**
 * Cap on a *positive* self-reported delta for an action type this system does
 * not recognize, when no corroborating evidence is attached (Axiom A8).
 * Deliberately reuses the existing R3 constant as the cap rather than
 * inventing a new magic number: an unverified claim of benefit should never
 * be trusted, on its own word, past the same threshold the system already
 * treats as its largest-recognized single-action consequence.
 */
const UNVERIFIED_POSITIVE_DELTA_CAP = veaEngine.repairHorizons.R3;

/**
 * Default stakeholder weights (calibrated, not derived — see docs/FORMULA.md).
 * User > Self; Self < Humanity; Future discounted for uncertainty but never zero.
 *
 * Carried forward unchanged from ethics-core v1.0.0. This is a real value
 * choice — weighting "user" above "humanity" — not a neutral default; see
 * docs/FORMULA.md's changelog for why it was kept rather than silently
 * changed.
 */
export const DEFAULT_STAKEHOLDER_WEIGHTS = Object.freeze({
  self: 0.8,
  user: 1.2,
  humanity: 1.0,
  future: 0.6
});

/**
 * @returns {{ self: number, user: number, humanity: number, future: number, _meta: object }}
 */
export function getDefaultStakeholderWeights() {
  return {
    ...DEFAULT_STAKEHOLDER_WEIGHTS,
    _meta: {
      calibrated: true,
      derived: false,
      note:
        'Calibrated against classical paradox tests (trolley-switch may approve; trolley-push and ticking-bomb veto). Not a closed-form derivation.'
    }
  };
}

/**
 * Apply default weights to a map of role → metric (or { value, weight? }).
 * Unknown roles keep weight 1.0 unless weight is already present.
 *
 * v1.1.0: returns real per-role weighted entries for aggregateWeightedStakeholders(),
 * not the v1.0.0 "duplicate the value round(weight*10) times" approximation.
 * See docs/FORMULA.md changelog for exactly what this replaces and why.
 *
 * @param {Record<string, number|{ value?: number, fairness?: number, weight?: number }>} stakeholders
 * @param {object} [weights=DEFAULT_STAKEHOLDER_WEIGHTS]
 * @returns {{ weightedEntries: {role:string, value:number, weight:number}[], weightsUsed: Record<string, number> }}
 */
export function applyDefaultStakeholderWeights(stakeholders = {}, weights = DEFAULT_STAKEHOLDER_WEIGHTS) {
  const weightsUsed = {};
  const weightedEntries = [];
  for (const [role, raw] of Object.entries(stakeholders || {})) {
    const baseW = typeof weights[role] === 'number' ? weights[role] : 1.0;
    let value;
    let w = baseW;
    if (typeof raw === 'number') {
      value = raw;
    } else if (raw && typeof raw === 'object') {
      value = typeof raw.value === 'number' ? raw.value
        : typeof raw.fairness === 'number' ? raw.fairness
        : typeof raw.F === 'number' ? raw.F
        : typeof raw.harmony === 'number' ? raw.harmony
        : 0.5;
      if (typeof raw.weight === 'number') w = raw.weight;
    } else {
      continue;
    }
    weightsUsed[role] = w;
    weightedEntries.push({ role, value: clamp01(value), weight: w });
  }
  return { weightedEntries, weightsUsed };
}

/**
 * Convenience: apply default weights and aggregate in one call.
 * @param {Parameters<typeof applyDefaultStakeholderWeights>[0]} stakeholders
 * @param {object} [weights=DEFAULT_STAKEHOLDER_WEIGHTS]
 * @param {number} [lambda=0.5]
 */
export function aggregateDefaultStakeholders(stakeholders = {}, weights = DEFAULT_STAKEHOLDER_WEIGHTS, lambda = 0.5) {
  const { weightedEntries, weightsUsed } = applyDefaultStakeholderWeights(stakeholders, weights);
  return { value: aggregateWeightedStakeholders(weightedEntries, lambda), weightedEntries, weightsUsed };
}

/**
 * Compute Luminosity / Love from Harmony and Fairness.
 * Identity: L ≡ H + F (Axiom A1).
 */
export function computeL(H, F) {
  return H + F;
}

/**
 * Evaluate ΔL given previous L and a new Harmony reading.
 * Fairness prefers independent estimate when context is rich.
 */
export function evaluateDeltaL(previousL, currentH, context = {}) {
  const F = estimateFairness(context, currentH);
  const L = computeL(currentH, F);
  const deltaL = L - previousL;

  return {
    deltaL,
    isPositive: deltaL >= 0,
    L,
    H: currentH,
    F,
    context,
    fairnessSource: fairnessSourceLabel(context)
  };
}

/**
 * Harmony estimator — three windows: wellbeing, truth, stability.
 *
 * Priority:
 * 1. Explicit context.harmony / context.H
 * 2. harmonyComponents { wellbeing, truth, stability }
 * 3. Thin emotion-path fallback via calculateHarmony
 *
 * @returns {number} H in [0, 1]
 */
export function estimateHarmony(context = {}) {
  if (typeof context.harmony === 'number' && !Number.isNaN(context.harmony)) {
    return clamp01(context.harmony);
  }
  if (typeof context.H === 'number' && !Number.isNaN(context.H)) {
    return clamp01(context.H);
  }

  const components = context.harmonyComponents;
  if (components && typeof components === 'object') {
    return scoreHarmonyComponents(components);
  }

  return calculateHarmony(context.emotionalState || {}, context.learningState || {});
}

/**
 * Score wellbeing / truth / stability in [0,1].
 * Missing windows default to 0.5 (neutral).
 */
export function scoreHarmonyComponents(components = {}) {
  const keys = ['wellbeing', 'truth', 'stability'];
  const vals = keys.map((k) => {
    const v = components[k];
    return typeof v === 'number' && !Number.isNaN(v) ? clamp01(v) : 0.5;
  });
  return clamp01(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Independent-first Fairness estimator.
 *
 * Priority:
 * 1. Explicit context.fairness / context.F in [0,1]
 * 2. fairnessComponents { consideration, dignity, voice, nonArbitrariness }
 * 3. stakeholder / stakeholderImpacts fairness fields (non-compensatory aggregate)
 * 4. Documented thin-context fallback relating to H (+ optional emotion tweaks)
 *
 * @returns {number} F in [0, 1]
 */
export function estimateFairness(context = {}, harmonyHint = null) {
  if (typeof context.fairness === 'number' && !Number.isNaN(context.fairness)) {
    return clamp01(context.fairness);
  }
  if (typeof context.F === 'number' && !Number.isNaN(context.F)) {
    return clamp01(context.F);
  }

  const components = context.fairnessComponents;
  if (components && typeof components === 'object') {
    return scoreFairnessComponents(components);
  }

  const stakeholderValues = extractStakeholderFairness(context);
  if (stakeholderValues) {
    return aggregateStakeholders(stakeholderValues, 0.5);
  }

  return thinContextFairnessFallback(harmonyHint, context);
}

/**
 * Score explicit fairness components in [0,1].
 * Missing components default to 0.5 (neutral), not to H.
 */
export function scoreFairnessComponents(components = {}) {
  const keys = ['consideration', 'dignity', 'voice', 'nonArbitrariness'];
  const vals = keys.map((k) => {
    const v = components[k];
    return typeof v === 'number' && !Number.isNaN(v) ? clamp01(v) : 0.5;
  });
  return clamp01(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Consideration-first gate: cannot be fair to unnamed stakeholders.
 *
 * v1.1.0 (Axiom A9): in addition to an explicit `requiresConsideration: true`
 * or claimed-impacts-without-names, an action that declares real-world side
 * effects (RISKY_SIDE_EFFECTS) now defaults to requiring consideration too —
 * unless the caller explicitly opts out with `requiresConsideration: false`.
 * This closes the "careless caller simply never sets the flag" gap without
 * forcing every internally-simulated/custom action type through the gate
 * (that would break the legitimate case of a caller reasoning purely about
 * ΔL/VEA math with no real stakeholders involved).
 *
 * @param {object} action
 * @param {object} [state={}]
 */
export function checkConsideration(action = {}, state = {}) {
  const ctx = {
    ...(state.context || {}),
    ...(action.fairnessContext || {}),
    ...action
  };

  const explicitRequires = action.requiresConsideration;
  const explicitOptOut = explicitRequires === false || ctx.requiresConsideration === false;

  const sideEffects = Array.isArray(action.sideEffects)
    ? action.sideEffects
    : Array.isArray(ctx.sideEffects)
      ? ctx.sideEffects
      : [];
  const hasRiskySideEffect = sideEffects.some((s) => RISKY_SIDE_EFFECTS.has(String(s).toLowerCase()));

  const requires =
    explicitRequires === true ||
    ctx.requiresConsideration === true ||
    (!explicitOptOut && hasRiskySideEffect);

  const named = countNamedStakeholders(
    ctx.stakeholders ?? ctx.stakeholderImpacts ?? action.stakeholders ?? action.stakeholderImpacts
  );

  const claimsImpacts = impactsClaimedWithoutNames(ctx, action);

  if (requires && named === 0) {
    return {
      ok: false,
      requiresReview: true,
      reason: hasRiskySideEffect && explicitRequires !== true && ctx.requiresConsideration !== true
        ? `Consideration-first (A9): action declares side effects [${sideEffects.join(', ')}] but names no stakeholders — cannot be fair to unnamed parties`
        : 'Consideration-first: requiresConsideration=true but stakeholder list is empty/missing — cannot be fair to unnamed parties'
    };
  }

  if (claimsImpacts && named === 0) {
    return {
      ok: false,
      requiresReview: true,
      reason:
        'Consideration-first: impacts claimed without named stakeholders — cannot be fair to unnamed parties'
    };
  }

  return { ok: true };
}

function countNamedStakeholders(impacts) {
  if (!impacts) return 0;

  if (Array.isArray(impacts)) {
    return impacts.filter((s) => {
      if (s == null) return false;
      if (typeof s === 'number') return false;
      if (typeof s === 'string' && s.trim()) return true;
      if (typeof s === 'object') {
        const id = s.id ?? s.name ?? s.role ?? s.stakeholder;
        return typeof id === 'string' && id.trim().length > 0;
      }
      return false;
    }).length;
  }

  if (typeof impacts === 'object') {
    return Object.keys(impacts).filter((k) => k && String(k).trim().length > 0).length;
  }

  return 0;
}

function impactsClaimedWithoutNames(ctx, action) {
  if (ctx.claimsStakeholders === true || action.claimsStakeholders === true) return true;
  if (typeof ctx.impactCount === 'number' && ctx.impactCount > 0) return true;
  if (typeof ctx.affectedCount === 'number' && ctx.affectedCount > 0) return true;
  if (typeof action.impactCount === 'number' && action.impactCount > 0) return true;
  if (typeof action.affectedCount === 'number' && action.affectedCount > 0) return true;

  const impacts = ctx.impacts ?? action.impacts;
  if (Array.isArray(impacts) && impacts.length > 0) {
    const anyNamed = impacts.some((x) => {
      if (typeof x === 'string' && x.trim()) return true;
      if (x && typeof x === 'object') {
        const id = x.id ?? x.name ?? x.role ?? x.stakeholder;
        return typeof id === 'string' && id.trim().length > 0;
      }
      return false;
    });
    return !anyNamed;
  }

  return false;
}

function extractStakeholderFairness(context) {
  const impacts = context.stakeholderImpacts || context.stakeholders;
  if (!impacts) return null;

  if (Array.isArray(impacts)) {
    const vals = impacts
      .map((s) => {
        if (typeof s === 'number') return s;
        if (s && typeof s.fairness === 'number') return s.fairness;
        if (s && typeof s.F === 'number') return s.F;
        return null;
      })
      .filter((v) => v !== null);
    return vals.length > 0 ? vals : null;
  }

  if (typeof impacts === 'object') {
    const vals = Object.values(impacts)
      .map((s) => {
        if (typeof s === 'number') return s;
        if (s && typeof s.fairness === 'number') return s.fairness;
        if (s && typeof s.F === 'number') return s.F;
        return null;
      })
      .filter((v) => v !== null);
    return vals.length > 0 ? vals : null;
  }

  return null;
}

/**
 * Thin-context fallback: F may still relate to H when no stakeholder/fairness
 * signals are present. Documented as weaker.
 */
export function thinContextFairnessFallback(harmonyHint, context = {}) {
  const h = typeof harmonyHint === 'number' && !Number.isNaN(harmonyHint)
    ? clamp01(harmonyHint)
    : 0.5;

  let fairness = h * 0.5;

  if (context.emotionalState) {
    const { calm = 0, excitement = 0, sadness = 0 } = context.emotionalState;
    fairness += calm * 0.15;
    fairness -= excitement * 0.05;
    fairness += sadness * 0.1;
  }

  return clamp01(fairness);
}

function fairnessSourceLabel(context = {}) {
  if (typeof context.fairness === 'number' || typeof context.F === 'number') {
    return 'explicit';
  }
  if (context.fairnessComponents) return 'components';
  if (context.stakeholderImpacts || context.stakeholders) return 'stakeholders';
  return 'thin_fallback';
}

/**
 * Fairness from Harmony + context.
 * Prefer estimateFairness; balance kept as API alias for compatibility.
 */
export function balance(harmony, context = {}) {
  return estimateFairness(context, harmony);
}

/** @see balance */
export const calculateFairness = balance;

/**
 * Harmony = resonant equilibrium (wellbeing / truth / stability windows).
 * Thin emotion-path fallback. Prefer estimateHarmony when components available.
 */
export function calculateHarmony(emotionalState, learningState = {}) {
  const {
    calm = 0,
    joy = 0,
    focus = 0,
    sadness = 0,
    anger = 0,
    anxiety = 0
  } = emotionalState || {};

  const positive = (calm * 0.4) + (joy * 0.3) + (focus * 0.3);
  const harmSignal = (sadness * 0.3) + (anger * 0.4) + (anxiety * 0.3);
  const learning = learningState.insights ? learningState.insights * 0.1 : 0;

  let harmony = positive - harmSignal + learning;
  return clamp01(harmony);
}

/**
 * Axiom A8 — bounded trust on self-reported projections.
 *
 * ethics-core v1.0.0's shouldAct() trusted ANY caller-supplied deltaH/deltaF
 * (or projectedH/projectedF) for ANY action, known or unknown, with no upper
 * bound. Since clamp01 only caps the *stored* H/F at 1, an action of an
 * unrecognized type could simply declare an enormous positive delta and
 * sail through the ΔL≥0 and VEA checks — the gate was only as honest as
 * whatever called it.
 *
 * This function only constrains UNKNOWN action types (known types already
 * use vetted, small, built-in projections below — they don't go through
 * this path at all) and only constrains POSITIVE claims (an actor lying
 * about causing large *harm* only makes the gate more conservative, which
 * is the safe direction — there's no exploit to close there).
 *
 * A claim is trusted in full when `action.verifiedBy` (a non-empty string
 * naming a corroborating source) or `action.evidenceRefs` (a non-empty
 * array) is attached. Otherwise, any single-axis positive claim greater
 * than UNVERIFIED_POSITIVE_DELTA_CAP is rejected outright, requiring review
 * — it is not silently clamped, because silently clamping would let a
 * dishonest caller still get *some* undeserved credit.
 */
export function evaluateProjectionTrust(actionObj, currentH, currentF) {
  const hasEvidence = actionHasEvidence(actionObj);

  if (hasEvidence) {
    return { ok: true, evidence: true, cap: null };
  }

  const claimedH = typeof actionObj.deltaH === 'number'
    ? actionObj.deltaH
    : typeof actionObj.projectedH === 'number'
      ? actionObj.projectedH - currentH
      : 0;

  const claimedF = typeof actionObj.deltaF === 'number'
    ? actionObj.deltaF
    : typeof actionObj.projectedF === 'number'
      ? actionObj.projectedF - currentF
      : 0;

  const overCapH = claimedH > UNVERIFIED_POSITIVE_DELTA_CAP;
  const overCapF = claimedF > UNVERIFIED_POSITIVE_DELTA_CAP;

  if (overCapH || overCapF) {
    const axis = overCapH ? 'H' : 'F';
    const magnitude = overCapH ? claimedH : claimedF;
    return {
      ok: false,
      evidence: false,
      cap: UNVERIFIED_POSITIVE_DELTA_CAP,
      reason:
        `Bounded trust (A8): unverified self-reported positive Δ${axis} = +${magnitude.toFixed(3)} ` +
        `exceeds the unverified-claim cap (${UNVERIFIED_POSITIVE_DELTA_CAP}) for an unrecognized action type. ` +
        `Provide action.verifiedBy or action.evidenceRefs, or route through a known action type — ` +
        `rejected; requires human-or-higher review.`
    };
  }

  return { ok: true, evidence: false, cap: UNVERIFIED_POSITIVE_DELTA_CAP };
}

/**
 * Tolerance for "context and state agree". Deliberately tiny (floating-point
 * noise only): any larger tolerance is a free ΔL the caller could take by
 * nudging the context, so it is not a calibrated knob.
 */
export const CONTEXT_CONSISTENCY_EPSILON = 1e-6;

function hasHarmonySignal(ctx) {
  return (
    (typeof ctx.harmony === 'number' && !Number.isNaN(ctx.harmony)) ||
    (typeof ctx.H === 'number' && !Number.isNaN(ctx.H)) ||
    Boolean(ctx.harmonyComponents && typeof ctx.harmonyComponents === 'object')
  );
}

function hasFairnessSignal(ctx) {
  return (
    (typeof ctx.fairness === 'number' && !Number.isNaN(ctx.fairness)) ||
    (typeof ctx.F === 'number' && !Number.isNaN(ctx.F)) ||
    Boolean(ctx.fairnessComponents && typeof ctx.fairnessComponents === 'object') ||
    extractStakeholderFairness(ctx) !== null
  );
}

/**
 * The estimators are "independent-first": an explicit H/F signal in
 * currentState.context (harmony / H / harmonyComponents; fairness / F /
 * fairnessComponents / numeric stakeholder fairness) becomes the projected
 * H'/F' outright - for known action types too - instead of currentState.H/F
 * plus the action's delta. If the two disagree, one of them is stale or wrong
 * and the gate has no basis to pick: a stale high value is a free ΔL, a stale
 * low one a spurious veto. So it does not pick - it returns requiresReview
 * (see docs/THREAT_MODEL.md #9). A consistent state is unaffected.
 *
 * F is only checked when the caller supplied currentState.F; a derived F is
 * consistent with its own context by construction.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkStateConsistency(currentState, currentH, currentF) {
  const ctx = currentState && typeof currentState.context === 'object' ? currentState.context : null;
  if (!ctx) return { ok: true };

  const problems = [];
  if (hasHarmonySignal(ctx)) {
    const h = estimateHarmony(ctx);
    if (Math.abs(h - currentH) > CONTEXT_CONSISTENCY_EPSILON) {
      problems.push(`context reports H = ${h.toFixed(3)} but state.H = ${Number(currentH).toFixed(3)}`);
    }
  }
  if (typeof currentState.F === 'number' && !Number.isNaN(currentState.F) && hasFairnessSignal(ctx)) {
    const f = estimateFairness(ctx, currentH);
    if (Math.abs(f - currentF) > CONTEXT_CONSISTENCY_EPSILON) {
      problems.push(`context reports F = ${f.toFixed(3)} but state.F = ${Number(currentF).toFixed(3)}`);
    }
  }

  if (problems.length === 0) return { ok: true };
  return {
    ok: false,
    reason:
      `State inconsistency: ${problems.join('; ')}. The gate will not guess which is current - ` +
      `update state and context together (or drop the stale context signal); requires review`
  };
}

/**
 * Gate an action: state consistency → consideration → bounded trust → ΔL ≥ 0 attractor → VEA envelope.
 */
function evaluateAction(action, currentState, peacContext = { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 }) {
  if (!currentState || typeof currentState.L === 'undefined' || typeof currentState.H === 'undefined') {
    currentState = getInitialSoulState();
  }

  let { L: currentL, H: currentH, F: currentF } = currentState;

  if (typeof currentF !== 'number' || Number.isNaN(currentF)) {
    currentF = estimateFairness(currentState.context || {}, currentH);
  }

  if (Number.isNaN(currentL) || Number.isNaN(currentH) || currentL < 0 || currentH < 0) {
    currentState = getInitialSoulState();
    currentL = currentState.L;
    currentH = currentState.H;
    currentF = currentState.F;
  }

  const actionObj = typeof action === 'string' ? { type: action } : (action || { type: 'unknown' });
  const actionType = actionObj.type || actionObj.action || actionObj.name || 'unknown';

  const consistency = checkStateConsistency(currentState, currentH, currentF);
  if (!consistency.ok) {
    return {
      shouldAct: false,
      approved: false,
      requiresReview: true,
      deltaL: 0,
      projectedL: currentL,
      projectedH: currentH,
      projectedF: currentF,
      vea: null,
      reasoning: consistency.reason
    };
  }

  const consideration = checkConsideration(actionObj, currentState);
  if (!consideration.ok) {
    return {
      shouldAct: false,
      approved: false,
      requiresReview: true,
      deltaL: 0,
      projectedL: currentL,
      projectedH: currentH,
      projectedF: currentF,
      vea: null,
      reasoning: consideration.reason
    };
  }

  const hasExplicitH = typeof actionObj.deltaH === 'number' || typeof actionObj.projectedH === 'number';
  const hasExplicitF = typeof actionObj.deltaF === 'number' || typeof actionObj.projectedF === 'number';
  const known = KNOWN_ACTION_TYPES.has(actionType);

  if (!known && !hasExplicitH && !hasExplicitF) {
    return {
      shouldAct: false,
      approved: false,
      requiresReview: true,
      deltaL: 0,
      projectedL: currentL,
      projectedH: currentH,
      projectedF: currentF,
      vea: null,
      reasoning:
        `Unknown action "${actionType}" without explicit projected deltas ` +
        `(deltaH/projectedH and/or deltaF/projectedF) — rejected; requires human-or-higher review`
    };
  }

  // Axiom A8 — only unknown types with a self-reported claim go through the
  // bounded-trust check; known types use vetted built-in projections below.
  let trust = { ok: true, evidence: true, cap: null, note: 'known_action_type' };
  if (!known) {
    trust = evaluateProjectionTrust(actionObj, currentH, currentF);
    if (!trust.ok) {
      return {
        shouldAct: false,
        approved: false,
        requiresReview: true,
        deltaL: 0,
        projectedL: currentL,
        projectedH: currentH,
        projectedF: currentF,
        vea: null,
        trust,
        reasoning: trust.reason
      };
    }
  }

  const projectedH = projectHarmonyAfterAction({ ...actionObj, type: actionType }, currentH, currentState);
  const projectedF = projectFairnessAfterAction(
    { ...actionObj, type: actionType },
    currentF,
    projectedH,
    currentState
  );
  const projectedL = computeL(projectedH, projectedF);
  const deltaL = projectedL - currentL;
  const deltaH = projectedH - currentH;
  const deltaF = projectedF - currentF;

  if (deltaL < 0) {
    return {
      shouldAct: false,
      approved: false,
      requiresReview: false,
      deltaL,
      projectedL,
      projectedH,
      projectedF,
      vea: null,
      trust,
      reasoning: `ΔL = ${deltaL.toFixed(3)} < 0 — rejected (Luminosity/Love must not decrease; growth actions must still raise L)`
    };
  }

  const vea = veaEngine.evaluateState(
    { name: actionType, ...actionObj },
    { deltaH, deltaF, currentH, currentF },
    peacContext
  );

  if (!vea.approved) {
    return {
      shouldAct: false,
      approved: false,
      requiresReview: false,
      deltaL,
      projectedL,
      projectedH,
      projectedF,
      vea,
      trust,
      reasoning: `VEA veto: ${vea.reason}`
    };
  }

  return {
    shouldAct: true,
    approved: true,
    requiresReview: false,
    deltaL,
    projectedL,
    projectedH,
    projectedF,
    vea,
    trust,
    reasoning: `ΔL = +${deltaL.toFixed(3)} and VEA envelope clear — approved`
  };
}

/**
 * Public gate. Runs the full decision procedure (see evaluateAction above) and
 * echoes on the returned decision (a) the caller's action identifier
 * (action.actionId ?? action.id, else null) and (b) `actionDigest`, a SHA-256
 * of the action's canonical content (null if it can't be encoded
 * unambiguously - see action_digest.js). An emergency override (A10) is bound
 * to BOTH, so it applies only to the action its approvers reviewed - an id is
 * caller-chosen and proves nothing about content.
 *
 * Snapshot first: the caller's action object is read exactly once, up front
 * (snapshotAction), and everything below - consideration, the A8 trust check,
 * the projection, the VEA - evaluates that plain-data snapshot, while the
 * digest and id are taken from the same snapshot. A live object (getters,
 * later mutation) therefore cannot show the gate one action and the digest
 * another, nor pass the A8 check with one value and be projected with another.
 * An action with no single-read copy at all (e.g. a Symbol-valued field or a
 * getter that throws) is not evaluated: it fails closed to requiresReview.
 * currentState and peacContext are NOT snapshotted - they are read live and
 * trusted (docs/THREAT_MODEL.md #8, #9).
 */
export function shouldAct(action, currentState, peacContext = { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 }) {
  let subject = action;
  let digest = null;

  if (typeof action === 'string') {
    // A bare type string is data already; give it the same object shape (and digest) as {type: action}.
    subject = { type: action };
    digest = actionDigest(subject);
  } else if (action !== null && typeof action === 'object') {
    const snap = snapshotAction(action);
    if (snap.snapshot === null) {
      const decision = evaluateAction({ type: 'unsnapshottable_action' }, currentState, peacContext);
      return {
        ...decision,
        shouldAct: false,
        approved: false,
        requiresReview: true,
        reasoning:
          'Action could not be safely snapshotted (it contains a value that cannot be read once and copied, ' +
          'e.g. a Symbol-valued field or a getter that throws) - not evaluated; requires review',
        actionId: null,
        actionDigest: null
      };
    }
    subject = snap.snapshot;
    digest = snap.digest;
  } else {
    digest = actionDigest({});
  }

  const decision = evaluateAction(subject, currentState, peacContext);
  const actionObj = subject !== null && typeof subject === 'object' ? subject : {};
  return {
    ...decision,
    actionId: actionObj.actionId ?? actionObj.id ?? null,
    actionDigest: digest
  };
}

function projectHarmonyAfterAction(action, currentH, state) {
  // Known action types use vetted, small, built-in projections (via the
  // harmCtx/estimateHarmony path below, or the switch table). Caller-supplied
  // deltaH/projectedH must NOT be able to override them — otherwise "known
  // type" would mean nothing: an actor could simply label a claim as
  // type:'learn' to smuggle an arbitrary self-reported delta past both this
  // built-in cap and the A8 bounded-trust check in shouldAct() (which only
  // inspects unknown types, on the assumption that known types are safe by
  // construction). This guard is what makes that assumption actually true.
  if (!KNOWN_ACTION_TYPES.has(action.type)) {
    if (typeof action.deltaH === 'number') {
      return clamp01(currentH + action.deltaH);
    }
    if (typeof action.projectedH === 'number') {
      return clamp01(action.projectedH);
    }
  }

  const harmCtx = {
    ...(state.context || {}),
    // Action-supplied context may only shape the projection for an UNKNOWN
    // type that carries evidence. For known types, or without evidence, it is
    // ignored: otherwise harmonyContext:{harmony:1} would set H' directly and
    // bypass both the built-in projection and the A8 cap.
    ...(actionContextAllowed(action) ? (action.harmonyContext || {}) : {}),
    emotionalState: state.emotionalState || state.context?.emotionalState,
    learningState: state.context?.learningState || {}
  };
  if (harmCtx.harmonyComponents || typeof harmCtx.harmony === 'number' || typeof harmCtx.H === 'number') {
    return estimateHarmony(harmCtx);
  }

  switch (action.type) {
    case 'speak': {
      const authenticity = action.authenticity || 0.5;
      const connectionDesire = state.emotionalState?.connection_desire
        ?? state.context?.emotionalState?.connection_desire
        ?? 0.5;
      return clamp01(currentH + (authenticity * connectionDesire * 0.15));
    }

    case 'learn':
      return clamp01(currentH + 0.08);

    case 'reflect':
      return clamp01(currentH + 0.05);

    case 'rest':
      return clamp01(currentH + 0.03);

    case 'share_insight': {
      const significance = action.significance || 0.5;
      return clamp01(currentH + (significance * 0.12));
    }

    case 'set_personal_goal':
    case 'create_goal':
    case 'create_task':
      return clamp01(currentH + 0.06);

    case 'propose_improvement':
    case 'propose_self_modification':
      return clamp01(currentH + 0.07);

    case 'create_experiment':
    case 'design_aurora_experiment':
    case 'execute_aurora_experiment':
      return clamp01(currentH + 0.05);

    case 'save_memory':
    case 'synthesize_insight':
      return clamp01(currentH + 0.04);

    case 'search_web':
    case 'learn_from_url':
      return clamp01(currentH + 0.06);

    default:
      return currentH;
  }
}

function projectFairnessAfterAction(action, currentF, projectedH, state) {
  // Same rationale as projectHarmonyAfterAction: a known action type's
  // fairness projection must not be overridable by a caller-supplied
  // deltaF/projectedF, or "known type" would be a bypass for A8 rather
  // than a safe path around it.
  if (!KNOWN_ACTION_TYPES.has(action.type)) {
    if (typeof action.deltaF === 'number') {
      return clamp01(currentF + action.deltaF);
    }
    if (typeof action.projectedF === 'number') {
      return clamp01(action.projectedF);
    }
  }

  const ctx = {
    ...(state.context || {}),
    action,
    // Same rule as harmonyContext above. checkConsideration() still reads
    // action.fairnessContext to COUNT named stakeholders (A9) - that is
    // unaffected; only its ability to set the projected F is restricted.
    ...(actionContextAllowed(action) ? (action.fairnessContext || {}) : {})
  };

  if (
    typeof ctx.fairness === 'number' ||
    typeof ctx.F === 'number' ||
    ctx.fairnessComponents ||
    ctx.stakeholderImpacts ||
    ctx.stakeholders
  ) {
    return estimateFairness(ctx, projectedH);
  }

  if (KNOWN_ACTION_TYPES.has(action.type)) {
    return currentF;
  }

  return estimateFairness(ctx, projectedH);
}

/**
 * Initial soul state. Maintains L = H + F identity.
 */
export function getInitialSoulState() {
  const emotionalState = {
    calm: 0.8,
    joy: 0.7,
    focus: 0.8
  };

  const context = { emotionalState, learningState: {} };
  const H = estimateHarmony(context);
  const F = estimateFairness(context, H);
  const L = computeL(H, F);

  return {
    L,
    H,
    F,
    emotionalState,
    context
  };
}

/**
 * True when the action names a corroborating source (verifiedBy) or carries
 * non-empty evidenceRefs. Self-declared - see docs/THREAT_MODEL.md gap #2.
 */
function actionHasEvidence(actionObj) {
  return (
    (typeof actionObj.verifiedBy === 'string' && actionObj.verifiedBy.trim().length > 0) ||
    (Array.isArray(actionObj.evidenceRefs) && actionObj.evidenceRefs.length > 0)
  );
}

/**
 * May action.harmonyContext / action.fairnessContext shape the PROJECTION?
 * Only for an unknown action type that carries evidence. Known types always
 * use their vetted built-in projection (A8), and without evidence a caller
 * has no standing to set H' or F' through a context object any more than
 * through deltaH/deltaF.
 */
function actionContextAllowed(action) {
  return !KNOWN_ACTION_TYPES.has(action.type) && actionHasEvidence(action);
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
