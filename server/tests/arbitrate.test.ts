/**
 * Arbitration round-trip test — known-good fixture.
 *
 * Run under Node 22+ with native TS stripping:
 *   node --experimental-strip-types --no-warnings tests/arbitrate.test.ts
 *
 * Covers:
 *   1. Signed-request verification against a known good HMAC.
 *   2. Full `arbitrate(...)` pipeline produces a signed response whose
 *      canonical report carries the expected outcome.
 *   3. Wrong-signature request is rejected with `signature-mismatch`.
 *
 * The fixture reuses HVCD's existing resolver test fixtures
 * (`fastJab`, `seat`, `buildLookup` from `tests/fixtures.ts`) — same
 * "fastJab" setup that `tests/resolve.test.ts § single-sided hit` already
 * asserts reproduces deterministically.
 */
import { arbitrate, type ArbitrationRequestEnvelope } from '../src/arbitrate.ts';
import { signEnvelope } from '../src/hmac.ts';
import { verifySignedRequest, type ActiveKey } from '../src/verifyHmac.ts';
import {
  buildLookup,
  makeCard,
  resetUid,
  seat,
} from '../../tests/fixtures.ts';
import type { SequenceSlot } from '../../scripts/resolver/types.ts';

interface TestResult { name: string; passed: boolean; reason?: string }
const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  resetUid();
  const run = async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      results.push({ name, passed: false, reason: err instanceof Error ? err.message : String(err) });
      console.log(`  \u2717 ${name}`);
      console.log(`      ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return run();
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Narrowing helper for the VerifyResult discriminated union. */
function reasonOf(r: { ok: boolean; reason?: string }): string {
  return r.ok ? 'ok' : (r.reason ?? '');
}

const SECRET = 'test-secret-fixture-not-for-production';
const KEY_ID = 'v1';
const ACTIVE_KEYS: ActiveKey[] = [{ keyId: KEY_ID, secret: SECRET }];

console.log('\narbitrate \u2014 signed request round-trip');

await test('known-good KO fixture arbitrates to consensus with outcome p1', async () => {
  // Mirrors `tests/resolve.test.ts § KO when HP reaches zero`. p1 is faster
  // and 3-damage; p2 starts on 2 HP, so p1's first hit lands and KOs.
  // The resolver returns `ko: 'p2'`, which `replayShowdown` projects to
  // `outcome: 'p1'` in the canonical report.
  const fastHeavy = makeCard({
    name: 'fastHeavy',
    totalFrames: 8,
    hitWindow: { start: 2, end: 3, damage: 3, hitStun: 2 },
  });
  const slowHeavy = makeCard({
    name: 'slowHeavy',
    totalFrames: 12,
    hitWindow: { start: 8, end: 10, damage: 3, hitStun: 3 },
  });
  const lookup = buildLookup([fastHeavy, slowHeavy]);

  const p1Seat = seat('a', [fastHeavy]);
  const p2Seat = seat('b', [slowHeavy], { hp: 2 });

  const committedSequences: Record<'p1' | 'p2', SequenceSlot[]> = {
    p1: p1Seat.sequence,
    p2: p2Seat.sequence,
  };

  const envelope: ArbitrationRequestEnvelope = {
    sessionId: 'test-session-0001',
    projectId: 'test-project-0001',
    committedSequences,
    initialState: {
      seats: [
        { seatId: 'p1', heroId: p1Seat.heroId, hp: p1Seat.hp, rage: p1Seat.rage, blockPool: p1Seat.blockPool, inventory: p1Seat.inventory },
        { seatId: 'p2', heroId: p2Seat.heroId, hp: p2Seat.hp, rage: p2Seat.rage, blockPool: p2Seat.blockPool, inventory: p2Seat.inventory },
      ],
    },
    rngSeed: 4242,
    // Client reports mirror what the module's match-end.ts would produce
    // when both clients ran the same deterministic resolver. Shape them to
    // match the server's `MatchAuthorityReport` — in production the field
    // projection happens at the platform-level lazy-arbitration layer.
    clientReports: {
      // Stub client reports — patched after the first arbitrate() call below
      // with the server's canonical fields (durationFrames / endReason / etc.
      // are computed by the resolver and aren't known statically).
      p1: { outcome: 'p1', finalHp: { p1: 8, p2: 0 }, finalRage: { p1: 0, p2: 0 }, finalBlockPool: { p1: 6, p2: 6 }, durationFrames: 0, endReason: '', eventStreamLength: 0 },
      p2: { outcome: 'p1', finalHp: { p1: 8, p2: 0 }, finalRage: { p1: 0, p2: 0 }, finalBlockPool: { p1: 6, p2: 6 }, durationFrames: 0, endReason: '', eventStreamLength: 0 },
    },
  };

  // Run the authoritative arbitration with stub client reports first to get
  // the server's canonical report, then re-run with client reports patched
  // to match.
  const now = Math.floor(Date.now() / 1000);
  const first = await arbitrate(envelope, {
    lookupCard: lookup,
    responseSecret: SECRET,
    responseKeyId: KEY_ID,
    now,
  });

  // Sanity check on the server-computed outcome.
  assert(first.response.canonicalReport.outcome === 'p1', `expected outcome p1, got ${first.response.canonicalReport.outcome}`);
  assert(first.response.canonicalReport.finalHp.p2 === 0, `expected p2 hp 0, got ${first.response.canonicalReport.finalHp.p2}`);
  assert(first.response.canonicalReport.finalHp.p1 === 8, `expected p1 hp 8, got ${first.response.canonicalReport.finalHp.p1}`);

  // Patch client reports to match the server's canonical report exactly.
  // Production clients produce this from their own deterministic resolver
  // run; we shortcut by copying the server output for the round-trip.
  const patched: ArbitrationRequestEnvelope = {
    ...envelope,
    clientReports: {
      p1: { ...first.response.canonicalReport },
      p2: { ...first.response.canonicalReport },
    },
  };

  const second = await arbitrate(patched, {
    lookupCard: lookup,
    responseSecret: SECRET,
    responseKeyId: KEY_ID,
    now,
  });

  assert(second.response.status === 'consensus', `expected consensus, got ${second.response.status} with mismatched seats ${JSON.stringify(second.response.mismatchedSeats)}`);
  assert(second.response.mismatchedSeats.length === 0, `expected no mismatched seats, got ${JSON.stringify(second.response.mismatchedSeats)}`);

  // The signed response carries the signature we expect.
  assert(second.signed.signature.alg === 'HMAC-SHA256', 'expected HMAC-SHA256');
  assert(second.signed.signature.keyId === KEY_ID, `expected keyId ${KEY_ID}`);

  // And the signature verifies against the same secret.
  const verifyOk = await verifySignedRequest(
    second.signed,
    ACTIVE_KEYS,
    now,
    60,
  );
  assert(verifyOk.ok, `expected response signature to verify, got failure: ${reasonOf(verifyOk)}`);
});

console.log('\narbitrate \u2014 signature verification');

await test('wrong-signature request is rejected with signature-mismatch', async () => {
  const envelope = { hello: 'world', nested: { a: 1, b: 2 } };
  const now = Math.floor(Date.now() / 1000);
  const goodHex = await signEnvelope(SECRET, envelope, now);

  // Tamper with the hex (flip the last char).
  const badHex = goodHex.slice(0, -1) + (goodHex.endsWith('0') ? '1' : '0');

  const result = await verifySignedRequest(
    {
      envelope,
      signature: { alg: 'HMAC-SHA256', keyId: KEY_ID, ts: now, hex: badHex },
    },
    ACTIVE_KEYS,
    now,
    60,
  );
  assert(!result.ok && reasonOf(result) === 'signature-mismatch', `expected signature-mismatch, got ${reasonOf(result)}`);

  // And the good hex with an unknown key id is rejected as unknown-key-id.
  const unknownKeyResult = await verifySignedRequest(
    {
      envelope,
      signature: { alg: 'HMAC-SHA256', keyId: 'never-used-key', ts: now, hex: goodHex },
    },
    ACTIVE_KEYS,
    now,
    60,
  );
  assert(!unknownKeyResult.ok && reasonOf(unknownKeyResult) === 'unknown-key-id', `expected unknown-key-id, got ${reasonOf(unknownKeyResult)}`);

  // Off-window ts rejected.
  const driftResult = await verifySignedRequest(
    {
      envelope,
      signature: { alg: 'HMAC-SHA256', keyId: KEY_ID, ts: now - 3600, hex: goodHex },
    },
    ACTIVE_KEYS,
    now,
    60,
  );
  assert(!driftResult.ok && reasonOf(driftResult) === 'timestamp-drift', `expected timestamp-drift, got ${reasonOf(driftResult)}`);
});

// ============================================================================
// Summary
// ============================================================================
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length} tests, ${results.length - failed.length} passed, ${failed.length} failed\n`);
if (failed.length > 0) {
  for (const f of failed) {
    console.log(`  FAIL: ${f.name}\n    ${f.reason}`);
  }
  process.exit(1);
}
