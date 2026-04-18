/**
 * HVCD resolver — card resolution and window -> token expansion
 *
 * Per combat-system.md §3, §5 ("Cards as manifests"), §7.
 *
 * Called by scripts/kinds/card.ts on dequeue (see combat-system.md §2 Dequeue
 * rule step 3): given the resolved card, a startFrame, and the seat, expand
 * the card's declared windows into per-frame tokens placed onto the shared
 * timeline.
 */
import type {
  AttackWindows,
  Card,
  CancelWindow,
  DefenseWindows,
  FrameRange,
  MatchState,
  ResolverEvent,
  SeatId,
  TimelineToken,
  WindowPayload,
  WindowTokenKind,
} from './types.ts';
import { placeToken } from './tokens.ts';

/** Resolve a card slot mode (base vs variant) into a concrete played card (§15). */
export function resolveCardMode(card: Card, mode: 'base' | 'variant'): Card {
  if (mode === 'base' || !card.rageVariant) return card;

  const variant = card.rageVariant;
  const resolved: Card = {
    ...card,
    totalFrames: typeof variant.totalFrames === 'number' ? variant.totalFrames : card.totalFrames,
    cancelWindow: variant.cancelWindow !== undefined ? variant.cancelWindow : card.cancelWindow,
  };

  if (variant.attackWindows) {
    resolved.attackWindows = {
      ...(card.attackWindows ?? {}),
      ...variant.attackWindows,
    };
  }
  if (variant.defenseWindows) {
    resolved.defenseWindows = {
      ...(card.defenseWindows ?? {}),
      ...variant.defenseWindows,
    };
  }

  return resolved;
}

function emit(
  events: ResolverEvent[],
  seat: SeatId,
  cardId: string,
  startFrame: number,
  windowKind: WindowTokenKind,
  frames: FrameRange,
  payload: WindowPayload,
): void {
  events.push({
    kind: 'window-tokens-placed',
    seat,
    cardId,
    cardStartGlobalFrame: startFrame,
    windowKind,
    frames,
    payload,
  });
}

function rangeFor(range: FrameRange, startFrame: number): {
  globalStart: number;
  globalEnd: number;
  cardLocal: FrameRange;
  windowLength: number;
} {
  const [lo, hi] = range;
  return {
    globalStart: startFrame + lo,
    globalEnd: startFrame + hi,
    cardLocal: [lo, hi],
    windowLength: hi - lo + 1,
  };
}

/**
 * Place a multi-frame window as a single logical token (OQ-32). The token
 * carries `frame` (window start) and `frameEnd` (inclusive last frame).
 */
function placeWindow(
  state: MatchState,
  seat: SeatId,
  cardId: string,
  kind: WindowTokenKind,
  globalStart: number,
  globalEnd: number,
  payload: Record<string, unknown>,
): void {
  placeToken(state, {
    kind,
    seat,
    frame: globalStart,
    frameEnd: globalEnd,
    cardId,
    payload,
  });
}

/**
 * Place a per-frame window as N independent tokens (block / armor) per OQ-32.
 */
function placePerFrame(
  state: MatchState,
  seat: SeatId,
  cardId: string,
  kind: WindowTokenKind,
  globalStart: number,
  globalEnd: number,
  payload: Record<string, unknown>,
): void {
  for (let f = globalStart; f <= globalEnd; f++) {
    placeToken(state, { kind, seat, frame: f, cardId, payload });
  }
}

/**
 * Expand a card's windows into timeline tokens + emit window-tokens-placed events.
 *
 * Per OQ-32 (§5 Per-kind token consumption):
 *   - hit / grab / projectile / parry / evasion / reflect / effect →
 *     **one logical token** spanning [start, end].
 *   - block / armor → per-frame tokens (each independently absorbs).
 *   - cancel → single-frame token.
 *
 * Returns the event list produced. Event shape (`window-tokens-placed`) is
 * unchanged — `frames` is the card-local range exactly as before, so on-the-
 * wire ResolverEvent stream is bit-for-bit equivalent.
 */
