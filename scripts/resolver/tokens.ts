/**
 * HVCD resolver — token placement, lookup, and conflict resolution
 *
 * Per combat-system.md §5:
 *   - Tokens are per-frame atomic entities with (seat, frame, kind).
 *   - `knockdown` overwrites `stun`.
 *   - `stun` + `block` mutually exclude (first-placed wins).
 *
 * All per-kind window expansion lives in `scripts/kinds/card.ts` and the
 * kinds/token.ts — these functions are the primitive placement ops.
 */
import type { MatchState, SeatId, TimelineToken, TokenKind } from './types.ts';

/** True iff any token matching (seat, frame, kind) exists. */
export function hasToken(state: MatchState, seat: SeatId, frame: number, kind: TokenKind): boolean {
  return state.tokens.some((t) => t.seat === seat && t.frame === frame && t.kind === kind);
}

export function tokensAt(state: MatchState, seat: SeatId, frame: number): TimelineToken[] {
  const out: TimelineToken[] = [];
  for (const t of state.tokens) {
    if (t.seat === seat && t.frame === frame) out.push(t);
  }
  return out;
}

/** All frames in range where the seat has a token of the given kind. */
export function anyTokenInRange(
  state: MatchState,
  seat: SeatId,
  from: number,
  to: number,
  kinds: TokenKind[],
): boolean {
  const set = new Set(kinds);
  for (const t of state.tokens) {
    if (t.seat === seat && set.has(t.kind) && t.frame >= from && t.frame <= to) return true;
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
 * Rules:
 *   - knockdown overwrites stun at the same (seat, frame)
 *   - stun and block mutually exclude: first wins
 *   - otherwise duplicate same-kind tokens are allowed (multi-seat/time-layered)
 */
export function placeToken(state: MatchState, tok: TimelineToken): boolean {
  const peers = state.tokens.filter((t) => t.seat === tok.seat && t.frame === tok.frame);

  // knockdown over stun
  if (tok.kind === 'knockdown') {
    for (let i = state.tokens.length - 1; i >= 0; i--) {
      const t = state.tokens[i];
      if (t.seat === tok.seat && t.frame === tok.frame && t.kind === 'stun') {
        state.tokens.splice(i, 1);
      }
    }
    state.tokens.push(tok);
    return true;
  }

  // stun <-> block mutual exclusion
  if (tok.kind === 'stun' && peers.some((t) => t.kind === 'block' || t.kind === 'knockdown')) {
    return false;
  }
  if (tok.kind === 'block' && peers.some((t) => t.kind === 'stun' || t.kind === 'knockdown')) {
    return false;
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
    if (t.frame > max) max = t.frame;
  }
  return max;
}
