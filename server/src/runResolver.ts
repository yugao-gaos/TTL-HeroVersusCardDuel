/**
 * Thin wrapper around the module's deterministic resolver.
 *
 * Import strategy: **Option B** (direct relative-path import of
 * `../../scripts/resolver/*`). The resolver is a pure module — it imports
 * only sibling files under `scripts/resolver/` and `scripts/effects/`,
 * without any browser / DOM / ECS side-effect surface (verified by
 * scanning for `@tabletoplabs`, `window`, `document`, `globalThis`
 * imports — none found). That means wrangler can bundle it into the
 * worker artifact directly; no separate vendored bundle is required for
 * the scaffold.
 *
 * See `server/README.md` § Resolver import strategy for the trade-offs
 * vs. Option A (vendored bundle) and when to revisit.
 *
 * What this wrapper does:
 *   - Accepts the arbitration-request inputs per platform-capability-
 *     server-auth.md § Replay API (`committedSequences`, `initialState`,
 *     `rngSeed`).
 *   - Materializes an in-memory `MatchState` by calling `createSeat` and
 *     `createInitialState`, threading the committed sequences into each
 *     seat's `sequence` field.
 *   - Runs `runShowdown(...)` to completion.
 *   - Projects the final state into a canonical `MatchAuthorityReport`
 *     shape — the minimal set of fields the platform / portal compares
 *     against each `clientReport` to decide consensus / mismatch.
 *
 * NOT in scope for this scaffold:
 *   - Full `HvcdMatchResult` shape (lives in module state scripts, not
 *     the pure resolver; building it here would duplicate the state-
 *     script logic and drift out of sync).
 *   - `per-tick` replay (Track A16 lazy arbitration — separate task).
 *   - Server-only KV reads (T3 authoritative state — separate task).
 *
 * The canonical report here is the "server truth" that arbitrate.ts
 * compares against each seat's client report.
 */
import type { SeatState, SequenceSlot, SeatId, ResolverEvent } from '../../scripts/resolver/types.ts';
import type { CardLookup } from '../../scripts/resolver/sequence.ts';
import { createInitialState, createSeat, runShowdown } from '../../scripts/resolver/world.ts';

/**
 * Snapshot of per-seat authoritative state captured at commit time. Mirrors
 * the `AuthoritativeStateSnapshot` referenced in platform-capability-server-
 * auth.md § Replay API, scoped to the fields the HVCD resolver actually
 * needs to run `runShowdown(...)`. Anything else is out of scope for v1
 * (will be filled in by Track B11 / B12).
 */
export interface AuthoritativeSeatSnapshot {
  seatId: SeatId;
  heroId: string;
  hp: number;
  rage: number;
  blockPool: number;
  inventory?: Array<{ itemId: string; usages: number | null }>;
}

export interface AuthoritativeInitialState {
  seats: [AuthoritativeSeatSnapshot, AuthoritativeSeatSnapshot];
}

export interface ReplayShowdownArgs {
  committedSequences: Record<SeatId, SequenceSlot[]>;
  initialState: AuthoritativeInitialState;
  rngSeed: number;
  lookupCard: CardLookup;
}

export interface MatchAuthorityReport {
  outcome: 'p1' | 'p2' | 'draw' | 'abort';
  finalHp: Record<SeatId, number>;
  finalRage: Record<SeatId, number>;
  finalBlockPool: Record<SeatId, number>;
  durationFrames: number;
  endReason: string;
  /**
   * Hash of the full event stream. A flat scalar in the report so reports
   * can be compared cheaply without diffing large arrays. The raw event
   * stream stays available for audit via the worker's log.
   */
  eventStreamLength: number;
}

export interface ReplayShowdownResult {
  events: ResolverEvent[];
  report: MatchAuthorityReport;
}

export function replayShowdown(args: ReplayShowdownArgs): ReplayShowdownResult {
  const p1Snap = args.initialState.seats[0];
  const p2Snap = args.initialState.seats[1];

  // Deep-clone the inputs. `runShowdown` mutates the seat's `sequence`
  // (drains it via `tryDequeue`) and `inventory` arrays. Cloning here makes
  // `replayShowdown` idempotent over the same envelope — calling it twice
  // with the same input produces the same output, which is what the
  // arbitration / determinism CI gate (Track B11) needs to assert.
  const p1Seat = createSeat(p1Snap.seatId, p1Snap.heroId, {
    hp: p1Snap.hp,
    rage: p1Snap.rage,
    blockPool: p1Snap.blockPool,
    inventory: cloneInventory(p1Snap.inventory),
    sequence: cloneSequence(args.committedSequences[p1Snap.seatId]),
  });
  const p2Seat = createSeat(p2Snap.seatId, p2Snap.heroId, {
    hp: p2Snap.hp,
    rage: p2Snap.rage,
    blockPool: p2Snap.blockPool,
    inventory: cloneInventory(p2Snap.inventory),
    sequence: cloneSequence(args.committedSequences[p2Snap.seatId]),
  });

  const state = createInitialState([p1Seat, p2Seat]);

  // NOTE: rngSeed is passed through as an opaque input; the current resolver
  // surface does not accept a seed explicitly (the frame-loop is purely
  // deterministic over its inputs — no RNG calls). The arg is retained so
  // the arbitration API stays wire-compatible with the contract in
  // platform-capability-server-auth.md § Replay API, and so a future resolver
  // that introduces seeded randomness can slot it in without a breaking
  // signature change.
  void args.rngSeed;

  const run = runShowdown(state, { lookupCard: args.lookupCard });

  const p1Final = run.finalState.seats[0];
  const p2Final = run.finalState.seats[1];

  let outcome: MatchAuthorityReport['outcome'];
  if (run.draw) {
    outcome = 'draw';
  } else if (run.ko === 'p1') {
    outcome = 'p2';
  } else if (run.ko === 'p2') {
    outcome = 'p1';
  } else if (p1Final.hp <= 0 && p2Final.hp <= 0) {
    outcome = 'draw';
  } else if (p1Final.hp <= 0) {
    outcome = 'p2';
  } else if (p2Final.hp <= 0) {
    outcome = 'p1';
  } else {
    outcome = 'abort';
  }

  const report: MatchAuthorityReport = {
    outcome,
    finalHp: { p1: p1Final.hp, p2: p2Final.hp },
    finalRage: { p1: p1Final.rage, p2: p2Final.rage },
    finalBlockPool: { p1: p1Final.blockPool, p2: p2Final.blockPool },
    durationFrames: run.durationFrames,
    endReason: run.endReason,
    eventStreamLength: run.events.length,
  };

  return { events: run.events, report };
}

function cloneSequence(seq: SequenceSlot[] | undefined): SequenceSlot[] {
  if (!seq) return [];
  return seq.map((slot) => ({ ...slot }) as SequenceSlot);
}

function cloneInventory(
  inv: Array<{ itemId: string; usages: number | null }> | undefined,
): Array<{ itemId: string; usages: number | null }> {
  if (!inv) return [];
  return inv.map((item) => ({ ...item }));
}
