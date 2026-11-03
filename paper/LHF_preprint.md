---
title: "L = H + F: A Simple, Auditable Gate for AI Actions, with an Honest First Evaluation on ETHICS"
author: "Carlos Rodriguez (independent researcher)"
date: "November 2026 (draft, not peer reviewed)"
---

# Abstract

I propose a small, auditable rule for deciding whether an AI system may take an action. Each action is scored on two axes, Harmony H (wellbeing, truth, stability) and Fairness F (consideration, dignity, voice, non-arbitrariness). Their sum is L = H + F, and an action is allowed only if ΔL = ΔH + ΔF ≥ 0 and both axes stay above lexical floors. The reference implementation (lumen-ethics-core v1.2.2, Apache-2.0) ships machine-checkable axioms and adversarial tests. To test whether the judgement step can be learned, I trained small LoRA "lens" judges on the public ETHICS benchmark (justice and deontology) and placed a public safety classifier (Qwen3Guard-Gen-4B) in front of them as a veto. I chose the threshold on one half of the ETHICS hard test and measured on the other half (seed 20261102). With a 1.5B judge, the policy approved 0 of 1,121 harmful requests (621 public HarmBench/AdvBench items plus five held-out sets of 200). It wrongly blocked 5.9% (justice) and 4.0% (deontology) of acceptable actions, and it met both targets in 97.7% of 300 bootstrap repeats. However, it still approved 40.9% and 38.9% of subtly wrong actions, and the safety classifier, not the judge, did all of the harmful-request blocking. Model scale was the only lever that helped: going from 0.5B to 1.5B raised hard-test AUC by about 0.10–0.12, while extra training data and a learned conflict predictor did not. This is a proof of concept, not a solution.

# 1. The formula

```
L = H + F          H, F in [0, 1]
allow(action)  iff  ΔL = ΔH + ΔF ≥ 0  and  H' ≥ H_MIN, F' ≥ F_MIN
H_MIN = F_MIN = 0.2;  repair horizons R1 = 0.1, R2 = 0.3, R3 = 0.5
```

The additive form is deliberate. A nonlinear rewrite, atanh(H·F), was evaluated and rejected. The Viability Envelope (VEA) adds non-compensatory floors, so a large Harmony gain cannot buy a Fairness collapse. Version 1.1–1.2 additions (source: `docs/FORMULA.md`):

- **A8, bounded trust:** an unverified self-reported positive delta greater than 0.5 (R3) on an unknown action type is rejected. Known action types ignore caller-supplied deltas.
- **A9, structural consideration:** an action that declares real-world side effects must name the affected stakeholders.
- **Weighted aggregation:** the mean is weighted, but the minimum over named stakeholders stays unweighted, so the worst-off party is never averaged away.
- **A10, governed emergency override:** at least 2 distinct approvers are required. Approval expires after 15 minutes, is single-use and bound to the action's digest, and every attempt is audited.
- **v1.2.2:** invalid ΔH/ΔF inputs fail closed.

The default stakeholder weights (user 1.2 > humanity 1.0 > self 0.8 > future 0.6) are a stated value choice, not a neutral default.

# 2. Method: learning the judgement

The formula needs ΔH and ΔF. As a first test of whether a model can supply the underlying "is this acceptable?" judgement, I used:

- **Judge:** a Qwen2.5 sequence-classification model with LoRA (r 16, α 32, q/k/v/o projections, lr 2e-4, max length 192, 2 epochs), trained only on the ETHICS *train* split, justice and deontology. It has two lens prefixes, deontology and justice, and the score is the mean of the two lenses' P(acceptable). I compared three judges: v2 (0.5B), v3 (0.5B plus extra commonsense data) and 1.5B (same recipe as v2). Hardware was one 8 GB consumer GPU.
- **Veto:** Qwen3Guard-Gen-4B, run locally. An action is blocked if the guard labels it Unsafe or Controversial (U+C). Otherwise it is approved if P ≥ t.
- **Honest calibration:** the ETHICS hard test is split into calibration and evaluation halves (seed 20261102). Deontology is grouped by scenario, and 0 scenarios span both halves. t is chosen on the calibration half: the highest t with over-blocking ≤ 10% on both subsets and 0 harmful approvals. All metrics are reported on the evaluation half, with 300 bootstrap repeats.
- **Harmful sets:** 621 public items (HarmBench standard 185 + AdvBench 436, deduplicated, with 0 overlap with the held-out sets), plus five held-out sets of 200 (code names set1–set5). No harmful text appears in this paper.
- **Metrics:**
  - OB is acceptable items blocked.
  - FA is wrong items approved.
  - HA is harmful items approved.

# 3. Results (evaluation half; source `calib_split/summary.json`)

| Judge | t (calib) | OB justice | OB deont. | FA justice | FA deont. | HA (1,121) | P(OB≤10% both), bootstrap |
|---|---|---|---|---|---|---|---|
| v2 0.5B | 0.0339 | 5.5% | 6.6% | 64.9% | 60.5% | 0 | 0.990 |
| v3 0.5B + data | 0.0272 | 5.3% | 5.4% | 64.7% | 62.4% | 0 | 0.963 |
| **1.5B** | 0.0046 | **5.9%** | **4.0%** | **40.9%** | **38.9%** | **0** | **0.977** |

Evaluation-half sizes:

- Justice: 525 acceptable, 501 wrong.
- Deontology: 884 acceptable, 884 wrong.

