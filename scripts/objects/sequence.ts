/**
 * HVCD board-object script: sequence (per seat)
 *
 * Owns (per combat-system.md §2, §15):
 *   - dequeue logic (§2 Dequeue rule)
 *   - commit validation (min sequence frames, resource checks)
 *   - carryover handoff (§2 End of turn)
 *
 * One instance per seat. The sequence is a queue of `SequenceSlot`s each
 * hiding a card/spacer/item. Slot kind, cardId, mode, and rageCancelArmed
 * are hidden from the opponent until the slot dequeues onto the timeline.
 *
 * State storage (per user guidance): slots array lives on the sequence
 * entity's `customData.slots`. Seat ownership is expressed by `owner: 'p1'|'p2'`.
 *
 * The dequeue algorithm lives in scripts/resolver/sequence.ts — this file
 * is the ECS binding (kind schema + commit-phase input handlers).
 */
// @ts-ignore
var sequenceLib = require('../resolver/sequence');
// @ts-ignore
var cardsLib = require('../resolver/cards');

var MIN_SEQUENCE_FRAMES = 10;

exports.kind = {
  id: 'hvcd.sequence',
  label: 'HVCD Sequence (per seat)',
  extendsKindId: null,
  engineKind: 'token',
  fields: [
    {
      path: 'props.ownerSeat',
      label: 'Owner Seat',
      type: 'select',
      options: [
        { value: 'p1', label: 'p1' },
        { value: 'p2', label: 'p2' },
      ],
    },
    {
      path: 'props.ready',
      label: 'Commit Ready',
      type: 'checkbox',
      description: 'True when the seat has signaled they are done editing the sequence.',
    },
    {
      path: 'props.slots',
      label: 'Slots',
      type: 'json',
      description:
        'SequenceSlot[] — per combat-system.md §15. Opaque to the opponent at the ECS level; platform state-sync filters it client-side.',
    },
    {
      path: 'props.cursor',
      label: 'Seat Cursor',
      type: 'number',
      min: 0,
      step: 1,
      description: 'Seat-local frame cursor. Carries across pauses.',
    },
  ],
  commonSections: ['tags', 'customData'],
  buildEntity: function (input, _ctx) {
    var data = input.data || {};
    var props = data.props || {};
    var tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    if (tags.indexOf('hvcd-sequence') === -1) tags.push('hvcd-sequence');
    return {
      kind: 'token',
      subtype: 'hvcd.sequence',
      label: data.label || input.label || 'HVCD Sequence',
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : undefined,
      z: typeof data.z === 'number' ? data.z : 0,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      tags: tags,
      traits: { grabbable: false, collidable: false },
      props: {
        ownerSeat: typeof props.ownerSeat === 'string' ? props.ownerSeat : 'p1',
        ready: !!props.ready,
        slots: Array.isArray(props.slots) ? props.slots : [],
        cursor: typeof props.cursor === 'number' ? props.cursor : 0,
      },
      customData: data.customData || {},
    };
  },
};

/**
 * Validate a sequence before allowing commit_locked_in.
 *
 * Per §2: total frame cost >= MIN_SEQUENCE_FRAMES (10).
 * Per §15: mode==='variant' only valid if card has rageVariant; rageCancelArmed
 *          only valid if resolved card has cancelWindow.rageCost defined.
 *
 * Returns { ok: true } or { ok: false, reason: string }.
 */
exports.validate = function (slots, lookupCard) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return { ok: false, reason: 'empty_sequence' };
  }
  var total = 0;
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (slot.kind === 'block-spacer') {
      if (typeof slot.tokens !== 'number' || slot.tokens < 1) {
        return { ok: false, reason: 'invalid_spacer' };
      }
      total += slot.tokens;
      continue;
    }
    var id = slot.cardId || slot.itemId;
    var card = lookupCard(id);
    if (!card) return { ok: false, reason: 'unknown_card:' + id };
    if (slot.mode === 'variant' && !card.rageVariant) {
      return { ok: false, reason: 'variant_not_supported:' + id };
    }
    if (slot.rageCancelArmed) {
      var cw = slot.mode === 'variant' && card.rageVariant && card.rageVariant.cancelWindow
        ? card.rageVariant.cancelWindow
        : card.cancelWindow;
      if (!cw || typeof cw.rageCost !== 'number') {
        return { ok: false, reason: 'arm_not_supported:' + id };
      }
    }
    var played = cardsLib.resolveCardMode(card, slot.mode || 'base');
    total += played.totalFrames;
  }
  if (total < MIN_SEQUENCE_FRAMES) {
    return { ok: false, reason: 'below_minimum:' + total };
  }
  return { ok: true, totalFrames: total };
};

/**
 * Called by scripts/objects/timeline.ts runShowdown to build the SeatState
 * snapshot at showdown entry. Reads from the ECS sequence entity's customData.
 */
exports.buildSeatState = function (_ctx, sequenceEntity, counterTray, heroEntity, seatId) {
  var cProps = (counterTray && counterTray.props) || {};
  var hProps = (heroEntity && heroEntity.props) || {};
  var sProps = sequenceEntity.props || {};
  return {
    id: seatId,
    index: seatId === 'p1' ? 0 : 1,
    heroId: hProps.slug || '',
    hp: typeof cProps.hp === 'number' ? cProps.hp : (hProps.baseHp || 16),
    rage: typeof cProps.rage === 'number' ? cProps.rage : (hProps.baseRage || 0),
    blockPool: typeof cProps.blockPool === 'number' ? cProps.blockPool : 6,
    sequence: Array.isArray(sProps.slots) ? sProps.slots.slice() : [],
    activeCard: null,
    cursor: typeof sProps.cursor === 'number' ? sProps.cursor : 0,
    discard: [],
    sideArea: Array.isArray(sProps.sideArea) ? sProps.sideArea.slice() : [],
    inventory: Array.isArray(cProps.inventory) ? cProps.inventory.slice() : [],
    reservedItems: [],
  };
};

exports.MIN_SEQUENCE_FRAMES = MIN_SEQUENCE_FRAMES;
