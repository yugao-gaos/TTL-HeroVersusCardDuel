exports.onSpawn = function(entityId, ctx) {
  var current = ctx.world.customData.get(entityId) || {};
  ctx.world.customData.set(entityId, Object.assign({}, current, {
    demoRuleAttached: true,
  }));
};

exports.onEnterZone = function(entityId, zoneId, ctx) {
  ctx.log('piece-entered-zone', entityId, zoneId);
};
