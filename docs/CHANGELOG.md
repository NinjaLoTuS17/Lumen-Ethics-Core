# Changelog

## v1.1.0 (this package, September 2026)

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
