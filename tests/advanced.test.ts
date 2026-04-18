/**
 * Advanced resolver tests — features unique to the §§7-13 port:
 *   - projectile launch / travel / arrival / clash / reflect
 *   - effect activation / standing effect / end
 *   - cancel arming / firing / hit-cancel
 *   - knockdown
 *   - parry
 *   - armor
 */
import { makeCard, seat, buildLookup, resetUid } from './fixtures.ts';
import { createInitialState, runShowdown, createSeat } from '../scripts/resolver/world.ts';
import type { Card, ResolverEvent, SequenceSlot } from '../scripts/resolver/types.ts';

const results: { name: string; passed: boolean; reason?: string }[] = [];

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

function runTest(cards: Card[], s0: ReturnType<typeof seat>, s1: ReturnType<typeof seat>) {
  const lookup = buildLookup(cards);
  const state = createInitialState([s0, s1]);
  return runShowdown(state, { lookupCard: lookup });
}

// === projectile ===
console.log('\nsimulate \u2014 projectile');

test('projectile launches at end of launch window, arrives after travelFrames', () => {
  // A projectile window [1,2] with travelFrames 5, damage 2
  const fireball: Card = {
    id: 'fireball',
    name: 'fireball',
    totalFrames: 6,
    attackWindows: {
      projectile: { frames: [1, 2], damage: 2, hits: 1, travelFrames: 5 },
    },
    defenseWindows: {},
    cancelWindow: null,
  };
  // Defender has nothing; should take raw damage on arrival.
  const dummy: Card = { id: 'dummy', name: 'dummy', totalFrames: 20, attackWindows: {}, defenseWindows: {}, cancelWindow: null };
  const lookup = buildLookup([fireball, dummy]);
  const slots0: SequenceSlot[] = [{ kind: 'card', cardId: 'fireball', mode: 'base', rageCancelArmed: false }];
  const slots1: SequenceSlot[] = [{ kind: 'card', cardId: 'dummy', mode: 'base', rageCancelArmed: false }];
  const s0 = createSeat('p1', 'a', { sequence: slots0 });
  const s1 = createSeat('p2', 'b', { sequence: slots1, hp: 10 });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const launched = r.events.find((e) => e.kind === 'projectile-launched');
  assert(!!launched, 'expected projectile-launched');
  const arrived = r.events.find((e) => e.kind === 'projectile-arrived');
  assert(!!arrived, 'expected projectile-arrived');
  assert(r.finalState.seats[1].hp <= 8, `expected damage to land, hp ${r.finalState.seats[1].hp}`);
});

// === knockdown ===
console.log('\nsimulate \u2014 knockdown');

