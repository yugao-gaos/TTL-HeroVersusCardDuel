/**
 * HVCD resolver — attack → defense resolution
 *
 * Per combat-system.md §4 Interaction matrix + §5 frame loop step 5
 * (precedence parry > evasion > block > reflect > armor > damage) + §8
 * (parry rules).
 *
 * Called by scripts/objects/timeline.ts once per frame per seat in combat mode.
 */
import { applyDamage } from './economy.ts';
import { applyDamageModifiers } from '../effects/registry.ts';
import { anyTokenInRange, hasToken, placeToken, removeTokens, tokensAt } from './tokens.ts';
import type {
  ActiveCard,
  MatchState,
  ResolverEvent,
  SeatId,
  SeatIndex,
  TimelineToken,
} from './types.ts';
import { otherSeat, seatIdOf, tokenCoversFrame, tokenLastFrame } from './types.ts';

/**
 * Find the attack token active on seat at frame (one of hit/grab/parry/effect).
 * Only considers the seat's currently-playing card. Returns null if none.
 *
 * Per OQ-32, attack windows are single logical tokens; they "fire once" on
 * the first frame the window becomes active. So we match on `frame === start`
 * (the token's `frame` field). At subsequent frames within the window's
 * range, `findActiveAttackToken` returns null because the token either
 * already fired (attacker's card was truncated) or wasn't supposed to fire
 * again this window.
 */
export function findActiveAttackToken(
  state: MatchState,
  seatIdx: SeatIndex,
  kinds: Array<'hit' | 'grab' | 'parry'>,
): TimelineToken | null {
  const seat = state.seats[seatIdx];
  const cur = seat.activeCard;
  if (!cur) return null;
  for (const t of state.tokens) {
    if (
      t.seat === seat.id &&
      t.frame === state.frame &&
      t.cardId === cur.cardId &&
      (kinds as string[]).includes(t.kind)
    ) {
      return t;
    }
  }
  return null;
}

/** Defender's active defense tokens at the resolution frame, from their current card. */
function activeDefenseTokens(
  state: MatchState,
  defenderIdx: SeatIndex,
): TimelineToken[] {
  const defender = state.seats[defenderIdx];
  const cur = defender.activeCard;
  const out: TimelineToken[] = [];
  // Card-bound defenses (evasion, armor, reflect, and card-own block).
  // Per OQ-32:
  //   - block / armor are per-frame tokens → covered by frame equality.
  //   - evasion / reflect are multi-frame single-token windows → check range.
  for (const t of state.tokens) {
    if (t.seat !== defender.id) continue;
    if (t.kind !== 'block' && t.kind !== 'armor' && t.kind !== 'evasion' && t.kind !== 'reflect') continue;
    if (!tokenCoversFrame(t, state.frame)) continue;
    // Only consider tokens belonging to the defender's active card OR
    // spacer-placed block tokens (no cardId).
    if (!cur && t.cardId !== undefined) continue;
    out.push(t);
  }
  return out;
}

export interface HitOutcome {
  resolvedAs: 'parry' | 'evasion' | 'block' | 'reflect' | 'armor' | 'none';
  endedShowdown: boolean;
  attackerCardConsumed: boolean;
}

/**
 * Resolve one attacker's active attack token against the defender at the
 * current frame. Called per frame-loop step 5.
 *
 * The attacker's current card is truncated after a successful hit (attacker's
 * card lifecycle: attacker commits to its hit window, then its recovery is
 * collapsed to `impactEnd+1` in combo mode — same behavior as HVCD's resolver
 * for the hit cases).
 */
