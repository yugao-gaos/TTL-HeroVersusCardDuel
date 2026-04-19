/**
 * HVCD state: showdown
 *
 * Frame-by-frame simulation per combat-system.md §5. Per OQ-5 (offline mode),
 * the entire showdown runs in a single synchronous pass on StateEntered; the
 * resolver is a pure function (scripts/resolver/world.ts) driven by the
 * timeline object.
 *
 * Distribution (B2 port):
 *   - scripts/objects/timeline.ts owns cursor sweep, tokens, cancel firing,
 *     KO check, combo mode enforcement.
 *   - scripts/objects/sequence.ts owns dequeue + commit validation + carryover.
 *   - scripts/objects/counterTray.ts owns HP/rage/pool mutation.
 *   - scripts/objects/sideArea.ts owns parked projectile/effect source cards.
 *   - scripts/objects/projectile.ts owns in-flight advancement.
 *   - scripts/kinds/card.ts owns window->token expansion.
 *   - scripts/kinds/token.ts owns per-kind interaction rules.
 *   - scripts/effects/registry.ts owns effect activation/end hooks.
 *
 * This state script is the thin glue: on entry, gather per-seat state from
 * ECS, call runShowdown(), then write results back.
 */
// @ts-ignore
var timelineScript = require('../objects/timeline');
// @ts-ignore
var sequenceScript = require('../objects/sequence');
// @ts-ignore
var counterTrayScript = require('../objects/counterTray');
// @ts-ignore
var sideAreaScript = require('../objects/sideArea');
// @ts-ignore
var cardKind = require('../kinds/card');

exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);
  // Gather ECS handles for the two seats.
  var world = ctx.world;
  var timeline = findSingleton(world, 'hvcd.timeline');
  if (!timeline) {
    ctx.log('hvcd:showdown:error', 'no timeline singleton found');
    return;
  }

  var p1 = gatherSeat(world, 'p1');
  var p2 = gatherSeat(world, 'p2');
  if (!p1 || !p2) {
    ctx.log('hvcd:showdown:error', 'missing per-seat entities (sequence/counterTray/sideArea)');
    return;
  }

  // Build SeatState snapshots.
  var seat0 = sequenceScript.buildSeatState(ctx, p1.sequence, p1.tray, p1.hero, 'p1');
  var seat1 = sequenceScript.buildSeatState(ctx, p2.sequence, p2.tray, p2.hero, 'p2');

  // Lookup function — reads from the global card registry populated by
  // scripts/kinds/card.ts onSpawn (+ any items authored as hvcd.item).
  var lookup = function (cardId) { return cardKind.lookupCard(ctx, cardId); };

  // Run the showdown in one pass.
  var result = timelineScript.runShowdown(ctx, timeline.id, lookup, [seat0, seat1]);

  // Emit the event log — resolver events onto the shared event bus, AND
  // tee each event into `timeline.customData.eventLog` so match-end can
  // mirror them into the inline replay artifact's `events[]` field.
  // (Replay-event capture follow-up: the bus is fire-and-forget; without
  // teeing, post-showdown consumers like match-end can't reconstruct the
  // event stream. Per HvcdReplayArtifact.events in session-api.md.)
  for (var i = 0; i < result.events.length; i++) {
    var ev = result.events[i];
    emitResolverEvent(ctx, ev);
    appendEventLog(timeline, ev);
    // Damage accumulator: damage-applied carries `seat` (target/victim) +
    // `attackerSeat` + `amount`. Mirror running totals onto the per-seat
    // counterTray.props so match-end can read damageDealt / damageTaken
    // straight off the tray (matches the HvcdMatchResult shape).
    if (ev && ev.kind === 'damage-applied' && typeof ev.amount === 'number' && ev.amount > 0) {
      accumulateDamage(world, ev.attackerSeat, ev.seat, ev.amount);
    }
  }

  // Write back to ECS.
  counterTrayScript.writeBack(ctx, p1.tray.id, result.finalState.seats[0]);
  counterTrayScript.writeBack(ctx, p2.tray.id, result.finalState.seats[1]);
  sideAreaScript.writeBack(ctx, p1.sideArea.id, result.finalState.seats[0]);
  sideAreaScript.writeBack(ctx, p2.sideArea.id, result.finalState.seats[1]);

  // Persist remaining sequence + cursor back.
  writeSequenceBack(world, p1.sequence, result.finalState.seats[0]);
  writeSequenceBack(world, p2.sequence, result.finalState.seats[1]);

  // Persist timeline state.
  timeline.props = timeline.props || {};
  timeline.props.currentFrame = result.finalState.frame;
  timeline.props.tokens = result.finalState.tokens;
  timeline.props.projectiles = result.finalState.projectiles;
  timeline.props.activeEffects = result.finalState.effects;

  // Transition to pause-or-end.
  ctx.stateMachine && ctx.stateMachine.dispatch && ctx.stateMachine.dispatch({
    type: 'showdown_paused',
    payload: { reason: result.endReason, ko: result.ko, draw: result.draw },
  });
};

