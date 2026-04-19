/**
 * B7 + B10 — match-end (platform.endGame wiring) and match-setup (starter
 * item grant) integration tests.
 *
 * Validates:
 *   - match-setup hydrates timeline.customData.runState with each hero's
 *     starter item (B10).
 *   - match-end calls ctx.platform.endGame with a HvcdMatchResult-shaped
 *     payload including:
 *       outcome, finalHp, finalRage, finalBlockPool,
 *       damageDealt, damageTaken, totalShowdownFrames, turnCount,
 *       perSeat (heroId, inventoryEnd), replay (shape: 'inline').
 *   - Idempotency key uses sessionId-end when ctx.session.id is bound.
 *   - Honest play on both seats produces identical canonical payloads
 *     (T2 consensus precondition).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SandboxedExports {
  StateEntered?: (ctx: unknown, state: unknown) => void;
  StateInput?: (input: unknown, ctx: unknown, state: unknown) => void;
  StateUpdate?: (ctx: unknown, dt: number, state: unknown) => void;
  StateExit?: (ctx: unknown, state: unknown) => void;
}

function loadSandboxed(relPath: string, requireMap: Record<string, unknown> = {}): SandboxedExports {
  const abs = resolve(__dirname, '..', relPath);
  const src = readFileSync(abs, 'utf8');
  const moduleScope: { exports: SandboxedExports } = { exports: {} };
  const fakeRequire = (id: string) => {
    if (id in requireMap) return requireMap[id];
    return {};
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('exports', 'module', 'require', src);
  factory(moduleScope.exports, moduleScope, fakeRequire);
  return moduleScope.exports;
}

// Real triggers module (static import compiled by --experimental-strip-types).
import * as triggersMod from '../scripts/items/triggers.ts';

const matchSetup = loadSandboxed('scripts/states/match-setup.ts', {
  '../items/triggers': triggersMod,
});
const matchEnd = loadSandboxed('scripts/states/match-end.ts');

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

interface PlatformCalls {
  endGameCalls: Array<{ callbackUrl: string; payload: unknown; idempotencyKey: string }>;
}

function buildWorld(opts: {
  p1Hp: number;
  p2Hp: number;
  p1Slug?: string;
  p2Slug?: string;
  withRunState?: boolean;
}) {
  const entities: MockEntity[] = [
    {
      subtype: 'hvcd.timeline',
      props: { turnIndex: 5, currentFrame: 1200 },
      customData: opts.withRunState ? {} : {},
    },
    {
      subtype: 'hvcd.counterTray',
      props: { ownerSeat: 'p1', hp: opts.p1Hp, rage: 4, blockPool: 6, damageDealt: 9, damageTaken: 7 },
    },
    {
      subtype: 'hvcd.counterTray',
      props: { ownerSeat: 'p2', hp: opts.p2Hp, rage: 2, blockPool: 3, damageDealt: 7, damageTaken: 9 },
    },
    {
      subtype: 'hvcd.hero',
      props: { ownerSeat: 'p1', heroId: opts.p1Slug ?? 'blaze', slug: opts.p1Slug ?? 'blaze' },
    },
    {
      subtype: 'hvcd.hero',
      props: { ownerSeat: 'p2', heroId: opts.p2Slug ?? 'aqua', slug: opts.p2Slug ?? 'aqua' },
    },
  ];

  const emitted: Array<{ stream: string; ev: unknown }> = [];
  const platform: PlatformCalls & {
    endGame(args: { callbackUrl: string; payload: unknown; idempotencyKey: string }): Promise<void>;
    getCallbackUrl(): string;
  } = {
    endGameCalls: [],
    endGame(args) {
      this.endGameCalls.push(args);
      return Promise.resolve();
    },
    getCallbackUrl() {
      return 'https://hvcd.example/api/match-result';
    },
  };

  const ctx = {
    world: {
      entities: { all: () => entities },
      events: { emit: (stream: string, ev: unknown) => { emitted.push({ stream, ev }); } },
    },
    log: (..._args: unknown[]) => {},
    platform,
    session: { id: 'sess-abc-123' },
    stateMachine: {
      dispatched: [] as Array<{ type: string; payload?: unknown }>,
      dispatch(input: { type: string; payload?: unknown }) { this.dispatched.push(input); },
    },
  };

  return { ctx, entities, emitted, platform };
}

console.log('\nB10 — match-setup grants hero starter items');

test('match-setup grants ignite to blaze, taser to volt, flask to aqua', () => {
  // Blaze + Volt
  const a = buildWorld({ p1Hp: 16, p2Hp: 16, p1Slug: 'blaze', p2Slug: 'volt', withRunState: true });
  matchSetup.StateEntered!(a.ctx, { id: 'match-setup' });
  const tlA = a.entities.find((e) => e.subtype === 'hvcd.timeline')!;
  const rs = (tlA.customData as any).runState;
  assert(!!rs, 'runState seeded');
  assert(rs.seats.p1.runItems[0].itemId === 'ignite', 'p1 has ignite');
  assert(rs.seats.p2.runItems[0].itemId === 'taser', 'p2 has taser');
  assert(rs.seats.p2.runItems[0].chargesRemaining === 2, 'taser starts at 2 charges');

  // Aqua starter
  const b = buildWorld({ p1Hp: 16, p2Hp: 16, p1Slug: 'aqua', p2Slug: 'blaze', withRunState: true });
  matchSetup.StateEntered!(b.ctx, { id: 'match-setup' });
  const tlB = b.entities.find((e) => e.subtype === 'hvcd.timeline')!;
  const rsB = (tlB.customData as any).runState;
  assert(rsB.seats.p1.runItems[0].itemId === 'flask', 'p1 aqua has flask');
  assert(rsB.seats.p1.runItems[0].chargesRemaining === 3, 'flask starts at 3 charges');
});

test('match-setup skips re-grant on subsequent matches in same run (matchIndex bumps)', () => {
  const w = buildWorld({ p1Hp: 16, p2Hp: 16, p1Slug: 'blaze', p2Slug: 'aqua', withRunState: true });
  matchSetup.StateEntered!(w.ctx, { id: 'match-setup' });
  const tl = w.entities.find((e) => e.subtype === 'hvcd.timeline')!;
  // Mutate the runState as if the player consumed flask charges.
  (tl.customData as any).runState.seats.p2.runItems[0].chargesRemaining = 1;
  matchSetup.StateEntered!(w.ctx, { id: 'match-setup' });
  const rs = (tl.customData as any).runState;
  assert(rs.seats.p2.runItems[0].chargesRemaining === 1, 'flask charges preserved');
  assert(rs.matchIndex === 1, `matchIndex bumped to 1, got ${rs.matchIndex}`);
});

console.log('\nB7 — match-end fires platform.endGame with HvcdMatchResult shape');

test('match-end calls platform.endGame with all required HvcdMatchResult fields', () => {
  const w = buildWorld({ p1Hp: 14, p2Hp: 0, p1Slug: 'blaze', p2Slug: 'aqua', withRunState: true });
  matchSetup.StateEntered!(w.ctx, { id: 'match-setup' });
  matchEnd.StateEntered!(w.ctx, { id: 'match-end' });

  assert(w.platform.endGameCalls.length === 1, `endGame called once, got ${w.platform.endGameCalls.length}`);
  const call = w.platform.endGameCalls[0];
  assert(call.callbackUrl === 'https://hvcd.example/api/match-result', 'callback URL');
  assert(call.idempotencyKey === 'sess-abc-123-end', `idempotency key uses sessionId-end, got ${call.idempotencyKey}`);

  const p = call.payload as Record<string, unknown>;
  assert(p.outcome === 'p1', `outcome p1, got ${p.outcome}`);
  assert(p.totalShowdownFrames === 1200, `frames 1200`);
  assert(p.turnCount === 5, `turnCount 5`);

  // finalHp / finalRage / finalBlockPool
  assert(JSON.stringify(p.finalHp) === JSON.stringify({ p1: 14, p2: 0 }), `finalHp ${JSON.stringify(p.finalHp)}`);
  assert(JSON.stringify(p.finalRage) === JSON.stringify({ p1: 4, p2: 2 }), `finalRage`);
  assert(JSON.stringify(p.finalBlockPool) === JSON.stringify({ p1: 6, p2: 3 }), `finalBlockPool`);

  // damageDealt / damageTaken
  assert(JSON.stringify(p.damageDealt) === JSON.stringify({ p1: 9, p2: 7 }), `damageDealt ${JSON.stringify(p.damageDealt)}`);
  assert(JSON.stringify(p.damageTaken) === JSON.stringify({ p1: 7, p2: 9 }), `damageTaken`);

  // perSeat
  const perSeat = p.perSeat as Record<string, { heroId: string; inventoryEnd: Array<{ itemId: string; usages: number | null }> }>;
  assert(perSeat.p1.heroId === 'blaze', `p1 hero blaze`);
  assert(perSeat.p2.heroId === 'aqua', `p2 hero aqua`);
  assert(Array.isArray(perSeat.p1.inventoryEnd) && perSeat.p1.inventoryEnd[0].itemId === 'ignite', `p1 inv ignite`);
  assert(perSeat.p1.inventoryEnd[0].usages === null, `ignite usages null`);
  assert(perSeat.p2.inventoryEnd[0].itemId === 'flask' && perSeat.p2.inventoryEnd[0].usages === 3, `p2 inv flask 3`);

  // replay shape: inline + artifact
  const replay = p.replay as { shape: string; artifact: { format: string } };
  assert(replay.shape === 'inline', `replay shape inline`);
  assert(replay.artifact.format === 'hvcd-replay@v1', `replay artifact format`);
});

test('match-end falls back to content-derived idempotency key when no session bound', () => {
  const w = buildWorld({ p1Hp: 0, p2Hp: 4, withRunState: true });
  // Strip session.
  (w.ctx as any).session = undefined;
  matchEnd.StateEntered!(w.ctx, { id: 'match-end' });
  const call = w.platform.endGameCalls[0];
  assert(typeof call.idempotencyKey === 'string' && call.idempotencyKey.startsWith('hvcd::p2::'), `fallback key, got ${call.idempotencyKey}`);
});

test('honest play on both seats produces identical canonical payloads (T2 consensus)', () => {
  // Two independently-built worlds with the same observable state.
  const a = buildWorld({ p1Hp: 0, p2Hp: 8, p1Slug: 'blaze', p2Slug: 'volt', withRunState: true });
  const b = buildWorld({ p1Hp: 0, p2Hp: 8, p1Slug: 'blaze', p2Slug: 'volt', withRunState: true });
  matchSetup.StateEntered!(a.ctx, { id: 'match-setup' });
  matchSetup.StateEntered!(b.ctx, { id: 'match-setup' });
  matchEnd.StateEntered!(a.ctx, { id: 'match-end' });
  matchEnd.StateEntered!(b.ctx, { id: 'match-end' });

  const pa = JSON.stringify(a.platform.endGameCalls[0].payload);
  const pb = JSON.stringify(b.platform.endGameCalls[0].payload);
  assert(pa === pb, `payloads identical (T2 consensus would hash-match)`);
  assert(a.platform.endGameCalls[0].idempotencyKey === b.platform.endGameCalls[0].idempotencyKey, `idempotency keys match`);
});

test('match-end skips endGame when ctx.platform is unbound', () => {
  const w = buildWorld({ p1Hp: 0, p2Hp: 12, withRunState: true });
  (w.ctx as any).platform = undefined;
  // Should not throw.
  matchEnd.StateEntered!(w.ctx, { id: 'match-end' });
  assert(w.platform.endGameCalls.length === 0, 'no calls when platform missing');
});

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} match-end tests passed, ${results.length - passed} failed`);
if (passed !== results.length) {
  process.exitCode = 1;
}