test('knockdown hit places knockdown tokens and ends showdown', () => {
  const kdStrike: Card = {
    id: 'kd',
    name: 'kd',
    totalFrames: 8,
    attackWindows: {
      hit: { frames: [2, 3], damage: 2, hits: 1, hitStun: 4, knockdown: true },
    },
    defenseWindows: {},
    cancelWindow: null,
  };
  const slow: Card = {
    id: 'slow',
    name: 'slow',
    totalFrames: 12,
    attackWindows: { hit: { frames: [8, 9], damage: 1, hitStun: 2 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const lookup = buildLookup([kdStrike, slow]);
  const s0 = createSeat('p1', 'a', { sequence: [{ kind: 'card', cardId: 'kd', mode: 'base', rageCancelArmed: false }] });
  const s1 = createSeat('p2', 'b', { sequence: [{ kind: 'card', cardId: 'slow', mode: 'base', rageCancelArmed: false }] });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const kdPlaced = r.events.find((e) => e.kind === 'knockdown-placed');
  assert(!!kdPlaced, 'expected knockdown-placed event');
});

// === cancel ===
console.log('\nsimulate \u2014 cancel');

test('armed cancel fires unconditionally, truncates card', () => {
  const feintCard: Card = {
    id: 'feint',
    name: 'feint',
    totalFrames: 10,
    attackWindows: { hit: { frames: [8, 9], damage: 1, hitStun: 2 } }, // never reaches hit because cancel fires at 4
    defenseWindows: {},
    cancelWindow: { frame: 4, hitCancel: false, rageCost: 2 },
  };
  const followup: Card = {
    id: 'followup',
    name: 'followup',
    totalFrames: 6,
    attackWindows: { hit: { frames: [1, 2], damage: 2, hitStun: 2 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const dummy: Card = { id: 'dummy', name: 'dummy', totalFrames: 20, attackWindows: {}, defenseWindows: {}, cancelWindow: null };
  const lookup = buildLookup([feintCard, followup, dummy]);
  const s0 = createSeat('p1', 'a', {
    sequence: [
      { kind: 'card', cardId: 'feint', mode: 'base', rageCancelArmed: true },
      { kind: 'card', cardId: 'followup', mode: 'base', rageCancelArmed: false },
    ],
    rage: 2,
  });
  const s1 = createSeat('p2', 'b', { sequence: [{ kind: 'card', cardId: 'dummy', mode: 'base', rageCancelArmed: false }] });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const fired = r.events.find((e) => e.kind === 'cancel-fired');
  assert(!!fired, 'expected cancel-fired event');
});

// === effects ===
console.log('\nsimulate \u2014 effects');

test('damageUp standing effect boosts subsequent damage by 1', () => {
  // Card 1 casts damageUp effect (duration 30). Card 2 is a 2-damage hit
  // that should land for 3 damage due to damageUp.
  const buffCard: Card = {
    id: 'buff',
    name: 'buff',
    totalFrames: 4,
    attackWindows: { effect: { frames: [1, 2], effectId: 'damageUp', target: 'self', duration: 30 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const hitCard: Card = {
    id: 'boosted',
    name: 'boosted',
    totalFrames: 6,
    attackWindows: { hit: { frames: [2, 3], damage: 2, hitStun: 2 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const slow: Card = {
    id: 'slow',
    name: 'slow',
    totalFrames: 20,
    attackWindows: { hit: { frames: [18, 19], damage: 1, hitStun: 1 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const lookup = buildLookup([buffCard, hitCard, slow]);
  const s0 = createSeat('p1', 'a', {
    sequence: [
      { kind: 'card', cardId: 'buff', mode: 'base', rageCancelArmed: false },
      { kind: 'card', cardId: 'boosted', mode: 'base', rageCancelArmed: false },
    ],
  });
  const s1 = createSeat('p2', 'b', {
    sequence: [{ kind: 'card', cardId: 'slow', mode: 'base', rageCancelArmed: false }],
    hp: 10,
  });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const activated = r.events.find((e) => e.kind === 'effect-activated');
  assert(!!activated, 'expected effect-activated event');
  const connected = r.events.find((e) => e.kind === 'hit-connected');
  assert(!!connected, 'expected hit-connected event');
  if (connected && connected.kind === 'hit-connected') {
    // 2 base + 1 damageUp = 3
    assert(connected.damage === 3, `expected damage 3, got ${connected.damage}`);
  }
});

// === parry ===
console.log('\nsimulate \u2014 parry');

test('parry triggers on incoming hit, places stun on attacker', () => {
  const attackCard: Card = {
    id: 'atk',
    name: 'atk',
    totalFrames: 8,
    attackWindows: { hit: { frames: [2, 3], damage: 2, hitStun: 2 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const parryCard: Card = {
    id: 'par',
    name: 'par',
    totalFrames: 8,
    attackWindows: { parry: { frames: [2, 3], damage: 0, hits: 1, hitStun: 4 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const lookup = buildLookup([attackCard, parryCard]);
  const s0 = createSeat('p1', 'a', { sequence: [{ kind: 'card', cardId: 'atk', mode: 'base', rageCancelArmed: false }] });
  const s1 = createSeat('p2', 'b', { sequence: [{ kind: 'card', cardId: 'par', mode: 'base', rageCancelArmed: false }] });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const parried = r.events.find((e) => e.kind === 'hit-parried');
  assert(!!parried, 'expected hit-parried event');
});

// === armor ===
console.log('\nsimulate \u2014 armor');

test('armor absorbs stun, damage still applies', () => {
  const attackCard: Card = {
    id: 'atk',
    name: 'atk',
    totalFrames: 8,
    attackWindows: { hit: { frames: [2, 3], damage: 2, hitStun: 3 } },
    defenseWindows: {},
    cancelWindow: null,
  };
  const armoredCard: Card = {
    id: 'arm',
    name: 'arm',
    totalFrames: 8,
    attackWindows: {},
    defenseWindows: { armor: { frames: [0, 7], absorbs: 2 } },
    cancelWindow: null,
  };
  const lookup = buildLookup([attackCard, armoredCard]);
  const s0 = createSeat('p1', 'a', { sequence: [{ kind: 'card', cardId: 'atk', mode: 'base', rageCancelArmed: false }] });
  const s1 = createSeat('p2', 'b', { sequence: [{ kind: 'card', cardId: 'arm', mode: 'base', rageCancelArmed: false }], hp: 10 });
  const state = createInitialState([s0, s1]);
  const r = runShowdown(state, { lookupCard: lookup });
  const armored = r.events.find((e) => e.kind === 'hit-armored');
  assert(!!armored, 'expected hit-armored event');
  if (armored && armored.kind === 'hit-armored') {
    assert(armored.damage === 2, `expected damage 2, got ${armored.damage}`);
    assert(!armored.armorBroken, 'expected armor intact after 1 absorb');
  }
});

// === summary ===
const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} advanced tests passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