exports.StateUpdate = function (_ctx, _dt, _state) {
  // no-op in offline mode (OQ-5). All frames run in StateEntered.
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (_input, _ctx, _state) {
  // Offline mode: showdown consumes no direct player input.
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSingleton(world, subtype) {
  if (!world || !world.entities) return null;
  // World.entities supports iteration per TabletopLabs EntityManager.
  var iter = world.entities.all ? world.entities.all() : world.entities;
  if (typeof iter.forEach !== 'function' && !Array.isArray(iter)) {
    // Map-like
    var found = null;
    iter.forEach && iter.forEach(function (e) {
      if (!found && e.subtype === subtype) found = e;
    });
    return found;
  }
  for (var i = 0; i < iter.length; i++) {
    if (iter[i].subtype === subtype) return iter[i];
  }
  return null;
}

function findPerSeat(world, subtype, seatId) {
  if (!world || !world.entities) return null;
  var all = [];
  var iter = world.entities.all ? world.entities.all() : world.entities;
  if (iter.forEach) iter.forEach(function (e) { all.push(e); });
  else for (var i = 0; i < iter.length; i++) all.push(iter[i]);
  for (var j = 0; j < all.length; j++) {
    var e = all[j];
    if (e.subtype !== subtype) continue;
    var ownerSeat = (e.props && e.props.ownerSeat) || e.owner;
    if (ownerSeat === seatId) return e;
  }
  return null;
}

function gatherSeat(world, seatId) {
  var sequence = findPerSeat(world, 'hvcd.sequence', seatId);
  var tray = findPerSeat(world, 'hvcd.counterTray', seatId);
  var sideArea = findPerSeat(world, 'hvcd.sideArea', seatId);
  var hero = findPerSeat(world, 'hvcd.hero', seatId);
  if (!sequence || !tray || !sideArea) return null;
  return { sequence: sequence, tray: tray, sideArea: sideArea, hero: hero };
}

function writeSequenceBack(world, sequenceEntity, seatState) {
  if (!sequenceEntity) return;
  sequenceEntity.props = sequenceEntity.props || {};
  sequenceEntity.props.slots = seatState.sequence;
  sequenceEntity.props.cursor = seatState.cursor;
}

function emitResolverEvent(ctx, event) {
  // TabletopLabs EventBus: ctx.world.events.emit(streamId, event).
  var world = ctx.world;
  var bus = world && (world.events || world.eventBus);
  if (bus && typeof bus.emit === 'function') {
    bus.emit('resolverEvents', event);
  } else {
    // Fallback: log for debugging
    ctx.log('hvcd:event', event.kind, JSON.stringify(event).slice(0, 200));
  }
}

/**
 * Append a resolver event to `timeline.customData.eventLog`. Capped at
 * EVENT_LOG_CAP entries — once the cap is hit, subsequent events are dropped
 * and a `truncated: true` flag is set on customData so downstream consumers
 * can surface the elision. Per asset-protocol.md the canonical replay format
 * targets 5-15 KB gzipped, so the 10K cap is a defensive ceiling against
 * runaway match lengths rather than a tight budget.
 */
var EVENT_LOG_CAP = 10000;
function appendEventLog(timeline, event) {
  if (!timeline || !event) return;
  timeline.customData = timeline.customData || {};
  if (!Array.isArray(timeline.customData.eventLog)) {
    timeline.customData.eventLog = [];
  }
  if (timeline.customData.eventLog.length >= EVENT_LOG_CAP) {
    timeline.customData.eventLogTruncated = true;
    return;
  }
  timeline.customData.eventLog.push(event);
}

/**
 * Per-seat damage accumulator. Writes through to counterTray.props so
 * match-end can read damageDealt / damageTaken without re-walking the event
 * log. Both seats run the same deterministic showdown so the totals match
 * across hosts (T2 consensus precondition).
 */
function accumulateDamage(world, attackerSeat, victimSeat, amount) {
  if (!world || !world.entities) return;
  if (typeof amount !== 'number' || amount <= 0) return;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var trays = [];
  if (iter.forEach) iter.forEach(function (e) { if (e && e.subtype === 'hvcd.counterTray') trays.push(e); });
  else for (var i = 0; i < iter.length; i++) if (iter[i] && iter[i].subtype === 'hvcd.counterTray') trays.push(iter[i]);
  for (var j = 0; j < trays.length; j++) {
    var t = trays[j];
    var ownerSeat = (t.props && t.props.ownerSeat) || t.owner;
    if (ownerSeat === attackerSeat && attackerSeat !== victimSeat) {
      t.props = t.props || {};
      t.props.damageDealt = (typeof t.props.damageDealt === 'number' ? t.props.damageDealt : 0) + amount;
    }
    if (ownerSeat === victimSeat) {
      t.props = t.props || {};
      t.props.damageTaken = (typeof t.props.damageTaken === 'number' ? t.props.damageTaken : 0) + amount;
    }
  }
}
