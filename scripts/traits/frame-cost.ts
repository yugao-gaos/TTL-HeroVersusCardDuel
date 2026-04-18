/**
 * HVCD trait: hvcd.frameCost
 *
 * Marker trait that acknowledges the slot's frame cost is a public (revealed)
 * attribute. Per combat-system.md §2 Reveal phase, slot frame cost is
 * published at reveal; the cabinet renderer uses it to draw the sequence
 * lane widths before identity reveals on dequeue.
 *
 * The actual frame cost comes from the resolved card's totalFrames (+ variant
 * override, if mode==='variant', per §7). This trait just tags the entity so
 * the renderer can discover it in the scene.
 */
exports.trait = {
  id: 'hvcd.frameCost',
  label: 'Frame Cost',
  applyToEntity: function (entity, _input, _ctx) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('hvcd-frame-cost') === -1) tags.push('hvcd-frame-cost');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      hvcdFrameCost: true,
    });
    return entity;
  },
};
