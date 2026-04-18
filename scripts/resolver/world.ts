/**
 * HVCD resolver — showdown driver (pure function)
 *
 * OQ-5 resolution: offline mode. Once commit phase ends, `runShowdown` takes
 * committed sequences + current world state and produces the full event log
 * for the showdown segment. No rollback inside the showdown.
 *
 * This function is invoked by scripts/objects/timeline.ts's StateEntered hook
 * (which the showdown state delegates to) or by the test harness directly.
 *
 * Frame-loop ordering matches combat-system.md §5 steps 1–10.
 */
import { cancelDefenderCard, findActiveAttackToken, processMutualClash, resolveAttack } from './combat.ts';
import { finishActiveCardIfEnded, tryDequeue, type CardLookup } from './sequence.ts';
import { launchProjectile, resolveArrivals, resolveClashes } from './projectiles.ts';
import { anyTokenInRange, hasToken, placeToken, removeTokens, tokensAt } from './tokens.ts';
import {
  applyDamageModifiers,
  getEffect,
} from '../effects/registry.ts';
import type {
  ActiveEffect,
  MatchState,
  ResolverEvent,
  SeatId,
  SeatIndex,
  SeatState,
  ShowdownRunResult,
  TimelineToken,
} from './types.ts';
import { otherSeat, seatIdOf, tokenLastFrame } from './types.ts';

const MAX_FRAMES = 2000;

export interface ShowdownRunOptions {
  lookupCard: CardLookup;
  startFrame?: number;
  turnIndex?: number;
  /** Maximum global frames to simulate before bailing out with 'safety' end. */
  maxFrames?: number;
}

export function createInitialState(seats: [SeatState, SeatState]): MatchState {
  return {
    seats,
    projectiles: [],
    effects: [],
    reflectFiredThisFrame: new Set<string>(),
    parryFiredThisFrame: new Set<string>(),
    tokens: [],
    frame: 0,
    turnIndex: 0,
    nextProjectileId: 1,
    nextEffectId: 1,
  };
}

export function createSeat(
  id: SeatId,
  heroId: string,
  opts: Partial<Omit<SeatState, 'id' | 'index' | 'heroId'>> = {},
): SeatState {
  const index = id === 'p1' ? 0 : 1;
  return {
    id,
    index: index as 0 | 1,
    heroId,
    hp: opts.hp ?? 8,
    rage: opts.rage ?? 0,
    blockPool: opts.blockPool ?? 6,
    sequence: opts.sequence ?? [],
    activeCard: null,
    cursor: opts.cursor ?? 0,
    discard: opts.discard ?? [],
    sideArea: opts.sideArea ?? [],
    inventory: opts.inventory ?? [],
    reservedItems: opts.reservedItems ?? [],
  };
}

/**
 * Run the showdown to completion (offline mode).
 */
