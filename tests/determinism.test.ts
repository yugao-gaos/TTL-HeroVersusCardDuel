/**
 * B11 — Resolver determinism CI gate.
 *
 * Per platform-capability-server-auth.md § Risks: T3 (server-authoritative
 * arbitration) only works if the resolver is byte-deterministic. This test
 * is the gate — CI fails if `runShowdown` ever produces non-identical event
 * streams for identical inputs.
 *
 * Strategy:
 *   1. Build a non-trivial fixture (multiple cards, both seats engaging,
 *      enough to exercise mutual clash, defense, combo, and KO paths).
 *   2. Run runShowdown N=20 times against fresh deep clones of the input.
 *   3. Canonicalize each result (canonical JSON: sorted object keys) and
 *      compare byte-for-byte.
 *
 * Also exercises the items/triggers engine for byte-determinism since that
 * pure module sits adjacent to the resolver in the deterministic event
 * pipeline (replay artifacts include item-trigger consequences).
 *
 * If V8's `--predictable` flag is available it would harden this further;
 * the strip-types harness in this repo runs Node directly so we rely on
 * the N-iterations-same heuristic, which is sufficient to catch:
 *   - Map / Set iteration-order non-determinism
 *   - Date.now / Math.random leakage into the resolver
 *   - Hash-collision-order leaks in canonicalization
 *
 * Run via: `npm run test:determinism` or as part of `npm test`.
 */
import {
  fastJab,
  heavyPunch,
  blockStance,
  sidestep,
  breakerStrike,
  makeCard,
  seat,
  buildLookup,
  resetUid,
} from './fixtures.ts';
import { createInitialState, runShowdown } from '../scripts/resolver/world.ts';
import type { Card } from '../scripts/resolver/types.ts';
import {
  createRunState,
  fireTrigger,
} from '../scripts/items/triggers.ts';

const N_ITERATIONS = 20;

const results: { name: string; passed: boolean; reason?: string }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    results.push({ name, passed: false, reason: err instanceof Error ? err.message : String(err) });
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/**
 * Canonical JSON: sorted object keys, recursive. Mirrors the canonicalizer
 * in match-end.ts so the gate aligns with what T2 consensus actually hashes.
 *
 * Plain Sets are coerced to sorted arrays so MatchState.reflectFiredThisFrame
 * doesn't pollute the comparison with insertion-order-dependent output.
 */
function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Set) {
    const arr = Array.from(value).map((v) => (typeof v === 'string' ? v : String(v))).sort();
    return canonical(arr);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonical(v === undefined ? null : v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + canonical(v));
    }
    return '{' + parts.join(',') + '}';
  }
  return 'null';
}

console.log('\nB11 — resolver determinism CI gate');

// --- Fixture: a 3-card-vs-3-card showdown that exercises hit, block,
// combo, and a defense-breaker. Stable inputs; should produce stable
// outputs every iteration. ----------------------------------------------
function buildFixture() {
  resetUid();
  const a1 = fastJab();
  const a2 = breakerStrike();
  const a3 = makeCard({
    name: 'finisher',
    totalFrames: 10,
    hitWindow: { start: 4, end: 6, damage: 2, hitStun: 3 },
  });
  const b1 = blockStance();
  const b2 = heavyPunch();
  const b3 = sidestep();
  const cards: Card[] = [a1, a2, a3, b1, b2, b3];
  const s0 = seat('a', [a1, a2, a3]);
  const s1 = seat('b', [b1, b2, b3]);
  return { cards, s0, s1 };
}

