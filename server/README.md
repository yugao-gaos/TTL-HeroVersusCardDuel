# HVCD ranked (T3) arbitration Cloudflare Worker

Scaffold of the project-hosted server endpoint that backs **match-authority
tier T3** for HVCD ranked mode, per
[`platform-capability-server-auth.md` § T3](../../hvcd-tabletop-contracts/platform-capability-server-auth.md)
and the arbitration / replay APIs defined there.

This directory is standalone — its `package.json`, `tsconfig.json`, and
`wrangler.toml` are independent of the module's top-level build. The module's
top-level `npm test` / `npm run typecheck` do not touch this directory, so
the worker can evolve without risking resolver-side CI churn.

## What this worker does

1. Accepts a signed arbitration request from the platform:
   `{ envelope: { sessionId, projectId, committedSequences, initialState, rngSeed, clientReports }, signature }`.
2. Verifies the HMAC-SHA256 signature against the per-project shared secret.
3. Imports the module's deterministic resolver (`scripts/resolver/*`) and
   runs `replayShowdown(...)` against the committed inputs.
4. Compares each client report against the server-computed canonical report.
5. Returns a signed response with
   `{ status: 'consensus' | 'client-mismatch-vs-server', canonicalReport, mismatchedSeats }`.

The worker handles one HTTP route, `POST /arbitrate`.

## Layout

```
server/
├── README.md              this file
├── package.json           @cloudflare/workers-types + wrangler
├── wrangler.toml          CF Worker config (template — operator fills in)
├── tsconfig.json          includes ../scripts/resolver/ + ../scripts/effects/
├── src/
│   ├── index.ts           fetch handler — HTTP shell
│   ├── arbitrate.ts       core pipeline: verify -> resolver -> sign
│   ├── canonical.ts       key-sorted JSON canonicalization
│   ├── hmac.ts            WebCrypto HMAC-SHA256 sign/verify
│   ├── verifyHmac.ts      incoming request HMAC verifier
│   ├── signResponse.ts    outgoing response HMAC signer
│   └── runResolver.ts     thin wrapper around scripts/resolver/
└── tests/
    └── arbitrate.test.ts  unit test — round-trip + bad-signature reject
```

## Resolver import strategy

Uses **Option B** — the worker imports the resolver directly by relative
path (`../../scripts/resolver/resolve`, `../../scripts/resolver/world`,
etc.). The resolver was verified to be a pure module: it imports only
sibling files under `scripts/resolver/` and `scripts/effects/`, with no
browser / DOM / ECS side-effect dependencies. Wrangler bundles it into the
worker artifact automatically.

**When to revisit**. If the resolver ever gains a host-specific dependency
(e.g., pulls in `@tabletoplabs/module-api` at the top of a resolver file),
switch to **Option A** — vendor a pre-built bundle under `server/vendor/`
and have the worker import *that*. The arbitrate / verifyHmac / signResponse
layers are resolver-agnostic; only `runResolver.ts` would need to change.

## Wire format

### Inbound request

```ts
POST /arbitrate
Content-Type: application/json

{
  "envelope": {
    "sessionId": "8d2f...a11c",
    "projectId": "6b1e...c2d9",
    "committedSequences": { "p1": [...], "p2": [...] },
    "initialState": {
      "seats": [
        { "seatId": "p1", "heroId": "...", "hp": 16, "rage": 0, "blockPool": 6, "inventory": [] },
        { "seatId": "p2", "heroId": "...", "hp": 16, "rage": 0, "blockPool": 6, "inventory": [] }
      ]
    },
    "rngSeed": 4242,
    "clientReports": {
      "p1": { "outcome": "p1", "finalHp": {...}, ... },
      "p2": { "outcome": "p1", "finalHp": {...}, ... }
    }
  },
  "signature": {
    "alg": "HMAC-SHA256",
    "keyId": "v1",
    "ts": 1728001234,
    "hex": "<hex of HMAC(secret, canonical(envelope) + String(ts))>"
  }
}
```

### Outbound response

Same shape, `envelope` replaced with:

```ts
{
  "sessionId": "...",
  "projectId": "...",
  "status": "consensus" | "client-mismatch-vs-server",
  "canonicalReport": {
    "outcome": "p1" | "p2" | "draw" | "abort",
    "finalHp": { "p1": number, "p2": number },
    "finalRage": { "p1": number, "p2": number },
    "finalBlockPool": { "p1": number, "p2": number },
    "durationFrames": number,
    "endReason": string,
    "eventStreamLength": number
  },
  "mismatchedSeats": ["p1" | "p2" ...],
  "diagnostics": { "eventStreamLength": number }
}
```

