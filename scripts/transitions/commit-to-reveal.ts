/**
 * HVCD transition: commit -> reveal
 * Fires on input `commit_locked_in`. Guard that both seats are ready
 * (single-seat locks don't release the transition).
 */
exports.CanTransition = function (ctx, input, transition) {
  // TODO(B2): look up per-seat ready flags and only return true when both are set.
  //   For now the guard is permissive — the commit state script is expected to
  //   only synthesize `commit_locked_in` after both ready flags are set.
  return true;
};

exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
};
