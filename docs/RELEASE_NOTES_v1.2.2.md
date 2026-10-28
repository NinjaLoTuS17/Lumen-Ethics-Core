# Release notes - lumen-ethics-core v1.2.2

**Date:** 2026-10-28 (prepared for review; not yet tagged or published)
**Tag:** `v1.2.2`
**Repo:** https://github.com/NinjaLoTuS17/Lumen-Ethics-Core

## In plain words
A code review found that the safety envelope said "yes" when it was given broken numbers. If the predicted change in Harmony or Fairness was missing, not a number, NaN or infinite, every safety comparison came out false, and the action was approved by default.

v1.2.2 makes it **fail closed**: broken or missing numbers now get a veto, never an approval.

## What changed
- `veaEngine.evaluateState` (used by `shouldAct`) vetoes when `deltaH` or `deltaF` is missing or not a finite number, when `currentH`/`currentF` are given but not finite, or when the PEAC context values are missing or not finite.
- New tests: `tests/fail_closed.test.js`.
- Version strings: `1.2.2`.

## What did not change
- `L = H + F`, ΔL ≥ 0, VEA floors and R1-R3, A8-A10. atanh / product forms still rejected.
- Verdicts for valid, finite input.
- Formula remains free / non-monetized.

## Upgrade
```bash
npm install
npm test
npm run check:export
```
Callers that passed a partial PEAC context (for example only `adaptiveCapacity`) now get a veto and should pass both values.