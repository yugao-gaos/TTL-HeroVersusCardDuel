/**
 * HVCD module-level shared types — Wave 4.
 *
 * Wire-compatible mirror of `HvcdMatchResult` from
 * hvcd-tabletop-contracts/session-api.md § HVCD-specific payload shape.
 *
 * Kept as TS types (no runtime). The match-end state script builds the
 * payload as a plain object and the platform forwards it opaquely; the
 * value of having the type here is keeping the payload shape coupled to
 * the contract at type-check time.
 *
 * Resolver-specific types live in scripts/resolver/types.ts. Items live in
 * scripts/items/catalog.ts. Both intentionally separate from this file.
 */

import type { SeatId } from './resolver/types.ts';

/**
 * The OQ-12 inline replay artifact (`shape: 'inline'`). HVCD always emits
 * inline (memory: 5–15 KB typical). The signed-url variant is retained in
 * the contract but unused by HVCD MVP.
 *
 * Shape mirrors `HvcdReplayArtifact` per session-api.md — fields are
 * intentionally `unknown`-typed at the leaves because each subsystem owns
 * its own internal shape (events / turns are emitted by the resolver, pin
 * is stamped by match-setup, etc.).
 */
export interface HvcdReplayArtifact {
  schemaVersion: 1;
  format: 'hvcd-replay@v1';
  pin: {
    moduleId: string;
    moduleVersion: string;
    projectId?: string;
    versionId?: string;
    commitSha?: string;
    contractsCommitSha?: string;
    platformVersion?: string;
  };
  session: {
    sessionId?: string;
    startedAt?: number | string | null;
    endedAt?: number | string | null;
    rngSeed: string | number | null;
  };
  seats: Array<{
    seatId: SeatId;
    heroId: string | null;
  }>;
  /**
   * Resolver event log. Untyped here — the canonical type is
   * `ResolverEvent` in resolver/types.ts; we keep this as `unknown[]` so
   * the result blob can be carried through code paths that don't import
   * the resolver.
   */
  events: unknown[];
  /** Per-turn commit log. */
  turns: Array<{
    turn: number;
    seat: SeatId;
    slots: unknown[];
  }>;
  /**
   * Optional embedded copy of the public `HvcdMatchResult` (sans nested
   * replay) so the artifact is self-describing.
   */
  result?: Omit<HvcdMatchResult, 'replay'>;
}

/**
 * Discriminated replay union per session-api.md § Payload conventions.
 *
 * HVCD uses `inline` by default; `signed-url` is the escape hatch for
 * artifacts > 64 KB.
 */
export type HvcdReplayField =
  | { shape: 'inline'; artifact: HvcdReplayArtifact }
  | {
      shape: 'signed-url';
      url: string;
      expiresAt: number;
      sha256: string;
      sizeBytes: number;
      mime: string;
    };

/**
 * Per-seat slice of HvcdMatchResult.
 */
export interface HvcdPerSeatResult {
  heroId: string;
  /**
   * `usages` mirrors `chargesRemaining` from items/triggers.ts —
   * `null` for passives, `0` for fully-spent consumables, `> 0` for
   * remaining charges.
   */
  inventoryEnd: Array<{ itemId: string; usages: number | null }>;
  /** Optional per-match deck delta (for roguelike pickups). */
  deckDelta?: { added: string[]; removed: string[] };
}

/**
 * Canonical end-game payload — wire-shape per
 * hvcd-tabletop-contracts/session-api.md § HVCD-specific payload shape.
 */
export interface HvcdMatchResult {
  outcome: 'p1' | 'p2' | 'draw' | 'abort';
  abortReason?: 'disconnect' | 'timeout' | 'platform_error' | 'admin_ended';
  finalHp: Record<SeatId, number>;
  finalRage: Record<SeatId, number>;
  finalBlockPool: Record<SeatId, number>;
  damageDealt: Record<SeatId, number>;
  damageTaken: Record<SeatId, number>;
  totalShowdownFrames: number;
  turnCount: number;
  perSeat: Record<SeatId, HvcdPerSeatResult>;
  replay: HvcdReplayField;
}