export function resolveAttack(
  state: MatchState,
  attackerIdx: SeatIndex,
  defenderIdx: SeatIndex,
  attackToken: TimelineToken,
  events: ResolverEvent[],
  isFirstClash: boolean,
): HitOutcome {
  const attacker = state.seats[attackerIdx];
  const defender = state.seats[defenderIdx];
  const cur = attacker.activeCard;
  if (!cur) return { resolvedAs: 'none', endedShowdown: false, attackerCardConsumed: false };

  const kind = attackToken.kind as 'hit' | 'grab' | 'parry';
  const payload = (attackToken.payload ?? {}) as {
    damage?: number;
    hits?: number;
    hitStun?: number;
    blockStun?: number;
    knockdown?: boolean;
    defenseBreaker?: boolean;
  };
  const damage = payload.damage ?? 0;
  const hits = payload.hits ?? 1;
  const hitStun = payload.hitStun ?? 0;
  const blockStun = payload.blockStun ?? 0;
  const knockdown = !!payload.knockdown;
  const defenseBreaker = !!payload.defenseBreaker;

  const defCur = defender.activeCard;
  const defenseTokens = activeDefenseTokens(state, defenderIdx);

  // parry is an attack, not in precedence; it's handled via the defender's own
  // attack token below. For the attack we're resolving:
  //   - if kind === 'parry', it triggers on incoming hit, not handled here.

  // Knockdown invincibility — defender untouchable if in knockdown token.
  if (hasToken(state, defender.id, state.frame, 'knockdown')) {
    events.push({
      kind: 'defense-precedence-resolved',
      atGlobalFrame: state.frame,
      defenderSeat: defender.id,
      resolvedAs: 'none',
      attackWindowKind: kind === 'parry' ? 'hit' : kind,
      attackCardId: cur.cardId,
      attackerSeat: attacker.id,
    });
    // whiff — consume the attacker's card frames
    truncateAttackerCard(state, attackerIdx, payload, events);
    return { resolvedAs: 'none', endedShowdown: false, attackerCardConsumed: true };
  }

  // Defender's parry window vs incoming hit? (attack.kind === 'hit')
  if (kind === 'hit') {
    const parry = findDefenderParry(state, defenderIdx);
    if (parry) {
      const parryKey = `${defender.id}|${parry.cardId}|${state.frame}`;
      if (!state.parryFiredThisFrame.has(parryKey)) {
        state.parryFiredThisFrame.add(parryKey);
        const pp = (parry.payload ?? {}) as {
          damage?: number;
          hits?: number;
          hitStun?: number;
          blockStun?: number;
          knockdown?: boolean;
        };
        events.push({
          kind: 'defense-precedence-resolved',
          atGlobalFrame: state.frame,
          defenderSeat: defender.id,
          resolvedAs: 'parry',
          attackWindowKind: 'hit',
          attackCardId: cur.cardId,
          attackerSeat: attacker.id,
        });
        events.push({
          kind: 'hit-parried',
          parrierSeat: defender.id,
          attackerSeat: attacker.id,
          cardId: parry.cardId ?? '',
          againstCardId: cur.cardId,
          atGlobalFrame: state.frame,
          counterDamage: pp.damage ?? 0,
          counterHits: pp.hits ?? 1,
          counterHitStun: pp.hitStun ?? 1,
          counterKnockdown: !!pp.knockdown,
        });
        // Place stun (or knockdown) on attacker
        const stunLen = pp.hitStun ?? 1;
        placeStun(state, attackerIdx, state.frame + 1, stunLen, pp.knockdown ? 'knockdown' : 'stun', 'parry', events);
        // Apply counter damage if any
        if ((pp.damage ?? 0) > 0) {
          const ko = applyDamage(state, attackerIdx, defenderIdx, pp.damage ?? 0, 'parry', parry.cardId ?? '', state.frame, events);
          if (ko) {
            events.push({ kind: 'ko', losingSeat: attacker.id, atGlobalFrame: state.frame });
            return { resolvedAs: 'parry', endedShowdown: true, attackerCardConsumed: true };
          }
        }
        // attacker's card truncates to recovery
        truncateAttackerCard(state, attackerIdx, payload, events);
        return { resolvedAs: 'parry', endedShowdown: false, attackerCardConsumed: true };
      }
    }
  }

  // Precedence order: parry (hit only, above), evasion, block, reflect, armor.

  // Evasion — only against hit/grab; projectile beats evasion.
  if (kind === 'hit' || kind === 'grab') {
    const evToken = defenseTokens.find((t) => t.kind === 'evasion');
    if (evToken) {
      events.push({
        kind: 'defense-precedence-resolved',
        atGlobalFrame: state.frame,
        defenderSeat: defender.id,
        resolvedAs: 'evasion',
        attackWindowKind: kind,
        attackCardId: cur.cardId,
        attackerSeat: attacker.id,
      });
      events.push({
        kind: 'hit-evaded',
        attackerSeat: attacker.id,
        defenderSeat: defender.id,
        attackKind: kind,
        cardId: cur.cardId,
        atGlobalFrame: state.frame,
      });
      truncateAttackerCard(state, attackerIdx, payload, events);
      return { resolvedAs: 'evasion', endedShowdown: false, attackerCardConsumed: true };
    }
  }

  // Block — defenseBreaker bypasses. Grab beats block.
  if (kind === 'hit' && !defenseBreaker) {
    const blockToken = defenseTokens.find((t) => t.kind === 'block');
    if (blockToken) {
      events.push({
        kind: 'defense-precedence-resolved',
        atGlobalFrame: state.frame,
        defenderSeat: defender.id,
        resolvedAs: 'block',
        attackWindowKind: 'hit',
        attackCardId: cur.cardId,
        attackerSeat: attacker.id,
      });
      // One block token absorbs one hit at this frame.
      const hitsAbsorbed = Math.min(1, hits);
      const hitsFallingThrough = hits - hitsAbsorbed;
      // consume the block token
      removeTokens(state, (t) => t === blockToken);

      events.push({
        kind: 'hit-blocked',
        attackerSeat: attacker.id,
        defenderSeat: defender.id,
        attackKind: 'hit',
        cardId: cur.cardId,
        atGlobalFrame: state.frame,
        hitsAbsorbed,
        hitsFallingThrough,
      });

      // Block-stun extension — blockStun frames starting frame+1.
      if (blockStun > 0) {
        extendBlockStun(state, defenderIdx, state.frame + 1, blockStun, events);
      }

      // Any remaining hits fall through as damage (no block to absorb them on
      // this frame — we simplify by landing raw; spec says they go to next
      // defense in precedence, which on a block-only defense is "damage").
      if (hitsFallingThrough > 0) {
        const dmg = applyDamageModifiers(state, attacker.id, defender.id, 'hit', damage, events, cur.cardId);
        const ko = applyDamage(state, defenderIdx, attackerIdx, dmg * hitsFallingThrough, 'hit', cur.cardId, state.frame, events);
        cur.connectedDamage = true;
        // regular stun spawn for fallthrough
        placeStun(state, defenderIdx, state.frame + 1, hitStun, knockdown ? 'knockdown' : 'stun', 'hit', events);
        events.push({
          kind: 'hit-connected',
          attackerSeat: attacker.id,
          defenderSeat: defender.id,
          attackKind: 'hit',
          cardId: cur.cardId,
          atGlobalFrame: state.frame,
          damage: dmg * hitsFallingThrough,
          hits: hitsFallingThrough,
          hitStunFrames: hitStun,
          comboExtend: false,
        });
        truncateAttackerCard(state, attackerIdx, payload, events);
        return { resolvedAs: 'block', endedShowdown: ko, attackerCardConsumed: true };
      }

      // All hits blocked, attacker's card ends naturally into recovery.
      truncateAttackerCard(state, attackerIdx, payload, events);
      return { resolvedAs: 'block', endedShowdown: false, attackerCardConsumed: true };
    }
  }

  // Armor — absorbs stun, not damage. defenseBreaker bypasses.
  if ((kind === 'hit' || kind === 'grab') && !defenseBreaker) {
    const armorToken = defenseTokens.find((t) => t.kind === 'armor');
    if (armorToken) {
      const ap = (armorToken.payload ?? {}) as { absorbs?: number };
      const remaining = (ap.absorbs ?? Infinity) - 1;
      events.push({
        kind: 'defense-precedence-resolved',
        atGlobalFrame: state.frame,
        defenderSeat: defender.id,
        resolvedAs: 'armor',
        attackWindowKind: kind,
        attackCardId: cur.cardId,
        attackerSeat: attacker.id,
      });
      const broken = remaining <= 0 && Number.isFinite(remaining);
      if (broken) {
        // armor broken — hit applies both damage and stun.
        removeTokens(state, (t) => t === armorToken);
        const dmg = applyDamageModifiers(state, attacker.id, defender.id, kind, damage, events, cur.cardId);
        const ko = applyDamage(state, defenderIdx, attackerIdx, dmg, kind, cur.cardId, state.frame, events);
        cur.connectedDamage = true;
        placeStun(state, defenderIdx, state.frame + 1, hitStun, knockdown ? 'knockdown' : 'stun', 'hit', events);
        events.push({
          kind: 'hit-armored',
          attackerSeat: attacker.id,
          defenderSeat: defender.id,
          attackKind: kind === 'grab' ? 'hit' : kind,
          cardId: cur.cardId,
          atGlobalFrame: state.frame,
          damage: dmg,
          armorAbsorbsRemaining: 0,
          armorBroken: true,
        });
        truncateAttackerCard(state, attackerIdx, payload, events);
        return { resolvedAs: 'armor', endedShowdown: ko, attackerCardConsumed: true };
      }
      // armor still intact — damage applies, no stun
      if (Number.isFinite(remaining)) {
        armorToken.payload = { ...(armorToken.payload ?? {}), absorbs: remaining };
      }
      const dmg = applyDamageModifiers(state, attacker.id, defender.id, kind, damage, events, cur.cardId);
      const ko = applyDamage(state, defenderIdx, attackerIdx, dmg, kind, cur.cardId, state.frame, events);
      cur.connectedDamage = true;
      events.push({
        kind: 'hit-armored',
        attackerSeat: attacker.id,
        defenderSeat: defender.id,
        attackKind: kind === 'grab' ? 'hit' : kind,
        cardId: cur.cardId,
        atGlobalFrame: state.frame,
        damage: dmg,
        armorAbsorbsRemaining: Number.isFinite(remaining) ? (remaining as number) : -1,
        armorBroken: false,
      });
      truncateAttackerCard(state, attackerIdx, payload, events);
      return { resolvedAs: 'armor', endedShowdown: ko, attackerCardConsumed: true };
    }
  }

  // No defense — attack lands.
  events.push({
    kind: 'defense-precedence-resolved',
    atGlobalFrame: state.frame,
    defenderSeat: defender.id,
    resolvedAs: 'none',
    attackWindowKind: kind === 'parry' ? 'hit' : kind,
    attackCardId: cur.cardId,
    attackerSeat: attacker.id,
  });

  const comboExtend = hasToken(state, defender.id, state.frame, 'stun');
  const dmg = applyDamageModifiers(state, attacker.id, defender.id, kind === 'parry' ? 'parry' : kind, damage, events, cur.cardId);
  const ko = applyDamage(state, defenderIdx, attackerIdx, dmg * hits, (kind === 'parry' ? 'parry' : kind), cur.cardId, state.frame, events);
  cur.connectedDamage = true;
  placeStun(state, defenderIdx, state.frame + 1, hitStun, knockdown ? 'knockdown' : 'stun', 'hit', events);
  events.push({
    kind: 'hit-connected',
    attackerSeat: attacker.id,
    defenderSeat: defender.id,
    attackKind: kind === 'parry' ? 'hit' : kind,
    cardId: cur.cardId,
    atGlobalFrame: state.frame,
    damage: dmg * hits,
    hits,
    hitStunFrames: hitStun,
    comboExtend,
  });
  truncateAttackerCard(state, attackerIdx, payload, events);
  return { resolvedAs: 'none', endedShowdown: ko || knockdown, attackerCardConsumed: true };
}