export function runShowdown(
  state: MatchState,
  opts: ShowdownRunOptions,
): ShowdownRunResult {
  const events: ResolverEvent[] = [];
  const lookupCard = opts.lookupCard;
  const max = opts.maxFrames ?? MAX_FRAMES;
  state.frame = opts.startFrame ?? state.frame;

  events.push({
    kind: 'showdown-started',
    turnIndex: opts.turnIndex ?? state.turnIndex,
    startGlobalFrame: state.frame,
    startTurnFrame: 0,
  });

  let attacker: SeatId | null = null;
  let ended = false;
  let endReason: ShowdownRunResult['endReason'] = 'safety';
  let ko: SeatId | null = null;
  let draw = false;

  // === Phase 1: pre-clash scan =============================================
  while (!ended && state.frame < max && attacker === null) {
    // Reset per-frame "once per tick" trackers (§9 reflect, §8 parry)
    state.reflectFiredThisFrame.clear();
    state.parryFiredThisFrame.clear();

    // Step 1: apply active standing effects (per-frame hooks)
    for (const eff of state.effects) {
      const impl = getEffect(eff.effectId);
      if (impl?.onFrame) impl.onFrame({ state, effect: eff, events });
    }

    // Finish ended cards + try dequeue
    for (let i = 0; i < 2; i++) {
      finishActiveCardIfEnded(state, i as SeatIndex, events);
    }
    for (let i = 0; i < 2; i++) {
      tryDequeue(state, i as SeatIndex, lookupCard, events);
    }

    // Step 2: advance / clash projectiles
    resolveClashes(state, events);

    // Projectile launch: when the projectile window's last frame equals the
    // current frame, spawn the in-flight token. Per OQ-32 the projectile
    // window is one logical token spanning [frame, frameEnd]; we launch at
    // tokenLastFrame(t).
    for (let i = 0; i < 2; i++) {
      const seat = state.seats[i];
      if (!seat.activeCard) continue;
      const cur = seat.activeCard;
      for (const t of state.tokens) {
        if (t.seat !== seat.id || t.cardId !== cur.cardId || t.kind !== 'projectile') continue;
        if (tokenLastFrame(t) !== state.frame) continue;
        // Already launched? (guard via side-area tether)
        const already = seat.sideArea.some((p) => p.cardId === cur.cardId && p.reason === 'projectile');
        if (!already) launchProjectile(state, seat.id, t, events);
      }
    }

    // Step 3: resolve projectile arrivals (interrupts defender if stuns)
    const projectileInterruptedSomeone = resolveArrivals(state, events);

    if (anyoneKO(state, events)) { ended = true; endReason = 'ko'; ko = detectKO(state); break; }

    // Step 5: attack -> defense interactions
    // Each seat's active attack token at this frame.
    const a0 = findActiveAttackToken(state, 0, ['hit', 'grab', 'parry']);
    const a1 = findActiveAttackToken(state, 1, ['hit', 'grab', 'parry']);

    if (a0 && a1) {
      // Both attacking — mutual clash (simultaneous). HVCD resolver handles
      // RPS tie by mutual damage. Here we treat both as connecting via hit
      // trade (§5 "Hit trade. Two hit attacks on the same frame trade 1-for-1").
      if (a0.kind === 'hit' && a1.kind === 'hit') {
        const outcome = processMutualClash(state, a0, a1, events);
        if (outcome.draw) { draw = true; ended = true; endReason = 'mutual-ko'; }
        else if (outcome.ended) {
          ended = true;
          const koSeat = detectKO(state);
          if (koSeat) { ko = koSeat; endReason = 'ko'; }
        }
        // Post-mutual: phase ends.
        break;
      }
      // If one is parry and other is hit, resolveAttack handles parry via the defender's parry token.
      // Otherwise, both attacker resolves — seat 0 goes first as a deterministic tiebreaker.
      const first = a0;
      const firstIdx: SeatIndex = 0;
      const defIdx = 1 as SeatIndex;
      const outcome = resolveAttack(state, firstIdx, defIdx, first, events, true);
      attacker = state.seats[firstIdx].id;
      if (outcome.endedShowdown) { ended = true; endReason = detectKO(state) ? 'ko' : 'safety'; ko = detectKO(state); }
    } else if (a0 || a1) {
      const aIdx: SeatIndex = a0 ? 0 : 1;
      const dIdx: SeatIndex = a0 ? 1 : 0;
      const token = (a0 ?? a1)!;
      const outcome = resolveAttack(state, aIdx, dIdx, token, events, true);
      attacker = state.seats[aIdx].id;
      events.push({
        kind: 'combo-started',
        attackerSeat: state.seats[aIdx].id,
        defenderSeat: state.seats[dIdx].id,
        atGlobalFrame: state.frame,
      });
      if (outcome.endedShowdown) { ended = true; endReason = detectKO(state) ? 'ko' : 'safety'; ko = detectKO(state); }
    }

    // Step 7: effect activations
    resolveEffectActivationsAndEnds(state, events);

    // Step 8: cancels
    resolveCancelTokens(state, events, lookupCard);

    // Step 9: KO check
    if (anyoneKO(state, events)) { ended = true; endReason = 'ko'; ko = detectKO(state); break; }

    // Step 10: cursor advance
    if (!ended && attacker === null) {
      const exhausted = state.seats.every((s) => !s.activeCard && s.sequence.length === 0 && !s.sideArea.some((p) => p.reason === 'standing-effect')) && state.projectiles.length === 0;
      if (exhausted) {
        ended = true;
        endReason = 'no-engagement';
        break;
      }
      state.frame++;
      events.push({ kind: 'cursor-advanced', newGlobalFrame: state.frame, skipped: 1 });
    }
  }

  // === Phase 2: combo mode =================================================
  if (!ended && attacker !== null) {
    const aIdx: SeatIndex = attacker === 'p1' ? 0 : 1;
    const dIdx: SeatIndex = otherSeat(aIdx);
    let safety = 0;
    while (!ended && state.seats[aIdx].sequence.length > 0 && safety++ < max) {
      const placeFrame = state.seats[aIdx].cursor;
      state.frame = placeFrame;
      state.reflectFiredThisFrame.clear();
      state.parryFiredThisFrame.clear();
      const outcome = tryDequeue(state, aIdx, lookupCard, events);
      if (outcome === 'idle') {
        // no more to dequeue
        events.push({ kind: 'combo-dropped', attackerSeat: state.seats[aIdx].id, atGlobalFrame: placeFrame, reason: 'attacker-out-of-cards' });
        ended = true;
        endReason = 'sequence-exhaustion';
        break;
      }
      if (outcome === 'fizzled') {
        events.push({ kind: 'combo-dropped', attackerSeat: state.seats[aIdx].id, atGlobalFrame: placeFrame, reason: 'card-fizzled' });
        ended = true;
        endReason = 'combo-drop';
        break;
      }
      // placed — check overlap with defender tokens
      const cur = state.seats[aIdx].activeCard;
      if (!cur) continue;
      // Find the attacker's own hit/grab attack window's global frame range.
      // Per OQ-32, hit/grab/parry are single-token windows: the token's
      // [frame, frameEnd] is the full window range.
      let attackStart = -1;
      let attackEnd = -1;
      for (const t of state.tokens) {
        if (t.seat !== state.seats[aIdx].id || t.cardId !== cur.cardId) continue;
        if (t.kind !== 'hit' && t.kind !== 'grab' && t.kind !== 'parry') continue;
        if (attackStart < 0 || t.frame < attackStart) attackStart = t.frame;
        const last = tokenLastFrame(t);
        if (last > attackEnd) attackEnd = last;
      }
      if (attackStart < 0) {
        // non-attack card (e.g. pure defensive) — ends the combo
        events.push({ kind: 'combo-dropped', attackerSeat: state.seats[aIdx].id, atGlobalFrame: placeFrame, reason: 'no-token-overlap' });
        ended = true;
        endReason = 'combo-drop';
        break;
      }
      const overlap = anyTokenInRange(state, state.seats[dIdx].id, attackStart, attackEnd, ['stun', 'knockdown', 'block']);
      if (!overlap) {
        events.push({ kind: 'combo-dropped', attackerSeat: state.seats[aIdx].id, atGlobalFrame: attackStart, reason: 'no-token-overlap' });
        // Card goes to discard
        removeTokens(state, (t) => t.seat === state.seats[aIdx].id && t.cardId === cur.cardId);
        state.seats[aIdx].discard.push(cur.cardId);
        events.push({ kind: 'card-left-timeline', seat: state.seats[aIdx].id, cardId: cur.cardId, atGlobalFrame: attackStart, disposition: 'to-discard' });
        state.seats[aIdx].activeCard = null;
        state.seats[aIdx].cursor = cur.startFrame + cur.card.totalFrames;
        ended = true;
        endReason = 'combo-drop';
        break;
      }
      // Resolve the hit at attackStart
      state.frame = attackStart;
      const attackTok = state.tokens.find((t) => t.seat === state.seats[aIdx].id && t.cardId === cur.cardId && t.frame === attackStart && (t.kind === 'hit' || t.kind === 'grab' || t.kind === 'parry'));
      if (!attackTok) break;
      const result = resolveAttack(state, aIdx, dIdx, attackTok, events, false);
      if (result.endedShowdown) {
        ended = true;
        endReason = detectKO(state) ? 'ko' : 'safety';
        ko = detectKO(state);
      }
      state.frame = attackEnd;
    }
    if (!ended) {
      ended = true;
      endReason = state.seats[aIdx].sequence.length === 0 ? 'sequence-exhaustion' : 'safety';
    }
  }

  // Emit the pause / end event.
  if (endReason === 'ko') {
    // already emitted ko; showdown-paused or match-ended is owned by FSM
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'combo-drop' });
  } else if (endReason === 'mutual-ko') {
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'combo-drop' });
  } else if (endReason === 'combo-drop') {
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'combo-drop' });
  } else if (endReason === 'sequence-exhaustion') {
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'sequence-exhaustion' });
  } else if (endReason === 'both-exhausted' || endReason === 'no-engagement') {
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'both-exhausted' });
  } else {
    events.push({ kind: 'showdown-paused', turnIndex: state.turnIndex, reason: 'admin-halt' });
  }

  return {
    events,
    finalState: state,
    endReason,
    attacker,
    durationFrames: state.frame,
    ko,
    draw,
  };
}

