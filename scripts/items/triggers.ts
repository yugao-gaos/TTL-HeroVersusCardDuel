/**
 * HVCD item triggers — Wave 4 / B8.
 *
 * The trigger engine is a **pure** function: given (runState, eventKind,
 * payload), it returns a list of mutations + a new RunState (with charges
 * decremented). Callers (state scripts) apply the mutations to the live
 * world.
 *
 * Why pure:
 *   - Replay determinism: the engine is a function of its inputs only.
 *   - Easier to unit-test (the determinism gate (B11) re-runs the engine
 *     N times and asserts identical output).
 *   - Decouples trigger semantics from the resolver internals.
 *
 * # Trigger boundaries (where each trigger fires)
 *
 *   onRunStart        scripts/states/match-setup (only on the first match
 *                     of a new run; current MVP fires it every match-setup
 *                     since per-run vs per-match isn't yet split — see
 *                     game_design_direction.md TODO on per-run state).
 *   onRoundStart      scripts/states/commit StateEntered (one per turn).
 *   onPlayCard        scripts/states/showdown after a hit-card is dequeued
 *                     for the owning seat (post-resolver, applied as side-
 *                     effect mutations on the next round-start tick).
 *   onTakeHit         scripts/states/pause-or-end after damage settled.
 *   onActivate        scripts/states/commit on an explicit activate-item
 *                     input from the player.
 *
 * NB: This trigger layer is *outside* the resolver per-frame loop and
 * therefore does not violate OQ-35 (which prohibits reactive items inside
 * the resolver). See scripts/items/catalog.ts header.
 *
 * # Privacy
 *
 * RunState.runItems[].chargesRemaining is owner-only. Callers should
 * persist this slice to the per-session **private KV** (the `__hidden`
 * namespace) per renderer-slots.md OQ-18.
 */

import type {
  Item,
  ItemEffect,
  ItemTrigger,
} from './catalog.ts';
import { getItem, getHeroStarterItem } from './catalog.ts';
import type { SeatId } from '../resolver/types.ts';

// ---------------------------------------------------------------------------
// RunState — per-seat slice
// ---------------------------------------------------------------------------

/**
 * One inventory entry inside RunState.
 *
 * For passives (catalog.charges === null), `chargesRemaining` is `null` and
 * the trigger always fires.
 *
 * For consumables (catalog.charges === N), `chargesRemaining` starts at N
 * and decrements to 0; at 0 the trigger no longer fires (the item is
 * "spent"). The entry is retained in the inventory for replay accounting
 * (matches the `inventoryEnd` field in HvcdMatchResult.perSeat — the
 * platform sees "you used all 3 of your flask charges").
 */
export interface RunInventoryEntry {
  itemId: string;
  chargesRemaining: number | null;
}

/**
 * Per-seat run state. One per SeatId.
 *
 * `firstCardThisRound` is the per-round flag used by the swift-boots
 * `first-card-rage-discount` op; reset to true at every onRoundStart.
 */
export interface SeatRunState {
  heroId: string;
  runItems: RunInventoryEntry[];
  firstCardThisRound: boolean;
  /** Counter so opponent burn tokens accumulate across rounds. */
  burnTokens: number;
}

/** Top-level run state, keyed by SeatId. */
export interface RunState {
  seats: Record<SeatId, SeatRunState>;
  /** Match index within the run (0-indexed). MVP increments per match. */
  matchIndex: number;
}

// ---------------------------------------------------------------------------
// Mutation ops emitted by the engine (consumed by state scripts)
// ---------------------------------------------------------------------------

/**
 * One concrete mutation the calling state script must apply to the live
 * world. Engine returns these instead of mutating directly so state scripts
 * can choose how to write into ECS / event bus / private KV.
 */
export type ItemMutation =
  | { kind: 'damage'; target: SeatId; amount: number; sourceItemId: string; reason: 'reflect' | 'burn' }
  | { kind: 'heal'; target: SeatId; amount: number; sourceItemId: string }
  | { kind: 'grant-rage'; target: SeatId; amount: number; sourceItemId: string }
  | { kind: 'add-block-pool'; target: SeatId; amount: number; sourceItemId: string }
  | { kind: 'apply-stun'; target: SeatId; frames: number; sourceItemId: string }
  | { kind: 'add-burn'; target: SeatId; tokens: number; sourceItemId: string }
  | { kind: 'rage-discount-next-card'; target: SeatId; amount: number; sourceItemId: string }
  | { kind: 'roll-bias'; target: SeatId; amount: number; sourceItemId: string }
  | { kind: 'consume-charge'; ownerSeat: SeatId; itemId: string };

// ---------------------------------------------------------------------------
// Event payloads — the typed shape the engine reads
// ---------------------------------------------------------------------------