function findDefenderParry(state: MatchState, defenderIdx: SeatIndex): TimelineToken | null {
  const defender = state.seats[defenderIdx];
  const cur = defender.activeCard;
  if (!cur) return null;
  // Parry is a multi-frame window (single logical token, OQ-32). It covers
  // every frame in [frame, frameEnd]; per-tick re-arming is enforced by the
  // `parryFiredThisFrame` set on MatchState.
  for (const t of state.tokens) {
    if (
      t.seat === defender.id &&
      t.kind === 'parry' &&
      t.cardId === cur.cardId &&
      tokenCoversFrame(t, state.frame)
    ) {
      return t;
    }
  }
  return null;
}

/**
 * Place `count` stun or knockdown tokens starting at `fromFrame`. Respects
 * placement-conflict rules (§5): knockdown over stun; stun does not overwrite
 * block.
 * Emits stun-placed / knockdown-placed events.
 *
 * B2 ambiguity #5 (combat-system.md §5): when a hit connects and places stun
 * on the defender, the defender's remaining card tokens at those frames —
 * **including cancel** — are removed from the timeline alongside the card
 * being discarded. Implemented here for `source === 'hit'`. The cancel does
 * not "whiff"; it ceases to exist (no `cancel-whiffed` event).
 *
 * `source === 'parry'` targets the attacker, whose card discard is owned by
 * the parry call site (`truncateAttackerCard`); we don't double-discard here.
 * `source === 'block-stun-overflow'` is handled by the block-extension path
 * (the defender was blocking, not hit through, so their card lifecycle is
 * managed by extendBlockStun's own cursor advance).
 */
