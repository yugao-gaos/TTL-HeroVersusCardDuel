exports.trait = {
  id: 'stackable',
  applyToEntity: function(entity) {
    var tags = Array.isArray(entity.tags) ? entity.tags.slice() : [];
    if (tags.indexOf('stackable') === -1) tags.push('stackable');
    entity.tags = tags;
    entity.customData = Object.assign({}, entity.customData || {}, {
      stackable: true,
    });
    return entity;
  }
};