export interface OnRunStartPayload {}
export interface OnRoundStartPayload { turnIndex: number }
export interface OnPlayCardPayload { seat: SeatId; cardKind: 'hit' | 'grab' | 'projectile' | 'parry' | 'effect' | 'defense' }
export interface OnTakeHitPayload { defender: SeatId; attacker: SeatId; damage: number; survived: boolean }
export interface OnActivatePayload { seat: SeatId; itemId: string }

export type TriggerEvent =
  | { kind: 'onRunStart'; payload: OnRunStartPayload }
  | { kind: 'onRoundStart'; payload: OnRoundStartPayload }
  | { kind: 'onPlayCard'; payload: OnPlayCardPayload }
  | { kind: 'onTakeHit'; payload: OnTakeHitPayload }
  | { kind: 'onActivate'; payload: OnActivatePayload };

export interface FireResult {
  /** Mutations the state script must apply, in order. */
  mutations: ItemMutation[];
  /** New run state with charges decremented. */
  runState: RunState;
}

// ---------------------------------------------------------------------------
// Run-state factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh RunState for a new run. Each seat is granted its hero's
 * hero-locked starter item via the catalog lookup.
 *
 * This is the **B10** entry point — match-setup calls it on a brand-new
 * run; subsequent matches in the same run carry the existing runState.
 */
export function createRunState(p1HeroId: string, p2HeroId: string): RunState {
  return {
    seats: {
      p1: createSeatRunState(p1HeroId),
      p2: createSeatRunState(p2HeroId),
    },
    matchIndex: 0,
  };
}

export function createSeatRunState(heroId: string): SeatRunState {
  const items: RunInventoryEntry[] = [];
  const starter = getHeroStarterItem(heroId);
  if (starter) {
    items.push({
      itemId: starter.id,
      chargesRemaining: starter.charges, // null for passives
    });
  }
  return {
    heroId,
    runItems: items,
    firstCardThisRound: true,
    burnTokens: 0,
  };
}

/**
 * Reset per-round flags. Call on onRoundStart before fireTrigger.
 */
export function resetRoundFlags(runState: RunState): RunState {
  return {
    ...runState,
    seats: {
      p1: { ...runState.seats.p1, firstCardThisRound: true },
      p2: { ...runState.seats.p2, firstCardThisRound: true },
    },
  };
}

// ---------------------------------------------------------------------------
// Core trigger engine
// ---------------------------------------------------------------------------

/**
 * Fire the named trigger and produce all (mutation list, new runState).
 *
 * This is pure: same input -> same output, byte-for-byte. The B11
 * determinism gate exercises this property.
 *
 * Iteration order: seats in document order (p1 then p2), then per seat
 * inventory in array order. Stable so replays are byte-identical.
 */
