/**
 * HVCD ranked (T3) Cloudflare Worker — fetch handler.
 *
 * Per platform-capability-server-auth.md § T3 and session-api.md § End-game
 * capability, the platform posts an arbitration request here whenever a
 * ranked match ends. This module is the HTTP shell — it parses + verifies
 * the incoming request, delegates to `./arbitrate.ts` for the actual work,
 * and emits the signed response.
 *
 * The resolver, canonicalization, and HMAC logic all live in sibling files;
 * this module stays thin so it's obvious at a glance what each HTTP failure
 * mode maps to.
 *
 * HTTP contract:
 *   - `POST /arbitrate` — the only supported route. Body is a
 *     `SignedRequest { envelope, signature }` per server/README.md.
 *   - Any other method / path returns `404 not-found`.
 *
 * Failure modes:
 *   - Malformed body / bad content-type     -> 400 bad-request
 *   - Signature verification failed          -> 401 bad-signature
 *   - Resolver threw (lookupCard missing,
 *     committed sequence references unknown
 *     card, etc.)                            -> 422 resolver-error
 *   - Unexpected runtime error               -> 500 internal-error
 *
 * Card lookup:
 *   The arbitrator needs a `lookupCard` function to resolve cardIds in the
 *   committed sequences. For the scaffold, the lookup is bound to an empty
 *   registry — a follow-up task (Track B11/B12) wires up the authoritative
 *   card registry from a server-only KV (per platform-capability-server-
 *   auth.md § Authoritative state). Until then the worker can only handle
 *   requests that carry self-contained inputs (which is fine for the unit
 *   test and for the round-trip verification B6's fixture exercises).
 */
import { arbitrate, type ArbitrationRequestEnvelope } from './arbitrate.ts';
import { verifySignedRequest, type ActiveKey } from './verifyHmac.ts';
import type { Card } from '../../scripts/resolver/types.ts';

export interface WorkerEnv {
  /** Per-project HMAC secret. Bound via `wrangler secret put HVCD_HMAC_SECRET`. */
  HVCD_HMAC_SECRET: string;
  /** Active keyId string. Bound via `wrangler secret put HVCD_HMAC_KEY_ID`. */
  HVCD_HMAC_KEY_ID: string;
  /** Optional second active key during rotation. */
  HVCD_HMAC_SECRET_PREV?: string;
  HVCD_HMAC_KEY_ID_PREV?: string;
  /** Maximum signature-timestamp drift in seconds. */
  ARBITRATION_TIMESTAMP_DRIFT_SEC?: string;
  LOG_LEVEL?: string;
}

function activeKeysFromEnv(env: WorkerEnv): ActiveKey[] {
  const keys: ActiveKey[] = [];
  if (env.HVCD_HMAC_SECRET && env.HVCD_HMAC_KEY_ID) {
    keys.push({ keyId: env.HVCD_HMAC_KEY_ID, secret: env.HVCD_HMAC_SECRET });
  }
  if (env.HVCD_HMAC_SECRET_PREV && env.HVCD_HMAC_KEY_ID_PREV) {
    keys.push({ keyId: env.HVCD_HMAC_KEY_ID_PREV, secret: env.HVCD_HMAC_SECRET_PREV });
  }
  return keys;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Build the card lookup used by the resolver. The scaffold binds an empty
 * registry; production wires this up from a server-only KV.
 *
 * Exposed as a module-level default so the test harness can swap in a
 * fixture-backed lookup without touching the fetch handler.
 */
export function defaultLookupCard(_id: string): Card | null {
  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/arbitrate') {
      return jsonResponse({ error: 'not-found' }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'bad-request', reason: 'invalid-json' }, 400);
    }

    const activeKeys = activeKeysFromEnv(env);
    if (activeKeys.length === 0) {
      return jsonResponse({ error: 'internal-error', reason: 'no-active-keys' }, 500);
    }

    const maxDriftSec = Number(env.ARBITRATION_TIMESTAMP_DRIFT_SEC ?? '60');
    const now = Math.floor(Date.now() / 1000);

    const verify = await verifySignedRequest(body, activeKeys, now, maxDriftSec);
    if (!verify.ok) {
      return jsonResponse({ error: 'bad-signature', reason: verify.reason }, 401);
    }

    const envelope = verify.envelope as ArbitrationRequestEnvelope;
    const responseKey = activeKeys.find((k) => k.keyId === verify.keyId)!;

    try {
      const { signed } = await arbitrate(envelope, {
        lookupCard: defaultLookupCard,
        responseSecret: responseKey.secret,
        responseKeyId: responseKey.keyId,
        now,
      });
      return jsonResponse(signed, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: 'resolver-error', reason: msg }, 422);
    }
  },
};
