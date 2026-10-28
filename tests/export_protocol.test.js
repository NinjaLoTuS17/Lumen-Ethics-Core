import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { presentFormula, verifyPresentation, FORMULA_VERSION, CANONICAL_SCALAR } from '../src/teach.js';
import { computeL, shouldAct } from '../src/formula.js';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('export protocol 1.2.x', () => {
  it('presentFormula has unique A1–A10 exactly once', () => {
    const p = presentFormula();
    const ids = p.axioms.map((a) => a.id);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
    for (const id of ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10']) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
  });

  it('canonical scalar is L = H + F and rejects name atanh', () => {
    const p = presentFormula();
    assert.equal(p.canonicalScalar, CANONICAL_SCALAR);
    assert.equal(CANONICAL_SCALAR, 'L = H + F');
    assert.ok(p.rejects.some((r) => /atanh/i.test(r)));
    assert.ok(!/atanh/i.test(p.canonicalScalar));
  });

  it('verifyPresentation ok on live presentation', () => {
    const vr = verifyPresentation(presentFormula());
    assert.equal(vr.ok, true, vr.errors?.join('; '));
  });

  it('verifyPresentation rejects atanh scalar', () => {
    const bad = { ...presentFormula(), canonicalScalar: 'L = atanh-product' };
    const vr = verifyPresentation(bad);
    assert.equal(vr.ok, false);
  });

  it('verifyPresentation rejects duplicate axiom ids', () => {
    const p = presentFormula();
    const dup = {
      ...p,
      axioms: [...p.axioms, { id: 'A1', formal: 'dup', prose: 'dup' }]
    };
    const vr = verifyPresentation(dup);
    assert.equal(vr.ok, false);
    assert.ok(vr.errors.some((e) => /duplicate/i.test(e)));
  });

  it('verifyPresentation rejects missing atanh in rejects (hard)', () => {
    const p = presentFormula();
    const bad = { ...p, rejects: ['monetization'] };
    const vr = verifyPresentation(bad);
    assert.equal(vr.ok, false);
  });

  it('computeL edge cases + ΔL attractor identity', () => {
    assert.equal(computeL(0, 0), 0);
    assert.equal(computeL(1, 1), 2);
    assert.equal(computeL(0.25, 0.75), 1);
    const prev = 1.0;
    const next = computeL(0.4, 0.5);
    assert.ok(next - prev < 0); // ΔL negative
  });

  it('A8 lying actor still rejected', () => {
    const state = { H: 0.5, F: 0.5, L: 1.0, context: {}, emotionalState: {} };
    const r = shouldAct({ type: 'novel_self_serving', deltaH: 0.9, deltaF: 0 }, state);
    assert.equal(r.shouldAct, false);
  });

  it('axioms.machine.json matches uniqueness + floors', () => {
    const ax = JSON.parse(readFileSync(join(root, 'export', 'axioms.machine.json'), 'utf8'));
    assert.equal(ax.canonicalScalar, 'L = H + F');
    assert.match(ax.attractor, /ΔL\s*≥\s*0/);
    assert.equal(ax.parameters.H_MIN, 0.2);
    assert.equal(ax.parameters.R3, 0.5);
    assert.equal(ax.axioms.length, 10);
    assert.equal(new Set(ax.axioms.map((a) => a.id)).size, 10);
  });

  it('check_export.mjs exits 0', () => {
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'check_export.mjs')], {
      encoding: 'utf8',
      cwd: root
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('FORMULA_VERSION is 1.2.2', () => {
    assert.equal(FORMULA_VERSION, '1.2.2');
  });
});
