
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

/**
 * @param {object} action
 * @returns {string|null} hex SHA-256 of the action's canonical form, or null
 *   if the action cannot be encoded unambiguously.
 */
export function actionDigest(action) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) return null;
  try {
    return createHash('sha256').update(canonical(action, [])).digest('hex');
  } catch {
    return null;
  }
}

export default { actionDigest };