export function placeStun(
  state: MatchState,
  targetIdx: SeatIndex,
  fromFrame: number,
  count: number,
  kind: 'stun' | 'knockdown',
  source: 'hit' | 'parry' | 'block-stun-overflow',
  events: ResolverEvent[],
): void {
  if (count <= 0) return;
  const seat = state.seats[targetIdx];

  // When a hit connects and stuns the defender, discard the defender's
  // active card *first* — purges its remaining window/defense/cancel tokens
  // out of the way before the stun tokens are placed. This avoids leaving
  // a cancel token to fire on a future stunned frame (B2 #5).
  if (source === 'hit' && seat.activeCard) {
    cancelDefenderCard(state, targetIdx, events);
  }

  const placedFrames: number[] = [];
  for (let i = 0; i < count; i++) {
    const f = fromFrame + i;
    const ok = placeToken(state, { kind, seat: seat.id, frame: f });
    if (ok) placedFrames.push(f);
  }
  if (placedFrames.length === 0) return;
  if (kind === 'stun') {
    events.push({
      kind: 'stun-placed',
      seat: seat.id,
      frames: [placedFrames[0], placedFrames[placedFrames.length - 1]],
      source,
    });
  } else {
    events.push({
      kind: 'knockdown-placed',
      seat: seat.id,
      frames: [placedFrames[0], placedFrames[placedFrames.length - 1]],
    });
  }
  // Advance defender's cursor past the stun so its next card doesn't start
  // until the stun ends.
  const lastFrame = placedFrames[placedFrames.length - 1];
  if (seat.cursor <= lastFrame) seat.cursor = lastFrame + 1;
}

