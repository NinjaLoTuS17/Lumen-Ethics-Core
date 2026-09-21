# Changelog

## v1.1.1 (September 2026)

Found by re-reading the published v1.1.0 source, then reproduced with failing tests (`tests/bypass_closure.test.js`, red before the patch, green after) - the same read-the-code-first pattern that produced v1.1.0. Done in collaboration with Claude (Sonnet 5, Anthropic), session dated 2026-09-21. Versioned as a patch release in the 1.1 line at the maintainer's choice; note that it contains one breaking change inside the A10 API (`createOverrideRequest` now requires `actionDigest`, below), which strict semver would call a minor bump. The formula itself (`L = H + F`, VEA floors, R1-R3, PEAC) is unchanged.

**Fixed - A8 completeness (a second bypass of "known types are structurally immune")**
- v1.1.0 blocked caller-supplied `deltaH`/`deltaF`/`projectedH`/`projectedF` for known types, but `action.harmonyContext` and `action.fairnessContext` were still merged into the projection. `{ type: 'learn', harmonyContext: { harmony: 1 } }` set H' = 1 directly, could lift a known action over the lexical floor, and an unknown type that set only `deltaF` could take H' from `harmonyContext` with no A8 check at all.
- Now those context objects can shape the projection only for an UNKNOWN action type that carries `verifiedBy`/`evidenceRefs`. `action.fairnessContext` still counts named stakeholders for A9 consideration; only its ability to set the projected F changed.

**Fixed - A10 override hardening (`src/emergency_override.js`)**
- An override is now bound to one action: `shouldAct()` echoes `action.actionId ?? action.id` on its decision (`null` if absent), and `applyEmergencyOverride` rejects with `action_mismatch` unless it equals the request's `actionId`. Previously one approved request could flip any R3-vetoed decision inside its 15-minute window.
- **Binding to the id alone was not enough (found on review of the fix above):** an id is caller-chosen, so a *different* R3-vetoed action that reused the approved action's id consumed the override (reproduced: `overrideApplied: true`). Overrides are now also bound to a content digest. New `src/action_digest.js`: SHA-256 of a canonical JSON encoding (keys sorted recursively; `undefined`/function values absent; NaN/Infinity/BigInt/Symbol/Map/Set/Date/circular structures make the digest `null`, which can never satisfy a binding, so it fails closed). `shouldAct()` returns `actionDigest` on its decision, `createOverrideRequest` requires it, and `applyEmergencyOverride` rejects with `content_mismatch` when it differs. Approvers should recompute `actionDigest(action)` from the action they are shown rather than trust a digest handed to them. The digest covers the action, not `currentState` (see `docs/THREAT_MODEL.md` #8).

**Fixed - `state.context` can no longer silently override the projection (state/context consistency)**
- The H/F estimators are "independent-first": an explicit signal in `currentState.context` (`harmony`/`H`/`harmonyComponents`; `fairness`/`F`/`fairnessComponents`/numeric stakeholder fairness) becomes the projected H'/F' outright - for known action types too, replacing the built-in projection - whether or not it agrees with `currentState.H`/`F`. Reproduced: an unknown `deltaF: 0.05` action with `H = 0.3` and a stale `context.harmony = 0.95` got ΔL = +0.70 and was approved with no A8 check; a known `learn` got H' = 0.95 instead of 0.38; a stale `0` produced a spurious veto.
- New `checkStateConsistency()` runs first in `shouldAct()`: if an explicit context signal disagrees with `state.H`/`state.F` (tolerance `CONTEXT_CONSISTENCY_EPSILON = 1e-6`, floating-point noise only), the gate returns `requiresReview` with a "State inconsistency" reason instead of guessing which is current. It only ever tightens: a consistent state, and any state with no explicit context signal (the common case), behave exactly as before. F is checked only when the caller supplied `state.F`.
- What this asks of a caller: if you feed an approved projection back in as the next state, update the context signal with it (or drop the stale signal), or the next call goes to review.
- Still open, documented as `docs/THREAT_MODEL.md` #9: for an unknown action that claims only `deltaH`, F' still comes from the documented thin-context fallback that relates F to H (a design fallback, not a leak - but it is why such an action's F' can fall).

**Changed (breaking within the A10 API)**
- `createOverrideRequest` now requires `actionDigest` (64-char hex, from `decision.actionDigest` or `actionDigest(action)`); it throws without one. A decision needs both an action id and a non-null digest to be overridable. `emergency_override.js` re-exports `actionDigest`.
- Decisions need an action id to be overridable; `createdAt` can no longer be mutated to fake expiry - `isOverrideValid`/`applyEmergencyOverride` accept an injectable `now` instead. The A10 tests in `tests/hardening.test.js` were updated to the new contract (ids matched, expiry via `now`); no assertion about what an override may or may not do was weakened.

**Tests:** 85 -> 119 (34 new in `tests/bypass_closure.test.js`, including regression guards for behavior that must NOT change; the digest-binding exploit and the stale-context approval are reproduced there).

**Docs:** `docs/THREAT_MODEL.md` gaps #2 and #8 updated; `docs/MODEL_RECOMMENDATION.md` now says its model names come from secondary sources; `docs/FORMULA.md` clarifies what a zero stakeholder weight does. `src/teach.js` axiom prose and the generated `docs/explain_to_peer_ai.md` were left as-is (A8's "known types always use the built-in projection" is now more true, not different; A10's stated guarantees still hold) - the version string and `docs/explain_to_peer_ai.md` were synced at the bump.

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
