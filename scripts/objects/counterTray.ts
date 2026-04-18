/**
 * HVCD board-object script: counterTray (HP / Rage / Pool, per seat)
 *
 * Owns (per combat-system.md §2, §6):
 *   - HP mutation on damage events
 *   - Rage gain on damage taken (1:1)
 *   - Rage spend on variant cost / cancel arming
 *   - Block pool consumption on spacer commit / block-stun extension
 *   - Between-showdown refill (block pool → 6, hand → HAND_SIZE)
 *
 * One instance per seat per tray kind (one HP tray, one rage tray, one pool
 * tray per seat — or a single combined tray per seat; authoring choice).
 * In this port we treat it as a combined tray: one `hvcd.counterTray` per
 * seat holding all three counters plus the inventory list.
 *
 * State storage (per user guidance): counters live as scalar props on the
 * tray entity; inventory is an array under `props.inventory`. The tray's
 * visual representation (chips in slots) is a B3 slot concern.
 */
// @ts-ignore
var economy = require('../resolver/economy');

exports.kind = {
  id: 'hvcd.counterTray',
  label: 'HVCD Counter Tray (per seat)',
  extendsKindId: null,
  engineKind: 'token',
  fields: [
    {
      path: 'props.ownerSeat',
      label: 'Owner Seat',
      type: 'select',
      options: [
        { value: 'p1', label: 'p1' },
        { value: 'p2', label: 'p2' },
      ],
    },
    {
      path: 'props.hp',
      label: 'HP',
      type: 'number',
      min: 0,
      step: 1,
    },
    {
      path: 'props.rage',
      label: 'Rage',
      type: 'number',
      min: 0,
      step: 1,
    },
    {
      path: 'props.blockPool',
      label: 'Block Pool',
      type: 'number',
      min: 0,
      max: 6,
      step: 1,
    },
    {
      path: 'props.inventory',
      label: 'Inventory',
      type: 'json',
      description: 'Array of { itemId, usages }. Private to the owning seat.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-counter-tray') === -1) tags.push('hvcd-counter-tray');
    return {
      kind: 'token',
      subtype: 'hvcd.counterTray',
      label: data.label || input.label || 'HVCD Counter Tray',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: { grabbable: false, collidable: false },
      props: {
        ownerSeat: typeof props.ownerSeat === 'string' ? props.ownerSeat : 'p1',
        hp: typeof props.hp === 'number' ? props.hp : 8,
        rage: typeof props.rage === 'number' ? props.rage : 0,
        blockPool: typeof props.blockPool === 'number' ? props.blockPool : 6,
        inventory: Array.isArray(props.inventory) ? props.inventory : [],
      },
      customData: data.customData || {},
    };
  },
};

/**
 * Refill block pool to 6 between showdowns (§2). Called from
 * scripts/states/pause-or-end.ts on entry.
 */
exports.refillBetweenShowdowns = function (ctx, trayEntityId) {
  var world = ctx.world;
  var tray = world.entities.get(trayEntityId);
  if (!tray) return;
  tray.props = tray.props || {};
  tray.props.blockPool = 6;
  ctx.log('hvcd:counterTray:refilled', trayEntityId);
};

/**
 * Write back final counters from the showdown run onto the ECS tray entity.
 */
exports.writeBack = function (ctx, trayEntityId, seatState) {
  var world = ctx.world;
  var tray = world.entities.get(trayEntityId);
  if (!tray) return;
  tray.props = tray.props || {};
  tray.props.hp = seatState.hp;
  tray.props.rage = seatState.rage;
  tray.props.blockPool = seatState.blockPool;
  tray.props.inventory = seatState.inventory;
};

// Reuse the library-side mutators so the per-frame combat code and the
// ECS-binding code share one implementation.
exports.applyDamage = economy.applyDamage;
exports.restoreHp = economy.restoreHp;
exports.grantRage = economy.grantRage;
exports.consumeBlockPool = economy.consumeBlockPool;
exports.refillBlockPool = economy.refillBlockPool;
