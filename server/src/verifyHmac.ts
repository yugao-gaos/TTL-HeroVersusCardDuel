/**
 * Incoming arbitration request verifier.
 *
 * Accepts a `{ envelope, signature }` shape per the wire format documented
 * in server/README.md, and returns either the verified envelope or a
 * structured rejection reason.
 *
 * Checks:
 *   1. `signature.alg` is `HMAC-SHA256` (the only alg the v1 spec admits).
 *   2. `signature.keyId` is one of the active key ids the worker is bound to
 *      (rotation: the worker can hold >1 key during an overlap window, per
 *      session-api.md § Per-project HMAC secret).
 *   3. `|now - signature.ts| <= drift` — anti-replay window.
 *   4. HMAC over `canonical(envelope) + String(ts)` matches `signature.hex`.
 *
 * The verifier is intentionally pure — no I/O. The fetch handler
 * (`src/index.ts`) pulls the active secrets from `env` and passes them in.
 */
import { verifyEnvelope } from './hmac.ts';

export interface SignedRequest {
  envelope: unknown;
  signature: {
    alg: string;
    keyId: string;
    ts: number;
    hex: string;
  };
}

export interface ActiveKey {
  keyId: string;
  secret: string;
}

export type VerifyResult =
  | { ok: true; envelope: unknown; keyId: string }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyFailureReason =
  | 'malformed'
  | 'unsupported-alg'
  | 'unknown-key-id'
  | 'timestamp-drift'
  | 'signature-mismatch';

export async function verifySignedRequest(
  req: unknown,
  activeKeys: readonly ActiveKey[],
  now: number,
  maxDriftSec: number,
): Promise<VerifyResult> {
  if (!req || typeof req !== 'object') return { ok: false, reason: 'malformed' };
  const body = req as Partial<SignedRequest>;
  const sig = body.signature;
  if (!sig || typeof sig !== 'object') return { ok: false, reason: 'malformed' };
  if (typeof sig.alg !== 'string' || typeof sig.keyId !== 'string'
      || typeof sig.ts !== 'number' || typeof sig.hex !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (sig.alg !== 'HMAC-SHA256') return { ok: false, reason: 'unsupported-alg' };

  const key = activeKeys.find((k) => k.keyId === sig.keyId);
  if (!key) return { ok: false, reason: 'unknown-key-id' };

  if (Math.abs(now - sig.ts) > maxDriftSec) {
    return { ok: false, reason: 'timestamp-drift' };
  }

  if (body.envelope === undefined) return { ok: false, reason: 'malformed' };

  const ok = await verifyEnvelope(key.secret, body.envelope, sig.ts, sig.hex);
  if (!ok) return { ok: false, reason: 'signature-mismatch' };

  return { ok: true, envelope: body.envelope, keyId: key.keyId };
}
