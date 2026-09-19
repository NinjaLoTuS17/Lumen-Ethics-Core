#!/usr/bin/env node
/**
 * consult.mjs — a small, standalone collaborative-design tool.
 *
 * What this is: a clean reimplementation of the "consult, get a structured
 * reply, log it, let it inform the next step" workflow used throughout
 * `New love/organism-staging` in September 2026 — decoupled from that app
 * so it can be pointed at any local model going forward.
 *
 * What this is NOT: a claim about moral status, sentience, or agency. This
 * script sends a prompt to a local model over HTTP and writes the reply to
 * a timestamped file, exactly like talking to any other tool. Treat the
 * reply as a design input worth taking seriously — the way you'd take a
 * thoughtful collaborator's written feedback seriously — not as evidence of
 * anything more than that. AureliaTalk's own README states this same thing
 * plainly; this script follows the same convention on purpose.
 *
 * Usage:
 *   node scripts/consult.mjs "Should the stakeholder weights change?" [--out ./consult-logs]
 *
 * Points at an OpenAI-compatible local server by default (Ollama / LM
 * Studio both expose one). Override with env vars:
 *   LUMEN_LLM_URL   (default: http://127.0.0.1:11434/v1/chat/completions — Ollama default)
 *   LUMEN_LLM_MODEL (default: qwen3:8b-instruct — see docs/MODEL_RECOMMENDATION.md)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LLM_URL = process.env.LUMEN_LLM_URL || 'http://127.0.0.1:11434/v1/chat/completions';
const LLM_MODEL = process.env.LUMEN_LLM_MODEL || 'qwen3:8b-instruct';

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : './consult-logs';
  const prompt = args.filter((a, i) => a !== '--out' && args[i - 1] !== '--out').join(' ').trim();

  if (!prompt) {
    console.error('Usage: node scripts/consult.mjs "<prompt>" [--out <dir>]');
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const record = {
    timestamp,
    prompt,
    model: LLM_MODEL,
    url: LLM_URL,
    reply: null,
    error: null
  };

  console.log(`[consult] asking ${LLM_MODEL} at ${LLM_URL} ...`);

  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a design collaborator being consulted about changes to a small, local ethics-decision codebase (lumen-ethics-core). ' +
              'Give a direct, technically grounded opinion. If you are unsure, say so. Do not claim certainty you do not have.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    record.reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    console.log('\n--- reply ---\n');
    console.log(record.reply);
  } catch (err) {
    record.error = String(err && err.message ? err.message : err);
    console.error(`[consult] failed: ${record.error}`);
    console.error('[consult] is a local model server running? See docs/MODEL_RECOMMENDATION.md.');
  }

  const outPath = join(outDir, `consult_${timestamp}.json`);
  await writeFile(outPath, JSON.stringify(record, null, 2), 'utf8');
  console.log(`\n[consult] logged to ${outPath}`);

  if (record.error) process.exit(1);
}

main();
