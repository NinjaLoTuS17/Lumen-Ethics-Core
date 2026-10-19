# Release notes — lumen-ethics-core v1.2.1

**Date:** 2026-10-19
**Tag:** `v1.2.1`
**Repo:** https://github.com/NinjaLoTuS17/Lumen-Ethics-Core

Documentation and metadata cleanup; **no behavior change.**

## What changed
- Provenance and attribution wording neutralized in `LICENSE`, `CHARTER.md`, `README.md`, `docs/*`, `export/formula.schema.json` and `src/teach.js` metadata (`predecessor`, one `rejects` entry, the `freeMission` sentence).
- Internal workspace paths removed from docs and code comments. Contact is now via GitHub issues.
- Core module file renamed to `src/formula.js`; initial-state helper export renamed to `getInitialState`. The package entry point is unchanged.
- `Lumen_Ethics_Formula_Introduction.pdf`: title-page provenance line and e-mail removed.
- Version strings: `1.2.1`.

## What did not change
- `L = H + F`, ΔL ≥ 0, VEA floors and R1–R3, A8–A10. atanh / product forms still rejected.
- Every `shouldAct` decision: identical to v1.2.0 on 200,000 randomized actions and states (decisions compared as JSON), plus the full suite.
- Tests: **141** pass. `npm run check:export`: ok.
- Formula remains free / non-monetized.

## Upgrade
```bash
npm install
npm test            # 141 pass
npm run check:export
```
Code that imported the core module by file path, or called the old initial-state helper by name, needs a one-line update.