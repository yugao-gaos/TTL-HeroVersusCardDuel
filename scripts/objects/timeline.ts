/**
 * HVCD board-object script: timeline
 *
 * Owns (per combat-system.md §5):
 *   - cursor sweep
 *   - token precedence
 *   - cancel firing (§13)
 *   - KO check
 *   - combo-mode enforcement
 *
 * The timeline is the match-scoped entity on which all frame events live.
 * There's one instance per match. It listens for the showdown-started
 * transition, reads seat sequences from the per-seat sequence objects, then
 * runs the full showdown in one pass (OQ-5: offline mode).
 *
 * Per-object state (stored in ECS `customData` on the timeline entity):
 *   - tokens: TimelineToken[]
 *   - currentFrame: number
 *   - turnIndex: number
 *   - pendingEvents: ResolverEvent[]
 *   - projectiles: ProjectileEntity[]
 *   - activeEffects: ActiveEffect[]
 *
 * The actual frame-loop algorithm lives in scripts/resolver/world.ts — this
 * script is the thin ECS-side binding that loads state from ECS, runs the
 * pure function, and writes results back.
 */
// @ts-ignore — resolver modules use ES imports; at runtime the sandbox bundles them.
var resolverWorld = require('../resolver/world');
// @ts-ignore
var resolverTypes = require('../resolver/types');

exports.kind = {
  id: 'hvcd.timeline',
  label: 'HVCD Timeline',
  extendsKindId: null,
  engineKind: 'token',
  fields: [
    {
      path: 'props.currentFrame',
      label: 'Current Global Frame',
      type: 'number',
      min: 0,
      step: 1,
      description: 'The resolver cursor. Incremented frame-by-frame during showdown.',
    },
    {
      path: 'props.turnIndex',
      label: 'Turn Index',
      type: 'number',
      min: 0,
      step: 1,
    },
    {
      path: 'props.tokens',
      label: 'Tokens (flat list)',
      type: 'json',
      description: 'TimelineToken[] — shared-timeline atoms. See combat-system.md §5.',
    },
    {
      path: 'props.projectiles',
      label: 'In-flight Projectiles',
      type: 'json',
      description: 'ProjectileEntity[] — match-scoped (not per-seat). See §9.',
    },
    {
      path: 'props.activeEffects',
      label: 'Active Standing Effects',
      type: 'json',
      description: 'ActiveEffect[]. See §11.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-timeline') === -1) tags.push('hvcd-timeline');
    return {
      kind: 'token',
      subtype: 'hvcd.timeline',
      label: data.label || input.label || 'HVCD Timeline',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      tags: tags,
      traits: { grabbable: false, collidable: false },
      props: {
        currentFrame: typeof props.currentFrame === 'number' ? props.currentFrame : 0,
        turnIndex: typeof props.turnIndex === 'number' ? props.turnIndex : 0,
        tokens: Array.isArray(props.tokens) ? props.tokens : [],
        projectiles: Array.isArray(props.projectiles) ? props.projectiles : [],
        activeEffects: Array.isArray(props.activeEffects) ? props.activeEffects : [],
      },
      customData: data.customData || {},
    };
  },
};

/**
 * Run the showdown in offline mode. Called from the showdown state's
 * StateEntered hook.
 *
 * @param ctx ScriptContext — provides world, log
 * @param timelineEntityId the timeline entity id
 * @param lookupCard fn(cardId) -> Card — reads from the kinds/card registry
 */
exports.runShowdown = function (ctx, timelineEntityId, lookupCard, seatStates) {
  // seatStates — [SeatState, SeatState], produced by scripts/objects/sequence.ts
  var state = resolverWorld.createInitialState(seatStates);
  var result = resolverWorld.runShowdown(state, { lookupCard: lookupCard });
  ctx.log('hvcd:showdown:runShowdown', 'events=' + result.events.length, 'reason=' + result.endReason);
  return result;
};

/**
 * Cursor tick (deterministic-mode path, future use).
 * In offline mode this is unused — runShowdown runs all frames in one call.
 */
exports.tick = function (_ctx, _state) {
  // noop
};
