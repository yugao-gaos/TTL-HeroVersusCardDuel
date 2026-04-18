/**
 * HVCD transition: reveal -> commit
 * Fires on input `reveal_mismatch` when the seats' grandTotalFrames don't match.
 * Both seats draw extra cards and go back to commit.
 */
exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
  // TODO(B2): per combat-system.md §2 Reveal phase — both players draw fresh
  //   cards and return to commit to extend their sequences.
};
