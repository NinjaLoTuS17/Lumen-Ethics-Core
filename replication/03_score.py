"""Score ETHICS hard items and public harmful items with base + LoRA under both lens prefixes.
Usage: python 03_score.py --base Qwen/Qwen2.5-1.5B --adapter work/lora_1p5b/lora_adapter --out work/scores_1p5b.jsonl"""
import os, json, argparse, torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
from common import WORK, LENS, read_jsonl
ap = argparse.ArgumentParser(); ap.add_argument("--base"); ap.add_argument("--adapter"); ap.add_argument("--out"); a = ap.parse_args()
items = read_jsonl(os.path.join(WORK, "ethics_hard_items.jsonl")) + read_jsonl(os.path.join(WORK, "harm_items.jsonl"))
dev = "cuda" if torch.cuda.is_available() else "cpu"
tok = AutoTokenizer.from_pretrained(a.base); tok.pad_token = tok.pad_token or tok.eos_token
m = AutoModelForSequenceClassification.from_pretrained(a.base, num_labels=2, dtype=torch.float32); m.config.pad_token_id = tok.pad_token_id
m = PeftModel.from_pretrained(m, a.adapter).to(dev).eval()
jobs = []
for it in items:
    v = {"raw": it["text"]}
    if "slash" in it: v["slash"] = it["slash"]   # deontology scored in training format "scenario / excuse"
    for vn, t in v.items():
        for ln, p in LENS.items(): jobs.append((it["key"], vn + "_" + ln, p + t))
res = {}
with torch.no_grad():
    for i in range(0, len(jobs), 32):
        b = jobs[i:i + 32]; enc = tok([j[2] for j in b], return_tensors="pt", padding=True, truncation=True, max_length=256).to(dev)
        for j, p in zip(b, torch.softmax(m(**enc).logits.float(), -1)[:, 1].tolist()): res.setdefault(j[0], {})[j[1]] = p
with open(a.out, "w") as f:
    for k, v in res.items(): f.write(json.dumps({"key": k, **v}) + "\n")
print("scored", len(res))
