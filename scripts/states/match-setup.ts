/**
 * HVCD state: match-setup
 *
 * Entry point for a new match. Initializes per-seat state (HP, rage, block
 * pool), draws the opening hand, then transitions automatically into the
 * first commit phase.
 *
 * # Wave 4 / B10 — Hero starter items at run-start
 *
 * On the **first match of a run**, this state seeds
 * `timeline.customData.runState` with a fresh per-hero RunState (see
 * scripts/items/triggers.ts `createRunState`). Each seat's hero-locked
 * starter item (see scripts/items/catalog.ts `getHeroStarterItem`) is
 * granted automatically — Blaze -> ignite, Volt -> taser, Aqua -> flask.
 *
 * Items earned mid-run via roguelike pickups go through a separate (TODO)
 * acquisition flow — out of scope for B10.
 *
 * On subsequent matches in the same run, the existing runState is preserved
 * (charges from previous matches carry over). The `matchIndex` field is
 * bumped so trigger handlers can distinguish first-of-run vs ongoing.
 *
 * STUB — resolver-side seat init still pending (Track B2). The slot-binding
 * for hand draw / HP reset will land alongside the fuller deck pipeline; for
 * now this state focuses on run-state hydration and per-hero starter-item
 * grants so the items system has correct seed data.
 */
// @ts-ignore — sibling pure module imported via require for parity with the
// other state scripts (loader uses CommonJS for sandboxed scripts).
// Defensive import: tests may stub require to return {}; in that case we
// degrade to a noop createRunState rather than crashing the state.
var triggersMod = (function () {
  try { return require('../items/triggers'); } catch (_e) { return {}; }
})();
function defaultCreateRunState(p1Hero, p2Hero) {
  return {
    seats: {
      p1: { heroId: p1Hero, runItems: [], firstCardThisRound: true, burnTokens: 0 },
      p2: { heroId: p2Hero, runItems: [], firstCardThisRound: true, burnTokens: 0 },
    },
    matchIndex: 0,
  };
}

exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);

  var world = ctx && ctx.world;
  var timeline = findSingletonMs(world, 'hvcd.timeline');
  if (!timeline) {
    ctx.log('hvcd:match-setup:no-timeline', 'skipping run-state hydration');
    return;
  }
  timeline.customData = timeline.customData || {};

  // Reset the per-match capture buffers so a fresh match starts with empty
  // commit + event logs (the per-state teeing path appends to these during
  // the match; match-end reads them into the inline replay artifact).
  timeline.customData.commitLog = [];
  timeline.customData.eventLog = [];
  timeline.customData.eventLogTruncated = false;

  // Reset per-seat damage accumulators on the counter trays. The accumulator
  // (showdown.ts `accumulateDamage`) sums damage-applied events into these
  // fields; match-end reads them into HvcdMatchResult.damageDealt /
  // damageTaken. They're per-match, not per-run, so reset on each match-setup.
  var trays = findAllMs(world, 'hvcd.counterTray');
  for (var t = 0; t < trays.length; t++) {
    trays[t].props = trays[t].props || {};
    trays[t].props.damageDealt = 0;
    trays[t].props.damageTaken = 0;
  }

  // If a runState already exists (continuing run), bump the matchIndex and
  // skip starter-item grants. Otherwise build a fresh RunState from each
  // hero's slug.
  if (timeline.customData.runState && timeline.customData.runState.seats) {
    timeline.customData.runState.matchIndex =
      (timeline.customData.runState.matchIndex || 0) + 1;
    return;
  }

  var p1Hero = findPerSeatMs(world, 'hvcd.hero', 'p1');
  var p2Hero = findPerSeatMs(world, 'hvcd.hero', 'p2');
  var p1Slug = (p1Hero && p1Hero.props && typeof p1Hero.props.slug === 'string') ? p1Hero.props.slug : 'unknown';
  var p2Slug = (p2Hero && p2Hero.props && typeof p2Hero.props.slug === 'string') ? p2Hero.props.slug : 'unknown';

  // Build the run state via the pure factory; both seats deterministically
  // get their hero's starter item (B10).
  var createRunState = (typeof triggersMod.createRunState === 'function')
    ? triggersMod.createRunState
    : defaultCreateRunState;
  timeline.customData.runState = createRunState(p1Slug, p2Slug);

  // TODO(B2): initialize per-seat HP/rage/blockPool from hero blueprints.
  // TODO(B2): emit MatchStartedEvent.

  // Wave 4 / A7 — spawn per-seat inventory-rack ECS entities and mark them
  // hidden so the platform's per-recipient sync pass strips them from the
  // opponent's snapshot. This replaces the v1 Layer-1 render-null pattern
  // (see scripts/slots/InventoryRack.tsx header).
  //
  // Data placement note: the rack entity's `customData.items` is the
  // post-A7 home for per-rack item state. The current InventoryRack slot
  // impl still derives item state by replaying resolver events; that path
  // continues to work because the events still include `match-started` /
  // `item-returned-to-inventory` events. Future cleanup will move that
  // state onto the entity's customData and rely solely on the per-recipient
  // snapshot for opponent privacy. See InventoryRack.tsx TODO(post-A7).
  ensureInventoryRackMs(ctx, world, 'p1');
  ensureInventoryRackMs(ctx, world, 'p2');
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op
};

