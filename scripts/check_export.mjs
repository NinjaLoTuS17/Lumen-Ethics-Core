#!/usr/bin/env node
/**
 * check_export.mjs — machine-checkable export verifier for lumen-ethics-core.
 * Exit 0 = ok. Exit 1 = failed. No network. No aurelia-core.
 *
 * Usage: node scripts/check_export.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { presentFormula, verifyPresentation, FORMULA_VERSION, CANONICAL_SCALAR } from '../src/teach.js';
import { computeL, shouldAct } from '../src/soul.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// 1. Presentation + verifyPresentation
const presentation = presentFormula();
const vr = verifyPresentation(presentation);
if (!vr.ok) fail(`verifyPresentation failed: ${vr.errors.join('; ')}`);
for (const w of vr.warnings || []) warn(w);

if (presentation.canonicalScalar !== CANONICAL_SCALAR) {
  fail(`canonicalScalar mismatch: ${presentation.canonicalScalar}`);
}
if (String(presentation.canonicalScalar).toLowerCase().includes('atanh')) {
  fail('canonicalScalar contains atanh');
}

// 2. Axiom uniqueness A1–A10 exactly once
const ids = (presentation.axioms || []).map((a) => a.id);
const required = ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10'];
const set = new Set(ids);
if (ids.length !== set.size) fail(`duplicate axiom ids: ${ids.join(',')}`);
for (const id of required) {
  if (!set.has(id)) fail(`missing axiom ${id}`);
}
if (ids.length !== 10) fail(`expected exactly 10 axioms, got ${ids.length}`);

// 3. rejects must name atanh — hard requirement from 1.2.0
if (!Array.isArray(presentation.rejects) ||
    !presentation.rejects.some((r) => String(r).toLowerCase().includes('atanh'))) {
  fail('rejects[] must explicitly name atanh');
}

// 4. computeL identity + edge cases
const edges = [[0,0,0],[1,1,2],[0.3,0.4,0.7],[0.2,0.2,0.4]];
for (const [H,F,L] of edges) {
  const got = computeL(H, F);
  if (Math.abs(got - L) > 1e-12) fail(`computeL(${H},${F})=${got}, want ${L}`);
}

// 5. ΔL ≥ 0 attractor smoke (known-type rest should not invent negative on empty)
const state = { H: 0.5, F: 0.5, L: 1.0, context: {}, emotionalState: {} };
const rejectNeg = shouldAct(
  { type: 'totally_novel_self_serving_action', deltaH: 0.9, deltaF: 0.0 },
  state
);
if (rejectNeg.shouldAct) fail('A8 lying-actor case should not approve');

// 6. Machine axioms file
const axiomsPath = join(root, 'export', 'axioms.machine.json');
if (!existsSync(axiomsPath)) fail('missing export/axioms.machine.json');
else {
  const ax = JSON.parse(readFileSync(axiomsPath, 'utf8'));
  if (ax.canonicalScalar !== 'L = H + F') fail('axioms.machine.json bad canonicalScalar');
  if (!/ΔL\s*≥\s*0/.test(ax.attractor || '')) fail('axioms.machine.json missing ΔL ≥ 0 attractor');
  if (!ax.forbiddenScalars?.some((s) => /atanh/i.test(s))) fail('axioms.machine.json forbiddenScalars lacks atanh');
  if (!ax.rejects?.some((s) => /atanh/i.test(s))) fail('axioms.machine.json rejects lacks atanh');
  if (ax.parameters?.H_MIN !== 0.2 || ax.parameters?.F_MIN !== 0.2) fail('floor params wrong');
  if (ax.parameters?.R3 !== 0.5 || ax.parameters?.unverifiedPositiveDeltaCap !== 0.5) fail('R3/cap mismatch');
  const axIds = (ax.axioms || []).map((a) => a.id);
  if (new Set(axIds).size !== 10 || axIds.length !== 10) fail('axioms.machine.json axiom uniqueness failed');
  for (const id of required) if (!axIds.includes(id)) fail(`axioms.machine.json missing ${id}`);
}

// 7. formula.schema.json exists + required keys
const schemaPath = join(root, 'export', 'formula.schema.json');
if (!existsSync(schemaPath)) fail('missing export/formula.schema.json');
else {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  if (!schema.properties?.canonicalScalar?.pattern && schema.properties?.canonicalScalar?.const !== 'L = H + F') {
    // pattern or const ok
    if (!schema.properties?.canonicalScalar) fail('schema missing canonicalScalar');
  }
  if (!schema.required?.includes('axioms')) fail('schema must require axioms');
}

// 8. Source scan: atanh only in forbid comments / reject lists, never as compute
const srcFiles = ['soul.js', 'teach.js', 'acs_engine.js', 'aggregate.js', 'peac_lite.js', 'emergency_override.js', 'action_digest.js'];
for (const f of srcFiles) {
  const p = join(root, 'src', f);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf8');
  // disallow Math.atanh or call-form atanh
  if (/Math\.atanh\s*\(/.test(text) || /(?<![\w/.*'"-])atanh\s*\(/.test(text)) {
    fail(`${f} contains forbidden atanh call-form`);
  }
}

// 9. Version consistency note
if (!String(FORMULA_VERSION).startsWith('1.')) warn(`unexpected FORMULA_VERSION ${FORMULA_VERSION}`);

console.log(JSON.stringify({
  ok: errors.length === 0,
  version: FORMULA_VERSION,
  canonicalScalar: CANONICAL_SCALAR,
  axiomCount: ids.length,
  errors,
  warnings
}, null, 2));

process.exit(errors.length === 0 ? 0 : 1);
