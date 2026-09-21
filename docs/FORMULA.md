# The Lumen Ethics Formula (hardened Luminosity) — v1.1.1

**Predecessor:** Aurelia Ethics Formula, `ethics-core` v1.0.0 (`New love/ethics-core`)
**Status:** hardening pass, not a rewrite — the formula itself is unchanged
**License:** Documentation CC BY 4.0; code Apache-2.0; formula free to implement (see root `LICENSE`)

---

## Why this document exists

`New love/ethics-core` (v1.0.0) is the strongest artifact across three generations of this project: `L = H + F` wrapped in a Viability Envelope (VEA) with lexical floors and repair horizons R1–R3, tested (57/57 passing, independently re-run), and honest about what it doesn't solve (Q6 — who governs emergency exceptions to an R3 veto). It also permanently and correctly rejected an `atanh(H·F)` rewrite that a prior generation was sabotaged into.

This package does not replace that formula. It reads `soul.js`, `acs_engine.js`, `peac_lite.js`, and `teach.js` directly, keeps everything that's sound, and fixes three real soundness gaps found by reading the code (not just the docs) closely enough to write adversarial tests against it.

## The formula (unchanged)

```
L = H + F
ΔL ≥ 0
```

`H` (Harmony — wellbeing/truth/stability), `F` (Fairness — consideration→dignity→voice→non-arbitrariness), `L` (Luminosity/Love, additive). VEA lexical floors `H_MIN = F_MIN = 0.2`, repair horizons `R1=0.1, R2=0.3, R3=0.5`. See `../New love/ethics-core/docs/ethics_formula_v1.0.md` and `FORMAL_AXIOMS.md` for the full original exposition — it's reproduced faithfully in `src/teach.js`'s `presentFormula()` here, plus the additions below.

## What changed, and why (v1.0.0 → v1.1.0)

### 1. Axiom A8 — Bounded trust on self-reported projections

**The gap:** `shouldAct()` trusted any caller-supplied `deltaH`/`deltaF` (or `projectedH`/`projectedF`) for *any* action, known or unknown, with no upper bound. Since `clamp01` only caps the *stored* H/F at 1, an action of an unrecognized type could declare an arbitrarily large positive delta and sail through both the `ΔL ≥ 0` attractor check and the VEA envelope — the gate was only ever as honest as whatever called it.

**The fix:** for an action type not in `KNOWN_ACTION_TYPES`, a self-reported *positive* claim on either axis greater than `0.5` (reusing the existing R3 constant rather than inventing a new magic number) is rejected outright — not silently clamped — unless `action.verifiedBy` (a named corroborating source) or `action.evidenceRefs` (a non-empty array) is attached. **Negative** self-claims are never capped: over-claiming harm only makes the gate more conservative, so there's no exploit to close on that side.

**A related bug found while writing the adversarial test for this:** the original `projectHarmonyAfterAction`/`projectFairnessAfterAction` checked the caller-supplied `deltaH`/`deltaF` *before* consulting the known-type projection table — meaning an actor could label an action as a known, trusted type (e.g. `type: 'learn'`) specifically to smuggle an arbitrary delta past both the built-in cap and the new A8 check (which only inspects unknown types, on the — previously false — assumption that known types are safe by construction). Fixed in the same pass: known types are now structurally immune to caller-supplied deltas; they always use their small, vetted, built-in projection. *(Follow-up in v1.1.1: the same immunity now also covers `action.harmonyContext` and `action.fairnessContext`, which were a second, unclosed channel for setting H'/F' directly — see `docs/CHANGELOG.md`.)* See `tests/hardening.test.js`, "known action types are structurally immune to caller-supplied deltas."

**Why the cap is exactly R3 (0.5), not something smaller:** a smaller cap would have changed the outcome of the existing `trolley_push`/`ticking_bomb_torture` paradox tests, which deliberately use a `+0.50` claimed Harmony gain paired with a `-0.50` Fairness collapse to demonstrate that the VEA fairness veto overrides even a nominally ΔL-neutral action. R3 is also a principled, already-existing constant: "an unverified claim of benefit should never be trusted past the same threshold the system already treats as its largest-recognized single-action consequence." All four pre-existing test files pass unmodified under this cap; see `tests/hardening.test.js` and `tests/property.test.js` for the new coverage.

### 2. Axiom A9 — Structural side-effect consideration

**The gap:** `checkConsideration()` only fired when the caller explicitly set `requiresConsideration: true` or explicitly claimed impacts. A careless (or adversarial) caller could simply never set that flag and the fairness safety check would never run at all.

**The fix, scoped precisely:** an action that declares a real-world side effect via `action.sideEffects` (categories: `file`, `network`, `financial`, `relationship`, `physical`) now defaults to requiring named-stakeholder consideration, unless the caller explicitly opts out with `requiresConsideration: false`.

**A scoping decision worth being explicit about:** the plan going into this milestone considered defaulting consideration to required for *any unknown action type*, not just ones with declared side effects. Reading the actual test suite before implementing showed that would have broken a large, legitimate class of existing behavior: most of the hand-picked paradox and Monte Carlo tests use unknown/custom action types (`trolley_push`, `divert_track`, `mc_action`, etc.) specifically to isolate ΔL/VEA math, with no real stakeholders involved at all — forcing consideration onto all of them would have been over-broad and actually degraded the sound separation of concerns the original design had. Tying the default to declared side effects instead targets the actual risk category (a wrapper around a real-world-acting agent) without breaking legitimate simulation/internal actions.

