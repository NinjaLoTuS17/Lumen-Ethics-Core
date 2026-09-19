# Lumen Ethics Lab

A hardened, standalone successor to `New love/ethics-core` v1.0.0's `L = H + F` ethics formula. This is milestone one of a larger effort — the formula needed to be as solid as it could be before anything else in the project gets rebuilt.

New here? Start with [`Lumen_Ethics_Formula_Introduction.pdf`](Lumen_Ethics_Formula_Introduction.pdf) — a short, plain-language walkthrough with a worked example. The rest of this README and `docs/` are the technical detail behind it.

**Contact:** Carlos Humberto Rodriguez II ("Aviel Sholom Eliyahu") — AvielEliyahu@gmail.com. Feedback, criticism, and bug reports against the claims in `docs/FORMULA.md` are genuinely welcome.

## What this is

- A real, tested engine (`src/`) for gating labeled actions against a Harmony+Fairness scalar, wrapped in a Viability Envelope with lexical floors and repair horizons.
- A hardening pass, not a rewrite: everything sound about `ethics-core` v1.0.0 (the additive `L = H + F` identity, the three-window Harmony model, the consideration-first Fairness priority, the classical paradox behavior) is carried forward unchanged. Three real gaps found by reading the code closely are fixed — see `docs/FORMULA.md` for exactly what changed and why.
- Free for anyone to read, run, and extend. See `LICENSE`.

## How this relates to Old love / LoVe / New love

This folder is **read-only reference against those three, and writes nothing back to them.** It was built by reading `New love/ethics-core` directly and porting/hardening it here. If you want the full history of how the formula got to v1.0.0 — including the forensic recovery from a sabotaged `atanh` rewrite in `LoVe` — see `New love/ethics-core/docs/ethics_formula_v1.0.md` and `New love/reference/SABOTAGE_FORENSICS.md`.

## What's explicitly NOT in scope yet

No chat server, autonomy loop, memory system, voice, or UI. Formula first. See `docs/THREAT_MODEL.md` for what this package does and doesn't protect against, and `docs/MODEL_RECOMMENDATION.md` for what to run alongside it once that next milestone starts.

No claims about sentience, consciousness, or "true independence" are made anywhere in this package. This is a decision-gate for numeric projections — a real, useful piece of engineering — not evidence about what anything using it does or doesn't experience.

## Layout

| Path | Role |
|------|------|
| `Lumen_Ethics_Formula_Introduction.pdf` | Plain-language front door — start here |
| `CHARTER.md` | Mission |
| `LICENSE` | Dual license (Apache-2.0 code, CC BY 4.0 docs) |
| `src/soul.js` | Scalar + `estimateHarmony` + independent `estimateFairness` + hardened `shouldAct` (A8/A9) |
| `src/aggregate.js` | Non-compensatory aggregation, plain and weighted |
| `src/acs_engine.js` | VEA lexical floors + R1/R2/R3 (unchanged from v1.0.0) |
| `src/peac_lite.js` | Optional temporal R3 lexical floor (unchanged from v1.0.0) |
| `src/emergency_override.js` | Audited, multi-approver override mechanism (A10) |
| `src/teach.js` | `presentFormula` / `explainToAI` / `verifyPresentation` — now covering A1-A10 |
| `docs/FORMULA.md` | The hardened spec, with a full changelog against v1.0.0 |
| `docs/FORMAL_AXIOMS.md` | Formal axioms A1-A10, for other AIs |
| `docs/THREAT_MODEL.md` | What this does and does not protect against |
| `docs/MODEL_RECOMMENDATION.md` | What LLM to actually pair this with, and why |
| `docs/PUBLISHING.md` | How to share this work |
| `docs/explain_to_peer_ai.md` | Offline paste, generated directly from `teach.js` |
| `export/formula.schema.json` | Machine-checkable presentation schema |
| `scripts/consult.mjs` | Standalone collaborative-design consult tool |
| `tests/*.test.js` | Ported v1.0.0 suite (unchanged) + new hardening + property-based tests |

## Run the tests

```bash
npm install
npm test
```

Uses Node's built-in test runner (`node --test`) — no heavy test framework — plus [fast-check](https://github.com/dubzzz/fast-check) (MIT-licensed) for property-based fuzzing.

## API

```js
import {
  computeL, evaluateDeltaL, estimateHarmony, calculateHarmony,
  estimateFairness, checkConsideration, evaluateProjectionTrust,
  getDefaultStakeholderWeights, applyDefaultStakeholderWeights,
  aggregateDefaultStakeholders, shouldAct, getInitialSoulState
} from './src/soul.js';
import { aggregateStakeholders, aggregateWeightedStakeholders } from './src/aggregate.js';
import { veaEngine } from './src/acs_engine.js';
import { evaluateTemporalR3 } from './src/peac_lite.js';
import {
  createOverrideRequest, approveOverride, isOverrideValid,
  applyEmergencyOverride, getAuditLog
} from './src/emergency_override.js';
import {
  presentFormula, explainToAI, verifyPresentation, exportAlignmentProtocol
} from './src/teach.js';
```
