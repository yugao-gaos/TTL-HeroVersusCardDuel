/**
 * HVCD trait: hvcd.cancelWindow
 *
 * Marker trait: this entity carries a cancelWindow (combat-system.md §3c).
 * Enables the cabinet renderer to surface cancel points in the sequence lane
 * and enables the commit UI to offer the "Arm Cancel" toggle when the
 * cancelWindow has a defined rageCost (per §6 and §15 card slot rules).
 *
 * Fire rules (summary, authoritative in §13):
 *   1. armed → fires unconditionally at `cancelWindow.frame`.
 *   2. hitCancel && prior connect → fires.
 *   3. otherwise → does not fire.
 */
exports.trait = {
  id: 'hvcd.cancelWindow',
  label: 'Cancel Window',
  applyToEntity: function (entity, _input, _ctx) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('hvcd-cancel-window') === -1) tags.push('hvcd-cancel-window');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      hvcdCancelWindow: true,
    });
    return entity;
  },
};