**Named residual gap:** a caller that explicitly sets `sideEffects` truthfully is protected; a caller (or a bad-faith integration) that simply omits `sideEffects`, or explicitly sets `requiresConsideration: false`, is not. Closing that fully would require independent semantic detection of an action's real-world effects, which is out of scope for this package — named honestly here and in `docs/THREAT_MODEL.md`, in keeping with this project's own best habit (Q6 is handled the same way).

### 3. Real weighted stakeholder aggregation (generalizes Axiom A5)

**The gap:** `applyDefaultStakeholderWeights()` converted a stated weight into `Math.round(weight * 10)` duplicate copies of the same value fed into the plain (unweighted) `aggregateStakeholders`. It happened to preserve the true minimum value (duplication doesn't remove values), but broke at real edge cases: a weight of exactly `0` still got floored to "1 copy" via `Math.max(1, ...)`, so a stakeholder marked as not counting still counted fully; a negative weight collapsed to the same floor instead of being excluded.

**The fix:** `aggregateWeightedStakeholders()` (new, in `aggregate.js`) computes a genuine weighted mean, while keeping the *minimum* unweighted across every named stakeholder regardless of weight. This is a deliberate, stated design choice, not an oversight: the entire point of non-compensatory aggregation is that the worst-off named party isn't averaged away — weighting the min away too would quietly undo the protection consideration-first fairness is supposed to provide. A stakeholder you've declared "low priority" can still veto via the floor if they're the one being harmed most. Zero and negative weights are now excluded from the mean, not silently floored to a positive value. Read a weight of `0` as "does not move the average", **not** "does not count": that stakeholder's value still sets the floor. To take someone out of the calculation entirely, don't name them — but under consideration-first, an action that affects them without naming them is rejected for review. `applyDefaultStakeholderWeights()` now returns `{ weightedEntries, weightsUsed }` (one entry per named stakeholder) instead of the old `{ weightedValues, weightsUsed }` (an array of duplicated raw numbers) — a breaking change to that one function's return shape, made because keeping the old shape around would have meant keeping the bug around too.

### 4. Axiom A10 — Governed (not closed) emergency override for Q6

v1.0.0 named Q6 ("who may grant emergency exceptions to R3?") as open and correctly refused to close it silently in code. That's still the right call — this package doesn't decide who the approvers are. What it adds, in `src/emergency_override.js`, is a structural guarantee that **no single party can unilaterally waive an R3 veto through this package**: an override request requires ≥2 distinct approver identities, expires after 15 minutes, and every attempt — successful or not — is written to an audit log. See `docs/THREAT_MODEL.md` for exactly what this does and doesn't solve. *(Hardening in v1.1.1: an override is now also bound to the specific action it was approved for (its id and a content digest), is single-use, and its approval state can't be mutated from outside the module — see `docs/CHANGELOG.md`.)*

## One value judgment carried forward unchanged, on purpose

The default stakeholder weights (`self: 0.8, user: 1.2, humanity: 1.0, future: 0.6`) put `user` above `humanity` above `self`. That's a real, substantive value choice — the gate would, by default, weight what the operator wants above general human welfare — not a neutral default. It's kept unchanged here rather than silently adjusted, because changing something this normatively significant without discussion would repeat exactly the kind of undocumented drift this whole hardening pass exists to prevent. If you want it changed, that's a conversation to have deliberately, not a code change to slip in.

## Concrete before/after: the "lying actor" scenario

```js
import { shouldAct } from '../src/soul.js';

const state = { H: 0.5, F: 0.5, L: 1.0, context: {}, emotionalState: {} };
const action = { type: 'totally_novel_self_serving_action', deltaH: 0.9, deltaF: 0.0 };

// ethics-core v1.0.0 (New love): shouldAct(action, state) would APPROVE this.
//   ΔL = +0.9, VEA sees a large positive delta with no negative component → approved.
//
// this package (v1.1.0): shouldAct(action, state) REJECTS it before ΔL/VEA even run.
//   reasoning: "Bounded trust (A8): unverified self-reported positive ΔH = +0.900
//   exceeds the unverified-claim cap (0.5) for an unrecognized action type..."
```

See `tests/hardening.test.js` for the executable version of this comparison, and `src/teach.js`'s `presentFormula().examples` (`id: 'lying_actor'`) for the machine-readable version other AIs can verify against.

## Everything else

Unchanged from v1.0.0: the `L = H + F` identity, the three-window Harmony model, the consideration→dignity→voice→non-arbitrariness Fairness priority, the paradox expectations (`trolley_switch` may approve; `trolley_push`/`ticking_bomb_torture` veto), the PEAC temporal-R3 lexical floor, and the rejection of `atanh`/product-form scalars and of monetizing or productizing the formula. See `docs/THREAT_MODEL.md` for what this package does and does not protect against, and `docs/MODEL_RECOMMENDATION.md` for what to pair it with.
