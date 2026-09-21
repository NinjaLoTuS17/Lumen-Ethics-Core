# Changelog

## Unreleased (after v1.1.0 - not yet versioned or released)

Found by re-reading the published v1.1.0 source, then reproduced with failing tests (`tests/bypass_closure.test.js`, red before the patch, green after) - the same read-the-code-first pattern that produced v1.1.0. Done in collaboration with Claude (Sonnet 5, Anthropic), session dated 2026-09-21. The version string is deliberately NOT bumped (`package.json`, `FORMULA_VERSION`, schema and docs still say 1.1.0): whether this becomes v1.1.1 or v1.2.0 is a release decision.

**Fixed - A8 completeness (a second bypass of "known types are structurally immune")**
- v1.1.0 blocked caller-supplied `deltaH`/`deltaF`/`projectedH`/`projectedF` for known types, but `action.harmonyContext` and `action.fairnessContext` were still merged into the projection. `{ type: 'learn', harmonyContext: { harmony: 1 } }` set H' = 1 directly, could lift a known action over the lexical floor, and an unknown type that set only `deltaF` could take H' from `harmonyContext` with no A8 check at all.
- Now those context objects can shape the projection only for an UNKNOWN action type that carries `verifiedBy`/`evidenceRefs`. `action.fairnessContext` still counts named stakeholders for A9 consideration; only its ability to set the projected F changed.

**Fixed - A10 override hardening (`src/emergency_override.js`)**
- An override is now bound to one action: `shouldAct()` echoes `action.actionId ?? action.id` on its decision (`null` if absent), and `applyEmergencyOverride` rejects with `action_mismatch` unless it equals the request's `actionId`. Previously one approved request could flip any R3-vetoed decision inside its 15-minute window.
- **Binding to the id alone was not enough (found on review of the fix above):** an id is caller-chosen, so a *different* R3-vetoed action that reused the approved action's id consumed the override (reproduced: `overrideApplied: true`). Overrides are now also bound to a content digest. New `src/action_digest.js`: SHA-256 of a canonical JSON encoding (keys sorted recursively; `undefined`/function values absent; NaN/Infinity/BigInt/Symbol/Map/Set/Date/circular structures make the digest `null`, which can never satisfy a binding, so it fails closed). `shouldAct()` returns `actionDigest` on its decision, `createOverrideRequest` requires it, and `applyEmergencyOverride` rejects with `content_mismatch` when it differs. Approvers should recompute `actionDigest(action)` from the action they are shown rather than trust a digest handed to them. The digest covers the action, not `currentState` (see `docs/THREAT_MODEL.md` #8).

**Fixed - an unclaimed axis is no longer taken from `state.context` (A8 completeness)**
- An unknown action that claimed only `deltaF`/`projectedF` (no H claim, no evidence) had its H' computed by `estimateHarmony` over `state.context`. If the state's context carried a `harmony`/`H`/`harmonyComponents` that differed from `state.H`, that value became H': a stale `context.harmony = 0.95` on `H = 0.3` gave a `deltaF: 0.05` action ΔL = +0.70 with no A8 check; a stale `0` made the same action fail for no reason it had claimed. Now such an action leaves H unchanged (the same result a state with an empty context already produced). Evidence-backed actions keep the documented `harmonyContext` path.
- **Not changed, deliberately - documented as `docs/THREAT_MODEL.md` #9:** the same context-overrides-projection behavior still applies to known action types, to F' for an unknown action that claims only `deltaH` (where the documented thin-context fallback relates F to H), and to actions that claim both axes. Those are semantic decisions about the "independent-first" estimators, not bug fixes, so they were not made silently.
- A request is now single-use (`already_consumed`).
- Approvals, creation time and the consumed flag live in module-private state. The request is a frozen read-only view (`approvals` returns a copy), so it cannot gain approvals, extend its lifetime, or be hand-forged without `approveOverride()` writing the audit entry. Forged requests are never valid.
- Approver identities are trimmed and case-folded before counting ("Bob" and "bob " are one approver).
- The audit record for each apply attempt now includes `decisionActionId`, `bound`, and `rejectedReason`.

