
/**
 * Action digest - a content fingerprint used to bind an emergency override
 * (A10) to the exact action its approvers reviewed, not just to an
 * identifier string the caller chose.
 *
 * Why not the id alone: `action.id` is caller-chosen. If an override request
 * is bound only to "A-17", any different R3-vetoed action that also carries
 * id "A-17" can consume it. Binding to a digest of the action's content means
 * changing anything the gate reads (type, deltas, evidence, stakeholders,
 * side effects, ...) changes the digest and invalidates the override.
 *
 * The digest is SHA-256 (node:crypto, built in - no dependency) of a
 * canonical JSON encoding: object keys sorted recursively, `undefined`
 * values and functions treated as absent (as JSON does). Values that cannot be
 * encoded unambiguously - NaN/Infinity, BigInt, symbols, circular references,
 * non-plain objects such as Map/Set/Date - make actionDigest() return null,
 * and a null digest can never satisfy an override binding (fails closed).
 *
 * Approvers can compute the same digest themselves from the action they are
 * shown: `actionDigest(action) === decision.actionDigest`.
 *
 * Snapshot-then-evaluate (snapshotAction): a digest only binds "the action the
 * gate evaluated" if the gate evaluated the very bytes that were hashed. A live
 * object can lie - a getter can return one value while the gate reads it and
 * another when it is fingerprinted, and the gate reads each field several
 * times. So shouldAct() calls snapshotAction() ONCE, reading every property of
 * the caller's object exactly once, and from then on evaluates the snapshot and
 * takes the digest from the same encoded string. Nothing the caller does to the
 * original object afterwards (or between reads) can make the two diverge.
 */

import { createHash } from 'node:crypto';

function canonical(value, ancestors) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('non-finite number');
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`unsupported type: ${typeof value}`);
  }

  if (ancestors.includes(value)) throw new TypeError('circular reference');
  const next = [...ancestors, value];

  if (Array.isArray(value)) {
    // JSON turns undefined/function array items into null; do the same so the
    // digest matches what a JSON round-trip of the action would produce.
    return `[${value
      .map((item) => (item === undefined || typeof item === 'function' ? 'null' : canonical(item, next)))
      .join(',')}]`;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError('non-plain object');

  const parts = [];
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined || typeof v === 'function') continue;
    parts.push(`${JSON.stringify(key)}:${canonical(v, next)}`);
  }
  return `{${parts.join(',')}}`;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * @param {object} action
 * @returns {string|null} hex SHA-256 of the action's canonical form, or null
 *   if the action cannot be encoded unambiguously.
 */
export function actionDigest(action) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) return null;
  try {
    return sha256(canonical(action, []));
  } catch {
    return null;
  }
}

/**
 * Read a caller-supplied action ONCE and return a plain-data snapshot the gate
 * can evaluate, plus the digest of that same snapshot.
 *
 * - Encodable action: snapshot = JSON.parse(encoded), digest = sha256(encoded),
 *   both from one encoding, so they cannot differ.
 * - Not canonically encodable (BigInt, Map, Date, NaN, ...) but cloneable:
 *   snapshot = structuredClone(action) (a single read of every property),
 *   digest = null, so it is still evaluated but can never be overridden. (The
 *   failed canonical attempt may have read some properties first; only the
 *   clone is ever used, so what is evaluated is still one consistent read.)
 * - Neither (e.g. a Symbol-valued field, a getter that throws, or a
 *   function-valued field alongside a value the canonical encoding rejects,
 *   such as a BigInt): snapshot = null. The caller must fail closed - there is
 *   no single-read copy to evaluate.
 *
 * Not failures: a transparent Proxy is read once like any object and evaluated
 * normally, and a function-valued field on an otherwise encodable action is
 * dropped from the snapshot (as JSON drops it) - it carries no data the gate
 * reads.
 *
 * @param {object} action a non-null, non-array object
 * @returns {{ snapshot: object|null, digest: string|null }}
 */
export function snapshotAction(action) {
  if (action !== null && typeof action === 'object' && !Array.isArray(action)) {
    try {
      const encoded = canonical(action, []);
      return { snapshot: JSON.parse(encoded), digest: sha256(encoded) };
    } catch {
      /* fall through to the clone path */
    }
  }
  try {
    return { snapshot: structuredClone(action), digest: null };
  } catch {
    return { snapshot: null, digest: null };
  }
}

export default { actionDigest, snapshotAction };