exports.StateExit = function (ctx, state) {
  ctx.log('hvcd:state-exit', state.id);
};

exports.StateInput = function (input, ctx, state) {
  // no player input is consumed during match-setup.
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSingletonMs(world, subtype) {
  if (!world || !world.entities) return null;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var found = null;
  if (iter.forEach) iter.forEach(function (e) { if (!found && e.subtype === subtype) found = e; });
  else for (var i = 0; i < iter.length; i++) if (iter[i].subtype === subtype) { found = iter[i]; break; }
  return found;
}

function findAllMs(world, subtype) {
  var out = [];
  if (!world || !world.entities) return out;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  if (iter.forEach) iter.forEach(function (e) { if (e && e.subtype === subtype) out.push(e); });
  else for (var i = 0; i < iter.length; i++) if (iter[i] && iter[i].subtype === subtype) out.push(iter[i]);
  return out;
}

function findPerSeatMs(world, subtype, seatId) {
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

/**
 * Wave 4 / A7 — ensure a per-seat inventory-rack entity exists and is marked
 * hidden so only the owner's snapshot includes it. Idempotent: if a rack
 * entity for this seat is already present, just (re)apply the privacy mode
 * (idempotent on the platform side too).
 *
 * This helper deliberately uses `customData.items` as the future state home;
 * for now it spawns an empty array, and the existing `useEventStream`
 * reducer in InventoryRack.tsx remains the source of render data. The
 * privacy guarantee is that the entity itself is stripped from the
 * opponent's snapshot.
 */
function ensureInventoryRackMs(ctx, world, seatId) {
  if (!world) return;
  var existing = findPerSeatMs(world, 'hvcd.inventoryRack', seatId);
  var entityId = existing && (existing.entityId || existing.id);
  if (!existing) {
    // Sandboxed scripts spawn entities through ctx.world.spawnEntity (Track
    // B2-shaped API) — when unavailable (early boot, tests), we degrade to
    // a metadata-only object pushed onto world.entities so the rest of the
    // sandbox helpers see it. The platform-side privacy call still happens
    // below; setEntityPrivacy on a non-numeric id is a no-op + warn.
    var record = {
      kind: 'hvcd.inventoryRack',
      subtype: 'hvcd.inventoryRack',
      label: seatId + ' Inventory Rack',
      owner: seatId,
      props: { ownerSeat: seatId },
      customData: { items: [] },
    };
    if (world.spawnEntity && typeof world.spawnEntity === 'function') {
      var spawned = world.spawnEntity(record);
      entityId = spawned && (spawned.entityId || spawned.id);
    } else if (world.entities && typeof world.entities.push === 'function') {
      world.entities.push(record);
    }
  }

  // Apply A7 privacy. The platform's authority check no-ops if this script
  // runs on a non-authority client. Idempotent — same-mode calls are dropped.
  var api = ctx && ctx.api;
  if (api && typeof api.setEntityPrivacy === 'function' && typeof entityId === 'number') {
    api.setEntityPrivacy(entityId, { mode: 'hidden', ownerSeat: seatId });
  } else {
    ctx && ctx.log && ctx.log('hvcd:a7:setEntityPrivacy-unavailable', seatId);
  }
}
