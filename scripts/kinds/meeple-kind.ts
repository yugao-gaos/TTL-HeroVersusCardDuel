exports.kind = {
  id: 'meeple',
  label: 'Meeple',
  traits: ['stackable'],
  fields: [
    {
      path: 'label',
      label: 'Runtime Label'
    },
    {
      path: 'props.role',
      label: 'Role',
      type: 'select',
      options: [
        { value: 'worker', label: 'Worker' },
        { value: 'scout', label: 'Scout' },
        { value: 'leader', label: 'Leader' }
      ]
    },
    {
      path: 'props.moveSpeed',
      label: 'Move Speed',
      type: 'number',
      min: 1,
      step: 1
    },
    {
      path: 'props.actionPoints',
      label: 'Action Points',
      type: 'number',
      min: 0,
      step: 1
    }
  ],
  commonSections: ['visual', 'tags', 'customData'],
  buildEntity: function(input) {
    var data = input.data || {};
    var props = data.props || {};
    var visual = data.visual || {};
    var role = typeof props.role === 'string' ? props.role : 'worker';
    var colors = {
      worker: '#f59e0b',
      scout: '#3b82f6',
      leader: '#8b5cf6'
    };
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('meeple') === -1) tags.push('meeple');
    return {
      kind: 'meeple',
      label: typeof data.label === 'string' ? data.label : (input.label || 'Meeple'),
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      visual: {
        color: typeof visual.color === 'string' ? visual.color : (colors[role] || '#f59e0b'),
        texture: typeof visual.texture === 'string' ? visual.texture : undefined,
        modelUrl: typeof visual.modelUrl === 'string' ? visual.modelUrl : undefined,
        scaleX: typeof visual.scaleX === 'number' ? visual.scaleX : 0.35,
        scaleY: typeof visual.scaleY === 'number' ? visual.scaleY : 0.7,
        scaleZ: typeof visual.scaleZ === 'number' ? visual.scaleZ : 0.35
      },
      props: {
        role: role,
        moveSpeed: typeof props.moveSpeed === 'number' ? props.moveSpeed : 2,
        actionPoints: typeof props.actionPoints === 'number' ? props.actionPoints : 1
      },
      customData: data.customData || {}
    };
  },
  onSpawn: function(entityId, ctx) {
    var current = ctx.world.customData.get(entityId) || {};
    ctx.world.customData.set(entityId, Object.assign({}, current, {
      kindSpawned: 'meeple'
    }));
  }
};
