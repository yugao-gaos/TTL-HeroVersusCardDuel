/**
 * HVCD state: reveal
 *
 * Reveal phase per combat-system.md §2. Both sequences are made public in terms
 * of slot count + per-slot frame cost (slot identity stays hidden). Frame totals
 * (sequence + carryover) are compared:
 *   - match → auto-transition to `showdown`
 *   - mismatch → fire `reveal_mismatch` input, both seats draw more cards
 *     and return to `commit`
 *
 * STUB — no mutation logic yet. Track B2 will populate:
 *   - Compute sequenceTotalFrames per seat (sum of slot frame costs).
 *   - Compute carryoverFrames per seat (max-extent of stun/knockdown/block
 *     tokens still on timeline from previous turn).
 *   - Compare grandTotalFrames across seats; emit reveal_mismatch if unequal.
 *   - Emit RevealBeatEvent per event-log-schema.md with publishedBySeat.
 */
exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // TODO(B2): compute + publish RevealBeatEvent.
  // TODO(B2): if totals match, do nothing — auto transition fires.
  // TODO(B2): if totals mismatch, emit reveal_mismatch input into the FSM
  //           so the commit-return transition can fire.
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (input, ctx, state) {
  // Reveal is normally auto-transition; only reveal_mismatch is consumed here.
};
