/**
 * HVCD trait: hvcd.rageCost
 *
 * Marker trait that exposes the `props.rageVariant.rageCost` field as a
 * queryable, editor-visible attribute on an entity. Does NOT perform the
 * deduction — rage is deducted at commit time by the commit state script
 * (combat-system.md §6 Commit point).
 *
 * Tagged entities pick up the `hvcd-rage-cost` tag so the cabinet renderer
 * can highlight rage-gated cards (EX / Super) visually.
 */
exports.trait = {
  id: 'hvcd.rageCost',
  label: 'Rage Cost',
  applyToEntity: function (entity, _input, _ctx) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('hvcd-rage-cost') === -1) tags.push('hvcd-rage-cost');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      hvcdRageCost: true,
    });
    return entity;
  },
};
