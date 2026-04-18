/**
 * HVCD kind: token
 *
 * Tokens on the shared timeline, per combat-system.md §5 + OQ-32.
 * Consumption granularity is **per-kind** (not uniform per-frame):
 *
 *   - Window tokens (10), placed on dequeue:
 *       hit, grab, projectile, parry, effect,
 *       block, armor, evasion, reflect, cancel
 *
 *     Multi-frame / fires-once kinds (hit, grab, projectile, parry, evasion,
 *     reflect, effect) are **one logical token** with `frame..frameEnd`
 *     internal structure. The per-frame chip visualization in the UI is a
 *     rendering choice, not a reflection of multiple token instances.
 *
 *     Per-frame kinds (block, armor) place one token per frame — each
 *     frame independently absorbs. Cancel is single-frame.
 *
 *   - Status tokens (2), spawned by the resolver:
 *       stun, knockdown  (per-frame)
 *   - Lifecycle token (1):
 *       effect-end       (single-frame)
 *
 * Plus one match-scoped floating token:
 *       projectile (in-flight; match-scoped, not seat-scoped — §9)
 *
 * Render note: in the cabinet UI (renderer-slots.md), tokens appear as
 * chips placed along the timeline rail. The token kind determines chip
 * color/icon. Owner seat + globalFrame (+ frameEnd for windows) place the
 * chip span.
 */
exports.kind = {
  id: 'hvcd.token',
  label: 'HVCD Token',
  extendsKindId: null,
  engineKind: 'token',
  hiddenKind: false,
  fields: [
    {
      path: 'props.tokenKind',
      label: 'Token Kind',
      type: 'select',
      options: [
        // Window tokens
        { value: 'hit',         label: 'hit (window)'         },
        { value: 'grab',        label: 'grab (window)'        },
        { value: 'projectile',  label: 'projectile (window/in-flight)' },
        { value: 'parry',       label: 'parry (window)'       },
        { value: 'effect',      label: 'effect (window)'      },
        { value: 'block',       label: 'block (window)'       },
        { value: 'armor',       label: 'armor (window)'       },
        { value: 'evasion',     label: 'evasion (window)'     },
        { value: 'reflect',     label: 'reflect (window)'     },
        { value: 'cancel',      label: 'cancel (window)'      },
        // Status tokens
        { value: 'stun',        label: 'stun (status)'        },
        { value: 'knockdown',   label: 'knockdown (status)'   },
        // Lifecycle token
        { value: 'effect-end',  label: 'effect-end (lifecycle)' },
      ],
    },
    {
      path: 'props.seat',
      label: 'Seat (p1|p2; omit for projectile in-flight)',
      type: 'select',
      options: [
        { value: 'p1', label: 'p1' },
        { value: 'p2', label: 'p2' },
      ],
    },
    {
      path: 'props.frame',
      label: 'Global Frame',
      type: 'number',
      min: 0,
      step: 1,
      description: 'First active global frame.',
    },
    {
      path: 'props.frameEnd',
      label: 'Window End Frame (inclusive; omit for single-frame)',
      type: 'number',
      min: 0,
      step: 1,
      description:
        'Last active global frame for multi-frame window kinds (hit, grab, projectile, parry, evasion, reflect, effect). Omit for per-frame or single-frame kinds.',
    },
    {
      path: 'props.cardId',
      label: 'Source Card ID (omit for spacer / status / projectile-in-flight)',
    },
    {
      path: 'props.effectId',
      label: 'Effect ID (effect / effect-end only)',
    },
    {
      path: 'props.payload',
      label: 'Payload',
      type: 'json',
      description:
        'Per-kind payload: damage, hits, hitStun, blockStun, knockdown, defenseBreaker, travelFrames, absorbs, reflectTravel, hitCancel, armed, fromPool, target, duration. See combat-system.md §5 Token model.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-token') === -1) tags.push('hvcd-token');
    var kindTag = 'hvcd-token-' + (typeof props.tokenKind === 'string' ? props.tokenKind : 'unknown');
    if (tags.indexOf(kindTag) === -1) tags.push(kindTag);
    return {
      kind: 'token',
      subtype: 'hvcd.token',
      label: data.label || input.label || 'HVCD Token',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: {
        grabbable: false,
        collidable: false,
        gravity: false,
      },
      props: {
        tokenKind: typeof props.tokenKind === 'string' ? props.tokenKind : 'stun',
        seat: typeof props.seat === 'string' ? props.seat : null,
        frame: typeof props.frame === 'number' ? props.frame : 0,
        cardId: typeof props.cardId === 'string' ? props.cardId : null,
        effectId: typeof props.effectId === 'string' ? props.effectId : null,
        payload: props.payload || {},
      },
      customData: data.customData || {},
    };
  },
};

// ---------------------------------------------------------------------------
// Per-kind interaction rules (combat-system.md §5).
//
// The pure-function core lives in scripts/resolver/ (combat.ts, projectiles.ts,
// tokens.ts). This kind file re-exports the key entry points so a consuming
// state script can dispatch on tokenKind without importing the resolver
// directly — matches the "distributed across per-object scripts" architecture
// per the user guidance.
// ---------------------------------------------------------------------------
// @ts-ignore
var tokensLib = require('../resolver/tokens');
// @ts-ignore
var combatLib = require('../resolver/combat');
// @ts-ignore
var projectilesLib = require('../resolver/projectiles');

exports.tokens = {
  placeToken: tokensLib.placeToken,
  hasToken: tokensLib.hasToken,
  tokensAt: tokensLib.tokensAt,
  anyTokenInRange: tokensLib.anyTokenInRange,
  removeTokens: tokensLib.removeTokens,
  isSuppressed: tokensLib.isSuppressed,
  carryoverExtent: tokensLib.carryoverExtent,
};

/**
 * Per-kind hit/defense interaction dispatch. For a given attack token kind,
 * returns the combat step that should run. Consumer (the timeline driver)
 * invokes them in combat-system.md §5 frame-loop order.
 *
 *   hit / grab / parry  -> combatLib.resolveAttack
 *   projectile (token)  -> projectilesLib.launchProjectile (launch step)
 *                           + projectilesLib.resolveArrivals (arrival step)
 *   effect              -> effect registry activation (see
 *                           scripts/resolver/world.ts resolveEffectActivationsAndEnds)
 *   block / armor /
 *     evasion / reflect -> defensive; consumed inside combatLib.resolveAttack
 *   cancel              -> scripts/resolver/world.ts resolveCancelTokens
 *   stun / knockdown /
 *     effect-end        -> status tokens; lifecycle events only (§5)
 */
exports.resolveHit = combatLib.resolveAttack;
exports.resolveMutualClash = combatLib.processMutualClash;
exports.cancelDefenderCard = combatLib.cancelDefenderCard;
exports.placeStun = combatLib.placeStun;
exports.launchProjectile = projectilesLib.launchProjectile;
exports.resolveProjectileClashes = projectilesLib.resolveClashes;
exports.resolveProjectileArrivals = projectilesLib.resolveArrivals;
