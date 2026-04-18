/**
 * HVCD trait: hvcd.ownerOnlyVisible
 *
 * Marker trait: this entity's presentation is private to its owner seat.
 * Used by the inventory rack and the hidden (face-down) sequence lane
 * slot preview. Maps to the `privacy: 'owner-only'` renderer-slot flag
 * from hvcd-tabletop-contracts/game-module-manifest.md.
 *
 * NOTE(OQ-18 unresolved): client-only enforcement is insufficient for
 * inventory bluff (combat-system.md §12 opponent visibility). Full
 * solution needs a network-level private channel; until then, this trait
 * only affects client-side render hiding. Track B2 (or a later track)
 * must coordinate with the platform on network-level enforcement.
 */
exports.trait = {
  id: 'hvcd.ownerOnlyVisible',
  label: 'Owner-Only Visible',
  applyToEntity: function (entity, _input, _ctx) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('hvcd-owner-only') === -1) tags.push('hvcd-owner-only');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      hvcdOwnerOnly: true,
    });
    return entity;
  },
};