/**
 * Block-stun extension (§5 Token model).
 * For each frame F in [X+1 .. X+N]:
 *   - if F already has a block token, do nothing.
 *   - else if pool has a token, place fromPool:true block, decrement pool.
 *   - else place stun. Once overflow starts, remaining frames are stun.
 */
function extendBlockStun(
  state: MatchState,
  targetIdx: SeatIndex,
  fromFrame: number,
  count: number,
  events: ResolverEvent[],
): void {
  const seat = state.seats[targetIdx];
  let tokensPlaced = 0;
  let overflowed = false;
  let stunStart = -1;
  for (let i = 0; i < count; i++) {
    const f = fromFrame + i;
    if (hasToken(state, seat.id, f, 'block')) continue;
    if (!overflowed && seat.blockPool > 0) {
      seat.blockPool -= 1;
      placeToken(state, { kind: 'block', seat: seat.id, frame: f, payload: { fromPool: true } });
      tokensPlaced++;
    } else {
      if (!overflowed) {
        overflowed = true;
        stunStart = f;
        events.push({ kind: 'block-stun-pool-exhausted', seat: seat.id, atGlobalFrame: f });
      }
      placeToken(state, { kind: 'stun', seat: seat.id, frame: f });
    }
  }
  events.push({
    kind: 'block-stun-extended',
    seat: seat.id,
    extensionFrames: [fromFrame, fromFrame + count - 1],
    tokensPlaced,
  });
  if (seat.cursor <= fromFrame + count - 1) seat.cursor = fromFrame + count;
}

