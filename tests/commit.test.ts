/**
 * B5 — commit-history capture tests.
 *
 * Validates that scripts/states/commit.ts:
 *   1. Mutates per-seat sequences on slot_add / slot_discard / slot_reorder /
 *      slot_clear.
 *   2. Appends to `timeline.customData.commitLog` once both seats flag
 *      `commit_ready`, with one entry per seat per turn.
 *   3. Produces byte-identical commit logs for two independently-driven
 *      "seat" worlds fed the same input stream — this is the determinism
 *      proof underlying T2 consensus on the inline replay blob.
 *
 * The state-script files are written as TabletopLabs sandbox modules
 * (`exports.X = function (...)`). The runtime sandbox provides `exports`,
 * `require`, etc. as injected globals; we recreate that here by reading the
 * source file, stripping TS type annotations the strip-types loader would
 * normally remove, and eval-ing it inside a CJS-style wrapper. This avoids
 * the ESM `exports is not defined` error when loading via dynamic import.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SandboxedModule {
  exports: {
    StateEntered?: (ctx: unknown, state: unknown) => void;
    StateInput?: (input: unknown, ctx: unknown, state: unknown) => void;
    StateUpdate?: (ctx: unknown, dt: number, state: unknown) => void;
    StateExit?: (ctx: unknown, state: unknown) => void;
  };
}

function loadSandboxed(relPath: string): SandboxedModule['exports'] {
  const abs = resolve(__dirname, '..', relPath);
  const src = readFileSync(abs, 'utf8');
  // Strip TypeScript type-only constructs that aren't already valid JS. The
  // state-script files are written in JS-shaped TS (var, function, no type
  // annotations), so source is already valid JS. Just wrap and eval.
  const moduleScope: SandboxedModule = { exports: {} };
  const fakeRequire = () => ({});
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('exports', 'module', 'require', src);
  factory(moduleScope.exports, moduleScope, fakeRequire);
  return moduleScope.exports;
}

const commitState = loadSandboxed('scripts/states/commit.ts');
const matchEndState = loadSandboxed('scripts/states/match-end.ts');

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

interface MockEntity {
  subtype: string;
  props?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

interface MockWorld {
  entities: { all(): MockEntity[] };
  events: { emit(stream: string, ev: unknown): void };
  emitted: Array<{ stream: string; ev: unknown }>;
}

interface MockCtx {
  world: MockWorld;
  log: (...args: unknown[]) => void;
  stateMachine: {
    dispatched: Array<{ type: string; payload?: unknown }>;
    dispatch(input: { type: string; payload?: unknown }): void;
  };
}

function buildWorld(turn = 0): { ctx: MockCtx; world: MockWorld; entities: MockEntity[] } {
  const entities: MockEntity[] = [
    { subtype: 'hvcd.timeline', props: { turnIndex: turn, currentFrame: 0 }, customData: {} },
    { subtype: 'hvcd.sequence', props: { ownerSeat: 'p1', slots: [], ready: false } },
    { subtype: 'hvcd.sequence', props: { ownerSeat: 'p2', slots: [], ready: false } },
  ];
  const emitted: Array<{ stream: string; ev: unknown }> = [];
  const world: MockWorld = {
    entities: { all: () => entities },
    events: { emit: (stream, ev) => { emitted.push({ stream, ev }); } },
    emitted,
  };
  const ctx: MockCtx = {
    world,
    log: () => {},
    stateMachine: {
      dispatched: [],
      dispatch(input) { this.dispatched.push(input); },
    },
  };
  return { ctx, world, entities };
}

function findEntity(world: MockWorld, subtype: string, ownerSeat?: string): MockEntity | null {
  for (const e of world.entities.all()) {
    if (e.subtype !== subtype) continue;
    if (ownerSeat && e.props?.ownerSeat !== ownerSeat) continue;
    return e;
  }
  return null;
}

console.log('\nB5 — commit-history capture');

test('slot_add appends to the seat sequence at the given index', () => {
  const { ctx, world } = buildWorld();
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'jab', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'block-spacer', tokens: 3 }, index: 0 } },
    ctx, { id: 'commit' },
  );
  const seq = findEntity(world, 'hvcd.sequence', 'p1');
  assert(!!seq, 'p1 sequence exists');
  const slots = (seq!.props!.slots as unknown[]);
  assert(slots.length === 2, 'two slots present');
  assert((slots[0] as { kind: string }).kind === 'block-spacer', 'spacer inserted at index 0');
});

test('slot_discard removes the slot at the given index', () => {
  const { ctx, world } = buildWorld();
  for (const cardId of ['a', 'b', 'c']) {
    commitState.StateInput!(
      { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId, mode: 'base', rageCancelArmed: false } } },
      ctx, { id: 'commit' },
    );
  }
  commitState.StateInput!({ type: 'slot_discard', payload: { seat: 'p1', index: 1 } }, ctx, { id: 'commit' });
  const seq = findEntity(world, 'hvcd.sequence', 'p1');
  const slots = seq!.props!.slots as Array<{ cardId?: string }>;
  assert(slots.length === 2, 'one removed');
  assert(slots[0].cardId === 'a' && slots[1].cardId === 'c', 'middle slot removed');
});

test('slot_reorder moves slots within the sequence', () => {
  const { ctx, world } = buildWorld();
  for (const cardId of ['a', 'b', 'c']) {
    commitState.StateInput!(
      { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId, mode: 'base', rageCancelArmed: false } } },
      ctx, { id: 'commit' },
    );
  }
  commitState.StateInput!({ type: 'slot_reorder', payload: { seat: 'p1', from: 0, to: 2 } }, ctx, { id: 'commit' });
  const seq = findEntity(world, 'hvcd.sequence', 'p1');
  const slots = seq!.props!.slots as Array<{ cardId?: string }>;
  assert(slots[0].cardId === 'b' && slots[1].cardId === 'c' && slots[2].cardId === 'a', 'a moved to end');
});

test('slot_clear empties the sequence', () => {
  const { ctx, world } = buildWorld();
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'a', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!({ type: 'slot_clear', payload: { seat: 'p1' } }, ctx, { id: 'commit' });
  const seq = findEntity(world, 'hvcd.sequence', 'p1');
  assert((seq!.props!.slots as unknown[]).length === 0, 'cleared');
});

test('commit_ready from one seat does not yet snapshot or dispatch', () => {
  const { ctx, world } = buildWorld();
  commitState.StateInput!({ type: 'commit_ready', payload: { seat: 'p1' } }, ctx, { id: 'commit' });
  const tl = findEntity(world, 'hvcd.timeline');
  const log = tl?.customData?.commitLog as unknown[] | undefined;
  assert(!Array.isArray(log) || log.length === 0, 'no commitLog yet');
  assert(ctx.stateMachine.dispatched.length === 0, 'no FSM dispatch yet');
});

test('both seats commit_ready snapshots one entry per seat and dispatches commit_locked_in', () => {
  const { ctx, world } = buildWorld(2);
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'jab', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p2', slot: { kind: 'card', cardId: 'punch', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!({ type: 'commit_ready', payload: { seat: 'p1' } }, ctx, { id: 'commit' });
  commitState.StateInput!({ type: 'commit_ready', payload: { seat: 'p2' } }, ctx, { id: 'commit' });

  const tl = findEntity(world, 'hvcd.timeline');
  const log = tl!.customData!.commitLog as Array<{ turn: number; seat: string; slots: unknown[] }>;
  assert(Array.isArray(log) && log.length === 2, `expected 2 entries, got ${log?.length}`);
  assert(log[0].turn === 2 && log[1].turn === 2, 'both entries on turn 2');
  assert(log[0].seat === 'p1' && log[1].seat === 'p2', 'p1 first, then p2');
  assert(log[0].slots.length === 1 && log[1].slots.length === 1, 'each seat has one slot');

  const slotCommitted = world.emitted.filter((e) => (e.ev as { kind: string }).kind === 'slot-committed');
  assert(slotCommitted.length === 2, `expected 2 slot-committed events, got ${slotCommitted.length}`);

  const dispatched = ctx.stateMachine.dispatched.find((d) => d.type === 'commit_locked_in');
  assert(!!dispatched, 'commit_locked_in dispatched');
});

test('two independent worlds with the same input stream produce identical commit logs (determinism)', () => {
  const a = buildWorld(1);
  const b = buildWorld(1);
  const inputStream = [
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'jab', mode: 'base', rageCancelArmed: false } } },
    { type: 'slot_add', payload: { seat: 'p2', slot: { kind: 'block-spacer', tokens: 5 } } },
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'punch', mode: 'variant', rageCancelArmed: true } } },
    { type: 'slot_reorder', payload: { seat: 'p1', from: 0, to: 1 } },
    { type: 'commit_ready', payload: { seat: 'p2' } },
    { type: 'commit_ready', payload: { seat: 'p1' } },
  ];
  for (const input of inputStream) {
    commitState.StateInput!(input, a.ctx, { id: 'commit' });
    commitState.StateInput!(input, b.ctx, { id: 'commit' });
  }
  const logA = (findEntity(a.world, 'hvcd.timeline')!.customData!.commitLog as unknown);
  const logB = (findEntity(b.world, 'hvcd.timeline')!.customData!.commitLog as unknown);
  assert(JSON.stringify(logA) === JSON.stringify(logB), 'commit logs are byte-identical');
});

test('match-end preserves the commit log and emits match-ended', () => {
  const { ctx, world, entities } = buildWorld(0);
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p1', slot: { kind: 'card', cardId: 'jab', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!(
    { type: 'slot_add', payload: { seat: 'p2', slot: { kind: 'card', cardId: 'punch', mode: 'base', rageCancelArmed: false } } },
    ctx, { id: 'commit' },
  );
  commitState.StateInput!({ type: 'commit_ready', payload: { seat: 'p1' } }, ctx, { id: 'commit' });
  commitState.StateInput!({ type: 'commit_ready', payload: { seat: 'p2' } }, ctx, { id: 'commit' });

  // Add counterTrays so match-end's HP/rage/pool reads succeed.
  entities.push(
    { subtype: 'hvcd.counterTray', props: { ownerSeat: 'p1', hp: 0, rage: 0, blockPool: 6 } },
    { subtype: 'hvcd.counterTray', props: { ownerSeat: 'p2', hp: 5, rage: 0, blockPool: 6 } },
  );

  matchEndState.StateEntered!(ctx, { id: 'match-end' });

  const tl = findEntity(world, 'hvcd.timeline');
  const log = tl!.customData!.commitLog as unknown[];
  assert(Array.isArray(log) && log.length === 2, `commitLog has 2 entries after match-end, got ${log?.length}`);

  const matchEnded = world.emitted.find((e) => (e.ev as { kind: string }).kind === 'match-ended');
  assert(!!matchEnded, 'match-ended emitted');
});

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} commit-history tests passed, ${results.length - passed} failed`);
if (passed !== results.length) {
  process.exitCode = 1;
}
