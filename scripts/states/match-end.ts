/**
 * HVCD state: match-end
 *
 * Terminal state. Match outcome is recorded, the MatchEndedEvent is emitted
 * onto the resolver event stream, and the module fires its `ctx.platform.endGame`
 * capability so the portal receives a signed, server-to-server outbound POST
 * with the canonical match outcome.
 *
 * Tier (MVP): **T2 consensus** per platform-capability-server-auth.md.
 *   - Both seats call `ctx.platform.endGame(...)` independently.
 *   - Platform hashes the two payloads; matching hashes → `status: 'consensus'`.
 *   - HVCD casual uses lenient disputed-behavior (configured server-side).
 *   - For byte-identical hashes across seats, the payload is serialized with
 *     stable key order (canonicalStringify below — sorts object keys, leaves
 *     arrays in document order). Both seats read from the same deterministic
 *     world state populated by scripts/states/showdown.ts, so honest play
 *     produces matching hashes.
 *
 * Per Wave 4 ScriptContext extension, the sandboxed state-script ctx now
 * exposes `ctx.platform` directly (no module-bundle bridge needed). The URL
 * comes from `ctx.platform.getCallbackUrl()` (the platform owns the
 * project-dashboard allow-list per session-api.md § Callback URL allowlist).
 *
 * Payload shape: HvcdMatchResult per session-api.md § HVCD-specific payload
 * shape, including the **inline replay blob** (OQ-12 resolution: deterministic
 * replay is only 5-15KB so we embed it directly rather than uploading a signed
 * URL pointer). Replay shape per hvcd-tabletop-contracts/open-questions.md
 * OQ-12.
 */

