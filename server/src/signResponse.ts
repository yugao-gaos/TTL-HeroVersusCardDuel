/**
 * Outgoing arbitration response signer.
 *
 * Mirrors the request verifier — produces the `{ envelope, signature }` shape
 * the platform expects in a T3 arbitration response.
 *
 * Keeping the API surface parallel to `verifyHmac.ts` so the symmetry between
 * inbound and outbound is visually obvious at the call site in
 * `arbitrate.ts`.
 */
import { signEnvelope } from './hmac.ts';

export interface SignResult {
  envelope: unknown;
  signature: {
    alg: 'HMAC-SHA256';
    keyId: string;
    ts: number;
    hex: string;
  };
}

export async function signArbitrationResponse(
  envelope: unknown,
  secret: string,
  keyId: string,
  now: number,
): Promise<SignResult> {
  const hex = await signEnvelope(secret, envelope, now);
  return {
    envelope,
    signature: {
      alg: 'HMAC-SHA256',
      keyId,
      ts: now,
      hex,
    },
  };
}
