# Release notes — lumen-ethics-core v1.2.0

**Released:** 2026-10-19  
**Tag:** `v1.2.0`  
**Repo:** https://github.com/NinjaLoTuS17/Lumen-Ethics-Core

## Highlights
- Machine-checkable axiom export: `export/axioms.machine.json` + `export/axioms.schema.json`
- Verifier: `npm run check:export` (`scripts/check_export.mjs`)
- Stronger `verifyPresentation`: unique A1–A10; `rejects` must name atanh; duplicate axioms fail
- Docs: `FORMAL_AXIOMS.md` §2.1 (uniqueness, ΔL ≥ 0, atanh ban as formal constraint)
- Tests: **141** pass (was 130 at v1.1.2)

## Unchanged (on purpose)
- Canonical scalar **L = H + F**
- Attractor **ΔL ≥ 0**
- atanh / product-as-primary still forbidden
- Formula remains free / non-monetized
- No AGI, ASI, or consciousness claims

## Companion evidence (outside this package tree)
- Teaching-study draft + frozen 2026-10-17 evidence (correct lesson 22/24 vs ~12/24 without)
- 32 outsider cases scored **32/32** against `shouldAct` on 2026-10-19 (original local cases; no external harmful-benchmark download)

## Upgrade from v1.1.2
```bash
npm install
npm test            # 141 pass
npm run check:export
```

## Citation
- This release: GitHub `v1.2.0` (Zenodo version DOI appears when the GitHub–Zenodo integration mints it; concept DOI always points at latest: https://doi.org/10.5281/zenodo.22840260)
- Previous: v1.1.2 https://doi.org/10.5281/zenodo.22878303