exports.StateEntered = function (ctx, state) {
  ctx.log('hvcd:state-entered', state.id);

  var world = ctx.world;
  var p1Tray = findPerSeatMe(world, 'hvcd.counterTray', 'p1');
  var p2Tray = findPerSeatMe(world, 'hvcd.counterTray', 'p2');
  var timeline = findSingletonMe(world, 'hvcd.timeline');

  var p1Hp = p1Tray && p1Tray.props && typeof p1Tray.props.hp === 'number' ? p1Tray.props.hp : 0;
  var p2Hp = p2Tray && p2Tray.props && typeof p2Tray.props.hp === 'number' ? p2Tray.props.hp : 0;
  var p1Rage = p1Tray && p1Tray.props && typeof p1Tray.props.rage === 'number' ? p1Tray.props.rage : 0;
  var p2Rage = p2Tray && p2Tray.props && typeof p2Tray.props.rage === 'number' ? p2Tray.props.rage : 0;
  var p1Pool = p1Tray && p1Tray.props && typeof p1Tray.props.blockPool === 'number' ? p1Tray.props.blockPool : 0;
  var p2Pool = p2Tray && p2Tray.props && typeof p2Tray.props.blockPool === 'number' ? p2Tray.props.blockPool : 0;
  var totalShowdownFrames = timeline && timeline.props && typeof timeline.props.currentFrame === 'number' ? timeline.props.currentFrame : 0;
  var turnCount = timeline && timeline.props && typeof timeline.props.turnIndex === 'number' ? timeline.props.turnIndex : 0;

  // damageDealt / damageTaken: written through to counterTray.props by the
  // damage-applied event handler. Defaults to 0 if the tracker hasn't seen
  // any damage events. (Per HvcdMatchResult.damageDealt / damageTaken in
  // session-api.md § HVCD-specific payload shape.)
  var p1Dealt = p1Tray && p1Tray.props && typeof p1Tray.props.damageDealt === 'number' ? p1Tray.props.damageDealt : 0;
  var p2Dealt = p2Tray && p2Tray.props && typeof p2Tray.props.damageDealt === 'number' ? p2Tray.props.damageDealt : 0;
  var p1Taken = p1Tray && p1Tray.props && typeof p1Tray.props.damageTaken === 'number' ? p1Tray.props.damageTaken : 0;
  var p2Taken = p2Tray && p2Tray.props && typeof p2Tray.props.damageTaken === 'number' ? p2Tray.props.damageTaken : 0;

  // Determine outcome from the same world state pause-or-end used to route
  // us here. Both seats run the same deterministic showdown so this is
  // byte-identical across seats — required for T2 consensus hashing.
  var outcome;
  var endedReason;
  if (p1Hp <= 0 && p2Hp <= 0) {
    outcome = 'draw';
    endedReason = 'hp-zero';
  } else if (p1Hp <= 0) {
    outcome = 'p2';
    endedReason = 'hp-zero';
  } else if (p2Hp <= 0) {
    outcome = 'p1';
    endedReason = 'hp-zero';
  } else {
    // Reached here via non-HP route (concede/timeout/disconnect). The
    // originating transition's input would carry the reason; absent that,
    // fall back to 'abort'. Live flow lands via pause-or-end with HP=0.
    outcome = 'abort';
    endedReason = 'disconnect';
  }

  // Emit MatchEndedEvent onto resolverEvents per event-log-schema.md.
  emitResolverEventMe(ctx, {
    kind: 'match-ended',
    outcome: outcome,
  });

  // Build the inline replay artifact per OQ-12 resolution. Both seats build
  // byte-identical payloads from byte-identical deterministic world state,
  // satisfying T2 consensus hashing. The commits[] feed comes from
  // timeline.customData.commitLog, populated each commit -> reveal edge by
  // scripts/states/commit.ts (B5).
  var replayArtifact = buildReplayBlob(ctx, world, {
    outcome: outcome,
    p1Hp: p1Hp,
    p2Hp: p2Hp,
    totalShowdownFrames: totalShowdownFrames,
    turnCount: turnCount,
  });

  // perSeat: heroId + run-state inventoryEnd. Hero entity carries heroId
  // on its props; run-state inventory lives on timeline.customData.runState
  // (populated by scripts/states/match-setup.ts at run-start and updated
  // through the match by the trigger engine).
  var perSeat = buildPerSeat(world);

  // Build the canonical end-game payload per session-api.md
  // § HVCD-specific payload shape. The platform forwards this opaquely
  // to the portal.
  var payload = {
    schemaVersion: 1,
    outcome: outcome,                     // 'p1' | 'p2' | 'draw' | 'abort'
    endedReason: endedReason,             // 'hp-zero' | 'concede' | 'timeout' | 'disconnect'
    finalHp:        { p1: p1Hp,    p2: p2Hp    },
    finalRage:      { p1: p1Rage,  p2: p2Rage  },
    finalBlockPool: { p1: p1Pool,  p2: p2Pool  },
    damageDealt:    { p1: p1Dealt, p2: p2Dealt },
    damageTaken:    { p1: p1Taken, p2: p2Taken },
    totalShowdownFrames: totalShowdownFrames,
    turnCount: turnCount,
    perSeat: perSeat,
    replay: { shape: 'inline', artifact: replayArtifact },
  };

  // Fire ctx.platform.endGame. Platform is not wired in design-time / test
  // hosts — bail gracefully without throwing so the FSM still terminates.
  var platform = ctx && ctx.platform;
  if (!platform || typeof platform.endGame !== 'function' || typeof platform.getCallbackUrl !== 'function') {
    ctx.log('hvcd:match-end:no-platform', 'skipping endGame dispatch (no ctx.platform bound)');
    return;
  }

  var callbackUrl = platform.getCallbackUrl();

  // Idempotency key must be stable across both seats (T2 consensus dedupes
  // retries from the same seat on the platform side). Prefer the sessionId
  // when the host wires it (matches the canonical `${sessionId}-end` shape
  // from the task spec); fall back to a content-stable key derived from the
  // payload so honest play on both seats lands on the same key when no
  // sessionId is available.
  var canonical = canonicalStringify(payload);
  var sessionId = (ctx && ctx.session && typeof ctx.session.id === 'string') ? ctx.session.id : null;
  var idempotencyKey = sessionId
    ? (sessionId + '-end')
    : ('hvcd::' + outcome + '::' + totalShowdownFrames + '::' + turnCount + '::' + p1Hp + '::' + p2Hp);

  // Fire-and-forget per task spec: platform's edge-fn ack resolves
  // asynchronously and the terminal state has nothing to do with the
  // response (delivery is retried by the platform per session-api.md §
  // Retry). Don't block state-enter on the promise.
  try {
    var p = platform.endGame({
      callbackUrl: callbackUrl,
      payload: JSON.parse(canonical), // canonicalStringify round-trip for stable key order
      idempotencyKey: idempotencyKey,
    });
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        ctx.log('endGame failed:', err && err.message ? err.message : String(err));
      });
    }
  } catch (err) {
    ctx.log('endGame failed:', err && err.message ? err.message : String(err));
  }
};

