/**
 * HVCD state: match-end
 *
 * Terminal state. Match outcome is recorded and the replay artifact is closed.
 *
 * STUB — no mutation logic yet. Track B2 will populate:
 *   - Determine outcome: 'p1' | 'p2' | 'draw' | 'abort'.
 *   - Emit MatchEndedEvent per event-log-schema.md.
 *   - Finalize the replay artifact (HvcdMatchResult@v1 per
 *     hvcd-tabletop-contracts/game-module-manifest.md § results).
 */
exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // TODO(B2): emit MatchEndedEvent and finalize replay.
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op
};

exports.StateExit = function (ctx, state) {
  // terminal — exit not expected during a normal session.
};

exports.StateInput = function (input, ctx, state) {
  // terminal — no inputs consumed.
};
