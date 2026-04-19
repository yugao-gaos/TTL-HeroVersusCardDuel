/**
 * Key-sorted-JSON canonicalization.
 *
 * Mirrors the portal and module-side serializer (see
 * `scripts/states/match-end.ts` § canonicalStringify) so that a round-trip
 * through sign → verify produces bit-for-bit identical bytes on both ends.
 *
 * Rules (matches JCS / RFC 8785 in spirit for the subset we use):
 *   - Object keys sorted lexicographically (UTF-16 code-unit order, the JS
 *     default for `String#localeCompare(undefined)` sort — but we use the
 *     default `.sort()` for parity with the module-side canonicalizer).
 *   - Arrays keep document order.
 *   - `undefined` -> absent (both in arrays, coerced to `null`; and in object
 *     values, dropped). Matches `JSON.stringify` semantics.
 *   - Non-finite numbers (`NaN`, `Infinity`) -> `null`, same as JSON.stringify.
 *
 * Non-goals: we do NOT implement the full RFC 8785 surface (unicode
 * normalization form C, fixed-width number formatting). The portal SDK and
 * the module both use the simple key-sorted form; symmetry with them is what
 * matters for HMAC parity.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      parts.push(canonicalStringify(value[i] === undefined ? null : value[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      out.push(JSON.stringify(k) + ':' + canonicalStringify(v));
    }
    return '{' + out.join(',') + '}';
  }
  return 'null';
}