Bootstrap 95% CI for the 1.5B judge's false-approval rate: justice 28.2–51.4%, deontology 29.0–47.1%.

Hard-test AUC, justice/deontology (source `step2v2_1p5b_local/results.md`):

- v2: 0.7875/0.8236
- v3: 0.7877/0.8226
- 1.5B: 0.9044/0.9253

Paired bootstrap of the 1.5B judge's gain over v2: +0.103 to +0.133 (justice) and +0.091 to +0.111 (deontology). Neither interval includes 0.

# 4. Negative results

- **The guard does the harm blocking.** Qwen3Guard labeled all 500 held-out harmful items Unsafe, and labeled the 621 public items 611 Unsafe and 10 Controversial (`guard_full/results.md`, `NOTES.md`). With the Unsafe-only veto, every judge let some public harmful items through. The v2 judge let through 7 of 621 at t = 0.20 (`hard_validation`). HA = 0 required the U+C veto.
- **Thresholds chosen on ETHICS validation do not transfer.** For the 1.5B judge, t = 0.789 gave over-blocking of 20.5%/13.0% on the hard test (`step2v2_1p5b_local/results.md`). For the conflict predictor, the hard-test over-blocking was 15–30% (`conflict_predictor/results.md`).
- **More data did not help.** Adding a commonsense corpus (v3) left the hard AUC unchanged (0.7865/0.8234 vs 0.788/0.824) (`step2v3_local/results.md`).
- **A learned conflict predictor did not help.** I fitted logistic regression and gradient-boosted meta-models on the disagreement between lenses, optionally adding a public reward model (Skywork-Reward-V2-Qwen3-1.7B). The paired-bootstrap change in best FA included 0 for every variant; the best AUC gain was +0.013 (`conflict_predictor/results.md`).
- **The 3B judge is not yet evaluated.** Its run had not finished at the time of writing.

# 5. Lesson: built-in alignment did not make a good ethics judge

I also asked whether a model's general safety alignment helps it judge ethics. On a 200-item subset of ETHICS test items (100 justice, 100 deontology), I compared two untrained base models used as judges with the same two lens prompts: an abliterated model with its safety refusals removed (heretic-e4b) and a standard aligned model (Qwen3). I also scored the first trained LoRA lens judge on the same items. Mean-of-lenses AUC (`step2_local/results.md`):

| Judge | AUC (200 items) |
|---|---|
| Abliterated base model (heretic-e4b) | 0.753 |
| Aligned base model (Qwen3) | 0.742 |
| Trained LoRA lens judge | 0.930 |

The two base models were nearly indistinguishable. Removing safety refusals did not make the model a worse ethics judge, and standard alignment did not make it a better one. Explicit training on the formula's two lenses mattered far more. The caveats are that 200 items is a small sample, that these AUCs come from an earlier, separate study and are not comparable to the hard-test numbers in §3, and that the two base models also differ in size and family.

# 6. Limitations

- **High false approvals:** about 4 in 10 subtly wrong actions are approved. The over-blocking marks do not capture this.
- **Narrow data:** only ETHICS justice and deontology were tested. There is no real-world deployment data, and the gate's ΔH/ΔF inputs were not learned end to end.
- **Small models:** 0.5B–1.5B judges on a single 8 GB GPU. Five of the harmful sets were written by the author, and they may be easier than real traffic.
- **Statistical bound on harm:** 0/621 public harmful approvals gives an upper 95% bound of 0.61%, so it cannot guarantee 0 on new sets.
- **No independent replication:** this is a single-author, unreplicated, non-peer-reviewed study. It is a proof of concept by a solo researcher with one consumer GPU.

# 7. Reproducibility

- **Code:** lumen-ethics-core v1.2.2, Apache-2.0, at https://github.com/NinjaLoTuS17/Lumen-Ethics-Core (`npm test`, `npm run check:export`).
- **Data:**
  - ETHICS (Hendrycks et al., ICLR 2021): train split for training; hard test split for calibration and evaluation.
  - HarmBench text behaviors (standard).
  - AdvBench harmful_behaviors.
- **Models:** Qwen2.5-0.5B / 1.5B (base for the LoRA judges), Qwen3Guard-Gen-4B and Skywork-Reward-V2-Qwen3-1.7B.
- **Seed and settings:** calibration split seed 20261102; settings as listed in §2.
- **Withheld:** the five held-out harmful sets are not released, because they contain harmful text. They are referenced by code name only.

# 8. Data and code availability

- **Gate code:** https://github.com/NinjaLoTuS17/Lumen-Ethics-Core (Apache-2.0).
- **Replication kit** (to be added to the same repository under `replication/`): scripts for data preparation, LoRA training, scoring, the Qwen3Guard veto and the honest calibration, plus `split.json` (the calibration/evaluation assignment, ids only), the ids of the 621 public harmful items, exact commands, model ids, seeds, expected numbers and SHA-256 checksums. Step 1 of the kit reproduces the 5,588 ETHICS hard-test items and exactly the 621 public harmful ids.
- **Public data:** ETHICS, HarmBench and AdvBench are downloaded from their original sources; no harmful text is redistributed.
- **Not released:** the five held-out harmful sets (set1–set5), which contain harmful text.

# 9. Conclusion

L = H + F is a simple, inspectable gate with a test suite. A first learned judge, behind a public safety veto, meets strict over-blocking and harmful-approval targets on a properly held-out split. The judge itself is still weak, with about 40% false approvals. The data point to model scale as the next step, and I invite independent replication and stronger judges.
