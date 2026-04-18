/**
 * HVCD state: pause-or-end
 *
 * Decision point after a showdown pause per combat-system.md §2.
 *   - If any seat has HP <= 0 (and it wasn't a mutual KO draw), the match ends.
 *   - Otherwise, the match continues: refill block pool (§2 End of turn),
 *     emit turn-ended, and auto-transition back to commit.
 */
// @ts-ignore
var counterTrayScript = require('../objects/counterTray');

exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);

  var world = ctx.world;
  var p1Tray = findPerSeat(world, 'hvcd.counterTray', 'p1');
  var p2Tray = findPerSeat(world, 'hvcd.counterTray', 'p2');
  var timeline = findSingleton(world, 'hvcd.timeline');

  var p1Hp = p1Tray && p1Tray.props ? p1Tray.props.hp : null;
  var p2Hp = p2Tray && p2Tray.props ? p2Tray.props.hp : null;
  var currentFrame = timeline && timeline.props ? (timeline.props.currentFrame || 0) : 0;
  var turnIndex = timeline && timeline.props ? (timeline.props.turnIndex || 0) : 0;

  if (p1Hp !== null && p1Hp <= 0) {
    emit(ctx, { kind: 'match-ended', outcome: 'p2' });
    dispatch(ctx, 'match_ended', { winner: 'p2' });
    return;
  }
  if (p2Hp !== null && p2Hp <= 0) {
    emit(ctx, { kind: 'match-ended', outcome: 'p1' });
    dispatch(ctx, 'match_ended', { winner: 'p1' });
    return;
  }

  // Turn ended; refill block pools per §2 End of turn.
  if (p1Tray) counterTrayScript.refillBetweenShowdowns(ctx, p1Tray.id);
  if (p2Tray) counterTrayScript.refillBetweenShowdowns(ctx, p2Tray.id);

  emit(ctx, { kind: 'turn-ended', turnIndex: turnIndex, endGlobalFrame: currentFrame });

  // Bump turnIndex for the next round.
  if (timeline) {
    timeline.props = timeline.props || {};
    timeline.props.turnIndex = turnIndex + 1;
  }

  // Auto-transition back to commit.
  dispatch(ctx, 'continue', { turnIndex: turnIndex + 1 });
};

exports.StateUpdate = function (_ctx, _dt, _state) {};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (_input, _ctx, _state) {
  // match_ended input from external flow routes to match-end.
};

// ----- helpers -----

function findSingleton(world, subtype) {
  if (!world || !world.entities) return null;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var found = null;
  if (iter.forEach) iter.forEach(function (e) { if (!found && e.subtype === subtype) found = e; });
  else for (var i = 0; i < iter.length; i++) if (iter[i].subtype === subtype) { found = iter[i]; break; }
  return found;
}

function findPerSeat(world, subtype, seatId) {
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

function emit(ctx, ev) {
  var bus = ctx.world && (ctx.world.events || ctx.world.eventBus);
  if (bus && typeof bus.emit === 'function') bus.emit('resolverEvents', ev);
  else ctx.log('hvcd:event', ev.kind);
}

function dispatch(ctx, type, payload) {
  if (ctx.stateMachine && typeof ctx.stateMachine.dispatch === 'function') {
    ctx.stateMachine.dispatch({ type: type, payload: payload });
  }
}
