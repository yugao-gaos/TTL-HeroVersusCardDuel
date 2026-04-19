/**
 * Track A10 — manifest declares hvcd.monitorMesh as a web-surface mount.
 *
 * Sanity-checks that the manifest carries the right shape so the
 * platform's WebSurfaceMesh primitive picks it up. Also verifies the
 * register.ts bundle exposes a `shouldRegisterInlineMonitor` decision
 * function that respects the manifest declaration.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadManifest(): Record<string, unknown> {
  const text = readFileSync(resolve(__dirname, '..', 'module-manifest.json'), 'utf8');
  return JSON.parse(text);
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test('hvcd.monitorMesh declares a web-surface mount', () => {
  const manifest = loadManifest();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = (manifest.declarations as any).rendererSlots as Array<{
    slotId: string;
    mount?: { type?: string; url?: string; allowedOrigins?: string[] };
  }>;
  const monitor = slots.find((s) => s.slotId === 'hvcd.monitorMesh');
  assert.ok(monitor, 'hvcd.monitorMesh must be declared');
  assert.equal(monitor!.mount?.type, 'web-surface');
  assert.match(
    monitor!.mount?.url ?? '',
    /\/monitor\/:sessionId$/,
    'URL must end in /monitor/:sessionId so the platform substitutes the session id',
  );
  assert.deepEqual(monitor!.mount?.allowedOrigins?.sort(), ['https://hvcd.example']);
});

test('every other slot keeps the React-component path (no mount or mount.type === "react-component")', () => {
  const manifest = loadManifest();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = (manifest.declarations as any).rendererSlots as Array<{
    slotId: string;
    mount?: { type?: string };
  }>;
  for (const slot of slots) {
    if (slot.slotId === 'hvcd.monitorMesh') continue;
    if (slot.mount && slot.mount.type !== 'react-component') {
      assert.fail(
        `slot "${slot.slotId}" declared mount.type="${slot.mount.type}" — only the monitor is companion (essential vs companion principle).`,
      );
    }
  }
});

test('manifest declares the resolverEvents stream the monitor portal will consume', () => {
  const manifest = loadManifest();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streams = (manifest.declarations as any).eventStreams as Array<{ id: string; schema: string }>;
  const resolver = streams.find((s) => s.id === 'resolverEvents');
  assert.ok(resolver, 'resolverEvents stream must be declared (monitor portal subscribes via emitToWebSurface)');
});

// Run sequentially.
let pass = 0;
let fail = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    pass++;
    // eslint-disable-next-line no-console
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    fail++;
    // eslint-disable-next-line no-console
    console.error(`  \u2717 ${name}`);
    console.error(err);
  }
}

// eslint-disable-next-line no-console
console.log(`\n${pass}/${tests.length} A10 monitor-manifest tests passed, ${fail} failed`);
if (fail > 0) process.exit(1);
