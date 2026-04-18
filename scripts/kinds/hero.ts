/**
 * HVCD kind: hero
 *
 * A hero is the per-seat fighter identity (avatar, base stats, starter deck).
 * In combat terms, the hero sits on the cabinet's monitor mesh — most of what
 * happens during a match is to the hero's HP / rage / block pool (see
 * combat-system.md §1, §2).
 *
 * Persistent hero state (HP, rage, etc.) lives on the ECS runtime under the
 * hero entity's `customData`. Static data (baseHp, baseRage, portrait, starter
 * deck ids, starter inventory ids) is authored per hero in a blueprint.
 *
 * Mapping to HVCD source data:
 *   - slug / name / description / base_hp / base_rage / base_block
 *     mirror heroTypes.ts and the `heroes` DB table.
 *   - Starter deck is enumerated here (migrated from
 *     20260416120000_card_frame_model.sql). Resolver uses these cardIds to
 *     build the initial draw pile at match-setup.
 *   - Starter inventory mirrors 20260417000000_items_and_progression.sql.
 */
exports.kind = {
  id: 'hvcd.hero',
  label: 'HVCD Hero',
  extendsKindId: null,
  engineKind: 'token',
  fields: [
    { path: 'label', label: 'Display Name' },
    { path: 'props.slug', label: 'Hero Slug (lowercase, stable id)' },
    { path: 'props.description', label: 'Description', type: 'textarea' },
    {
      path: 'props.baseHp',
      label: 'Base HP',
      type: 'number',
      min: 1,
      step: 1,
    },
    {
      path: 'props.baseRage',
      label: 'Base Rage',
      type: 'number',
      min: 0,
      step: 1,
    },
    {
      path: 'props.baseBlock',
      label: 'Base Block Bonus',
      type: 'number',
      min: 0,
      step: 1,
      description:
        'Starting block pool = 6 + baseBlock. Used by Terra for bonus guard.',
    },
    {
      path: 'props.portraitPath',
      label: 'Portrait',
      type: 'asset-image',
    },
    {
      path: 'props.fullbodyPath',
      label: 'Full Body Art',
      type: 'asset-image',
    },
    {
      path: 'props.starterDeck',
      label: 'Starter Deck (card ids with counts)',
      type: 'json',
      description:
        'Array of { cardId, count }. Sum should equal hero deck size (~12). See 20260416120000_card_frame_model.sql for original values.',
    },
    {
      path: 'props.starterInventory',
      label: 'Starter Inventory (item ids)',
      type: 'json',
      description:
        'Array of itemIds granted at run-start. See 20260417000000_items_and_progression.sql.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-hero') === -1) tags.push('hvcd-hero');
    return {
      kind: 'token',
      subtype: 'hvcd.hero',
      label: data.label || input.label || 'HVCD Hero',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: {
        grabbable: false,
        collidable: false,
      },
      props: {
        slug: typeof props.slug === 'string' ? props.slug : '',
        description: typeof props.description === 'string' ? props.description : '',
        baseHp: typeof props.baseHp === 'number' ? props.baseHp : 30,
        baseRage: typeof props.baseRage === 'number' ? props.baseRage : 0,
        baseBlock: typeof props.baseBlock === 'number' ? props.baseBlock : 0,
        portraitPath: typeof props.portraitPath === 'string' ? props.portraitPath : null,
        fullbodyPath: typeof props.fullbodyPath === 'string' ? props.fullbodyPath : null,
        starterDeck: Array.isArray(props.starterDeck) ? props.starterDeck : [],
        starterInventory: Array.isArray(props.starterInventory) ? props.starterInventory : [],
      },
      customData: data.customData || {},
    };
  },
};