function anyoneKO(state: MatchState, _events: ResolverEvent[]): boolean {
  return state.seats[0].hp <= 0 || state.seats[1].hp <= 0;
}

function detectKO(state: MatchState): SeatId | null {
  if (state.seats[0].hp <= 0 && state.seats[1].hp <= 0) return null;
  if (state.seats[0].hp <= 0) return 'p1';
  if (state.seats[1].hp <= 0) return 'p2';
  return null;
}

function resolveEffectActivationsAndEnds(state: MatchState, events: ResolverEvent[]): void {
  // Effect activation fires on the last frame of the activation window, not
  // interrupted by prior steps. Per OQ-32 the effect window is a single
  // logical token spanning [frame, frameEnd]; we fire at tokenLastFrame(t).
  for (let i = 0; i < 2; i++) {
    const seat = state.seats[i];
    const cur = seat.activeCard;
    if (!cur) continue;
    for (const t of state.tokens) {
      if (t.seat !== seat.id || t.cardId !== cur.cardId || t.kind !== 'effect') continue;
      if (tokenLastFrame(t) !== state.frame) continue;
      // Check for interruption: if defender stun hit this seat earlier this
      // frame, we'd have returned already; if seat is currently stunned at
      // this frame, don't activate.
      if (hasToken(state, seat.id, state.frame, 'stun') || hasToken(state, seat.id, state.frame, 'knockdown')) {
        events.push({
          kind: 'effect-interrupted',
          casterSeat: seat.id,
          effectId: String((t.payload as Record<string, unknown>).effectId ?? ''),
          atGlobalFrame: state.frame,
          byCause: 'stun',
        });
        continue;
      }
      const payload = t.payload as { effectId?: string; target?: 'self' | 'opponent'; duration?: number };
      const effectId = payload.effectId ?? '';
      const targetSeat: SeatId = payload.target === 'opponent' ? (seat.id === 'p1' ? 'p2' : 'p1') : seat.id;
      const duration = payload.duration;
      const effectObj: ActiveEffect = {
        id: `eff-${state.nextEffectId++}`,
        effectId,
        casterSeat: seat.id,
        targetSeat,
        activationFrame: state.frame,
        endFrame: typeof duration === 'number' ? state.frame + duration : null,
        payload: {},
      };
      if (typeof duration === 'number') {
        state.effects.push(effectObj);
        placeToken(state, {
          kind: 'effect-end',
          seat: targetSeat,
          frame: state.frame + duration,
          payload: { effectId },
        });
        events.push({
          kind: 'effect-activated',
          casterSeat: seat.id,
          targetSeat,
          effectId,
          activationGlobalFrame: state.frame,
          duration,
          endGlobalFrame: state.frame + duration,
        });
        events.push({
          kind: 'effect-end-scheduled',
          effectId,
          targetSeat,
          endGlobalFrame: state.frame + duration,
        });
      } else {
        events.push({
          kind: 'effect-activated',
          casterSeat: seat.id,
          targetSeat,
          effectId,
          activationGlobalFrame: state.frame,
        });
      }
      // Invoke registry onActivate
      const impl = getEffect(effectId);
      if (impl?.onActivate) {
        impl.onActivate({ state, effect: effectObj, events });
      } else if (!impl) {
        events.push({
          kind: 'diagnostic',
          level: 'warn',
          message: `unknown effectId '${effectId}' — activation window consumed, no-op`,
        });
      }
    }
  }

  // effect-end tokens at current frame
  for (let k = state.tokens.length - 1; k >= 0; k--) {
    const t = state.tokens[k];
    if (t.kind !== 'effect-end' || t.frame !== state.frame) continue;
    const effectId = String((t.payload as Record<string, unknown>).effectId ?? '');
    const effectIdx = state.effects.findIndex((e) => e.effectId === effectId && e.targetSeat === t.seat && e.endFrame === state.frame);
    if (effectIdx >= 0) {
      const eff = state.effects[effectIdx];
      const impl = getEffect(effectId);
      if (impl?.onEnd) impl.onEnd({ state, effect: eff, events });
      state.effects.splice(effectIdx, 1);
      events.push({ kind: 'effect-ended', effectId, targetSeat: t.seat, atGlobalFrame: state.frame });
    }
    state.tokens.splice(k, 1);
  }
}

