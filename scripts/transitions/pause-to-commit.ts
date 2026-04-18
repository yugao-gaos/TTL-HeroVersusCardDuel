/**
 * HVCD transition: pause-or-end -> commit
 * Auto. Fires when the match is not over after a pause — back to the next turn.
 */
exports.CanTransition = function (ctx, input, transition) {
  // TODO(B2): return false if a KO condition is active; the `match_ended`
  //   input (emitted by the pause-or-end state when HP <= 0) will route to
  //   match-end instead.
  return true;
};

exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
};