test(`runShowdown produces byte-identical event streams across N=${N_ITERATIONS} runs`, () => {
  // Capture the "reference" canonical event stream from run 0.
  const fixture0 = buildFixture();
  const state0 = createInitialState([fixture0.s0, fixture0.s1]);
  const lookup0 = buildLookup(fixture0.cards);
  const r0 = runShowdown(state0, { lookupCard: lookup0 });
  const reference = canonical(r0.events);

  for (let i = 1; i < N_ITERATIONS; i++) {
    const fix = buildFixture();
    const st = createInitialState([fix.s0, fix.s1]);
    const lk = buildLookup(fix.cards);
    const r = runShowdown(st, { lookupCard: lk });
    const c = canonical(r.events);
    if (c !== reference) {
      // Find first diverging event for an actionable error.
      const refEvents = JSON.parse(reference) as unknown[];
      const curEvents = JSON.parse(c) as unknown[];
      const minLen = Math.min(refEvents.length, curEvents.length);
      let divergeAt = -1;
      for (let j = 0; j < minLen; j++) {
        if (canonical(refEvents[j]) !== canonical(curEvents[j])) { divergeAt = j; break; }
      }
      throw new Error(
        `Non-determinism at iteration ${i}: divergeAt=${divergeAt} ` +
        `refLen=${refEvents.length} curLen=${curEvents.length}`,
      );
    }
  }
});

test(`runShowdown final-state damage / KO / endReason are byte-identical across runs`, () => {
  const fixture0 = buildFixture();
  const state0 = createInitialState([fixture0.s0, fixture0.s1]);
  const lookup0 = buildLookup(fixture0.cards);
  const r0 = runShowdown(state0, { lookupCard: lookup0 });
  const ref = canonical({
    endReason: r0.endReason,
    attacker: r0.attacker,
    ko: r0.ko,
    draw: r0.draw,
    p1Hp: r0.finalState.seats[0].hp,
    p2Hp: r0.finalState.seats[1].hp,
    p1Pool: r0.finalState.seats[0].blockPool,
    p2Pool: r0.finalState.seats[1].blockPool,
    durationFrames: r0.durationFrames,
  });

  for (let i = 1; i < N_ITERATIONS; i++) {
    const fix = buildFixture();
    const st = createInitialState([fix.s0, fix.s1]);
    const lk = buildLookup(fix.cards);
    const r = runShowdown(st, { lookupCard: lk });
    const c = canonical({
      endReason: r.endReason,
      attacker: r.attacker,
      ko: r.ko,
      draw: r.draw,
      p1Hp: r.finalState.seats[0].hp,
      p2Hp: r.finalState.seats[1].hp,
      p1Pool: r.finalState.seats[0].blockPool,
      p2Pool: r.finalState.seats[1].blockPool,
      durationFrames: r.durationFrames,
    });
    if (c !== ref) throw new Error(`Final-state divergence at iteration ${i}: ref=${ref} cur=${c}`);
  }
});

test(`items trigger engine produces byte-identical mutations across N=${N_ITERATIONS} runs`, () => {
  // Compose a trigger event whose effect path uses the deterministic hash
  // (mirror's reflect-damage-chance) so any non-deterministic hashing would
  // be caught.
  const buildRs = () => {
    const rs = createRunState('blaze', 'aqua');
    rs.seats.p1.runItems.push({ itemId: 'mirror', chargesRemaining: null });
    rs.seats.p1.runItems.push({ itemId: 'vampiric-edge', chargesRemaining: null });
    rs.seats.p2.runItems.push({ itemId: 'iron-shield', chargesRemaining: null });
    rs.seats.p2.runItems.push({ itemId: 'focus-flask', chargesRemaining: 2 });
    return rs;
  };
  const event = { kind: 'onTakeHit' as const, payload: { defender: 'p1' as const, attacker: 'p2' as const, damage: 5, survived: true } };

  const reference = canonical(fireTrigger(buildRs(), event));
  for (let i = 1; i < N_ITERATIONS; i++) {
    const c = canonical(fireTrigger(buildRs(), event));
    if (c !== reference) throw new Error(`Item-trigger non-determinism at iteration ${i}`);
  }
});

test(`canonical-stringify is order-stable: building the same object via different key insertion orders hashes the same`, () => {
  // Defense-in-depth: the canonicalizer itself must be deterministic.
  const a = { z: 1, a: 2, m: { y: 3, b: 4 } };
  const b: Record<string, unknown> = {};
  b.m = { b: 4, y: 3 };
  b.a = 2;
  b.z = 1;
  assert(canonical(a) === canonical(b), 'canonical output independent of insertion order');
});

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} determinism tests passed, ${results.length - passed} failed`);
if (passed !== results.length) {
  process.exitCode = 1;
}