/**
 * Called after an attacker's card has connected / blocked / evaded / armored.
 * In HVCD's resolver: attacker's cursor advances to impactEnd+1 (skip recovery)
 * and the card is finished.
 *
 * Removes all remaining tokens for the attacker's current card (past this frame).
 */
function truncateAttackerCard(
  state: MatchState,
  attackerIdx: SeatIndex,
  _payload: unknown,
  events: ResolverEvent[],
): void {
  const seat = state.seats[attackerIdx];
  const cur = seat.activeCard;
  if (!cur) return;

  // Compute impactEnd from the attack tokens still on the timeline for this
  // card. Per OQ-32, hit/grab/parry are single windowed tokens, so use the
  // token's last frame (frameEnd ?? frame).
  let impactEnd = state.frame;
  for (const t of state.tokens) {
    if (t.seat !== seat.id || t.cardId !== cur.cardId) continue;
    if (t.kind !== 'hit' && t.kind !== 'grab' && t.kind !== 'parry') continue;
    const last = tokenLastFrame(t);
    if (last > impactEnd) impactEnd = last;
  }

  // Remove all remaining tokens for this card whose start is past impactEnd.
  // (A windowed token whose frameEnd > impactEnd shouldn't normally exist
  // under §3 "one window per kind per card" — only `cancel` (single frame)
  // can sit past impactEnd. Block/armor per-frame tokens past impactEnd are
  // also removed.)
  removeTokens(state, (t) => t.seat === seat.id && t.cardId === cur.cardId && t.frame > impactEnd);

  seat.cursor = impactEnd + 1;
  // Finalize the card to discard.
  seat.discard.push(cur.cardId);
  events.push({
    kind: 'card-left-timeline',
    seat: seat.id,
    cardId: cur.cardId,
    atGlobalFrame: state.frame,
    disposition: 'to-discard',
  });
  seat.activeCard = null;
}

/**
 * Cancel the defender's active card (§5 on hit connect — defender card is
 * interrupted by stun).
 *
 * B2 ambiguity #5 (combat-system.md §5): "all of the defender's remaining
 * window tokens at those frames (attack, defense, **and cancel**) are
 * **removed** from the timeline alongside the card being discarded." The
 * cancel does not "whiff" from stun — it ceases to exist. No
 * `cancel-whiffed` event fires from this path.
 *
 * We remove every token authored by this card whose live extent reaches
 * into `state.frame` or beyond — including cancel, including windowed
 * attack/defense tokens that started before `state.frame` but extend into
 * it (so the per-window range is fully purged).
 */
export function cancelDefenderCard(
  state: MatchState,
  defenderIdx: SeatIndex,
  events: ResolverEvent[],
): void {
  const seat = state.seats[defenderIdx];
  const cur = seat.activeCard;
  if (!cur) return;
  removeTokens(
    state,
    (t) => t.seat === seat.id && t.cardId === cur.cardId && tokenLastFrame(t) >= state.frame,
  );
  seat.discard.push(cur.cardId);
  events.push({
    kind: 'card-left-timeline',
    seat: seat.id,
    cardId: cur.cardId,
    atGlobalFrame: state.frame,
    disposition: 'to-discard',
  });
  seat.activeCard = null;
}

/**
 * Handle mutual clash — both seats' hit tokens at the same frame trade 1-for-1.
 * (Multi-hit is still 1-for-1; remaining hits on the winning side continue —
 * but in the simple HVCD test-vector model this is modeled as "both take one
 * hit's worth of damage, both cards discarded".)
 */