exports.StateUpdate = function (ctx, dt, state) {
  // no-op
};

exports.StateExit = function (ctx, state) {
  // terminal — exit not expected during a normal session.
};

exports.StateInput = function (input, ctx, state) {
  // terminal — no inputs consumed.
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSingletonMe(world, subtype) {
  if (!world || !world.entities) return null;
  var iter = world.entities.all ? world.entities.all() : world.entities;
  var found = null;
  if (iter.forEach) iter.forEach(function (e) { if (!found && e.subtype === subtype) found = e; });
  else for (var i = 0; i < iter.length; i++) if (iter[i].subtype === subtype) { found = iter[i]; break; }
  return found;
}

function findPerSeatMe(world, subtype, seatId) {
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

function emitResolverEventMe(ctx, event) {
  var bus = ctx.world && (ctx.world.events || ctx.world.eventBus);
  if (bus && typeof bus.emit === 'function') {
    bus.emit('resolverEvents', event);
  } else {
    ctx.log('hvcd:event', event.kind);
  }
}

/**
 * Build the inline replay blob per OQ-12.
 *
 * Shape per hvcd-tabletop-contracts/open-questions.md OQ-12 resolution:
 *   {
 *     moduleRepo, moduleVersion,
 *     matchConfig: { heroes, mode, seats },
 *     rngSeed,
 *     commits: Array<{ turn, seat, slots: SequenceSlot[] }>,
 *     metadata: { startedAt, endedAt, outcome }
 *   }
 *
 * Sources:
 *   - moduleRepo / moduleVersion: read from manifest if attached to ctx, else
 *     from a module-local default. The manifest is module-manifest.json at
 *     the repo root — we don't `require` it from a sandboxed state script
 *     (path-resolution differs per host), so we accept ctx.manifest if the
 *     host populates it and fall back to a sentinel.
 *   - matchConfig.heroes: per-seat hero entity heroId.
 *   - matchConfig.seats: ['p1','p2'] — fixed for HVCD.
 *   - matchConfig.mode: 'casual' (HVCD MVP only ships casual).
 *   - rngSeed: read from timeline.props.rngSeed if present (match-setup is
 *     responsible for seeding it; currently a B2 stub — see match-setup.ts).
 *   - commits: read from `timeline.customData.commitLog`, an append-only
 *     Array<{ turn, seat, slots: SequenceSlot[] }> populated by
 *     scripts/states/commit.ts on each commit -> reveal lock-in. Both seats
 *     observe the same input stream and apply the same deterministic
 *     mutations, so the log is byte-identical across seats.
 *   - metadata.startedAt / endedAt: read from timeline if tracked, else null.
 */
function buildReplayBlob(ctx, world, summary) {
  var manifest = (ctx && ctx.manifest) || {};
  var moduleRepo = (typeof manifest.repo === 'string' && manifest.repo)
    ? manifest.repo
    : 'yugao-gaos/TTL-HeroVersusCardDuel';
  var moduleVersion = (typeof manifest.version === 'string' && manifest.version)
    ? manifest.version
    : '0.3.0';

  var p1Hero = findPerSeatMe(world, 'hvcd.hero', 'p1');
  var p2Hero = findPerSeatMe(world, 'hvcd.hero', 'p2');
  var p1HeroId = p1Hero && p1Hero.props && typeof p1Hero.props.heroId === 'string' ? p1Hero.props.heroId : null;
  var p2HeroId = p2Hero && p2Hero.props && typeof p2Hero.props.heroId === 'string' ? p2Hero.props.heroId : null;

  var timeline = findSingletonMe(world, 'hvcd.timeline');
  var rngSeed = null;
  var startedAt = null;
  var endedAt = null;
  if (timeline && timeline.props) {
    if (typeof timeline.props.rngSeed === 'string') rngSeed = timeline.props.rngSeed;
    else if (typeof timeline.props.rngSeed === 'number') rngSeed = String(timeline.props.rngSeed);
    if (typeof timeline.props.startedAt === 'string' || typeof timeline.props.startedAt === 'number') {
      startedAt = timeline.props.startedAt;
    }
    if (typeof timeline.props.endedAt === 'string' || typeof timeline.props.endedAt === 'number') {
      endedAt = timeline.props.endedAt;
    }
  }

  // Pull the deterministic commit log appended on each commit -> reveal
  // edge by scripts/states/commit.ts. Defensively shape entries so the
  // canonical hash inputs are stable even if upstream pushes extra fields.
  var commits = readCommitLog(timeline);

  // Per session-api.md § HVCD-specific payload shape, the inline replay
  // artifact uses the canonical `HvcdReplayArtifact` shape — schemaVersion
  // / format / pin / session / seats / events / turns. The legacy
  // moduleRepo / matchConfig / commits keys are folded into the new
  // schema (matchConfig dropped — heroes go on `seats`; commits become
  // `turns`).
  var sessionId = (ctx && ctx.session && typeof ctx.session.id === 'string') ? ctx.session.id : null;
  return {
    schemaVersion: 1,
    format: 'hvcd-replay@v1',
    pin: {
      moduleId: 'hvcd',
      moduleVersion: moduleVersion,
      commitSha: typeof manifest.commitSha === 'string' ? manifest.commitSha : null,
      contractsCommitSha: typeof manifest.contractsCommitSha === 'string' ? manifest.contractsCommitSha : null,
      platformVersion: typeof manifest.platformVersion === 'string' ? manifest.platformVersion : null,
      // Provenance of the source repo for downstream debug / dashboard use.
      moduleRepo: moduleRepo,
    },
    session: {
      sessionId: sessionId,
      startedAt: startedAt,
      endedAt: endedAt,
      rngSeed: rngSeed,
    },
    seats: [
      { seatId: 'p1', heroId: p1HeroId },
      { seatId: 'p2', heroId: p2HeroId },
    ],
    // Resolver event log — match-end runs after showdown/pause-or-end so
    // the live event stream has already been emitted by those states. We
    // don't currently mirror it to timeline.customData (B5 captured commits
    // only); leave as an empty list and let downstream replay tooling
    // reconstruct from the commit log + canonical resolver. Tracked as
    // followup TODO when replay-event capture lands.
    events: [],
    // Per-seat per-turn commits (B5 capture).
    turns: commits,
    // Self-describing summary for replay readers.
    result: {
      outcome: summary.outcome,
      finalHp: { p1: summary.p1Hp, p2: summary.p2Hp },
      totalShowdownFrames: summary.totalShowdownFrames,
      turnCount: summary.turnCount,
    },
  };
}

/**
 * Read the per-match commit log off the timeline entity. The log lives at
 * `timeline.customData.commitLog` and is populated by scripts/states/commit.ts
 * each time both seats lock in their commit-phase sequences (one entry per
 * seat per turn). Returns a defensively-shaped array — entries with missing
 * fields are coerced to schema-valid sentinels so canonicalStringify produces
 * a stable hash even on partial / corrupted state.
 */
function readCommitLog(timeline) {
  if (!timeline || !timeline.customData) return [];
  var raw = timeline.customData.commitLog;
  if (!Array.isArray(raw)) return [];
  var out = new Array(raw.length);
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i] || {};
    out[i] = {
      turn: typeof e.turn === 'number' ? e.turn : 0,
      seat: e.seat === 'p1' || e.seat === 'p2' ? e.seat : 'p1',
      slots: Array.isArray(e.slots) ? e.slots : [],
    };
  }
  return out;
}

