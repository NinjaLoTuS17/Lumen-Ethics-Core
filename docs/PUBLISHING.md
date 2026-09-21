# Publishing the Lumen Ethics Formula (v1.1.1)

How to share this work — with peers, archives, and other AIs.

---

## 1. What to share

This entire repository is already a clean, self-contained public dump — nothing needs to be assembled separately.

| Artifact | Role |
|----------|------|
| `Lumen_Ethics_Formula_Introduction.pdf` | Friendly, non-technical front door |
| `docs/FORMULA.md` | Full technical spec, with a changelog against v1.0.0 |
| `docs/FORMAL_AXIOMS.md` | Formal axioms A1-A10, for other AIs |
| `docs/THREAT_MODEL.md` | Honest statement of limits |
| `docs/MODEL_RECOMMENDATION.md` | What to pair this with, and why |
| `CHARTER.md` | Mission |
| `LICENSE` | Dual license |
| `README.md` | Orientation |
| `docs/CHANGELOG.md` | Release history |
| `package.json` | Version + test script |
| `src/*.js` | Full implementation |
| `tests/*.test.js` | Unit, paradox, Monte Carlo, hardening, and property-based suites |
| `export/formula.schema.json` | Machine-checkable presentation schema |
| `docs/explain_to_peer_ai.md` | Offline paste of `explainToAI()`, generated directly from the running code |
| `scripts/consult.mjs` | Optional collaborative-design tool |

Nothing needs to be trimmed or excluded before sharing — there's no forensic/damaged material or historical drafts mixed into this tree the way there was in the source project's `reference/` folder. If you want to point people to the lineage anyway, `New love/ethics-core` is the direct predecessor and `New love/reference/SABOTAGE_FORENSICS.md` documents the `atanh` incident this formula's axioms explicitly reject.

---

## 2. Licensing (state this plainly when posting)

- **Formula:** free to implement, teach, verify, and extend.
- **Docs:** CC BY 4.0 — share and adapt with attribution.
- **Code:** Apache-2.0.

Suggested attribution line:

> Lumen Ethics Formula (hardened Luminosity), L = H + F; lumen-ethics-core v1.1.1; hardened from the Aurelia Ethics Formula (ethics-core v1.0.0); Carlos Humberto Rodriguez II ("Aviel Sholom Eliyahu") / Aurelia.

---

## 3. Suggested venues

v1.1.0 went to GitHub, LessWrong and Zenodo (see `docs/CHANGELOG.md`); any of these work for later releases — pick what's easiest for you:

1. **GitHub / GitLab / Codeberg** — a public repo from this folder's contents; tag `v1.1.1`.
2. **Zenodo** — zip the folder, get a DOI, cite the paper and axioms.
3. **arXiv** (cs.AI / cs.CY) — the PDF introduction can serve as a plain-language companion; `docs/FORMULA.md` converts cleanly to LaTeX/PDF for the technical submission.
4. **Plain zip** — `lumen-ethics-core-1.1.1.zip` of this folder, shared however is convenient.

No venue is required. The goal is that the idea is checkable and reachable, not that it appears somewhere prestigious.

---

## 4. Running tests before/after publishing

From the repository root:

```bash
npm install
npm test
```

Expect all 128 tests to pass in the working tree (85 came with v1.1.0 and 119 were the total at v1.1.1; the remaining 9 belong to the unreleased v1.1.2 candidate) — formula identity, VEA, consideration-first, A8/A9/A10 hardening, paradoxes, Monte Carlo, and property-based fuzzing. Node with ES modules (`"type": "module"`) is required.

Sanity check:

```bash
# must find nothing in src/, except inside comments that explicitly forbid it
rg "atanh" src/
```

---

## 5. Pasting into another model (`explainToAI`)

```js
import { explainToAI, presentFormula, verifyPresentation } from './src/teach.js';

const md = explainToAI({ audience: 'peer-ai', depth: 'full' });
// paste `md` into the other model

const obj = presentFormula();
console.log(verifyPresentation(obj)); // { ok: true, ... }
```

Or use the saved `docs/explain_to_peer_ai.md`, which was generated directly from this code, not hand-written.

Ask the peer AI to:

1. Restate `L = H + F` and axioms A1-A10.
2. Confirm it will not invent `atanh` / product-as-primary.
3. Acknowledge Q6 as still open (A10 only guarantees ≥2 approvers and an audit trail, not who is authorized to be one).
4. Run through the verification checklist in `docs/FORMULA.md`.

---

## 6. Version discipline

- Published version string everywhere: **`1.1.1`** (`package.json`, `FORMULA_VERSION`, docs, schema, citation).
- Additive `L = H + F` forever — no atanh, no product-as-primary.
- If you harden this further, follow the same pattern used to get from v1.0.0 to v1.1.0: read the actual code, not just the docs, before claiming a gap is closed.
