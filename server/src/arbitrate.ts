/**
 * Arbitration pipeline — the core of the T3 worker.
 *
 * Given a verified arbitration request, this module:
 *   1. Runs the authoritative resolver against the committed inputs.
 *   2. Diffs the canonical report against each seat's `clientReport`.
 *   3. Produces the signed response envelope.
 *
 * Per platform-capability-server-auth.md § Arbitration API, the response
 * carries:
 *   - `status: 'consensus' | 'client-disagreement' | 'client-mismatch-vs-server'`
 *     (the 'client-disagreement' branch is tagged but not used by the v1
 *     worker — the platform's lazy-arbitration path handles the "both
 *     clients agree but disagree with each other vs the server" distinction).
 *   - `canonicalReport`: always the server-computed one.
 *   - `mismatchedSeats`: empty on consensus; non-empty when one or more
 *     client reports diverge from the server's canonical output.
 *
 * Comparison rule: a client report matches the server if every field in
 * `MatchAuthorityReport` is deeply equal. The comparison uses the same
 * canonical-JSON serializer used for signing, so key ordering in the client
 * report doesn't cause false mismatches.
 */
import { canonicalStringify } from './canonical.ts';
import type { MatchAuthorityReport, ReplayShowdownArgs, ReplayShowdownResult } from './runResolver.ts';
import { replayShowdown } from './runResolver.ts';
import { signArbitrationResponse, type SignResult } from './signResponse.ts';
import type { SeatId } from '../../scripts/resolver/types.ts';

export interface ArbitrationRequestEnvelope {
  sessionId: string;
  projectId: string;
  committedSequences: ReplayShowdownArgs['committedSequences'];
  initialState: ReplayShowdownArgs['initialState'];
  rngSeed: number;
  /**
   * Per-seat client-reported outcomes. The worker compares each of these
   * against the authoritative output. Shape is intentionally `unknown` —
   * the resolver decides which fields are load-bearing and compares only
   * those, so additional cosmetic fields on the client side don't produce
   * spurious mismatches.
   */
  clientReports: Record<SeatId, unknown>;
}

export interface ArbitrationResponseEnvelope {
  sessionId: string;
  projectId: string;
  status: 'consensus' | 'client-disagreement' | 'client-mismatch-vs-server';
  canonicalReport: MatchAuthorityReport;
  mismatchedSeats: SeatId[];
  /**
   * Optional server-only diagnostic. Not comparing-against-spec; the portal
   * discards it if it doesn't care. Helpful for the dashboard's debug view.
   */
  diagnostics?: {
    eventStreamLength: number;
  };
}

export interface ArbitrateOptions {
  lookupCard: ReplayShowdownArgs['lookupCard'];
  /** HMAC secret used to sign the response envelope. */
  responseSecret: string;
  /** Key id to stamp on the response signature. */
  responseKeyId: string;
  /** `now` in unix seconds. Stamped on the response signature. */
  now: number;
}

/**
 * Runs the full arbitration pipeline. The fetch handler in `src/index.ts`
 * is a thin wrapper around this — HTTP parsing / request verification /
 * response serialization live there; the actual "does the client match the
 * server" decision lives here.
 */
export async function arbitrate(
  request: ArbitrationRequestEnvelope,
  opts: ArbitrateOptions,
): Promise<{ response: ArbitrationResponseEnvelope; signed: SignResult; replay: ReplayShowdownResult }> {
  // 1. Run authoritative resolver.
  const replay = replayShowdown({
    committedSequences: request.committedSequences,
    initialState: request.initialState,
    rngSeed: request.rngSeed,
    lookupCard: opts.lookupCard,
  });

  // 2. Diff each client report against the canonical server report.
  const mismatchedSeats: SeatId[] = [];
  const seatIds: SeatId[] = ['p1', 'p2'];
  for (const seatId of seatIds) {
    const clientReport = request.clientReports[seatId];
    if (clientReport === undefined) {
      // Missing client report is tagged as mismatched. The platform's
      // 'partial' path should have caught this earlier; if it reaches
      // the worker, we still mark it for audit rather than silently
      // accepting a one-sided report as consensus.
      mismatchedSeats.push(seatId);
      continue;
    }
    if (!clientMatchesServer(clientReport, replay.report)) {
      mismatchedSeats.push(seatId);
    }
  }

  const status: ArbitrationResponseEnvelope['status'] =
    mismatchedSeats.length === 0 ? 'consensus' : 'client-mismatch-vs-server';

  // 3. Build + sign response envelope.
  const response: ArbitrationResponseEnvelope = {
    sessionId: request.sessionId,
    projectId: request.projectId,
    status,
    canonicalReport: replay.report,
    mismatchedSeats,
    diagnostics: { eventStreamLength: replay.events.length },
  };

  const signed = await signArbitrationResponse(
    response,
    opts.responseSecret,
    opts.responseKeyId,
    opts.now,
  );

  return { response, signed, replay };
}

/**
 * Field-wise comparison. The client report can carry extra cosmetic fields
 * (UI-specific sugar) without triggering a mismatch — we only compare the
 * fields of `MatchAuthorityReport`.
 *
 * Uses canonicalStringify on both sides so key ordering in the client's
 * JSON doesn't matter.
 */
function clientMatchesServer(clientReport: unknown, serverReport: MatchAuthorityReport): boolean {
  if (!clientReport || typeof clientReport !== 'object') return false;
  const c = clientReport as Record<string, unknown>;

  const requiredKeys: Array<keyof MatchAuthorityReport> = [
    'outcome',
    'finalHp',
    'finalRage',
    'finalBlockPool',
    'durationFrames',
    'endReason',
    'eventStreamLength',
  ];

  for (const k of requiredKeys) {
    const cv = c[k as string];
    const sv = serverReport[k];
    if (cv === undefined) return false;
    if (canonicalStringify(cv) !== canonicalStringify(sv)) return false;
  }
  return true;
}