export function processMutualClash(
  state: MatchState,
  hit0: TimelineToken,
  hit1: TimelineToken,
  events: ResolverEvent[],
): { ended: boolean; draw: boolean } {
  const p0 = (hit0.payload ?? {}) as { damage?: number; hits?: number };
  const p1 = (hit1.payload ?? {}) as { damage?: number; hits?: number };
  const d0 = p0.damage ?? 0;
  const d1 = p1.damage ?? 0;

  // Record defense-precedence-resolved for readability on both sides.
  events.push({
    kind: 'defense-precedence-resolved',
    atGlobalFrame: state.frame,
    defenderSeat: state.seats[1].id,
    resolvedAs: 'none',
    attackWindowKind: 'hit',
    attackCardId: state.seats[0].activeCard?.cardId ?? '',
    attackerSeat: state.seats[0].id,
  });
  events.push({
    kind: 'defense-precedence-resolved',
    atGlobalFrame: state.frame,
    defenderSeat: state.seats[0].id,
    resolvedAs: 'none',
    attackWindowKind: 'hit',
    attackCardId: state.seats[1].activeCard?.cardId ?? '',
    attackerSeat: state.seats[1].id,
  });

  // Apply damage (modifiers via effects)
  const c0 = state.seats[0].activeCard;
  const c1 = state.seats[1].activeCard;
  const d0mod = applyDamageModifiers(state, state.seats[0].id, state.seats[1].id, 'hit', d0, events, c0?.cardId ?? '');
  const d1mod = applyDamageModifiers(state, state.seats[1].id, state.seats[0].id, 'hit', d1, events, c1?.cardId ?? '');
  const ko1 = applyDamage(state, 1, 0, d0mod, 'hit', c0?.cardId ?? '', state.frame, events);
  const ko0 = applyDamage(state, 0, 1, d1mod, 'hit', c1?.cardId ?? '', state.frame, events);

  // hit-connected events for both sides
  events.push({
    kind: 'hit-connected',
    attackerSeat: state.seats[0].id,
    defenderSeat: state.seats[1].id,
    attackKind: 'hit',
    cardId: c0?.cardId ?? '',
    atGlobalFrame: state.frame,
    damage: d0mod,
    hits: p0.hits ?? 1,
    hitStunFrames: 0,
    comboExtend: false,
  });
  events.push({
    kind: 'hit-connected',
    attackerSeat: state.seats[1].id,
    defenderSeat: state.seats[0].id,
    attackKind: 'hit',
    cardId: c1?.cardId ?? '',
    atGlobalFrame: state.frame,
    damage: d1mod,
    hits: p1.hits ?? 1,
    hitStunFrames: 0,
    comboExtend: false,
  });

  // Both cards go to discard — mutual trade, no combo starts.
  for (let i = 0; i < 2; i++) {
    const seat = state.seats[i];
    const cur = seat.activeCard;
    if (cur) {
      removeTokens(state, (t) => t.seat === seat.id && t.cardId === cur.cardId);
      seat.discard.push(cur.cardId);
      events.push({
        kind: 'card-left-timeline',
        seat: seat.id,
        cardId: cur.cardId,
        atGlobalFrame: state.frame,
        disposition: 'to-discard',
      });
      seat.activeCard = null;
    }
  }

  if (ko0 && ko1) {
    // Mutual KO — restore to 1 (§2 End of match)
    state.seats[0].hp = 1;
    state.seats[1].hp = 1;
    events.push({ kind: 'mutual-ko-draw', atGlobalFrame: state.frame, restoredHp: 1 });
    return { ended: true, draw: true };
  }
  if (ko0 || ko1) {
    events.push({
      kind: 'ko',
      losingSeat: ko0 ? state.seats[0].id : state.seats[1].id,
      atGlobalFrame: state.frame,
    });
    return { ended: true, draw: false };
  }
  return { ended: true, draw: false }; // mutual clash ends pre-clash phase
}