/**
 * Build the `perSeat` slice of HvcdMatchResult — heroId + inventoryEnd
 * (+ optional deckDelta when roguelike pickups land).
 *
 * heroId comes from the hvcd.hero entity per seat. inventoryEnd comes from
 * the per-run inventory snapshot stored on `timeline.customData.runState`
 * (populated and updated by scripts/items/triggers.ts via match-setup +
 * commit + pause-or-end). When no run state is present (legacy match
 * without items wired), falls back to an empty inventory — keeps the
 * payload schema-valid even on partially-bound modules.
 */
function buildPerSeat(world) {
  var p1Hero = findPerSeatMe(world, 'hvcd.hero', 'p1');
  var p2Hero = findPerSeatMe(world, 'hvcd.hero', 'p2');
  var p1HeroId = p1Hero && p1Hero.props && typeof p1Hero.props.heroId === 'string'
    ? p1Hero.props.heroId
    : (p1Hero && p1Hero.props && typeof p1Hero.props.slug === 'string' ? p1Hero.props.slug : 'unknown');
  var p2HeroId = p2Hero && p2Hero.props && typeof p2Hero.props.heroId === 'string'
    ? p2Hero.props.heroId
    : (p2Hero && p2Hero.props && typeof p2Hero.props.slug === 'string' ? p2Hero.props.slug : 'unknown');

  var timeline = findSingletonMe(world, 'hvcd.timeline');
  var runState = (timeline && timeline.customData && timeline.customData.runState) || null;
  var p1Inv = readInventoryEnd(runState, 'p1');
  var p2Inv = readInventoryEnd(runState, 'p2');

  return {
    p1: { heroId: p1HeroId, inventoryEnd: p1Inv },
    p2: { heroId: p2HeroId, inventoryEnd: p2Inv },
  };
}

