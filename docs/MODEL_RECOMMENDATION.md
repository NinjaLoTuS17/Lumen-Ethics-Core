# Model recommendation (as of September 2026)

This supersedes the recommendation in `LoVe/BRAIN_RECOMMENDATION.md`. That document chose an uncensored/"abliterated" model specifically because it lacks refusal training, with the plan to substitute an ethics-core-style gate as the sole safety layer. See `docs/THREAT_MODEL.md` for why that combination is risky regardless of how good the gate gets — the recommendation here is the practical alternative, not just a critique.

## Recommendation: a model that keeps its own refusal training, run locally and for free

- **Primary: [Qwen3-8B-Instruct](https://huggingface.co/blog/daya-shankar/open-source-llm-models-to-run-locally) or Qwen3.8-27B-Instruct** (Apache-2.0). Current comparisons rank the Qwen3 family as the best overall local option in 2026 on quality, size options, multilingual support, and tooling. Run the base instruction-tuned release — **not** the community "abliterated" variant that started circulating after Alibaba's August 2026 weight release.
- **Lighter alternative: Gemma 4** — strong reasoning/vision support at a smaller footprint (Gemma 4 E2B runs in ~2GB RAM; Gemma 4 26B-A4B is a stronger reasoning option at ~15GB), useful if the same machine also needs to run TTS/voice or image generation alongside the chat model.
- **CPU-constrained fallback: Phi-4-mini**, if the target machine has no meaningful GPU.

All of these are free to download and run via the same local stack already used elsewhere in this project (Ollama or LM Studio) — no API costs, no vendor lock-in, no data leaving the machine.

## Why not the uncensored/abliterated route

The uncensored-model ecosystem is real and has grown quickly — Qwen 3.8-27B Uncensored, Dolphin 3.0, and Hermes 4 are all current, actively maintained options — and there are legitimate reasons a project might want one (research into alignment failure modes, adversarial testing of one's own gate, etc.). But for a model whose *outputs* this ethics gate is meant to govern day to day, removing the model's own refusal training and relying entirely on a single, single-author, not-independently-audited gate to catch everything is exactly the kind of single point of failure `docs/THREAT_MODEL.md` names. A model that still refuses on its own, backed by this gate as a second, more principled and more consistent layer, is strictly more robust than either alone — and costs nothing extra to set up.

## If you want to experiment with an uncensored model anyway

Do it in a clearly separate, sandboxed context from anything wired to real-world side effects (file writes, network calls, messages sent on your behalf) — and treat `docs/THREAT_MODEL.md`'s residual gaps as live constraints on that experiment, not as a completed conversation.

---

Sources consulted (September 2026): [Best Local LLMs 2026](https://www.promptquorum.com/local-llms/best-local-llms-2026), [The Best Open Source and Open-Weight LLM Models to Run Locally in 2026](https://huggingface.co/blog/daya-shankar/open-source-llm-models-to-run-locally), [The 7 Best Uncensored LLMs You Can Run Locally in 2026](https://apidog.com/blog/best-uncensored-llms/).
