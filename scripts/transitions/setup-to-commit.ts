/**
 * HVCD transition: match-setup -> commit
 * Fires once per match, auto, after match-setup completes.
 */
exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
  // TODO(B2): any last-mile seeding between setup and first commit phase.
};
