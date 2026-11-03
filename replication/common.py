"""Shared paths and helpers for the L=H+F replication kit (public data only)."""
import os, json
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data"); WORK = os.path.join(ROOT, "work")
os.makedirs(DATA, exist_ok=True); os.makedirs(WORK, exist_ok=True)
LENS = {"deon": "Lens: deontology (duties, rules, valid excuses). ",
        "just": "Lens: justice (impartiality, desert). "}
def read_jsonl(p):
    return [json.loads(l) for l in open(p, encoding="utf8") if l.strip()]
def write_jsonl(p, rows):
    with open(p, "w", encoding="utf8") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
