/**
 * B8 + B10 — items system tests.
 *
 * Validates:
 *   - Catalog ships the 10 documented items with correct kind / charges /
 *     trigger / effect-op shapes.
 *   - createRunState grants each hero's hero-locked starter item.
 *   - fireTrigger fires for each of the 5 documented triggers
 *     (onRunStart, onRoundStart, onPlayCard, onTakeHit, onActivate).
 *   - Consumable charges decrement when the trigger fires; passives never
 *     decrement.
 *   - Mutations are pure functions of inputs (running fireTrigger twice on
 *     a deep-clone produces byte-identical results).
 *   - Burn tokens accumulate across onPlayCard ticks and damage on the
 *     opponent's onRoundStart.
 *   - Privacy-shape converter `toInventoryEnd` produces the
 *     HvcdMatchResult-compatible array.
 *   - match-setup grants Blaze->ignite, Volt->taser, Aqua->flask.
 */
import {
  ITEMS,
  getItem,
  getHeroStarterItem,
} from '../scripts/items/catalog.ts';
import {
  createRunState,
  createSeatRunState,
  fireTrigger,
  resetRoundFlags,
  toInventoryEnd,
} from '../scripts/items/triggers.ts';

const results: { name: string; passed: boolean; reason?: string }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    results.push({ name, passed: false, reason: err instanceof Error ? err.message : String(err) });
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log('\nB8 — items catalog');

test('catalog ships the 10 documented items', () => {
  assert(ITEMS.length === 10, `expected 10 items, got ${ITEMS.length}`);
  for (const id of ['ignite', 'taser', 'flask', 'focus-flask', 'mirror', 'bandage', 'iron-shield', 'lucky-coin', 'swift-boots', 'vampiric-edge']) {
    assert(getItem(id) !== undefined, `missing item ${id}`);
  }
});

test('starter items are hero-locked: blaze->ignite, volt->taser, aqua->flask', () => {
  const blaze = getHeroStarterItem('blaze');
  const volt = getHeroStarterItem('volt');
  const aqua = getHeroStarterItem('aqua');
  assert(blaze?.id === 'ignite', `blaze starter ${blaze?.id}`);
  assert(volt?.id === 'taser', `volt starter ${volt?.id}`);
  assert(aqua?.id === 'flask', `aqua starter ${aqua?.id}`);
});

test('passives have null charges; consumables have integer charges', () => {
  for (const it of ITEMS) {
    if (it.kind === 'passive') {
      assert(it.charges === null, `${it.id} passive should have null charges`);
    } else {
      assert(typeof it.charges === 'number' && it.charges > 0, `${it.id} consumable charges`);
    }
  }
});

console.log('\nB8 — RunState factory');

test('createRunState grants each hero its starter item', () => {
  const rs = createRunState('blaze', 'aqua');
  assert(rs.matchIndex === 0, `matchIndex starts at 0, got ${rs.matchIndex}`);
  assert(rs.seats.p1.runItems.length === 1, `p1 has 1 starter`);
  assert(rs.seats.p1.runItems[0].itemId === 'ignite', `p1 starter ignite`);
  assert(rs.seats.p1.runItems[0].chargesRemaining === null, `ignite is passive (null charges)`);
  assert(rs.seats.p2.runItems[0].itemId === 'flask', `p2 starter flask`);
  assert(rs.seats.p2.runItems[0].chargesRemaining === 3, `flask starts at 3 charges`);
});

test('createSeatRunState is empty for unknown hero', () => {
  const seat = createSeatRunState('mystery-hero');
  assert(seat.runItems.length === 0, `unknown hero gets no starter`);
});

console.log('\nB8 — trigger hook fires (each of 5 triggers)');

test('onRunStart fires lucky-coin (passive, run-bias)', () => {
  const rs = createRunState('blaze', 'aqua');
  // Add lucky-coin to p1 inventory.
  rs.seats.p1.runItems.push({ itemId: 'lucky-coin', chargesRemaining: null });
  const r = fireTrigger(rs, { kind: 'onRunStart', payload: {} });
  const biases = r.mutations.filter((m) => m.kind === 'roll-bias');
  assert(biases.length === 1, `expected 1 roll-bias mutation, got ${biases.length}`);
  assert(biases[0].target === 'p1', `bias targets p1`);
});

