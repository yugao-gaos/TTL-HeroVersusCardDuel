/**
 * Ported HVCD fixtures from HeroVersusCardDuel/src/lib/showdown/__tests__/fixtures.ts
 * Remapped onto the §7 card model (attackWindows/defenseWindows dicts instead
 * of flat hitWindow/blockWindow/etc.). hitType/RPS is dropped per §7 migration.
 */
import type { Card, SeatState, SequenceSlot } from '../scripts/resolver/types.ts';
import { createSeat } from '../scripts/resolver/world.ts';

let uid = 0;
export function resetUid() {
  uid = 0;
}

export interface PartialCard {
  name: string;
  totalFrames: number;
  hitWindow?: { start: number; end: number; damage?: number; hits?: number; hitStun?: number; blockStun?: number; knockdown?: boolean; defenseBreaker?: boolean };
  blockWindow?: { start: number; end: number };
  evasionWindow?: { start: number; end: number };
  damage?: number;
  defenseBreaker?: boolean;
  rageCost?: number;
}

/**
 * Build a Card per §7 from the legacy fixture shape used by HVCD tests.
 * RPS hitType is dropped — all hits use attackWindows.hit.
 */
export function makeCard(partial: PartialCard): Card {
  const id = `${partial.name}#${uid++}`;
  const hit = partial.hitWindow
    ? {
        frames: [partial.hitWindow.start, partial.hitWindow.end] as [number, number],
        damage: partial.hitWindow.damage ?? partial.damage ?? 0,
        hits: partial.hitWindow.hits ?? 1,
        hitStun: partial.hitWindow.hitStun,
        blockStun: partial.hitWindow.blockStun,
        knockdown: partial.hitWindow.knockdown,
        defenseBreaker: partial.hitWindow.defenseBreaker ?? partial.defenseBreaker,
      }
    : null;
  const block = partial.blockWindow
    ? { frames: [partial.blockWindow.start, partial.blockWindow.end] as [number, number] }
    : null;
  const evasion = partial.evasionWindow
    ? { frames: [partial.evasionWindow.start, partial.evasionWindow.end] as [number, number] }
    : null;
  return {
    id,
    name: partial.name,
    totalFrames: partial.totalFrames,
    attackWindows: hit ? { hit } : {},
    defenseWindows: { ...(block ? { block } : {}), ...(evasion ? { evasion } : {}) },
    cancelWindow: null,
    rageVariant: null,
  };
}

export const fastJab = () =>
  makeCard({
    name: 'fastJab',
    totalFrames: 6,
    hitWindow: { start: 2, end: 3, damage: 1, hitStun: 2 },
  });

export const heavyPunch = () =>
  makeCard({
    name: 'heavyPunch',
    totalFrames: 12,
    hitWindow: { start: 6, end: 8, damage: 3, hitStun: 3 },
  });

export const blockStance = () =>
  makeCard({
    name: 'blockStance',
    totalFrames: 8,
    blockWindow: { start: 1, end: 7 },
  });

export const sidestep = () =>
  makeCard({
    name: 'sidestep',
    totalFrames: 5,
    evasionWindow: { start: 1, end: 3 },
  });

export const breakerStrike = () =>
  makeCard({
    name: 'breakerStrike',
    totalFrames: 8,
    hitWindow: { start: 2, end: 3, damage: 3, hitStun: 2, defenseBreaker: true },
  });

export interface TestSeatOverrides {
  hp?: number;
  rage?: number;
  blockPool?: number;
}

export function seat(heroId: string, cards: Card[], overrides?: TestSeatOverrides): SeatState {
  // Each card is a sequence slot of kind 'card'.
  const slots: SequenceSlot[] = cards.map((c) => ({
    kind: 'card',
    cardId: c.id,
    mode: 'base',
    rageCancelArmed: false,
  }));
  return createSeat(heroId === 'a' ? 'p1' : 'p2', heroId, {
    hp: overrides?.hp ?? 8,
    rage: overrides?.rage ?? 0,
    blockPool: overrides?.blockPool ?? 6,
    sequence: slots,
  });
}

/** In-memory card registry — replaces cardRegistry lookup during tests. */
export function buildLookup(cards: Card[]): (id: string) => Card | null {
  const map = new Map<string, Card>();
  for (const c of cards) map.set(c.id, c);
  return (id: string) => map.get(id) ?? null;
}
