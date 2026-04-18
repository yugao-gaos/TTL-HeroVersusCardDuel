/**
 * HVCD resolver — token placement, lookup, and conflict resolution
 *
 * Per combat-system.md §5 (post OQ-32):
 *   - Per-frame kinds (`block`, `armor`, `stun`, `knockdown`) are placed one
 *     token per frame.
 *   - Multi-frame window kinds (`hit`, `grab`, `projectile`, `parry`,
 *     `evasion`, `reflect`, `effect`) are **one logical token** with an
 *     inclusive `[frame, frameEnd]` range.
 *   - Single-frame kinds (`cancel`, `effect-end`) are one token at one frame.
 *
 * Placement-conflict rules (only meaningful for per-frame kinds — window
 * tokens are not placement-conflict-eligible because they live alongside
 * status tokens, never compete for occupancy):
 *   - `knockdown` overwrites `stun` at the same (seat, frame)
 *   - `stun` + `block` mutually exclude (first-placed wins).
 */
import type { MatchState, SeatId, TimelineToken, TokenKind } from './types.ts';
import { tokenCoversFrame, tokenLastFrame } from './types.ts';

/** True iff any token matching (seat, frame, kind) covers the frame. */
export function hasToken(state: MatchState, seat: SeatId, frame: number, kind: TokenKind): boolean {
  return state.tokens.some(
    (t) => t.seat === seat && t.kind === kind && tokenCoversFrame(t, frame),
  );
}

export function tokensAt(state: MatchState, seat: SeatId, frame: number): TimelineToken[] {
  const out: TimelineToken[] = [];
  for (const t of state.tokens) {
    if (t.seat === seat && tokenCoversFrame(t, frame)) out.push(t);
  }
  return out;
}

/** True iff any token of one of the kinds is active at any frame in [from, to]. */
export function anyTokenInRange(
  state: MatchState,
  seat: SeatId,
  from: number,
  to: number,
  kinds: TokenKind[],
): boolean {
  const set = new Set(kinds);
  for (const t of state.tokens) {
    if (t.seat !== seat || !set.has(t.kind)) continue;
    // Range overlap: [t.frame, tokenLastFrame(t)] vs [from, to]
    const tEnd = tokenLastFrame(t);
    if (t.frame > to || tEnd < from) continue;
    return true;
  }
  return false;
}

/** Remove all tokens satisfying the predicate. */
export function removeTokens(state: MatchState, pred: (t: TimelineToken) => boolean): number {
  let removed = 0;
  for (let i = state.tokens.length - 1; i >= 0; i--) {
    if (pred(state.tokens[i])) {
      state.tokens.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/**
 * Place a token subject to §5 placement-conflict rules.
 * Returns true if placed, false if rejected by conflict.
 *
 * Per OQ-32, placement-conflict rules apply only to per-frame status-style
 * kinds (`stun`, `knockdown`, `block`). Multi-frame window tokens
 * (hit/grab/projectile/parry/evasion/reflect/effect) and single-frame tokens
 * (cancel/effect-end) are never gated by conflict — they're seat-and-card-
 * scoped and don't compete for the same frame slot.
 */
export function placeToken(state: MatchState, tok: TimelineToken): boolean {
  // Per-frame conflict checks only inspect tokens covering tok.frame.
  // (For status placement we always create one token per frame, so this is
  // a per-frame conflict check.)
  const startFrame = tok.frame;

  // knockdown over stun (per-frame placement)
  if (tok.kind === 'knockdown') {
    for (let i = state.tokens.length - 1; i >= 0; i--) {
      const t = state.tokens[i];
      if (t.seat === tok.seat && t.kind === 'stun' && tokenCoversFrame(t, startFrame)) {
        state.tokens.splice(i, 1);
      }
    }
    state.tokens.push(tok);
    return true;
  }

  // stun <-> block mutual exclusion
  if (tok.kind === 'stun') {
    for (const t of state.tokens) {
      if (t.seat !== tok.seat || !tokenCoversFrame(t, startFrame)) continue;
      if (t.kind === 'block' || t.kind === 'knockdown') return false;
    }
  }
  if (tok.kind === 'block') {
    for (const t of state.tokens) {
      if (t.seat !== tok.seat || !tokenCoversFrame(t, startFrame)) continue;
      if (t.kind === 'stun' || t.kind === 'knockdown') return false;
    }
  }

  state.tokens.push(tok);
  return true;
}

/**
 * True if the seat is suppressed at the given frame per §2 Dequeue rule.
 * (Dequeue is blocked by stun | knockdown | block at the cursor frame.)
 */
export function isSuppressed(state: MatchState, seat: SeatId, frame: number): boolean {
  return anyTokenInRange(state, seat, frame, frame, ['stun', 'knockdown', 'block']);
}

/**
 * Max frame extent (for carryover frame-total) — returns -Infinity if none.
 * Only stun/knockdown/block count (§2 frame-total matching).
 */
export function carryoverExtent(state: MatchState, seat: SeatId, cursor: number): number {
  let max = cursor - 1;
  for (const t of state.tokens) {
    if (t.seat !== seat) continue;
    if (t.kind !== 'stun' && t.kind !== 'knockdown' && t.kind !== 'block') continue;
    const last = tokenLastFrame(t);
    if (last > max) max = last;
  }
  return max;
}
