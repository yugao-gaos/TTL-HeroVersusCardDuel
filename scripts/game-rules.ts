/**
 * HVCD global script.
 *
 * Global scripts receive world-level events in the ScriptEngine sandbox. For
 * HVCD this is the thin top layer: seat join/leave tracking, match lifecycle
 * logging, and bridging platform events into the resolver's event stream
 * (see hvcd-tabletop-contracts/event-log-schema.md).
 *
 * STUB — no resolver / event-stream logic yet. Track B2 will populate the
 * onEvent bridge. This file is intentionally tiny because most HVCD logic
 * lives on the FSM state scripts (scripts/states/*) and the resolver itself.
 *
 * NOTE(OQ-1 unresolved): if HVCD's resolver ends up needing a richer host
 * than the ScriptEngine (Web Worker, direct three.js access), this file
 * stays small and the resolver moves to a module-host bundle per
 * hvcd-tabletop-contracts/game-module-manifest.md § register(api) surface.
 */
exports.onPlayerJoin = function (playerId, ctx) {
  ctx.log('hvcd:player-joined', playerId);
};

exports.onPlayerLeave = function (playerId, ctx) {
  ctx.log('hvcd:player-left', playerId);
};

exports.onTick = function (ctx, dt) {
  // no-op: HVCD showdown ticking lives in scripts/states/showdown.ts per OQ-5 recommendation.
};

exports.onEvent = function (type, payload, ctx) {
  if (type === 'entity_spawned') {
    // Leave as a no-op in the stub; verbose logging would spam the console
    // because HVCD spawns many tokens during a showdown.
  }
  // TODO(B2): bridge resolver events onto the 'resolverEvents' stream per
  //   event-log-schema.md. Envelope fields: streamId, schema='ResolverEvent@v1',
  //   seq, globalFrame, turnFrame, turnIndex, timestamp.
};
