/**
 * HVCD transition: showdown -> pause-or-end
 * Fires on input `showdown_paused` (combo drop, attacker sequence exhausted,
 * both exhausted, or admin halt — combat-system.md §2 Showdown phase).
 */
exports.BeforeTransition = function (ctx, input, transition) {
  ctx.log('hvcd:transition', transition.id);
  // TODO(B2): finalize showdown segment — ShowdownPausedEvent, update
  //   carryover tokens, ensure in-flight projectiles remain tracked (§2).
};