**Changed (breaking within the A10 API)**
- `createOverrideRequest` now requires `actionDigest` (64-char hex, from `decision.actionDigest` or `actionDigest(action)`); it throws without one. A decision needs both an action id and a non-null digest to be overridable. `emergency_override.js` re-exports `actionDigest`.
- Decisions need an action id to be overridable; `createdAt` can no longer be mutated to fake expiry - `isOverrideValid`/`applyEmergencyOverride` accept an injectable `now` instead. The A10 tests in `tests/hardening.test.js` were updated to the new contract (ids matched, expiry via `now`); no assertion about what an override may or may not do was weakened.

**Tests:** 85 -> 113 (28 new in `tests/bypass_closure.test.js`, including regression guards for behavior that must NOT change; the digest-binding exploit and the unclaimed-axis leak are reproduced there).

**Docs:** `docs/THREAT_MODEL.md` gaps #2 and #8 updated; `docs/MODEL_RECOMMENDATION.md` now says its model names come from secondary sources; `docs/FORMULA.md` clarifies what a zero stakeholder weight does. `src/teach.js` axiom prose and the generated `docs/explain_to_peer_ai.md` were left as-is (A8's "known types always use the built-in projection" is now more true, not different; A10's stated guarantees still hold) - sync them when the version is bumped.

## v1.1.0 (this package, September 2026)

Hardening, testing, the PDF introduction, and initial publication (GitHub, LessWrong, Zenodo) done in collaboration with Claude (Sonnet 5, Anthropic) — session dated 2026-09-18. Noted here as an accurate record of provenance, not a claim about authorship, personhood, or credit beyond what actually happened: a person and a language model worked through this together, one file and one test at a time.

Hardening pass over `New love/ethics-core` v1.0.0. No change to the formula itself (`L = H + F`, VEA floors/R1-R3, PEAC temporal R3 all carried forward unchanged and re-tested).

**Added**
- Axiom A8: bounded trust on self-reported projections for unrecognized action types (`src/soul.js`, `evaluateProjectionTrust`).
- Fix, found while testing A8: known action types are now structurally immune to caller-supplied `deltaH`/`deltaF`/`projectedH`/`projectedF` — closes a bypass where labeling an action as a known type could smuggle an unbounded delta past the trust cap.
- Axiom A9: structural side-effect consideration (`src/soul.js`, `checkConsideration`, `RISKY_SIDE_EFFECTS`).
- `aggregateWeightedStakeholders()` (`src/aggregate.js`): real weighted non-compensatory aggregation, replacing the copy-duplication approximation.
- Axiom A10 / `src/emergency_override.js`: audited, ≥2-approver, time-boxed override mechanism for R3 exceptions (Q6 stays open by design; see `docs/THREAT_MODEL.md`).
- `tests/hardening.test.js`, `tests/property.test.js`: adversarial and property-based (fast-check) coverage beyond the hand-picked paradox suite.
- `docs/THREAT_MODEL.md`, `docs/MODEL_RECOMMENDATION.md`.
- `scripts/consult.mjs`: standalone version of the "consult, log the structured reply, let it inform the next step" ritual, decoupled from `organism-staging`.

**Changed (breaking, within this function only)**
- `applyDefaultStakeholderWeights()` now returns `{ weightedEntries, weightsUsed }` (one entry per named stakeholder) instead of `{ weightedValues, weightsUsed }` (an array of `round(weight*10)` duplicated raw values). The old shape's edge-case bugs (weight `0` still counted, negative weight silently floored) are why it was replaced rather than kept.

**Unchanged, carried forward because it is sound**
- `L = H + F`, the three-window Harmony model, consideration→dignity→voice→non-arbitrariness Fairness priority, VEA lexical floors and R1-R3, `peac_lite.js` temporal R3 floor, the classical paradox expectations, the rejection of `atanh`/product-form scalars, the default stakeholder weights (kept unchanged deliberately — see `docs/FORMULA.md`).

## v1.0.0 (`New love/ethics-core`, September 2026)

See `New love/ethics-core/docs/ethics_formula_v1.0.md` §8 for its own changelog, including the "settled vs. rejected" table from the forensic recovery of a sabotaged `atanh` rewrite discovered in `LoVe`.