/**
 * Read a seat's inventoryEnd from the runState slice. `usages` mirrors
 * `chargesRemaining` (null for passives). Defensively shape entries so a
 * partial / corrupted runState produces a schema-valid empty list rather
 * than crashing the end-game payload build.
 */
function readInventoryEnd(runState, seatId) {
  if (!runState || !runState.seats || !runState.seats[seatId]) return [];
  var raw = runState.seats[seatId].runItems;
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i] || {};
    if (typeof e.itemId !== 'string') continue;
    out.push({
      itemId: e.itemId,
      usages: typeof e.chargesRemaining === 'number' ? e.chargesRemaining : null,
    });
  }
  return out;
}

/**
 * Canonical JSON serializer — sorts object keys recursively, leaves arrays
 * in document order, and coerces undefined to absent (JSON.stringify's
 * behavior). Matches the spirit of JCS / RFC 8785's key-ordering rule so
 * both seats produce byte-identical output given byte-identical input.
 *
 * The platform edge fn hashes with its own canonicalizer
 * (supabase/functions/_shared/endGameLogic.ts `hashPayloadCanonical`),
 * which also sorts keys — so any ordering we pick that matches
 * determinism-by-sort is safe. We stringify once here purely to force
 * stable insertion order on the object we pass to `endGame()`, defending
 * against non-canonical hashers in future platform versions.
 */
function canonicalStringify(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    var parts = [];
    for (var i = 0; i < value.length; i++) {
      parts.push(canonicalStringify(value[i] === undefined ? null : value[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (typeof value === 'object') {
    var keys = Object.keys(value).sort();
    var out = [];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var v = value[key];
      if (v === undefined) continue;
      out.push(JSON.stringify(key) + ':' + canonicalStringify(v));
    }
    return '{' + out.join(',') + '}';
  }
  return 'null';
}
