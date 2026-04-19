/**
 * WebCrypto HMAC-SHA256 helpers for the arbitration worker.
 *
 * Cloudflare Workers expose WebCrypto as `crypto.subtle`. The same API is
 * available in Node 20+ under the global `crypto` (no import needed), which
 * keeps the unit test (`tests/arbitrate.test.ts`) portable.
 *
 * The signing scheme matches what A5's outbound end-game envelope signing
 * does (see `scripts/states/match-end.ts` § endGame dispatch and
 * session-api.md § End-game capability → Signed envelope):
 *
 *   hex = HMAC-SHA256(secret, canonical(envelope) + String(ts))
 *
 * where `canonical` is the key-sorted-JSON serializer in ./canonical.ts.
 *
 * The `ts` is carried in the signature object and covered by the HMAC;
 * verifying requires re-canonicalizing the envelope and re-concatenating the
 * signature's `ts`. Replay protection is `drift > MAX_DRIFT` → reject.
 */
import { canonicalStringify } from './canonical.ts';

const ENCODER = new TextEncoder();

async function importHmacKey(secretUtf8: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secretUtf8),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    const b = view[i].toString(16);
    hex += b.length === 1 ? '0' + b : b;
  }
  return hex;
}

function hexToBytes(hex: string): ArrayBuffer {
  if (hex.length % 2 !== 0) throw new Error('invalid hex length');
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return buf;
}

/**
 * Compute HMAC-SHA256 hex over `canonical(envelope) + String(ts)`.
 */
export async function signEnvelope(
  secret: string,
  envelope: unknown,
  ts: number,
): Promise<string> {
  const key = await importHmacKey(secret);
  const payload = canonicalStringify(envelope) + String(ts);
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(payload));
  return bytesToHex(sig);
}

/**
 * Verify an HMAC signature. Returns true on match. Uses `crypto.subtle.verify`
 * which is constant-time for length-equal inputs (the typical pattern in
 * Workers / modern WebCrypto implementations).
 */
export async function verifyEnvelope(
  secret: string,
  envelope: unknown,
  ts: number,
  hexSignature: string,
): Promise<boolean> {
  let sigBuf: ArrayBuffer;
  try {
    sigBuf = hexToBytes(hexSignature);
  } catch {
    return false;
  }
  const key = await importHmacKey(secret);
  const payload = canonicalStringify(envelope) + String(ts);
  return crypto.subtle.verify('HMAC', key, sigBuf, ENCODER.encode(payload));
}
