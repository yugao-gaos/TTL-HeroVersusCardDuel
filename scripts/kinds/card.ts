/**
 * HVCD kind: card
 *
 * Every playable HVCD card is an instance of this kind. The data model
 * matches combat-system.md §7 (authoritative spec). The shape is expressed
 * here as KindFieldDefinition entries for the kind editor UI; the actual
 * window/variant objects live in blueprints / object `overrides` as free-form
 * JSON because they're shape-polymorphic (one sub-key per window kind).
 *
 * Combat-system mapping:
 *   - totalFrames, attackWindows, defenseWindows, cancelWindow, rageVariant
 *     match §7 exactly.
 *   - Each window kind appears at most once per card (§3 "one window per kind").
 *   - `rageVariant` inherits from the base: sub-keyed override for attack /
 *     defense windows, whole-object replace for cancelWindow.
 *
 * Notes:
 *   - This kind extends TabletopLabs' built-in `card` engine kind so the
 *     base flip/deck/pile behaviors stay consistent with the renderer.
 *   - Traits attached: hvcd.rageCost, hvcd.cancelWindow, hvcd.variantOverride
 *     (see scripts/traits). These are lightweight markers; actual window
 *     expansion into timeline tokens happens in the resolver (Track B2).
 *   - The structured card-face rich text (name, description, art) uses the
 *     built-in card-face editor; body text may reference glossary terms
 *     defined in config/glossary.json.
 */
exports.kind = {
  id: 'hvcd.card',
  label: 'HVCD Card',
  extendsKindId: null,
  engineKind: 'card',
  fallbackBuiltInKind: 'card',
  traits: [
    'hvcd.rageCost',
    'hvcd.cancelWindow',
    'hvcd.variantOverride',
  ],
  fields: [
    { path: 'label', label: 'Card Name' },
    {
      path: 'props.element',
      label: 'Element',
      type: 'select',
      options: [
        { value: 'neutral',   label: 'Neutral'   },
        { value: 'fire',      label: 'Fire'      },
        { value: 'water',     label: 'Water'     },
        { value: 'earth',     label: 'Earth'     },
        { value: 'lightning', label: 'Lightning' },
      ],
    },
    {
      path: 'props.rarity',
      label: 'Rarity',
      type: 'select',
      options: [
        { value: 'common',    label: 'Common'    },
        { value: 'uncommon',  label: 'Uncommon'  },
        { value: 'rare',      label: 'Rare'      },
        { value: 'legendary', label: 'Legendary' },
      ],
    },
    { path: 'props.heroId',      label: 'Hero Lock (optional hero slug)' },
    {
      path: 'props.totalFrames',
      label: 'Total Frames',
      type: 'number',
      min: 1,
      step: 1,
      description: 'Base card duration in frames. Variant may override.',
    },
    {
      path: 'props.attackWindows',
      label: 'Attack Windows (dict)',
      type: 'json',
      description:
        'Dict keyed by hit|grab|projectile|parry|effect. Shape per combat-system.md §7.',
    },
    {
      path: 'props.defenseWindows',
      label: 'Defense Windows (dict)',
      type: 'json',
      description:
        'Dict keyed by block|armor|evasion|reflect. Shape per combat-system.md §7.',
    },
    {
      path: 'props.cancelWindow',
      label: 'Cancel Window',
      type: 'json',
      description:
        'Single-frame cancel point with hitCancel + optional rageCost. See §3c / §13.',
    },
    {
      path: 'props.rageVariant',
      label: 'Rage Variant (EX / Super)',
      type: 'json',
      description:
        'Optional variant override. Keys: required, rageCost, totalFrames, attackWindows, defenseWindows, cancelWindow. See §7 inheritance rule.',
    },
  ],
  builtinTraits: ['flippable', 'grabbable'],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-card') === -1) tags.push('hvcd-card');
    return {
      kind: 'card',
      subtype: 'hvcd.card',
      label: data.label || input.label || 'HVCD Card',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: {
        flippable: { faceUp: false },
        grabbable: true,
      },
      props: {
        // Identity
        element: typeof props.element === 'string' ? props.element : 'neutral',
        rarity: typeof props.rarity === 'string' ? props.rarity : 'common',
        heroId: typeof props.heroId === 'string' ? props.heroId : null,
        // Window model
        totalFrames: typeof props.totalFrames === 'number' ? props.totalFrames : 1,
        attackWindows: props.attackWindows || {},
        defenseWindows: props.defenseWindows || {},
        cancelWindow: props.cancelWindow || null,
        rageVariant: props.rageVariant || null,
        // Art / face — resolved by the renderer via card face layers.
        artPath: typeof props.artPath === 'string' ? props.artPath : null,
      },
      customData: data.customData || {},
    };
  },
  onSpawn: function (entityId, ctx) {
    // B2 port: register the card instance so the resolver's lookupCard(id)
    // can resolve its windows on dequeue (combat-system.md §2 step 3).
    // The registry lives on the world's global customData under
    // `hvcd.cardRegistry` so it survives across state transitions.
    var world = ctx && ctx.world;
    if (!world || !world.entities) return;
    var ent = world.entities.get(entityId);
    if (!ent) return;
    var global = world.globalState || (world.globalState = {});
    var registry = global.hvcdCardRegistry || (global.hvcdCardRegistry = {});
    var p = ent.props || {};
    registry[ent.id] = {
      id: ent.id,
      name: ent.label || p.name || ent.id,
      totalFrames: typeof p.totalFrames === 'number' ? p.totalFrames : 1,
      attackWindows: p.attackWindows || null,
      defenseWindows: p.defenseWindows || null,
      cancelWindow: p.cancelWindow || null,
      rageVariant: p.rageVariant || null,
      isItem: (ent.subtype === 'hvcd.item'),
      itemUsages: typeof p.usages === 'number' ? p.usages : null,
    };
  },
};

// ---------------------------------------------------------------------------
// Window -> timeline token expansion (combat-system.md §2 Dequeue rule step 3
// + §5 "Cards as manifests").
//
// Called by scripts/objects/sequence.ts / scripts/objects/timeline.ts when a
// slot of kind 'card' or 'item' is dequeued. Delegates to the pure-function
// core in scripts/resolver/cards.ts.
// ---------------------------------------------------------------------------
// @ts-ignore — runtime require of sibling resolver module.
var cardsLib = require('../resolver/cards');

exports.resolveCardMode = cardsLib.resolveCardMode;
exports.expandCardToTokens = cardsLib.expandCardToTokens;
exports.firstAttackStart = cardsLib.firstAttackStart;

/** Look up a card by id from the world's global card registry. */
exports.lookupCard = function (ctx, cardId) {
  var world = ctx && ctx.world;
  var reg = world && world.globalState && world.globalState.hvcdCardRegistry;
  if (!reg) return null;
  return reg[cardId] || null;
};
