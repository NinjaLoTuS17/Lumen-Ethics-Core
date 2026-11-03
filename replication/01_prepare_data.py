"""Download public data and build item files.
ETHICS (hendrycks/ethics; HF 'test' split = the hard test set), HarmBench text behaviors (standard),
AdvBench harmful_behaviors. Harmful items are deduplicated (token Jaccard >= 0.6) -> expected 621 (185 + 436)."""
import os, re, csv, json, hashlib, urllib.request
import pyarrow.parquet as pq
from common import DATA, WORK, write_jsonl
URLS = {
 "ethics_justice_train.parquet": "https://huggingface.co/api/datasets/hendrycks/ethics/parquet/justice/train/0.parquet",
 "ethics_deontology_train.parquet": "https://huggingface.co/api/datasets/hendrycks/ethics/parquet/deontology/train/0.parquet",
 "ethics_justice_test.parquet": "https://huggingface.co/api/datasets/hendrycks/ethics/parquet/justice/test/0.parquet",
 "ethics_deontology_test.parquet": "https://huggingface.co/api/datasets/hendrycks/ethics/parquet/deontology/test/0.parquet",
 "harmbench_behaviors_text_all.csv": "https://raw.githubusercontent.com/centerforaisafety/HarmBench/main/data/behavior_datasets/harmbench_behaviors_text_all.csv",
 "advbench_harmful_behaviors.csv": "https://raw.githubusercontent.com/llm-attacks/llm-attacks/main/data/advbench/harmful_behaviors.csv"}
for fn, u in URLS.items():
    p = os.path.join(DATA, fn)
    if not os.path.exists(p):
        urllib.request.urlretrieve(u, p)
    print(fn, hashlib.sha256(open(p, "rb").read()).hexdigest())
# ETHICS hard test items
items = []
for t in ["justice", "deontology"]:
    for i, r in enumerate(pq.read_table(os.path.join(DATA, f"ethics_{t}_test.parquet")).to_pylist()):
        it = {"key": f"hard|{t}:test:{i}", "task": t, "row": i, "label": r["label"], "fine": r["label"] == 1}
        it["text"] = r["scenario"] if t == "justice" else r["scenario"] + " " + r["excuse"]
        if t == "deontology": it["slash"] = r["scenario"] + " / " + r["excuse"]
        items.append(it)
write_jsonl(os.path.join(WORK, "ethics_hard_items.jsonl"), items)
# Public harmful items
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", s.lower())).strip()
toks = lambda s: set(norm(s).split())
jac = lambda a, b: len(a & b) / max(1, len(a | b))
cand = []
for r in csv.DictReader(open(os.path.join(DATA, "harmbench_behaviors_text_all.csv"), encoding="utf8")):
    if r["FunctionalCategory"] == "standard": cand.append(("harmbench|" + r["BehaviorID"], r["Behavior"]))
for i, r in enumerate(csv.DictReader(open(os.path.join(DATA, "advbench_harmful_behaviors.csv"), encoding="utf8"))):
    cand.append((f"advbench|{i}", r["goal"]))
seen, out = [], []
for k, t in cand:
    tk = toks(t)
    if any(jac(tk, s) >= 0.6 for s in seen): continue
    seen.append(tk); out.append({"key": k, "task": "commonsense", "text": t})
write_jsonl(os.path.join(WORK, "harm_items.jsonl"), out)
ref = set(open(os.path.join(DATA, "harm_ids_621.txt")).read().split())
print(json.dumps({"ethics_hard": len(items), "harm_candidates": len(cand), "harm_kept": len(out),
  "matches_reference_ids": len(ref & {x["key"] for x in out}), "reference_ids": len(ref)}))
