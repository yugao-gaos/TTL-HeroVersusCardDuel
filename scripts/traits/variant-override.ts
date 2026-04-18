/**
 * HVCD trait: hvcd.variantOverride
 *
 * Marker trait: this entity (card / item) may carry a `props.rageVariant`
 * payload that overrides the base card's windows when `mode === 'variant'`.
 * Per combat-system.md §7 inheritance rule:
 *   - attackWindows / defenseWindows override at the sub-key level; set a
 *     key to null to remove from the variant.
 *   - cancelWindow replaces wholesale.
 *   - totalFrames overrides if present.
 *
 * The resolver (Track B2) performs the merge at commit time when it
 * resolves a slot to a concrete played card.
 */
exports.trait = {
  id: 'hvcd.variantOverride',
  label: 'Variant Override',
  applyToEntity: function (entity, _input, _ctx) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('hvcd-variant-override') === -1) tags.push('hvcd-variant-override');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      hvcdVariantOverride: true,
    });
    return entity;
  },
};
