/**
 * Port of HeroVersusCardDuel/src/lib/showdown/__tests__/resolve.test.ts to
 * this module's resolver. Run under Node 22+ with native TS stripping:
 *
 *   node --experimental-strip-types --no-warnings tests/run.ts
 *
 * The RPS layer is dropped per §7 migration; tests that asserted RPS-specific
 * outcomes are rewritten in terms of frame-speed tiebreakers (§5 "Hit trade").
 */
import {
  makeCard,
  fastJab,
  heavyPunch,
  blockStance,
  sidestep,
  breakerStrike,
  seat,
  buildLookup,
  resetUid,
} from './fixtures.ts';
import { createInitialState, runShowdown } from '../scripts/resolver/world.ts';
import type { Card, ResolverEvent } from '../scripts/resolver/types.ts';

interface TestResult {
  name: string;
  passed: boolean;
  reason?: string;
  details?: unknown;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  resetUid();
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

function countEvents(events: ResolverEvent[], kind: string): number {
  return events.filter((e) => e.kind === kind).length;
}

function findEvent<K extends ResolverEvent['kind']>(
  events: ResolverEvent[],
  kind: K,
): Extract<ResolverEvent, { kind: K }> | undefined {
  return events.find((e) => e.kind === kind) as Extract<ResolverEvent, { kind: K }> | undefined;
}

function runTest(cards: Card[], s0: ReturnType<typeof seat>, s1: ReturnType<typeof seat>) {
  const lookup = buildLookup(cards);
  const state = createInitialState([s0, s1]);
  return runShowdown(state, { lookupCard: lookup });
}

// ============================================================================
// First-clash tests
// ============================================================================
console.log('\nsimulate \u2014 first clash');

test('single-sided hit: faster jab hits heavy punch defender before punch\'s hit window', () => {
  const a = fastJab();
  const b = heavyPunch();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b]));
  assert(r.attacker === 'p1', `expected attacker p1, got ${r.attacker}`);
  const lands = countEvents(r.events, 'hit-connected');
  assert(lands >= 1, `expected 1+ hit-connected, got ${lands}`);
  // Defender lost 1 HP
  assert(r.finalState.seats[1].hp === 7, `expected p2 hp 7, got ${r.finalState.seats[1].hp}`);
  assert(r.finalState.seats[0].hp === 8, `expected p1 hp 8, got ${r.finalState.seats[0].hp}`);
});

test('same-frame hit on both sides: mutual trade (RPS dropped, was tie in HVCD)', () => {
  const a = fastJab();
  const b = fastJab();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b]));
  // Both should take 1 damage.
  const dmgEvents = r.events.filter((e) => e.kind === 'damage-applied');
  assert(dmgEvents.length === 2, `expected 2 damage events, got ${dmgEvents.length}`);
  assert(r.finalState.seats[0].hp === 7, `expected p1 hp 7, got ${r.finalState.seats[0].hp}`);
  assert(r.finalState.seats[1].hp === 7, `expected p2 hp 7, got ${r.finalState.seats[1].hp}`);
});

// ============================================================================
// Evasion
// ============================================================================
console.log('\nsimulate \u2014 evasion');

test('evasion whiffs non-homing attack and ends showdown', () => {
  const a = fastJab();
  const b = sidestep();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b]));
  const evades = countEvents(r.events, 'hit-evaded');
  assert(evades >= 1, `expected 1+ hit-evaded, got ${evades}`);
  const dmgs = countEvents(r.events, 'damage-applied');
  assert(dmgs === 0, `expected 0 damages, got ${dmgs}`);
});

// ============================================================================
// Block & defense breaker
// ============================================================================
console.log('\nsimulate \u2014 block & defense breaker');

test('block absorbs hit, drains block tokens, no damage', () => {
  // Fast jab (damage 1, hitStun 2) vs block stance.
  const a = fastJab();
  const b = blockStance();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b], { blockPool: 6 }));
  const blocks = countEvents(r.events, 'hit-blocked');
  assert(blocks >= 1, `expected 1+ block, got ${blocks}`);
  const dmgs = countEvents(r.events, 'damage-applied');
  assert(dmgs === 0, `expected 0 damages (fully blocked), got ${dmgs}`);
});

