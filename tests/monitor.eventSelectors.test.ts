/**
 * Pure-function tests for scripts/monitor/eventSelectors.ts
 *
 * These tests require nothing but a module loader + a describe/it/expect
 * runtime (Vitest, Jest, or anything else with that API). No DOM, no
 * Remotion, no three.js.
 *
 * Wired for Vitest out-of-box: if the repo adopts Jest later, the
 * describe/it/expect symbols work unchanged; only the import source
 * differs.
 */

import { describe, it, expect } from 'vitest';
import {
  expandEventsToLayers,
  selectActiveLayersAt,
  selectActiveSequences,
  selectComboState,
  selectHitStop,
  selectFrameReadout,
  hitSize,
  HIT_STOP_BY_SIZE,
  type ActiveLayer,
} from '../scripts/monitor/eventSelectors';
import type { ResolverEvent } from '../scripts/resolver/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cardEntered(
  at: number,
  totalFrames: number,
  seat: 'p1' | 'p2' = 'p1',
  cardId = 'card-x',
): ResolverEvent {
  return {
    kind: 'card-entered-timeline',
    seat,
    cardId,
    atGlobalFrame: at,
    totalFrames,
    slotKind: 'card',
  };
}

function hitConnected(
  at: number,
  damage: number,
  opts: Partial<{ attackerSeat: 'p1' | 'p2'; defenderSeat: 'p1' | 'p2'; hits: number; hitStun: number }> = {},
): ResolverEvent {
  return {
    kind: 'hit-connected',
    attackerSeat: opts.attackerSeat ?? 'p1',
    defenderSeat: opts.defenderSeat ?? 'p2',
    attackKind: 'hit',
    cardId: 'card-hit',
    atGlobalFrame: at,
    damage,
    hits: opts.hits ?? 1,
    hitStunFrames: opts.hitStun ?? 10,
    comboExtend: false,
  };
}

function matchStarted(): ResolverEvent {
  return {
    kind: 'match-started',
    setup: {
      seats: {
        p1: { heroId: 'h1', hp: 100, rage: 0, blockPool: 5, inventory: [] },
        p2: { heroId: 'h2', hp: 100, rage: 0, blockPool: 5, inventory: [] },
      },
      rngSeed: 42,
    },
  };
}

// ---------------------------------------------------------------------------
// hitSize
// ---------------------------------------------------------------------------

describe('hitSize', () => {
  it('classifies damage into small / medium / heavy buckets', () => {
    expect(hitSize(0)).toBe('small');
    expect(hitSize(5)).toBe('small');
    expect(hitSize(11)).toBe('small');
    expect(hitSize(12)).toBe('medium');
    expect(hitSize(24)).toBe('medium');
    expect(hitSize(25)).toBe('heavy');
    expect(hitSize(99)).toBe('heavy');
  });
});

// ---------------------------------------------------------------------------
// expandEventsToLayers
// ---------------------------------------------------------------------------

