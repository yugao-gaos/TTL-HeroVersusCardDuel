/**
 * HVCD state: match-setup
 *
 * Entry point for a new match. Initializes per-seat state (HP, rage, block pool),
 * draws the opening hand, then transitions automatically into the first commit phase.
 *
 * STUB — no resolver logic yet. Track B2 will populate:
 *   - Reset seat HP to hero.baseHp (see config/objects/heroes/*.json).
 *   - Reset rage to hero.baseRage (0 for all starter heroes).
 *   - Reset block pool to 6 (per combat-system.md §2).
 *   - Shuffle each seat's deck and draw HAND_SIZE (5) cards.
 *   - Emit MatchStartedEvent per hvcd-tabletop-contracts/event-log-schema.md.
 */
exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // TODO(B2): initialize per-seat state from hero blueprints.
  // TODO(B2): emit MatchStartedEvent.
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (input, ctx, state) {
  // no player input is consumed during match-setup.
};