### Canonicalization

Both sign and verify use the key-sorted-JSON serializer in `src/canonical.ts`:

- Object keys sorted lexicographically (default `.sort()`).
- Arrays keep document order.
- `undefined` treated same as `JSON.stringify` (drop in objects, `null` in arrays).
- `NaN` / `Infinity` → `null`.

This mirrors the module-side canonicalizer in `scripts/states/match-end.ts`
so the signing is symmetric across platform → module → worker.

### HMAC payload

```
HMAC-SHA256(secret, canonical(envelope) + String(ts))
```

`ts` is carried in the signature block (not the envelope) and covered by
the HMAC; verifying requires re-concatenating the signature's `ts`.

### Failure codes

| HTTP | Body                                                       | When                              |
|------|------------------------------------------------------------|-----------------------------------|
| 400  | `{ error: "bad-request", reason: "invalid-json" }`         | Body is not JSON                  |
| 401  | `{ error: "bad-signature", reason: "malformed" }`          | Missing envelope/signature fields |
| 401  | `{ error: "bad-signature", reason: "unsupported-alg" }`    | `alg !== "HMAC-SHA256"`           |
| 401  | `{ error: "bad-signature", reason: "unknown-key-id" }`     | `keyId` not in bound secrets      |
| 401  | `{ error: "bad-signature", reason: "timestamp-drift" }`    | `|now - ts| > 60s`                |
| 401  | `{ error: "bad-signature", reason: "signature-mismatch" }` | HMAC comparison failed            |
| 404  | `{ error: "not-found" }`                                   | Method/path not `POST /arbitrate` |
| 422  | `{ error: "resolver-error", reason: <msg> }`               | Resolver threw                    |
| 500  | `{ error: "internal-error", reason: "no-active-keys" }`    | No secrets bound                  |

## Running tests

```bash
cd server
node --experimental-strip-types --no-warnings tests/arbitrate.test.ts
```

(Node 22+ required for native `.ts` stripping. Tests do not spin up
wrangler or a real Worker runtime; they invoke `arbitrate(...)` and the
HMAC helpers directly.)

## Deployment

This scaffold does **not** ship credentials. Before deploying:

1. Create a Cloudflare Worker in the project's CF account (per OQ-21 — each
   project has its own CF app).
2. Fill in `account_id` in `wrangler.toml`.
3. Bind secrets:
   ```bash
   wrangler secret put HVCD_HMAC_SECRET
   wrangler secret put HVCD_HMAC_KEY_ID
   ```
   During a rotation window (14 days default per session-api.md § Per-project
   HMAC secret), also bind `HVCD_HMAC_SECRET_PREV` + `HVCD_HMAC_KEY_ID_PREV`.
4. Optionally configure a route in `wrangler.toml`.
5. `wrangler deploy`.

The `account_id = "TODO_SET_BY_OPERATOR"` sentinel in `wrangler.toml` is
intentional — `wrangler deploy` will fail loudly rather than silently
deploying to the wrong account.

## What's NOT in scope

Captured per the B6 task spec for clarity; these are separate follow-up
tracks:

- **Lazy arbitration / probabilistic auditing optimizations** — Track A16.
- **Resolver determinism CI gate** — Track B11.
- **Server-only KV for authoritative state (full deck, full RNG state)** —
  separate task.
- **Production deploy** — no real CF account id here.
- **Card registry lookup** — the scaffold binds an empty lookup; a follow-up
  wires it to the server-only KV per platform-capability-server-auth.md §
  Authoritative state. The round-trip test supplies its own lookup
  directly.

## Cross-references

- [`platform-capability-server-auth.md`](../../hvcd-tabletop-contracts/platform-capability-server-auth.md) —
  T3 spec, replay / arbitration APIs.
- [`session-api.md`](../../hvcd-tabletop-contracts/session-api.md) —
  End-game capability, per-project HMAC secret, payload signing.
- [`scripts/states/match-end.ts`](../scripts/states/match-end.ts) —
  client-side canonicalizer this worker mirrors.
- [`scripts/resolver/resolve.ts`](../scripts/resolver/resolve.ts),
  [`scripts/resolver/world.ts`](../scripts/resolver/world.ts) —
  the deterministic resolver this worker imports.