describe('expandEventsToLayers', () => {
  it('produces a FighterAttack layer for each card-entered-timeline', () => {
    const layers = expandEventsToLayers([
      cardEntered(0, 30, 'p1', 'card-a'),
      cardEntered(10, 40, 'p2', 'card-b'),
    ]);
    const attacks = layers.filter((l): l is Extract<ActiveLayer, { kind: 'fighter-attack' }> => l.kind === 'fighter-attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({
      seat: 'p1',
      cardId: 'card-a',
      startFrame: 0,
      durationFrames: 30,
    });
    expect(attacks[1]).toMatchObject({
      seat: 'p2',
      cardId: 'card-b',
      startFrame: 10,
      durationFrames: 40,
    });
  });

  it('produces a fighter-react + impact-flash + damage-numeral trio per hit-connected', () => {
    const layers = expandEventsToLayers([hitConnected(20, 15)]);
    const kinds = layers.map((l) => l.kind).sort();
    expect(kinds).toEqual(['damage-numeral', 'fighter-react', 'impact-flash']);
    const react = layers.find((l): l is Extract<ActiveLayer, { kind: 'fighter-react' }> => l.kind === 'fighter-react')!;
    expect(react.size).toBe('medium');
    expect(react.seat).toBe('p2');
    expect(react.startFrame).toBe(20);
  });

  it('expands hit-parried into parry-glint + fighter-stagger + (counter numeral)', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'hit-parried',
        parrierSeat: 'p2',
        attackerSeat: 'p1',
        cardId: 'parry-card',
        againstCardId: 'attack-card',
        atGlobalFrame: 40,
        counterDamage: 8,
        counterHits: 1,
        counterHitStun: 10,
        counterKnockdown: false,
      },
    ]);
    const kinds = layers.map((l) => l.kind).sort();
    expect(kinds).toEqual(['damage-numeral', 'fighter-stagger', 'parry-glint']);
  });

  it('emits a projectile layer covering [spawn, arrive)', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'projectile-launched',
        ownerSeat: 'p1',
        cardId: 'proj',
        spawnGlobalFrame: 50,
        arrivalGlobalFrame: 80,
        travelFrames: 30,
        hits: 1,
        damage: 10,
        defenseBreaker: false,
        knockdown: false,
        projectileId: 'prj-1',
      },
    ]);
    const proj = layers.find((l): l is Extract<ActiveLayer, { kind: 'projectile' }> => l.kind === 'projectile')!;
    expect(proj.spawnFrame).toBe(50);
    expect(proj.arriveFrame).toBe(80);
    expect(proj.projectileId).toBe('prj-1');
  });

  it('does NOT emit an impact-flash layer on a "landed" projectile-arrived (hit-connected owns that)', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'projectile-arrived',
        projectileId: 'prj-2',
        ownerSeat: 'p1',
        targetSeat: 'p2',
        atGlobalFrame: 90,
        resolution: 'landed',
      },
    ]);
    expect(layers.filter((l) => l.kind === 'impact-flash')).toHaveLength(0);
  });

  it('does emit an impact-flash layer on a blocked/evaded projectile arrival', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'projectile-arrived',
        projectileId: 'prj-3',
        ownerSeat: 'p1',
        targetSeat: 'p2',
        atGlobalFrame: 100,
        resolution: 'blocked',
      },
    ]);
    const flash = layers.find((l) => l.kind === 'impact-flash');
    expect(flash).toBeDefined();
  });

  it('emits a knockdown layer for knockdown-placed covering the frame range', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'knockdown-placed',
        seat: 'p2',
        frames: [100, 130],
      },
    ]);
    const kd = layers.find((l): l is Extract<ActiveLayer, { kind: 'knockdown' }> => l.kind === 'knockdown');
    expect(kd).toBeDefined();
    expect(kd!.startFrame).toBe(100);
    expect(kd!.durationFrames).toBe(31); // inclusive
  });

  it('emits an effect layer for effect-activated and honors duration', () => {
    const layers = expandEventsToLayers([
      {
        kind: 'effect-activated',
        casterSeat: 'p1',
        targetSeat: 'p2',
        effectId: 'poison',
        activationGlobalFrame: 60,
        duration: 45,
        endGlobalFrame: 105,
      },
    ]);
    const eff = layers.find((l): l is Extract<ActiveLayer, { kind: 'effect' }> => l.kind === 'effect');
    expect(eff).toBeDefined();
    expect(eff!.durationFrames).toBe(45);
    expect(eff!.startFrame).toBe(60);
    expect(eff!.targetSeat).toBe('p2');
  });

  it('emits a ko-flash layer on ko event', () => {
    const layers = expandEventsToLayers([
      { kind: 'ko', losingSeat: 'p2', atGlobalFrame: 200 },
    ]);
    const ko = layers.find((l): l is Extract<ActiveLayer, { kind: 'ko-flash' }> => l.kind === 'ko-flash');
    expect(ko).toBeDefined();
    expect(ko!.losingSeat).toBe('p2');
  });

  it('ignores events that have no visual layer (cursor-advanced, rage-gained, etc.)', () => {
    const layers = expandEventsToLayers([
      { kind: 'cursor-advanced', newGlobalFrame: 5, skipped: 1 },
      { kind: 'rage-gained', seat: 'p1', amount: 1, rageAfter: 2, reason: 'damage-taken' },
      { kind: 'damage-applied', seat: 'p2', amount: 10, hpBefore: 50, hpAfter: 40, attackerSeat: 'p1', attackKind: 'hit', cardId: 'c', atGlobalFrame: 10 },
    ]);
    expect(layers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// selectActiveLayersAt / selectActiveSequences
// ---------------------------------------------------------------------------

describe('selectActiveLayersAt', () => {
  const events: ResolverEvent[] = [
    cardEntered(0, 30, 'p1', 'card-a'),
    cardEntered(30, 20, 'p2', 'card-b'),
    hitConnected(40, 18, { attackerSeat: 'p2', defenderSeat: 'p1', hitStun: 10 }),
  ];

  it('includes only layers whose [start, start+duration) window covers currentFrame', () => {
    const layers = expandEventsToLayers(events);

    const at10 = selectActiveLayersAt(layers, 10);
    expect(at10.map((l) => l.kind).sort()).toEqual(['fighter-attack']);

    const at40 = selectActiveLayersAt(layers, 40);
    // p2's attack (spans 30..50) + hit's react/flash/numeral (start at 40).
    expect(at40.map((l) => l.kind).sort())
      .toEqual(['damage-numeral', 'fighter-attack', 'fighter-react', 'impact-flash']);

    const at60 = selectActiveLayersAt(layers, 60);
    // DamageNumeral lasts 30 frames, so it still shows at 60 (40..70).
    expect(at60.map((l) => l.kind).sort()).toEqual(['damage-numeral']);
  });

  it('selectActiveSequences is a convenience one-shot equivalent', () => {
    const live = selectActiveSequences(events, 10);
    expect(live.map((l) => l.kind)).toEqual(['fighter-attack']);
  });
});

// ---------------------------------------------------------------------------
// selectComboState
// ---------------------------------------------------------------------------

describe('selectComboState', () => {
  it('returns empty state with no events', () => {
    expect(selectComboState([])).toEqual({
      attackerSeat: null,
      hitCount: 0,
      startedAtFrame: null,
    });
  });

  it('increments hitCount for hit-connected events that match the current attacker', () => {
    const log: ResolverEvent[] = [
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 8, { attackerSeat: 'p1' }),
      hitConnected(25, 12, { attackerSeat: 'p1' }),
    ];
    const combo = selectComboState(log);
    expect(combo.attackerSeat).toBe('p1');
    expect(combo.hitCount).toBe(2);
    expect(combo.startedAtFrame).toBe(10);
  });

  it('respects the `hits` field when it is > 1', () => {
    const log: ResolverEvent[] = [
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 5, { attackerSeat: 'p1', hits: 3 }),
    ];
    expect(selectComboState(log).hitCount).toBe(3);
  });

  it('clears on combo-dropped', () => {
    const log: ResolverEvent[] = [
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 8, { attackerSeat: 'p1' }),
      { kind: 'combo-dropped', attackerSeat: 'p1', atGlobalFrame: 20, reason: 'no-token-overlap' },
    ];
    expect(selectComboState(log).attackerSeat).toBeNull();
    expect(selectComboState(log).hitCount).toBe(0);
  });

  it('clears on ko / showdown-paused / turn-ended', () => {
    const baseCombo: ResolverEvent[] = [
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 8, { attackerSeat: 'p1' }),
    ];
    for (const terminator of [
      { kind: 'showdown-paused', turnIndex: 0, reason: 'combo-drop' } as ResolverEvent,
      { kind: 'turn-ended', turnIndex: 0, endGlobalFrame: 30 } as ResolverEvent,
      { kind: 'ko', losingSeat: 'p2', atGlobalFrame: 30 } as ResolverEvent,
      { kind: 'mutual-ko-draw', atGlobalFrame: 30, restoredHp: 1 } as ResolverEvent,
    ]) {
      expect(selectComboState([...baseCombo, terminator]).attackerSeat).toBeNull();
    }
  });

  it('does NOT count hits from a seat that is not the current combo attacker', () => {
    const log: ResolverEvent[] = [
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 8, { attackerSeat: 'p2', defenderSeat: 'p1' }), // not p1's combo
    ];
    expect(selectComboState(log).hitCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// selectHitStop
// ---------------------------------------------------------------------------

describe('selectHitStop', () => {
  it('returns 1.0 outside any hit-stop window', () => {
    expect(selectHitStop([], 0)).toBe(1);
    expect(selectHitStop([hitConnected(0, 5)], 100)).toBe(1);
  });

  it('freezes (returns 0) inside a hit-connected hit-stop window scaled by hit size', () => {
    const small = HIT_STOP_BY_SIZE.small;
    const log = [hitConnected(100, 5)]; // small
    expect(selectHitStop(log, 100)).toBe(0);
    expect(selectHitStop(log, 100 + small - 1)).toBe(0);
    expect(selectHitStop(log, 100 + small)).toBe(1);
  });

  it('heavy hits have a longer freeze than small hits', () => {
    const heavy = hitConnected(100, 30); // heavy
    const small = hitConnected(100, 5); // small
    expect(selectHitStop([heavy], 100 + HIT_STOP_BY_SIZE.medium)).toBe(0); // still frozen
    expect(selectHitStop([small], 100 + HIT_STOP_BY_SIZE.medium)).toBe(1); // already recovered
  });

  it('projectile clash slows (not freezes)', () => {
    const log: ResolverEvent[] = [
      {
        kind: 'projectile-clashed',
        atGlobalFrame: 100,
        aProjectileId: 'a',
        bProjectileId: 'b',
        hitsCancelled: 1,
        aRemainingHits: 0,
        bRemainingHits: 0,
      },
    ];
    expect(selectHitStop(log, 100)).toBe(0.25);
    expect(selectHitStop(log, 104)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// selectFrameReadout
// ---------------------------------------------------------------------------

describe('selectFrameReadout', () => {
  it('initializes HP/rage from match-started', () => {
    const r = selectFrameReadout([matchStarted()], 0);
    expect(r.hp).toEqual({ p1: 100, p2: 100 });
    expect(r.rage).toEqual({ p1: 0, p2: 0 });
    expect(r.frame).toBe(0);
  });

  it('folds damage-applied into hp at the event frame', () => {
    const log: ResolverEvent[] = [
      matchStarted(),
      {
        kind: 'damage-applied',
        seat: 'p2',
        amount: 20,
        hpBefore: 100,
        hpAfter: 80,
        attackerSeat: 'p1',
        attackKind: 'hit',
        cardId: 'c',
        atGlobalFrame: 50,
      },
    ];
    // Before the damage frame, HP is still 100.
    expect(selectFrameReadout(log, 49).hp.p2).toBe(100);
    // At and after the damage frame, HP is 80.
    expect(selectFrameReadout(log, 50).hp.p2).toBe(80);
    expect(selectFrameReadout(log, 200).hp.p2).toBe(80);
  });

  it('folds rage-gained into rage cumulatively', () => {
    const log: ResolverEvent[] = [
      matchStarted(),
      { kind: 'rage-gained', seat: 'p1', amount: 1, rageAfter: 1, reason: 'damage-taken' },
      { kind: 'rage-gained', seat: 'p1', amount: 1, rageAfter: 2, reason: 'damage-taken' },
    ];
    expect(selectFrameReadout(log, 100).rage.p1).toBe(2);
  });

  it('deducts rage on cancel-armed', () => {
    const log: ResolverEvent[] = [
      matchStarted(),
      { kind: 'rage-gained', seat: 'p1', amount: 3, rageAfter: 3, reason: 'damage-taken' },
      { kind: 'cancel-armed', seat: 'p1', slotIndex: 0, cardId: 'c', rageSpent: 2 },
    ];
    expect(selectFrameReadout(log, 100).rage.p1).toBe(1);
  });

  it('tracks comboHits only within an active combo window at the given frame', () => {
    const log: ResolverEvent[] = [
      matchStarted(),
      { kind: 'combo-started', attackerSeat: 'p1', defenderSeat: 'p2', atGlobalFrame: 10 },
      hitConnected(15, 8, { attackerSeat: 'p1', defenderSeat: 'p2' }),
      hitConnected(22, 10, { attackerSeat: 'p1', defenderSeat: 'p2' }),
      { kind: 'combo-dropped', attackerSeat: 'p1', atGlobalFrame: 30, reason: 'no-token-overlap' },
      hitConnected(40, 5, { attackerSeat: 'p1', defenderSeat: 'p2' }), // outside combo
    ];
    expect(selectFrameReadout(log, 20).comboHits).toBe(1);
    expect(selectFrameReadout(log, 25).comboHits).toBe(2);
    expect(selectFrameReadout(log, 35).comboHits).toBe(0);
    expect(selectFrameReadout(log, 45).comboHits).toBe(0);
  });

  it('respects currentFrame — later events are ignored', () => {
    const log: ResolverEvent[] = [
      matchStarted(),
      {
        kind: 'damage-applied',
        seat: 'p1',
        amount: 30,
        hpBefore: 100,
        hpAfter: 70,
        attackerSeat: 'p2',
        attackKind: 'hit',
        cardId: 'c',
        atGlobalFrame: 100,
      },
    ];
    expect(selectFrameReadout(log, 50).hp.p1).toBe(100);
    expect(selectFrameReadout(log, 100).hp.p1).toBe(70);
  });
});
