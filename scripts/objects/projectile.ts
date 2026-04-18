/**
 * HVCD board-object script: projectile (match-scoped, in-flight)
 *
 * Owns (per combat-system.md §9):
 *   - In-flight projectile advancement (frame-loop step 2)
 *   - Clash resolution between opposing projectiles
 *   - Arrival resolution (frame-loop step 3) — precedence
 *     block > reflect > armor > damage (parry / evasion both lose)
 *   - Invincibility handling when the target has a `knockdown` token
 *   - Owner-flip on reflect
 *
 * A projectile is match-scoped (NOT per-seat): the in-flight list lives on
 * the timeline entity's `customData.projectiles`. Each projectile knows its
 * owner, source card id, spawn/arrival frames, hits, damage, and flags.
 *
 * The pure-function core is scripts/resolver/projectiles.ts. This script
 * exposes the projectile kind and thin helpers for the timeline driver.
 */
// @ts-ignore
var projectileLib = require('../resolver/projectiles');

exports.kind = {
  id: 'hvcd.projectile',
  label: 'HVCD Projectile (in-flight)',
  extendsKindId: null,
  engineKind: 'token',
  fields: [
    { path: 'props.projectileId', label: 'Projectile ID' },
    {
      path: 'props.ownerSeat',
      label: 'Owner Seat (mutates on reflect)',
      type: 'select',
      options: [
        { value: 'p1', label: 'p1' },
        { value: 'p2', label: 'p2' },
      ],
    },
    { path: 'props.sourceCardId', label: 'Source Card ID' },
    { path: 'props.spawnFrame', label: 'Spawn Global Frame', type: 'number', min: 0, step: 1 },
    { path: 'props.arrivalFrame', label: 'Arrival Global Frame', type: 'number', min: 0, step: 1 },
    { path: 'props.damage', label: 'Damage', type: 'number', min: 0, step: 1 },
    { path: 'props.hits', label: 'Hits Remaining', type: 'number', min: 0, step: 1 },
    { path: 'props.hitStun', label: 'Hit Stun', type: 'number', min: 0, step: 1 },
    { path: 'props.defenseBreaker', label: 'Defense Breaker', type: 'checkbox' },
    { path: 'props.knockdown', label: 'Knockdown', type: 'checkbox' },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-projectile') === -1) tags.push('hvcd-projectile');
    return {
      kind: 'token',
      subtype: 'hvcd.projectile',
      label: data.label || input.label || 'HVCD Projectile',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      tags: tags,
      traits: { grabbable: false, collidable: false, gravity: false },
      props: {
        projectileId: typeof props.projectileId === 'string' ? props.projectileId : '',
        ownerSeat: typeof props.ownerSeat === 'string' ? props.ownerSeat : 'p1',
        sourceCardId: typeof props.sourceCardId === 'string' ? props.sourceCardId : '',
        spawnFrame: typeof props.spawnFrame === 'number' ? props.spawnFrame : 0,
        arrivalFrame: typeof props.arrivalFrame === 'number' ? props.arrivalFrame : 0,
        damage: typeof props.damage === 'number' ? props.damage : 0,
        hits: typeof props.hits === 'number' ? props.hits : 1,
        hitStun: typeof props.hitStun === 'number' ? props.hitStun : 4,
        defenseBreaker: !!props.defenseBreaker,
        knockdown: !!props.knockdown,
      },
      customData: data.customData || {},
    };
  },
};

// Re-export the pure-function projectile helpers so the timeline driver can
// call them uniformly through the object-scripts API.
exports.launchProjectile = projectileLib.launchProjectile;
exports.resolveClashes = projectileLib.resolveClashes;
exports.resolveArrivals = projectileLib.resolveArrivals;
