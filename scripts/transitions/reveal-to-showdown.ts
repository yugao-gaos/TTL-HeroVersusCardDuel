/**
 * HVCD transition: reveal -> showdown
 * Auto. Fires when reveal phase concludes with matching frame totals.
 */
exports.CanTransition = function (ctx, input, transition) {
  // TODO(B2): read the computed per-seat grandTotalFrames; only return true
  //   when they're equal. If mismatched, the reveal state should instead
  //   inject `reveal_mismatch` to route to reveal-to-commit.
  return true;
};

exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
};
