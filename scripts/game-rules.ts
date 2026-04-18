exports.onTick = function(ctx, dt) {
  // Template global rules hook.
};

exports.onEvent = function(type, payload, ctx) {
  if (type === 'entity_spawned') {
    ctx.log('spawned', payload);
  }
};