function resolveCancelTokens(
  state: MatchState,
  events: ResolverEvent[],
  lookupCard: CardLookup,
): void {
  for (let i = 0; i < 2; i++) {
    const seat = state.seats[i];
    const cur = seat.activeCard;
    if (!cur) continue;
    for (const t of state.tokens) {
      if (t.seat !== seat.id || t.frame !== state.frame || t.cardId !== cur.cardId || t.kind !== 'cancel') continue;
      const p = (t.payload ?? {}) as { hitCancel?: boolean; armed?: boolean };
      let fire = false;
      let reason: 'armed' | 'hit-cancel' = 'armed';
      if (p.armed) { fire = true; reason = 'armed'; }
      else if (p.hitCancel && cur.connectedDamage) { fire = true; reason = 'hit-cancel'; }
      if (fire) {
        const framesRemaining = cur.startFrame + cur.card.totalFrames - 1 - state.frame;
        events.push({ kind: 'cancel-fired', seat: seat.id, cardId: cur.cardId, atGlobalFrame: state.frame, reason });
        events.push({ kind: 'card-truncated-by-cancel', seat: seat.id, cardId: cur.cardId, atGlobalFrame: state.frame, framesRemaining });
        // Truncate
        removeTokens(state, (u) => u.seat === seat.id && u.cardId === cur.cardId && u.frame > state.frame);
        seat.discard.push(cur.cardId);
        events.push({ kind: 'card-left-timeline', seat: seat.id, cardId: cur.cardId, atGlobalFrame: state.frame, disposition: 'to-discard' });
        seat.activeCard = null;
        seat.cursor = state.frame;
        // Re-run dequeue for this seat this frame.
        tryDequeue(state, i as SeatIndex, lookupCard, events);
      } else {
        events.push({
          kind: 'cancel-whiffed',
          seat: seat.id,
          cardId: cur.cardId,
          atGlobalFrame: state.frame,
          reason: p.hitCancel ? 'hit-cancel-not-connected' : 'not-armed-no-hit-connect',
        });
      }
    }
  }
}
