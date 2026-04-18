exports.editor = {
  kindId: 'meeple',
  render: function(ctx) {
    return [
      ctx.note('Meeples use the custom kind registry pipeline.'),
      ctx.group('Meeple Setup', [
        ctx.field('props.role'),
        ctx.field('props.moveSpeed'),
        ctx.field('props.actionPoints'),
        ctx.commonSection('visual'),
        ctx.commonSection('tags'),
        ctx.rawJson('Open Meeple JSON')
      ])
    ];
  }
};