export function expandCardToTokens(
  state: MatchState,
  seat: SeatId,
  card: Card,
  startFrame: number,
): ResolverEvent[] {
  const events: ResolverEvent[] = [];
  const a: AttackWindows = card.attackWindows ?? {};
  const d: DefenseWindows = card.defenseWindows ?? {};

  // Attack windows — single logical token each (OQ-32).
  if (a.hit) {
    const r = rangeFor(a.hit.frames, startFrame);
    const payload: Record<string, unknown> = {
      damage: a.hit.damage ?? 0,
      hits: a.hit.hits ?? 1,
      hitStun: a.hit.hitStun ?? r.windowLength,
      blockStun: a.hit.blockStun ?? 0,
      knockdown: !!a.hit.knockdown,
      defenseBreaker: !!a.hit.defenseBreaker,
    };
    placeWindow(state, seat, card.id, 'hit', r.globalStart, r.globalEnd, payload);
    emit(events, seat, card.id, startFrame, 'hit', r.cardLocal, {
      kind: 'hit',
      damage: a.hit.damage,
      hits: a.hit.hits,
      hitStun: a.hit.hitStun,
      blockStun: a.hit.blockStun,
      knockdown: a.hit.knockdown,
      defenseBreaker: a.hit.defenseBreaker,
    });
  }
  if (a.grab) {
    const r = rangeFor(a.grab.frames, startFrame);
    const payload = {
      damage: a.grab.damage ?? 0,
      hits: a.grab.hits ?? 1,
      hitStun: a.grab.hitStun ?? r.windowLength,
      defenseBreaker: !!a.grab.defenseBreaker,
    };
    placeWindow(state, seat, card.id, 'grab', r.globalStart, r.globalEnd, payload);
    emit(events, seat, card.id, startFrame, 'grab', r.cardLocal, {
      kind: 'grab',
      damage: a.grab.damage,
      hits: a.grab.hits,
      hitStun: a.grab.hitStun,
      defenseBreaker: a.grab.defenseBreaker,
    });
  }
  if (a.projectile) {
    const r = rangeFor(a.projectile.frames, startFrame);
    const payload = {
      damage: a.projectile.damage ?? 0,
      hits: a.projectile.hits ?? 1,
      hitStun: a.projectile.hitStun ?? 4,
      travelFrames: a.projectile.travelFrames,
      defenseBreaker: !!a.projectile.defenseBreaker,
      knockdown: !!a.projectile.knockdown,
    };
    placeWindow(state, seat, card.id, 'projectile', r.globalStart, r.globalEnd, payload);
    emit(events, seat, card.id, startFrame, 'projectile', r.cardLocal, {
      kind: 'projectile',
      damage: a.projectile.damage,
      hits: a.projectile.hits,
      hitStun: a.projectile.hitStun,
      travelFrames: a.projectile.travelFrames,
      knockdown: a.projectile.knockdown,
      defenseBreaker: a.projectile.defenseBreaker,
    });
  }
  if (a.parry) {
    const r = rangeFor(a.parry.frames, startFrame);
    const payload = {
      damage: a.parry.damage ?? 0,
      hits: a.parry.hits ?? 1,
      hitStun: a.parry.hitStun ?? r.windowLength,
      blockStun: a.parry.blockStun ?? 0,
      knockdown: !!a.parry.knockdown,
    };
    placeWindow(state, seat, card.id, 'parry', r.globalStart, r.globalEnd, payload);
    emit(events, seat, card.id, startFrame, 'parry', r.cardLocal, {
      kind: 'parry',
      damage: a.parry.damage,
      hits: a.parry.hits,
      hitStun: a.parry.hitStun,
      blockStun: a.parry.blockStun,
    });
  }
  if (a.effect) {
    const r = rangeFor(a.effect.frames, startFrame);
    const payload = {
      effectId: a.effect.effectId,
      target: a.effect.target ?? 'self',
      duration: a.effect.duration,
    };
    placeWindow(state, seat, card.id, 'effect', r.globalStart, r.globalEnd, payload);
    emit(events, seat, card.id, startFrame, 'effect', r.cardLocal, {
      kind: 'effect',
      effectId: a.effect.effectId,
      target: a.effect.target ?? 'self',
      duration: a.effect.duration,
    });
  }

  // Defense windows
  if (d.block) {
    const r = rangeFor(d.block.frames, startFrame);
    placePerFrame(state, seat, card.id, 'block', r.globalStart, r.globalEnd, { fromPool: false });
    emit(events, seat, card.id, startFrame, 'block', r.cardLocal, { kind: 'block', fromPool: false });
  }
  if (d.armor) {
    const r = rangeFor(d.armor.frames, startFrame);
    placePerFrame(state, seat, card.id, 'armor', r.globalStart, r.globalEnd, { absorbs: d.armor.absorbs });
    emit(events, seat, card.id, startFrame, 'armor', r.cardLocal, { kind: 'armor', absorbs: d.armor.absorbs });
  }
  // evasion — multi-frame, single logical token (continuous dodge across the window).
  if (d.evasion) {
    const r = rangeFor(d.evasion.frames, startFrame);
    placeWindow(state, seat, card.id, 'evasion', r.globalStart, r.globalEnd, {});
    emit(events, seat, card.id, startFrame, 'evasion', r.cardLocal, { kind: 'evasion' });
  }
  // reflect — multi-frame, re-arms per tick (resolver enforces ≤1 trigger per frame).
  if (d.reflect) {
    const r = rangeFor(d.reflect.frames, startFrame);
    placeWindow(state, seat, card.id, 'reflect', r.globalStart, r.globalEnd, {
      reflectTravel: d.reflect.reflectTravel,
    });
    emit(events, seat, card.id, startFrame, 'reflect', r.cardLocal, {
      kind: 'reflect',
      reflectTravel: d.reflect.reflectTravel,
    });
  }

  // Cancel window (single frame)
  const cw: CancelWindow | null | undefined = card.cancelWindow;
  if (cw) {
    const globalFrame = startFrame + cw.frame;
    // `armed` is set later — at the resolver's discretion — via the slot's rageCancelArmed.
    placeToken(state, {
      kind: 'cancel',
      seat,
      frame: globalFrame,
      cardId: card.id,
      payload: { hitCancel: !!cw.hitCancel, armed: false },
    });
    emit(events, seat, card.id, startFrame, 'cancel', [cw.frame, cw.frame], {
      kind: 'cancel',
      hitCancel: !!cw.hitCancel,
      armed: false,
    });
  }

  return events;
}

/** Convenience: the first frame of an attack window (if any). */
export function firstAttackStart(card: Card): number | null {
  const a = card.attackWindows;
  if (!a) return null;
  const candidates: number[] = [];
  if (a.hit) candidates.push(a.hit.frames[0]);
  if (a.grab) candidates.push(a.grab.frames[0]);
  if (a.projectile) candidates.push(a.projectile.frames[0]);
  if (a.parry) candidates.push(a.parry.frames[0]);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}
