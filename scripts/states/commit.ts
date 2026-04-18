/**
 * HVCD state: commit
 *
 * Commit phase per combat-system.md §2. Each seat builds/edits their sequence:
 *   - add a slot (card from hand, spacer from pool, or item from inventory)
 *   - reorder slots
 *   - discard slots (one-way for rage/pool; items return to inventory)
 * Transitions out to `reveal` on input `commit_locked_in` when both seats
 * have signaled ready.
 *
 * STUB — no mutation logic yet. Track B2 will populate:
 *   - Per-seat ready flag; only emit commit_locked_in when both are ready.
 *   - Validation: minimum sequence frames (MIN_SEQUENCE_FRAMES = 10).
 *   - Validation: rage cost / block pool / item availability on add.
 *   - Resource deduction at add-time (one-way per §2 commit phase).
 *   - Emit SlotCommitted / SlotDiscardedFromSequence / SlotReordered /
 *     RagePaid / BlockPoolConsumed events per event-log-schema.md.
 *   - Hand mulligan between showdowns (§2 End of turn / refills).
 */
exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // TODO(B2): emit CommitPhaseEnteredEvent.
  // TODO(B2): reset per-seat ready flags, top up hand to HAND_SIZE,
  //           refill block pool to 6 (between-showdowns refills, §2).
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op; commit phase is input-driven, not time-driven.
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (input, ctx, state) {
  ctx.log('hvcd:commit:input', input && input.type);
  // TODO(B2): dispatch on input.type:
  //   - 'slot_add'      → validate + mutate sequence + deduct resources
  //   - 'slot_discard'  → mutate sequence (preserve item charges per §12)
  //   - 'slot_reorder'  → swap slot positions
  //   - 'mulligan'      → redraw hand (free mulligan, §2 End of turn)
  //   - 'commit_ready'  → mark seat ready; when both ready emit commit_locked_in
};