export function fireTrigger(runState: RunState, event: TriggerEvent): FireResult {
  // Defensive deep-clone of runItems: pure function must not mutate input.
  const next: RunState = {
    ...runState,
    seats: {
      p1: cloneSeat(runState.seats.p1),
      p2: cloneSeat(runState.seats.p2),
    },
  };
  const mutations: ItemMutation[] = [];

  // Burn tokens fire on onRoundStart (deals 1 dmg per stacked token, then
  // consumes them). This is the consequence of `add-burn` from a previous
  // round — implemented as a deterministic round-start tick rather than a
  // per-frame status effect (same as item triggers: out of resolver).
  if (event.kind === 'onRoundStart') {
    for (const seatId of (['p1', 'p2'] as SeatId[])) {
      const seat = next.seats[seatId];
      if (seat.burnTokens > 0) {
        mutations.push({
          kind: 'damage',
          target: seatId,
          amount: seat.burnTokens,
          sourceItemId: 'burn-token',
          reason: 'burn',
        });
        seat.burnTokens = 0; // consumed
      }
    }
  }

  for (const seatId of (['p1', 'p2'] as SeatId[])) {
    const seat = next.seats[seatId];
    for (const inv of seat.runItems) {
      const item = getItem(inv.itemId);
      if (!item) continue; // unknown id -> silent no-op (stale inventory)
      if (item.trigger !== event.kind) continue;
      if (!shouldFire(item, inv, seatId, event)) continue;

      // Apply effect — convert to mutations.
      const ms = applyEffect(item, inv, seatId, event, seat);
      for (const m of ms) mutations.push(m);

      // Decrement charges for consumables that fired.
      if (item.kind === 'consumable' && inv.chargesRemaining !== null && inv.chargesRemaining > 0) {
        inv.chargesRemaining -= 1;
        mutations.push({
          kind: 'consume-charge',
          ownerSeat: seatId,
          itemId: item.id,
        });
      }
    }
  }

  return { mutations, runState: next };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneSeat(seat: SeatRunState): SeatRunState {
  return {
    heroId: seat.heroId,
    runItems: seat.runItems.map((it) => ({ itemId: it.itemId, chargesRemaining: it.chargesRemaining })),
    firstCardThisRound: seat.firstCardThisRound,
    burnTokens: seat.burnTokens,
  };
}

/**
 * Trigger eligibility check.
 *
 *   - Consumables with 0 charges remaining never fire.
 *   - onActivate items only fire when the explicit activate event names them.
 *   - onPlayCard items only fire for the owning seat's hit-card dequeues.
 *   - onTakeHit items only fire when the defender is the owning seat (and
 *     for `survive-restore-hp` only when survived).
 */
function shouldFire(item: Item, inv: RunInventoryEntry, ownerSeat: SeatId, event: TriggerEvent): boolean {
  if (item.kind === 'consumable' && inv.chargesRemaining !== null && inv.chargesRemaining <= 0) return false;

  switch (event.kind) {
    case 'onRunStart':
    case 'onRoundStart':
      return true;
    case 'onActivate':
      return event.payload.seat === ownerSeat && event.payload.itemId === item.id;
    case 'onPlayCard':
      // Per the catalog, onPlayCard items care about hit-cards specifically.
      return event.payload.seat === ownerSeat
        && (event.payload.cardKind === 'hit' || event.payload.cardKind === 'grab' || event.payload.cardKind === 'projectile');
    case 'onTakeHit':
      if (event.payload.defender !== ownerSeat) return false;
      if (item.effect.op === 'survive-restore-hp' && !event.payload.survived) return false;
      return true;
  }
}

function applyEffect(
  item: Item,
  _inv: RunInventoryEntry,
  ownerSeat: SeatId,
  event: TriggerEvent,
  seatState: SeatRunState,
): ItemMutation[] {
  const eff: ItemEffect = item.effect;
  const opp: SeatId = ownerSeat === 'p1' ? 'p2' : 'p1';
  const out: ItemMutation[] = [];

  switch (eff.op) {
    case 'add-burn': {
      const target = eff.target === 'opponent' ? opp : ownerSeat;
      out.push({ kind: 'add-burn', target, tokens: eff.tokens, sourceItemId: item.id });
      break;
    }
    case 'apply-stun': {
      const target = eff.target === 'opponent' ? opp : ownerSeat;
      out.push({ kind: 'apply-stun', target, frames: eff.frames, sourceItemId: item.id });
      break;
    }
    case 'heal': {
      out.push({ kind: 'heal', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      break;
    }
    case 'grant-rage': {
      out.push({ kind: 'grant-rage', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      break;
    }
    case 'add-block-pool': {
      out.push({ kind: 'add-block-pool', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      break;
    }
    case 'reflect-damage-chance': {
      // Deterministic chance roll: uses the current event payload as input
      // so the same input event yields the same outcome on both seats. The
      // attacker is encoded in the onTakeHit payload.
      if (event.kind !== 'onTakeHit') break;
      const attacker = event.payload.attacker;
      // Hash of (ownerSeat + attacker + damage) -> 0..99. Stable, no Math.random.
      const seed = stableHash(`${ownerSeat}|${attacker}|${event.payload.damage}|${item.id}`);
      const roll = seed % 100;
      if (roll < eff.chancePercent) {
        out.push({ kind: 'damage', target: attacker, amount: eff.amount, sourceItemId: item.id, reason: 'reflect' });
      }
      break;
    }
    case 'first-card-rage-discount': {
      if (event.kind !== 'onPlayCard') break;
      if (!seatState.firstCardThisRound) break;
      out.push({ kind: 'rage-discount-next-card', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      // Mark the flag locally — caller will see this via runState mutation.
      seatState.firstCardThisRound = false;
      break;
    }
    case 'survive-restore-hp': {
      if (event.kind !== 'onTakeHit') break;
      if (!event.payload.survived) break;
      out.push({ kind: 'heal', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      break;
    }
    case 'roll-bias': {
      out.push({ kind: 'roll-bias', target: ownerSeat, amount: eff.amount, sourceItemId: item.id });
      break;
    }
  }

  return out;
}

/**
 * Tiny FNV-1a 32-bit hash. Used for the deterministic chance roll in
 * `reflect-damage-chance`. Pure, no randomness, no platform deps —
 * critical for replay determinism (B11).
 */
function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Math.imul is deterministic and same across V8/Deno/Node.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Public-shape converter for HvcdMatchResult.perSeat[].inventoryEnd
// ---------------------------------------------------------------------------

/**
 * Convert a SeatRunState's runItems into the public `inventoryEnd` shape the
 * platform expects in HvcdMatchResult. `usages` mirrors the
 * `chargesRemaining` field (for passives, null).
 */
export function toInventoryEnd(seat: SeatRunState): Array<{ itemId: string; usages: number | null }> {
  return seat.runItems.map((it) => ({
    itemId: it.itemId,
    usages: it.chargesRemaining,
  }));
}