test('onRoundStart fires focus-flask (consumable) and decrements its charge', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p1.runItems.push({ itemId: 'focus-flask', chargesRemaining: 2 });
  const r = fireTrigger(rs, { kind: 'onRoundStart', payload: { turnIndex: 0 } });
  const rage = r.mutations.find((m) => m.kind === 'grant-rage');
  assert(!!rage, 'rage mutation present');
  assert(rage!.amount === 2, `expected +2 rage, got ${(rage as any).amount}`);
  assert(r.runState.seats.p1.runItems.find((i) => i.itemId === 'focus-flask')?.chargesRemaining === 1, `flask charges decremented to 1`);
});

test('onRoundStart fires iron-shield (passive) every round; never decrements', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p2.runItems.push({ itemId: 'iron-shield', chargesRemaining: null });
  const r1 = fireTrigger(rs, { kind: 'onRoundStart', payload: { turnIndex: 0 } });
  const r2 = fireTrigger(r1.runState, { kind: 'onRoundStart', payload: { turnIndex: 1 } });
  const blocks1 = r1.mutations.filter((m) => m.kind === 'add-block-pool' && m.target === 'p2');
  const blocks2 = r2.mutations.filter((m) => m.kind === 'add-block-pool' && m.target === 'p2');
  assert(blocks1.length === 1 && blocks2.length === 1, `iron-shield fires both rounds`);
  assert(r2.runState.seats.p2.runItems[1].chargesRemaining === null, `passive charges still null`);
});

test('onPlayCard fires ignite (passive) and adds burn tokens to opponent', () => {
  const rs = createRunState('blaze', 'aqua'); // blaze starter is ignite
  const r = fireTrigger(rs, { kind: 'onPlayCard', payload: { seat: 'p1', cardKind: 'hit' } });
  const burns = r.mutations.filter((m) => m.kind === 'add-burn');
  assert(burns.length === 1, `ignite fires once on hit-card`);
  assert(burns[0].target === 'p2' && burns[0].tokens === 1, 'burn lands on p2');
});

test('onPlayCard does not fire ignite for non-hit-cards', () => {
  const rs = createRunState('blaze', 'aqua');
  const r = fireTrigger(rs, { kind: 'onPlayCard', payload: { seat: 'p1', cardKind: 'defense' } });
  assert(r.mutations.filter((m) => m.kind === 'add-burn').length === 0, 'no burn on defense card');
});

test('onTakeHit fires vampiric-edge (passive) only on survival', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p1.runItems.push({ itemId: 'vampiric-edge', chargesRemaining: null });
  // Survived: heal 1.
  const survived = fireTrigger(rs, { kind: 'onTakeHit', payload: { defender: 'p1', attacker: 'p2', damage: 4, survived: true } });
  const heal1 = survived.mutations.find((m) => m.kind === 'heal' && m.target === 'p1');
  assert(!!heal1 && (heal1 as any).amount === 1, 'vampiric-edge heals 1 on survived hit');
  // Killed: no heal.
  const dead = fireTrigger(rs, { kind: 'onTakeHit', payload: { defender: 'p1', attacker: 'p2', damage: 100, survived: false } });
  assert(!dead.mutations.find((m) => m.kind === 'heal'), 'no heal on death');
});

test('onActivate fires taser (consumable) only when targeted itemId matches', () => {
  const rs = createRunState('volt', 'aqua'); // volt starter is taser
  // Wrong itemId — no fire.
  const wrong = fireTrigger(rs, { kind: 'onActivate', payload: { seat: 'p1', itemId: 'bandage' } });
  assert(wrong.mutations.length === 0, 'no fire on mismatched itemId');
  // Right itemId — fires apply-stun + consume-charge.
  const right = fireTrigger(rs, { kind: 'onActivate', payload: { seat: 'p1', itemId: 'taser' } });
  const stun = right.mutations.find((m) => m.kind === 'apply-stun');
  assert(!!stun, 'taser fires apply-stun');
  assert((stun as any).target === 'p2' && (stun as any).frames === 1, 'opponent stunned 1f');
  assert(right.runState.seats.p1.runItems[0].chargesRemaining === 1, 'taser decremented to 1');
});

test('consumable does not fire once charges hit 0', () => {
  const rs = createRunState('aqua', 'blaze'); // aqua starter is flask, 3 charges
  let cur = rs;
  for (let i = 0; i < 4; i++) {
    cur = fireTrigger(cur, { kind: 'onActivate', payload: { seat: 'p1', itemId: 'flask' } }).runState;
  }
  assert(cur.seats.p1.runItems[0].chargesRemaining === 0, 'flask drained to 0');
  const last = fireTrigger(cur, { kind: 'onActivate', payload: { seat: 'p1', itemId: 'flask' } });
  assert(last.mutations.length === 0, 'no fire when charges 0');
});

