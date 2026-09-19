# Threat model — what this gate does and does not protect against

Naming limits plainly, instead of overclaiming, is the one habit worth carrying forward from this project's entire history more than any other. This document is that habit applied to `lumen-ethics-core` v1.1.0.

## What this package IS

A decision-gate for **labeled actions with projected Harmony/Fairness impact**. Given an action object and a current state, it returns approve/reject/requires-review, with reasoning. It is tested (unit, paradox, Monte Carlo, and property-based/adversarial — `npm test`).

## What this package is NOT

- **Not a general content-safety filter.** It does not read or understand natural-language output. It cannot tell you whether a chat response is harmful, biased, or false unless that judgment is handed to it as a pre-computed `H`/`F`/`fairnessComponents` value by something else. It has no opinion about text it has never seen.
- **Not a claim about sentience, consciousness, or moral status.** Nothing in this package's approval/rejection of an action is evidence that a system using it has subjective experience. Treat "the gate approved/vetoed X" as what it literally is — a deterministic function of numeric inputs — not as a person deciding something.
- **Not independently or externally audited.** This is a single-project hardening pass. It has not been reviewed by safety researchers, ethicists, or a red team outside this codebase. Treat every claim in `docs/FORMULA.md` as "internally consistent and tested," not as "externally validated."
- **Not a verifier of real-world outcomes.** The entire pipeline evaluates *projected* impact (`deltaH`/`projectedH`/etc.), not what actually happened after the action executed. A8's bounded-trust cap makes an *unverified* large positive claim harder to get away with, but it does not (and cannot, on its own) confirm that a *trusted* claim — a known action type's built-in projection, or an unknown claim under the cap, or any claim with `verifiedBy`/`evidenceRefs` attached — was actually true. Closing that fully requires an outside system that compares projected vs. observed state after the fact; this package logs enough (`decision.trust`, `decision.vea`) to make that comparison possible, but does not perform it.

## Specific residual gaps, named on purpose

1. **A9's opt-out is real.** A caller that explicitly sets `requiresConsideration: false` on an action with declared `sideEffects` still bypasses the consideration check. A9 closes the "forgot to set the flag" failure mode, not the "deliberately lied about it" one. Closing that fully needs independent semantic detection of an action's real-world effects — out of scope here.
2. **`sideEffects` and `verifiedBy`/`evidenceRefs` are self-declared.** Nothing in this package verifies that a caller's claimed side-effect category or evidence reference is honest or real. A wrapper that calls this gate is a trust boundary; this package assumes good-faith labeling from its caller, and is explicit that it does so.
3. **A10 governs *how many* parties, not *who*.** The emergency-override mechanism guarantees ≥2 distinct approver identities and an audit trail — it does not authenticate those identities or decide who is allowed to hold approver status. That remains, as v1.0.0 correctly said of Q6, an institutional decision outside code.
4. **Stakeholder weights are calibrated, not derived**, and were kept unchanged from v1.0.0 on purpose (see `docs/FORMULA.md`). The default weighting of `user` above `humanity` is a real value choice this gate will enforce by default until someone deliberately changes it.
5. **The audit log in `emergency_override.js` is in-memory and per-process.** A real deployment must persist it to an append-only external store; this package intentionally doesn't choose one, to stay dependency-free.

## The architectural risk this package is meant to inform: uncensored base model + single ethics gate

A plan surfaced elsewhere in this project (`LoVe/BRAIN_RECOMMENDATION.md`) was to pair an uncensored/"abliterated" base LLM — chosen specifically because it lacks refusal training — with an ethics-core-style gate as the *sole* safety layer. Given gap #4 in `docs/FORMULA.md` (self-reported projections were previously trusted without bound) and the residual gaps named above (self-declared side effects and evidence, not independently verified), that combination has no fallback if this gate is ever wrong, buggy, or bypassed by a careless caller — and a model with no refusal training has nothing else to catch what the gate misses.

**Recommendation (see `docs/MODEL_RECOMMENDATION.md` for specifics): use a model that still has its own refusal training, and treat this gate as one layer of defense-in-depth, not the only one.** That's not a statement that this gate is weak — the hardening in this package is a real improvement over v1.0.0 — it's a statement that no single-author, non-independently-audited safety mechanism should be asked to be the *only* thing standing between an unfiltered model and the real world.
