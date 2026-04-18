/**
 * HVCD kind: item
 *
 * Per combat-system.md §12, items are structurally cards — same attack /
 * defense / cancel window model, same rage variants — but live in the hero's
 * **inventory** rather than in the deck. Commit + dequeue + usages are the
 * item-specific layer on top of the card model.
 *
 * Implementation choice: item extends `hvcd.card`. That keeps the window /
 * variant / cancel fields shared, and item-specific fields (usages, trigger,
 * heroLock) layer on top. Inventory asymmetry rules (§12 Discarding an item
 * slot) belong in the resolver (Track B2), not in this kind definition.
 */
exports.kind = {
  id: 'hvcd.item',
  label: 'HVCD Item',
  extendsKindId: 'hvcd.card',
  engineKind: 'card',
  traits: [
    'hvcd.rageCost',
    'hvcd.cancelWindow',
    'hvcd.variantOverride',
  ],
  fields: [
    {
      path: 'props.usages',
      label: 'Usages (null = infinite)',
      type: 'number',
      min: 0,
      step: 1,
      description:
        'Integer charges or null for infinite. Decrements on dequeue per §12.',
    },
    {
      path: 'props.itemKind',
      label: 'Item Kind',
      type: 'select',
      options: [
        { value: 'passive',    label: 'Passive'    },
        { value: 'consumable', label: 'Consumable' },
      ],
      description:
        'Informational categorization inherited from HVCD. Per combat-system.md §12, all items resolve on dequeue — there is no functional difference at the resolver level.',
    },
    // OQ-35 (resolved): reactive `trigger` field removed. All items resolve
    // on dequeue per §12; legacy onTakeHit / onRoundStart / onPlayCard /
    // onRunStart / onActivate are no longer modeled.
    {
      path: 'props.heroLock',
      label: 'Hero Lock (slug)',
      description:
        'If set, only the given hero can equip this item. Starter items are hero-locked.',
    },
    {
      path: 'props.effectPayload',
      label: 'Effect Payload',
      type: 'json',
      description:
        'Free-form JSON payload describing the item\'s effect. The effect registry (combat-system.md §11) reads effectId + payload on activation.',
    },
  ],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-item') === -1) tags.push('hvcd-item');
    // Item-specific props; base card props are merged by the parent kind.
    return {
      subtype: 'hvcd.item',
      tags: tags,
      props: {
        usages: typeof props.usages === 'number' ? props.usages : null,
        itemKind: typeof props.itemKind === 'string' ? props.itemKind : 'consumable',
        // OQ-35 resolved: no `trigger` field. All items resolve on dequeue.
        heroLock: typeof props.heroLock === 'string' ? props.heroLock : null,
        effectPayload: props.effectPayload || {},
      },
    };
  },
};