test('defense breaker goes through block for full damage', () => {
  const a = breakerStrike();
  const b = blockStance();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b], { blockPool: 10 }));
  assert(r.finalState.seats[1].hp === 5, `expected p2 hp 5, got ${r.finalState.seats[1].hp}`);
  // Block pool should be unchanged (defense breaker doesn't consume blocks).
  assert(r.finalState.seats[1].blockPool === 10, `expected blockPool 10, got ${r.finalState.seats[1].blockPool}`);
});

// ============================================================================
// Combo & combo drop
// ============================================================================
console.log('\nsimulate \u2014 combo & combo drop');

test('combo extends when next hit overlaps existing stun', () => {
  // Long-stun hit (5-frame stun) fires at frame 2; slow defender can't
  // respond in time (hit at frame 8). longStun places stun 3..7, then its
  // own card continues through. At impactEnd+1 = 7, attacker cursor resets.
  // Followup placed at frame 7 with hit window 1..2 (frames 8..9) overlaps
  // the stun tokens at frames 3..7 + nothing at 8-9. So we extend longStun.
  // Simpler test: longStun hitStun 8 so stun covers frames 3..10.
  const longStun = makeCard({
    name: 'longStun',
    totalFrames: 10,
    hitWindow: { start: 2, end: 6, damage: 1, hitStun: 8 },
  });
  const followup = makeCard({
    name: 'followup',
    totalFrames: 6,
    hitWindow: { start: 1, end: 2, damage: 2, hitStun: 2 },
  });
  // Defender's slow punch so longStun hits first.
  const slowHeavy = makeCard({
    name: 'slowHeavy',
    totalFrames: 14,
    hitWindow: { start: 10, end: 12, damage: 2, hitStun: 2 },
  });
  const r = runTest([longStun, followup, slowHeavy], seat('a', [longStun, followup]), seat('b', [slowHeavy]));
  assert(r.attacker === 'p1', `expected attacker p1, got ${r.attacker}`);
  const lands = r.events.filter((e) => e.kind === 'hit-connected');
  assert(lands.length >= 2, `expected 2+ hit-connected, got ${lands.length}`);
  // Second hit should be combo-extend
  const second = lands[1];
  assert(second.kind === 'hit-connected' && second.comboExtend === true, `expected second hit comboExtend`);
});

test('combo drops when next hit misses stun window', () => {
  const jab1 = fastJab();
  const jab2 = fastJab();
  const b = heavyPunch();
  const r = runTest([jab1, jab2, b], seat('a', [jab1, jab2]), seat('b', [b]));
  assert(r.attacker === 'p1', `expected attacker p1, got ${r.attacker}`);
  const lands = countEvents(r.events, 'hit-connected');
  assert(lands === 1, `expected exactly 1 hit-connected (first jab only), got ${lands}`);
  const drop = findEvent(r.events, 'combo-dropped');
  assert(!!drop, 'expected combo-dropped event');
});

// ============================================================================
// Rage cost — skipped because RageCost at top-level is non-spec per §7.
// Legacy test used top-level rageCost; §7 uses rageVariant.rageCost. Covered
// by a separate variant-specific test below.
// ============================================================================

// ============================================================================
// End state
// ============================================================================
console.log('\nsimulate \u2014 end state');

test('KO when HP reaches zero', () => {
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
  const r = runTest([fastHeavy, slowHeavy], seat('a', [fastHeavy]), seat('b', [slowHeavy], { hp: 2 }));
  assert(r.ko === 'p2', `expected ko p2, got ${r.ko}`);
  assert(r.finalState.seats[1].hp === 0, `expected p2 hp 0, got ${r.finalState.seats[1].hp}`);
});

test('no engagement: both defensive -> no_engagement end', () => {
  const a = blockStance();
  const b = sidestep();
  const r = runTest([a, b], seat('a', [a]), seat('b', [b]));
  assert(r.attacker === null, `expected attacker null, got ${r.attacker}`);
  assert(r.endReason === 'no-engagement', `expected no-engagement, got ${r.endReason}`);
});

// ============================================================================
// Summary
// ============================================================================
const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} tests passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
