/**
 * HVCD board-object script: sideArea (per seat)
 *
 * Owns (per combat-system.md §9, §11):
 *   - Parking cards for in-flight projectiles
 *   - Parking cards for standing effects
 *   - Tether lifecycle — card is released back to discard / inventory when
 *     its tether (projectile token or effect-end token) leaves the timeline
 *
 * One instance per seat. Structurally a list of `{ cardId, reason, tether }`
 * entries. Storage lives on the sideArea entity's `customData.parked`.
 *
 * The parking / release logic is driven by the timeline object during the
 * showdown pass. This script is the ECS binding + helpers for the state
 * scripts to read / write the parked list.
 */
exports.kind = {
  id: 'hvcd.sideArea',
  label: 'HVCD Side Area (per seat)',
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
      path: 'props.parked',
      label: 'Parked Cards',
      type: 'json',
      description:
        'Array of { cardId: string, reason: "projectile" | "standing-effect", tether: string }.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-side-area') === -1) tags.push('hvcd-side-area');
    return {
      kind: 'token',
      subtype: 'hvcd.sideArea',
      label: data.label || input.label || 'HVCD Side Area',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: { grabbable: false, collidable: false },
      props: {
        ownerSeat: typeof props.ownerSeat === 'string' ? props.ownerSeat : 'p1',
        parked: Array.isArray(props.parked) ? props.parked : [],
      },
      customData: data.customData || {},
    };
  },
};

/** Park a card while its tether is live. */
exports.park = function (sideAreaProps, cardId, reason, tether) {
  sideAreaProps.parked = sideAreaProps.parked || [];
  sideAreaProps.parked.push({ cardId: cardId, reason: reason, tether: tether });
};

/** Release the card bound to `tether` (e.g. projectile id or effect-end id). */
exports.release = function (sideAreaProps, tether) {
  sideAreaProps.parked = sideAreaProps.parked || [];
  for (var i = sideAreaProps.parked.length - 1; i >= 0; i--) {
    if (sideAreaProps.parked[i].tether === tether) {
      var removed = sideAreaProps.parked[i];
      sideAreaProps.parked.splice(i, 1);
      return removed;
    }
  }
  return null;
};

exports.listParked = function (sideAreaProps) {
  return sideAreaProps.parked || [];
};

/** Write back the final parked list from SeatState after a showdown pass. */
exports.writeBack = function (ctx, sideAreaEntityId, seatState) {
  var world = ctx.world;
  var ent = world.entities.get(sideAreaEntityId);
  if (!ent) return;
  ent.props = ent.props || {};
  ent.props.parked = seatState.sideArea || [];
};
