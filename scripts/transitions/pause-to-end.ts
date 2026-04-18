/**
 * HVCD transition: pause-or-end -> match-end
 * Fires on input `match_ended` when a KO condition resolves the match.
 */
exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
};
