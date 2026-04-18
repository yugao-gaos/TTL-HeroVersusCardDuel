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

function expandFrames(
  range: FrameRange,
  startFrame: number,
): { globalFrames: number[]; cardLocal: FrameRange } {
  const [lo, hi] = range;
  const globalFrames: number[] = [];
  for (let f = lo; f <= hi; f++) globalFrames.push(startFrame + f);
  return { globalFrames, cardLocal: [lo, hi] };
}

function placeRange(
  state: { tokens: TimelineToken[]; [k: string]: unknown },
  seat: SeatId,
  cardId: string,
  kind: WindowTokenKind,
  globalFrames: number[],
  payload: Record<string, unknown>,
): void {
  for (const f of globalFrames) {
    placeToken(state as never, { kind, seat, frame: f, cardId, payload });
  }
}

/**
 * Expand a card's windows into timeline tokens + emit window-tokens-placed events.
 * Returns the event list produced.
 */
export function expandCardToTokens(
  state: Parameters<typeof placeToken>[0],
  seat: SeatId,
  card: Card,
  startFrame: number,
): ResolverEvent[] {
  const events: ResolverEvent[] = [];
  const a: AttackWindows = card.attackWindows ?? {};
  const d: DefenseWindows = card.defenseWindows ?? {};

  // Attack windows
  if (a.hit) {
    const { globalFrames, cardLocal } = expandFrames(a.hit.frames, startFrame);
    const payload: Record<string, unknown> = {
      damage: a.hit.damage ?? 0,
      hits: a.hit.hits ?? 1,
      hitStun: a.hit.hitStun ?? globalFrames.length,
      blockStun: a.hit.blockStun ?? 0,
      knockdown: !!a.hit.knockdown,
      defenseBreaker: !!a.hit.defenseBreaker,
    };
    placeRange(state, seat, card.id, 'hit', globalFrames, payload);
    emit(events, seat, card.id, startFrame, 'hit', cardLocal, {
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
    const { globalFrames, cardLocal } = expandFrames(a.grab.frames, startFrame);
    const payload = {
      damage: a.grab.damage ?? 0,
      hits: a.grab.hits ?? 1,
      hitStun: a.grab.hitStun ?? globalFrames.length,
      defenseBreaker: !!a.grab.defenseBreaker,
    };
    placeRange(state, seat, card.id, 'grab', globalFrames, payload);
    emit(events, seat, card.id, startFrame, 'grab', cardLocal, {
      kind: 'grab',
      damage: a.grab.damage,
      hits: a.grab.hits,
      hitStun: a.grab.hitStun,
      defenseBreaker: a.grab.defenseBreaker,
    });
  }
  if (a.projectile) {
    const { globalFrames, cardLocal } = expandFrames(a.projectile.frames, startFrame);
    const payload = {
      damage: a.projectile.damage ?? 0,
      hits: a.projectile.hits ?? 1,
      hitStun: a.projectile.hitStun ?? 4,
      travelFrames: a.projectile.travelFrames,
      defenseBreaker: !!a.projectile.defenseBreaker,
      knockdown: !!a.projectile.knockdown,
    };
    placeRange(state, seat, card.id, 'projectile', globalFrames, payload);
    emit(events, seat, card.id, startFrame, 'projectile', cardLocal, {
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
    const { globalFrames, cardLocal } = expandFrames(a.parry.frames, startFrame);
    const payload = {
      damage: a.parry.damage ?? 0,
      hits: a.parry.hits ?? 1,
      hitStun: a.parry.hitStun ?? globalFrames.length,
      blockStun: a.parry.blockStun ?? 0,
      knockdown: !!a.parry.knockdown,
    };
    placeRange(state, seat, card.id, 'parry', globalFrames, payload);
    emit(events, seat, card.id, startFrame, 'parry', cardLocal, {
      kind: 'parry',
      damage: a.parry.damage,
      hits: a.parry.hits,
      hitStun: a.parry.hitStun,
      blockStun: a.parry.blockStun,
    });
  }
  if (a.effect) {
    const { globalFrames, cardLocal } = expandFrames(a.effect.frames, startFrame);
    const payload = {
      effectId: a.effect.effectId,
      target: a.effect.target ?? 'self',
      duration: a.effect.duration,
    };
    placeRange(state, seat, card.id, 'effect', globalFrames, payload);
    emit(events, seat, card.id, startFrame, 'effect', cardLocal, {
      kind: 'effect',
      effectId: a.effect.effectId,
      target: a.effect.target ?? 'self',
      duration: a.effect.duration,
    });
  }

  // Defense windows
  if (d.block) {
    const { globalFrames, cardLocal } = expandFrames(d.block.frames, startFrame);
    placeRange(state, seat, card.id, 'block', globalFrames, { fromPool: false });
    emit(events, seat, card.id, startFrame, 'block', cardLocal, { kind: 'block', fromPool: false });
  }
  if (d.armor) {
    const { globalFrames, cardLocal } = expandFrames(d.armor.frames, startFrame);
    placeRange(state, seat, card.id, 'armor', globalFrames, { absorbs: d.armor.absorbs });
    emit(events, seat, card.id, startFrame, 'armor', cardLocal, { kind: 'armor', absorbs: d.armor.absorbs });
  }
  if (d.evasion) {
    const { globalFrames, cardLocal } = expandFrames(d.evasion.frames, startFrame);
    placeRange(state, seat, card.id, 'evasion', globalFrames, {});
    emit(events, seat, card.id, startFrame, 'evasion', cardLocal, { kind: 'evasion' });
  }
  if (d.reflect) {
    const { globalFrames, cardLocal } = expandFrames(d.reflect.frames, startFrame);
    placeRange(state, seat, card.id, 'reflect', globalFrames, { reflectTravel: d.reflect.reflectTravel });
    emit(events, seat, card.id, startFrame, 'reflect', cardLocal, { kind: 'reflect', reflectTravel: d.reflect.reflectTravel });
  }

  // Cancel window (single frame)
  const cw: CancelWindow | null | undefined = card.cancelWindow;
  if (cw) {
    const globalFrame = startFrame + cw.frame;
    // `armed` is set later — at the resolver's discretion — via the slot's rageCancelArmed.
    placeRange(state, seat, card.id, 'cancel', [globalFrame], { hitCancel: !!cw.hitCancel, armed: false });
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
