/**
 * HVCD state: commit
 *
 * Commit phase per combat-system.md §2. Each seat builds/edits their sequence:
 *   - add a slot (card from hand, spacer from pool, or item from inventory)
 *   - reorder slots
 *   - discard slots (one-way for rage/pool; items return to inventory)
 *   - clear the entire working sequence
 * Transitions out to `reveal` on synthesized input `commit_locked_in` once both
 * seats have flagged ready. At that point we snapshot the locked-in sequences
 * to a deterministic per-match commit log so match-end.ts can attach them to
 * the inline replay blob (OQ-12).
 *
 * Wave 4 / A7 migration status — DEFERRED
 * ----------------------------------------
 * The platform's Track A7 `dual-schema` privacy mode is the right home for
 * "the cardId of a committed slot is hidden from the opponent until reveal."
 * Per the spec example:
 *
 *   setEntityPrivacy(slotEntityId, {
 *     mode: 'dual-schema',
 *     ownerSeat: committingSeat,
 *     privateView: { cardId, cost, effectPreview },
 *     publicView: { silhouette: 'generic-back', label: '?', committedAt: turn },
 *   });
 *
 * This requires modeling each slot as its own ECS entity (today slots live
 * inline as `props.slots[]` on the per-seat sequence entity — no individual
 * entity ids to attach privacy to). That refactor is bounded but non-trivial
 * (touches commit/reveal/showdown state scripts plus the SequenceLane render
 * slot impl) and is out of scope for the A7 platform work.
 *
 * Today's behavior (resolver omits cardId from `slot-committed` events,
 * fills in on `slot-dequeued`) remains the v1-correct mechanism. When the
 * slot-as-entity refactor lands, swap that resolver-side omission for the
 * dual-schema call above and `delete` the placeholder fields. See spec
 * `platform-capability-privacy.md` §"HVCD usage patterns" row
 * "Committed-sequence slot kind / cardId before dequeue" for the exact
 * dual-schema shape.
 *
 * B5 — commit-history capture
 * ---------------------------
 * The commit log lives on `timeline.customData.commitLog` as
 *   Array<{ turn: number, seat: 'p1'|'p2', slots: SequenceSlot[] }>
 * appended on the commit -> reveal transition (one entry per seat per turn).
 * Both seats receive the same input stream over the gameplay lane, apply the
 * same deterministic mutations, and snapshot at the same FSM edge — so the
 * log is byte-identical across seats and survives canonicalStringify hashing
 * for T2 consensus (see match-end.ts).
 *
 * Mutations are deliberately minimal: we maintain the per-seat sequence
 * entity's `props.slots` array and `props.ready` flag. Resource validation
 * (rage cost / pool availability / hand membership) is left to a future B-track
 * pass — the commit-log snapshot only requires that the working-sequence ECS
 * state is correct at lock-in time, which both seats observe identically.
 */

exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // Reset per-seat ready flags so a new commit phase is editable. The slot
  // lists themselves persist across commit phases (sequence carryover is
  // handled in showdown / pause-or-end).
  var world = ctx.world;
  var p1Seq = findPerSeatCo(world, 'hvcd.sequence', 'p1');
  var p2Seq = findPerSeatCo(world, 'hvcd.sequence', 'p2');
  if (p1Seq) { p1Seq.props = p1Seq.props || {}; p1Seq.props.ready = false; }
  if (p2Seq) { p2Seq.props = p2Seq.props || {}; p2Seq.props.ready = false; }
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op; commit phase is input-driven, not time-driven.
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (input, ctx, state) {
  if (!input || typeof input.type !== 'string') return;
  ctx.log('hvcd:commit:input', input.type);
  var world = ctx.world;
  var payload = input.payload || {};
  var seatId = payload.seat;

  switch (input.type) {
    case 'slot_add':
      applyToSeatSequence(world, seatId, function (slots) {
        if (!payload.slot) return slots;
        var idx = typeof payload.index === 'number' ? clampIndex(payload.index, slots.length) : slots.length;
        var next = slots.slice();
        next.splice(idx, 0, payload.slot);
        return next;
      });
      return;

    case 'slot_discard':
      applyToSeatSequence(world, seatId, function (slots) {
        if (typeof payload.index !== 'number') return slots;
        if (payload.index < 0 || payload.index >= slots.length) return slots;
        var next = slots.slice();
        next.splice(payload.index, 1);
        return next;
      });
      return;

    case 'slot_reorder':
      applyToSeatSequence(world, seatId, function (slots) {
        if (typeof payload.from !== 'number' || typeof payload.to !== 'number') return slots;
        if (payload.from < 0 || payload.from >= slots.length) return slots;
        var to = clampIndex(payload.to, slots.length - 1);
        var next = slots.slice();
        var moved = next.splice(payload.from, 1)[0];
        next.splice(to, 0, moved);
        return next;
      });
      return;

    case 'slot_clear':
      applyToSeatSequence(world, seatId, function (_slots) { return []; });
      return;

    case 'commit_ready':
      markReady(world, seatId, true);
      tryLockIn(ctx, world);
      return;

    case 'commit_unready':
      markReady(world, seatId, false);
      return;

    default:
      return;
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampIndex(i, max) {
  if (i < 0) return 0;
  if (i > max) return max;
  return i;
}

function applyToSeatSequence(world, seatId, mutator) {
  var ent = findPerSeatCo(world, 'hvcd.sequence', seatId);
  if (!ent) return;
  ent.props = ent.props || {};
  var current = Array.isArray(ent.props.slots) ? ent.props.slots : [];
  ent.props.slots = mutator(current);
}

function markReady(world, seatId, ready) {
  var ent = findPerSeatCo(world, 'hvcd.sequence', seatId);
  if (!ent) return;
  ent.props = ent.props || {};
  ent.props.ready = !!ready;
}

/**
 * If both seats have signaled ready, snapshot their working sequences into the
 * shared commit log on the timeline entity, emit SlotCommitted events, and
 * dispatch `commit_locked_in` to advance the FSM. Both seats execute this
 * deterministically since they share the same input stream and the same
 * tick-ordered ECS state.
 */
function tryLockIn(ctx, world) {
  var p1Seq = findPerSeatCo(world, 'hvcd.sequence', 'p1');
  var p2Seq = findPerSeatCo(world, 'hvcd.sequence', 'p2');
  if (!p1Seq || !p2Seq) return;
  var p1Ready = !!(p1Seq.props && p1Seq.props.ready);
  var p2Ready = !!(p2Seq.props && p2Seq.props.ready);
  if (!p1Ready || !p2Ready) return;

  var timeline = findSingletonCo(world, 'hvcd.timeline');
  var turn = (timeline && timeline.props && typeof timeline.props.turnIndex === 'number')
    ? timeline.props.turnIndex
    : 0;

  var p1Slots = (p1Seq.props && Array.isArray(p1Seq.props.slots)) ? p1Seq.props.slots : [];
  var p2Slots = (p2Seq.props && Array.isArray(p2Seq.props.slots)) ? p2Seq.props.slots : [];

  appendCommitLog(timeline, { turn: turn, seat: 'p1', slots: cloneSlots(p1Slots) });
  appendCommitLog(timeline, { turn: turn, seat: 'p2', slots: cloneSlots(p2Slots) });

  // Emit SlotCommitted events for the resolver event log (event-log-schema.md).
  // Note: these aren't part of the typed ResolverEvent union today (commit-phase
  // events are out of scope for the showdown resolver). Emitted as freeform
  // bus events; downstream consumers ignore unknown kinds.
  emitResolverEventCo(ctx, { kind: 'slot-committed', seat: 'p1', turn: turn, slots: cloneSlots(p1Slots) });
  emitResolverEventCo(ctx, { kind: 'slot-committed', seat: 'p2', turn: turn, slots: cloneSlots(p2Slots) });

  // Advance the FSM. The transition itself is permissive (commit-to-reveal.ts);
  // we gate here.
  if (ctx.stateMachine && typeof ctx.stateMachine.dispatch === 'function') {
    ctx.stateMachine.dispatch({ type: 'commit_locked_in', payload: { turn: turn } });
  }
}

function appendCommitLog(timeline, entry) {
  if (!timeline) return;
  timeline.customData = timeline.customData || {};
  if (!Array.isArray(timeline.customData.commitLog)) {
    timeline.customData.commitLog = [];
  }
  timeline.customData.commitLog.push(entry);
}

function cloneSlots(slots) {
  // Shallow clone is enough — SequenceSlot is a flat tagged-union shape with
  // primitive fields per resolver/types.ts. JSON round-trip would also work
  // but we keep this hot-path cheap.
  var out = new Array(slots.length);
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i] || {};
    var copy = {};
    for (var k in s) {
      if (Object.prototype.hasOwnProperty.call(s, k)) copy[k] = s[k];
    }
    out[i] = copy;
  }
  return out;
}

// Helper names are suffixed `Co` (commit) so each state-script file declares
// uniquely-named top-level functions. The runtime sandbox treats each file
// as its own module, but tsc lints them together as ambient-script globals
// and complains about duplicate function implementations. Suffixing avoids
// that without introducing a shared module dependency between sandboxed files.
function findSingletonCo(world, subtype) {
  if (!world || !world.entities) return null;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var found = null;
  if (iter.forEach) iter.forEach(function (e) { if (!found && e.subtype === subtype) found = e; });
  else for (var i = 0; i < iter.length; i++) if (iter[i].subtype === subtype) { found = iter[i]; break; }
  return found;
}

function findPerSeatCo(world, subtype, seatId) {
  if (!world || !world.entities) return null;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var found = null;
  var consider = function (e) {
    if (found || e.subtype !== subtype) return;
    var ownerSeat = (e.props && e.props.ownerSeat) || e.owner;
    if (ownerSeat === seatId) found = e;
  };
  if (iter.forEach) iter.forEach(consider);
  else for (var i = 0; i < iter.length; i++) consider(iter[i]);
  return found;
}

function emitResolverEventCo(ctx, event) {
  var bus = ctx.world && (ctx.world.events || ctx.world.eventBus);
  if (bus && typeof bus.emit === 'function') {
    bus.emit('resolverEvents', event);
  } else {
    ctx.log('hvcd:event', event.kind);
  }
  // Tee into timeline.customData.eventLog so match-end can mirror the
  // full live event stream into the inline replay artifact (events[]).
  // commit-phase events (`slot-committed`) are part of the replay too —
  // they reconstruct what each seat locked in per turn.
  var timeline = findSingletonCo(ctx.world, 'hvcd.timeline');
  appendEventLogCo(timeline, event);
}

var EVENT_LOG_CAP_CO = 10000;
function appendEventLogCo(timeline, event) {
  if (!timeline || !event) return;
  timeline.customData = timeline.customData || {};
  if (!Array.isArray(timeline.customData.eventLog)) {
    timeline.customData.eventLog = [];
  }
  if (timeline.customData.eventLog.length >= EVENT_LOG_CAP_CO) {
    timeline.customData.eventLogTruncated = true;
    return;
  }
  timeline.customData.eventLog.push(event);
}