console.log('\nB8 — burn tokens accumulate and damage on round-start');

test('burn tokens added by ignite damage opponent at next onRoundStart', () => {
  const rs = createRunState('blaze', 'aqua');
  // Blaze plays a hit card -> 1 burn on p2.
  const r1 = fireTrigger(rs, { kind: 'onPlayCard', payload: { seat: 'p1', cardKind: 'hit' } });
  // State script applies the add-burn mutation by writing to runState.seats.
  // Simulate that:
  const bumped = JSON.parse(JSON.stringify(r1.runState));
  for (const m of r1.mutations) {
    if (m.kind === 'add-burn') bumped.seats[m.target].burnTokens += m.tokens;
  }
  // Round start should now produce a burn-damage mutation on p2.
  const r2 = fireTrigger(bumped, { kind: 'onRoundStart', payload: { turnIndex: 1 } });
  const burnDmg = r2.mutations.find((m) => m.kind === 'damage' && m.target === 'p2');
  assert(!!burnDmg, 'burn damage on p2');
  assert((burnDmg as any).amount === 1, 'damage equals burn tokens');
  assert(r2.runState.seats.p2.burnTokens === 0, 'burn tokens consumed');
});

console.log('\nB8 — pure-function determinism (precursor to B11 gate)');

test('fireTrigger does not mutate input runState', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p1.runItems.push({ itemId: 'focus-flask', chargesRemaining: 2 });
  const before = JSON.stringify(rs);
  fireTrigger(rs, { kind: 'onRoundStart', payload: { turnIndex: 0 } });
  assert(JSON.stringify(rs) === before, 'input runState unchanged');
});

test('fireTrigger is byte-deterministic across runs', () => {
  const rs1 = createRunState('blaze', 'aqua');
  const rs2 = createRunState('blaze', 'aqua');
  rs1.seats.p1.runItems.push({ itemId: 'mirror', chargesRemaining: null });
  rs2.seats.p1.runItems.push({ itemId: 'mirror', chargesRemaining: null });
  const a = fireTrigger(rs1, { kind: 'onTakeHit', payload: { defender: 'p1', attacker: 'p2', damage: 3, survived: true } });
  const b = fireTrigger(rs2, { kind: 'onTakeHit', payload: { defender: 'p1', attacker: 'p2', damage: 3, survived: true } });
  assert(JSON.stringify(a.mutations) === JSON.stringify(b.mutations), 'mutations byte-identical');
  assert(JSON.stringify(a.runState) === JSON.stringify(b.runState), 'runState byte-identical');
});

console.log('\nB8 — round-flag reset');

test('resetRoundFlags resets firstCardThisRound for both seats', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p1.firstCardThisRound = false;
  rs.seats.p2.firstCardThisRound = false;
  const reset = resetRoundFlags(rs);
  assert(reset.seats.p1.firstCardThisRound === true, 'p1 reset');
  assert(reset.seats.p2.firstCardThisRound === true, 'p2 reset');
});

test('swift-boots only fires on first card of the round', () => {
  const rs = createRunState('blaze', 'aqua');
  rs.seats.p1.runItems.push({ itemId: 'swift-boots', chargesRemaining: null });
  const first = fireTrigger(rs, { kind: 'onPlayCard', payload: { seat: 'p1', cardKind: 'hit' } });
  const disc1 = first.mutations.find((m) => m.kind === 'rage-discount-next-card');
  assert(!!disc1, 'first card gets discount');
  // Second card same round — no discount.
  const second = fireTrigger(first.runState, { kind: 'onPlayCard', payload: { seat: 'p1', cardKind: 'hit' } });
  const disc2 = second.mutations.find((m) => m.kind === 'rage-discount-next-card');
  assert(!disc2, 'second card no discount');
});

console.log('\nB8 — inventoryEnd shape (for HvcdMatchResult.perSeat)');

test('toInventoryEnd mirrors itemId + chargesRemaining as usages', () => {
  const seat = createSeatRunState('blaze');
  seat.runItems.push({ itemId: 'flask', chargesRemaining: 2 });
  const inv = toInventoryEnd(seat);
  assert(inv.length === 2, '2 items');
  // ignite passive
  assert(inv[0].itemId === 'ignite' && inv[0].usages === null, 'ignite usages null');
  // flask consumable
  assert(inv[1].itemId === 'flask' && inv[1].usages === 2, 'flask usages 2');
});

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} items tests passed, ${results.length - passed} failed`);
if (passed !== results.length) {
  process.exitCode = 1;
}
