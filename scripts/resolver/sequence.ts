/**
 * HVCD resolver — sequence dequeue
 *
 * Per combat-system.md §2 Dequeue rule.
 * Called by the showdown driver (scripts/resolver/world.ts / object/timeline.ts)
 * once per frame, per seat, to attempt to dequeue the next slot.
 *
 * Returns:
 *   - 'placed' if a card started playing
 *   - 'fizzled' if the slot couldn't resolve (insufficient rage for variant
 *     or for armed cancel — shouldn't happen in offline mode because those
 *     costs are pre-paid at commit, but safeguard anyway)
 *   - 'idle' if no dequeue happened (suppressed, empty, or already playing)
 */
import { expandCardToTokens, resolveCardMode } from './cards.ts';
import { isSuppressed, placeToken } from './tokens.ts';
import type {
  ActiveCard,
  Card,
  MatchState,
  ResolverEvent,
  SeatIndex,
  SequenceSlot,
  TimelineToken,
} from './types.ts';

export interface CardLookup {
  /** Return the authored Card (base shape) by cardId. Null if not found. */
  (cardId: string): Card | null;
}

export type DequeueOutcome = 'placed' | 'fizzled' | 'idle';

export function tryDequeue(
  state: MatchState,
  seatIdx: SeatIndex,
  lookupCard: CardLookup,
  events: ResolverEvent[],
): DequeueOutcome {
  const seat = state.seats[seatIdx];
  const frame = state.frame;

  // Already playing
  if (seat.activeCard) return 'idle';

  // Sequence exhausted
  if (seat.sequence.length === 0) return 'idle';

  // Suppressed by stun / knockdown / block
  if (isSuppressed(state, seat.id, frame)) return 'idle';

  // Cursor hasn't caught up yet
  if (frame < seat.cursor) return 'idle';

  const slot = seat.sequence[0];

  // --- Dequeue the slot ---
  seat.sequence.shift();

  events.push({
    kind: 'slot-dequeued',
    seat: seat.id,
    atGlobalFrame: frame,
    slot,
  });

  if (slot.kind === 'block-spacer') {
    // Place N consecutive block tokens with fromPool: true (§2, §5).
    for (let i = 0; i < slot.tokens; i++) {
      placeToken(state, {
        kind: 'block',
        seat: seat.id,
        frame: frame + i,
        payload: { fromPool: true },
      } as TimelineToken);
    }
    events.push({
      kind: 'window-tokens-placed',
      seat: seat.id,
      cardStartGlobalFrame: frame,
      cardId: `__spacer_${frame}`,
      windowKind: 'block',
      frames: [0, slot.tokens - 1],
      payload: { kind: 'block', fromPool: true },
    });
    // Advance cursor past the spacer.
    seat.cursor = frame + slot.tokens;
    return 'placed';
  }

  // card | item — discriminated-union narrow so TS resolves the right id.
  const lookupId = slot.kind === 'card' ? slot.cardId : slot.itemId;
  const card = lookupCard(lookupId);
  if (!card) {
    events.push({
      kind: 'diagnostic',
      level: 'error',
      message: `unknown card/item id: ${lookupId ?? '??'}`,
    });
    return 'fizzled';
  }

  const played = resolveCardMode(card, slot.mode);

  // Slot reserved item — decrement usages on dequeue per §12.
  if (slot.kind === 'item') {
    const inv = seat.inventory.find((i) => i.itemId === slot.itemId);
    if (inv && inv.usages !== null) inv.usages -= 1;
    if (inv && inv.usages !== null && inv.usages <= 0) {
      events.push({ kind: 'item-consumed', seat: seat.id, itemId: slot.itemId, atGlobalFrame: frame });
    } else {
      const usagesRemaining = inv ? (inv.usages ?? Infinity) : 0;
      events.push({
        kind: 'item-returned-to-inventory',
        seat: seat.id,
        itemId: slot.itemId,
        usagesRemaining: Number.isFinite(usagesRemaining) ? (usagesRemaining as number) : -1,
        reason: 'resolution',
      });
    }
    // Item's reservation is gone.
    const reservedIdx = seat.reservedItems.indexOf(slot.itemId);
    if (reservedIdx >= 0) seat.reservedItems.splice(reservedIdx, 1);
  }

  // Place the card's windows as tokens and announce.
  const active: ActiveCard = {
    cardId: played.id,
    card: played,
    startFrame: frame,
    mode: slot.mode,
    rageCancelArmed: slot.rageCancelArmed,
    connectedDamage: false,
  };
  seat.activeCard = active;

  events.push({
    kind: 'card-entered-timeline',
    seat: seat.id,
    cardId: played.id,
    atGlobalFrame: frame,
    totalFrames: played.totalFrames,
    slotKind: slot.kind === 'item' ? 'item' : 'card',
  });

  // Expand windows
  const expansion = expandCardToTokens(state, seat.id, played, frame);
  for (const ev of expansion) events.push(ev);

  // If the card had an armed cancel, mark the cancel token as armed.
  if (slot.rageCancelArmed && played.cancelWindow) {
    const cancelFrame = frame + played.cancelWindow.frame;
    for (const t of state.tokens) {
      if (t.seat === seat.id && t.frame === cancelFrame && t.kind === 'cancel' && t.cardId === played.id) {
        t.payload = { ...(t.payload ?? {}), armed: true };
      }
    }
  }

  return 'placed';
}

/**
 * Finish the currently active card (cursor past its last frame) by moving to
 * discard / side-area and clearing `activeCard`. Called per-frame before the
 * dequeue attempt.
 *
 * Does NOT emit card-left-timeline — that's emitted at actual disposal points.
 */
export function finishActiveCardIfEnded(
  state: MatchState,
  seatIdx: SeatIndex,
  events: ResolverEvent[],
): boolean {
  const seat = state.seats[seatIdx];
  const cur = seat.activeCard;
  if (!cur) return false;
  const end = cur.startFrame + cur.card.totalFrames - 1;
  if (state.frame <= end) return false;

  // Determine disposition.
  // If the card has a projectile window that already spawned in-flight, the card
  // is already parked in side-area and shouldn't go to discard yet.
  // The projectile script handles side-area release on projectile removal.
  const parkedForProjectile = seat.sideArea.some(
    (p) => p.cardId === cur.cardId && p.reason === 'projectile',
  );
  const parkedForEffect = seat.sideArea.some(
    (p) => p.cardId === cur.cardId && p.reason === 'standing-effect',
  );
  if (parkedForProjectile) {
    events.push({
      kind: 'card-left-timeline',
      seat: seat.id,
      cardId: cur.cardId,
      atGlobalFrame: state.frame,
      disposition: 'to-side-area-projectile',
    });
  } else if (parkedForEffect) {
    events.push({
      kind: 'card-left-timeline',
      seat: seat.id,
      cardId: cur.cardId,
      atGlobalFrame: state.frame,
      disposition: 'to-side-area-standing-effect',
    });
  } else if (cur.card.isItem) {
    // Item already decremented usages on dequeue; disposition is informational.
    events.push({
      kind: 'card-left-timeline',
      seat: seat.id,
      cardId: cur.cardId,
      atGlobalFrame: state.frame,
      disposition: 'to-inventory-retained',
    });
  } else {
    seat.discard.push(cur.cardId);
    events.push({
      kind: 'card-left-timeline',
      seat: seat.id,
      cardId: cur.cardId,
      atGlobalFrame: state.frame,
      disposition: 'to-discard',
    });
  }

  seat.activeCard = null;
  if (seat.cursor < state.frame) seat.cursor = state.frame;
  return true;
}
