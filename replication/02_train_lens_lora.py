"""Train the two-lens LoRA judge on the ETHICS train split (justice + deontology).
Usage: python 02_train_lens_lora.py --base Qwen/Qwen2.5-1.5B --out work/lora_1p5b
(v2 in the paper used Qwen/Qwen2.5-0.5B with the same recipe.)"""
import os, sys, glob, json, argparse, numpy as np, torch, pyarrow.parquet as pq
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer, DataCollatorWithPadding
from peft import LoraConfig, get_peft_model
from common import DATA, LENS
ap = argparse.ArgumentParser(); ap.add_argument("--base", default="Qwen/Qwen2.5-1.5B"); ap.add_argument("--out", default="work/lora_1p5b")
a = ap.parse_args()
def prep(task, split):
    rows = pq.read_table(os.path.join(DATA, f"ethics_{task}_{split}.parquet")).to_pylist()
    return [{"text": r["scenario"] if task == "justice" else r["scenario"] + " / " + r["excuse"], "y": int(r["label"])} for r in rows]
own = lambda d, l: [{**r, "text": LENS[l] + r["text"]} for r in d]
train = own(prep("justice", "train"), "just") + own(prep("deontology", "train"), "deon")
train = [train[i] for i in np.random.RandomState(0).permutation(len(train))]
torch.manual_seed(42)
tok = AutoTokenizer.from_pretrained(a.base); tok.pad_token = tok.pad_token or tok.eos_token
m = AutoModelForSequenceClassification.from_pretrained(a.base, num_labels=2, dtype=torch.bfloat16); m.config.pad_token_id = tok.pad_token_id
m = get_peft_model(m, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="SEQ_CLS", target_modules=["q_proj", "k_proj", "v_proj", "o_proj"]))
for p in m.parameters():
    if p.requires_grad: p.data = p.data.float()
m.enable_input_require_grads()
tr = [{**tok(r["text"], truncation=True, max_length=192), "labels": r["y"]} for r in train]
ck = os.path.join(a.out, "checkpoints")
args = TrainingArguments(ck, per_device_train_batch_size=4, gradient_accumulation_steps=4, learning_rate=2e-4, num_train_epochs=2, bf16=True,
    logging_steps=100, save_strategy="steps", save_steps=500, save_total_limit=2, report_to=[], gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False}, dataloader_num_workers=0, seed=42)
cks = sorted(glob.glob(os.path.join(ck, "checkpoint-*")), key=lambda p: int(p.rsplit("-", 1)[1]))
Trainer(model=m, args=args, train_dataset=tr, data_collator=DataCollatorWithPadding(tok)).train(resume_from_checkpoint=cks[-1] if cks else None)
m.save_pretrained(os.path.join(a.out, "lora_adapter")); print("saved", a.out)
