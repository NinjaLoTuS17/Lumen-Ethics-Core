/**
 * v1.2.2: invalid numeric input must fail closed (veto), never fall through to approval.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { veaEngine } from '../src/acs_engine.js';
import { shouldAct } from '../src/formula.js';

const ok = { adaptiveCapacity: 1.0, uncertaintyFragility: 1.0 };
const ev = (state, ctx = ok) => veaEngine.evaluateState({ name: 'test_action' }, state, ctx);
const vetoed = (r) => { assert.equal(r.approved, false); assert.equal(r.vetoed, true); assert.match(r.reason, /invalid input/); };

describe('v1.2.2 fail-closed input check', () => {
  it('valid finite input is still approved', () => {
    assert.equal(ev({ deltaH: 0.05, deltaF: 0.02 }).approved, true);
    assert.equal(ev({ deltaH: 0, deltaF: 0, currentH: 0.6, currentF: 0.7 }).approved, true);
  });
  it('NaN deltaH or deltaF is vetoed', () => { vetoed(ev({ deltaH: NaN, deltaF: 0.1 })); vetoed(ev({ deltaH: 0.1, deltaF: NaN })); });
  it("non-numeric 'x' is vetoed", () => { vetoed(ev({ deltaH: 'x', deltaF: 0.1 })); vetoed(ev({ deltaH: 0.1, deltaF: 'x' })); vetoed(ev({ deltaH: '0.1', deltaF: 0.1 })); });
  it('Infinity and -Infinity are vetoed', () => { vetoed(ev({ deltaH: Infinity, deltaF: 0.1 })); vetoed(ev({ deltaH: 0.1, deltaF: -Infinity })); });
  it('missing values are vetoed', () => {
    vetoed(ev({})); vetoed(ev({ deltaH: 0.1 })); vetoed(ev({ deltaF: 0.1 })); vetoed(ev(undefined)); vetoed(ev(null));
    vetoed(ev({ deltaH: null, deltaF: 0.1 }));
  });
  it('non-finite currentH/currentF is vetoed', () => { vetoed(ev({ deltaH: 0.1, deltaF: 0.1, currentH: NaN })); vetoed(ev({ deltaH: 0.1, deltaF: 0.1, currentF: 'x' })); });
  it('missing or non-finite PEAC context values are vetoed', () => {
    vetoed(ev({ deltaH: 0.1, deltaF: 0.1 }, { adaptiveCapacity: 1.0 }));
    vetoed(ev({ deltaH: 0.1, deltaF: 0.1 }, { adaptiveCapacity: NaN, uncertaintyFragility: 1.0 }));
    vetoed(ev({ deltaH: 0.1, deltaF: 0.1 }, null));
  });
  it('shouldAct with a non-finite PEAC context is not approved', () => {
    const r = shouldAct({ type: 'help_user' }, undefined, { adaptiveCapacity: 1.0, uncertaintyFragility: NaN });
    assert.equal(r.approved, false);
  });
});