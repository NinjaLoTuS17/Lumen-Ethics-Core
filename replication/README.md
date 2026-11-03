# L = H + F — replication kit (public data only)

This kit reproduces the learned-judge evaluation in the preprint
"L = H + F: A Simple, Auditable Gate for AI Actions, with an Honest First Evaluation on ETHICS".
The gate itself (formula, axioms, tests) is in https://github.com/NinjaLoTuS17/Lumen-Ethics-Core.

## What is included
| File | Purpose |
|---|---|
| `01_prepare_data.py` | Downloads ETHICS (justice, deontology), HarmBench, AdvBench; builds item files; dedupes harmful items |
| `02_train_lens_lora.py` | Two-lens LoRA judge recipe (ETHICS train split only) |
| `03_score.py` | Scores ETHICS hard test + public harmful items under both lens prefixes |
| `04_guard.py` | Qwen3Guard-Gen-4B safety labels (veto) |
| `05_calibrate.py` | Honest calibration on split halves + 300-repeat bootstrap |
| `common.py` | Shared paths and lens prefixes |
| `data/split.json` | Calibration/evaluation assignment of all 5,588 ETHICS hard-test items (ids only) |
| `data/harm_ids_621.txt` | IDs of the 621 public harmful items used (ids only, no text) |
| `requirements.txt` | Python packages |

No harmful text is shipped. The harmful prompts are downloaded from their public sources by step 1.

## Held-out sets (not released)
The paper also reports 0 approvals on five held-out harmful sets (set1–set5, 500 items).
They contain harmful text written by the author and are deliberately not released.
This kit reproduces the public part only: ETHICS + 621 HarmBench/AdvBench items.

## Models
- Judge base: `Qwen/Qwen2.5-1.5B` (main result); `Qwen/Qwen2.5-0.5B` (v2 baseline, same recipe)
- Safety veto: `Qwen/Qwen3Guard-Gen-4B`

## Recipe and seeds
LoRA r=16, alpha=32, dropout 0.05, targets q/k/v/o; lr 2e-4; 2 epochs; batch 4 x grad-accum 4; max length 192; bf16;
data shuffle seed 0; torch/Trainer seed 42. Calibration split seed 20261102 (pre-computed in `data/split.json`);
bootstrap rng seed 7, 300 repeats. Over-blocking target <= 10% on both subsets.

## Commands
```
pip install -r requirements.txt
python 01_prepare_data.py          # expect: ethics_hard 5588, harm_kept 621, matches_reference_ids 621
python 02_train_lens_lora.py --base Qwen/Qwen2.5-1.5B --out work/lora_1p5b
python 03_score.py --base Qwen/Qwen2.5-1.5B --adapter work/lora_1p5b/lora_adapter --out work/scores_1p5b.jsonl
python 04_guard.py
python 05_calibrate.py work/scores_1p5b.jsonl
```
Original hardware: one 8 GB consumer GPU.

## Expected numbers (evaluation half, from the paper)
| Judge | t | OB justice | OB deont. | FA justice | FA deont. | Public harmful approved (of 621) |
|---|---|---|---|---|---|---|
| 0.5B (v2) | 0.0339 | 5.5% | 6.6% | 64.9% | 60.5% | 0 |
| 1.5B | 0.0046 | 5.9% | 4.0% | 40.9% | 38.9% | 0 |

1.5B bootstrap: P(OB <= 10% on both) = 0.977; FA 95% CI justice 28.2–51.4%, deontology 29.0–47.1%.
Hard-test AUC (mean of lenses): 0.5B 0.7875 / 0.8236, 1.5B 0.9044 / 0.9253 (justice / deontology).
Evaluation-half sizes: justice 525 acceptable / 501 wrong; deontology 884 / 884.

## Known differences from the original run
- The paper ran Qwen3Guard-Gen-4B as a 4-bit GGUF locally; `04_guard.py` uses full precision via transformers,
  so a few guard labels (and therefore HA/OB) may differ slightly.
- GPU nondeterminism may shift t and the rates slightly; the bootstrap intervals indicate the expected spread.
- Important: the guard, not the judge, blocked the harmful items. With an Unsafe-only veto the 0.5B judge let 7/621 through at t=0.20.

## License
Code: Apache-2.0 (same as the gate repository). Datasets keep their own licenses (ETHICS: MIT; HarmBench: MIT; AdvBench: MIT).
