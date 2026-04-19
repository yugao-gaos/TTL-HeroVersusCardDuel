// HVCD higher-trust bundle entry.
//
// Per OQ-1 resolution (game-module-manifest.md §Decisions status): HVCD runs
// under a hybrid host. Per-tick deterministic game logic lives in the existing
// ScriptEngine (see `scripts/kinds/`, `scripts/states/`, `scripts/traits/`).
// Renderer-slot impls + Remotion composition live in THIS bundle, which the
// TabletopLabs module-host loader loads at higher trust and calls `register(api)`
// on.
//
// This file is the default export the platform invokes after loading the bundle.
//
// Track A10 (Wave 4): the `hvcd.monitorMesh` slot can now be served from the
// HVCD portal as a WebSurfaceMesh instead of an in-module Remotion canvas.
// Selection between the two paths is driven by the manifest:
//   - When `module-manifest.json` declares `mount.type === 'web-surface'` for
//     `hvcd.monitorMesh`, the platform mounts the WebSurfaceMesh and we
//     register an event-forwarder via `api.emitToWebSurface(...)` instead of
//     the in-module `MonitorMesh` React component.
//   - Otherwise (or when `hvcd.monitorMode` global is forced to 'inline'),
//     the in-module Remotion path lands as before. This preserves the B4
//     pipeline as a fallback for Lovable smoke tests + offline TTL games
//     without a companion portal.

import type { ModuleApi } from '@tabletoplabs/module-api';
import { CabinetChassis } from '../slots/CabinetChassis';
import { TimelineRail } from '../slots/TimelineRail';
import { SequenceLane } from '../slots/SequenceLane';
import { ChipTray } from '../slots/ChipTray';
import { SideArea } from '../slots/SideArea';
import { InventoryRack } from '../slots/InventoryRack';
import { MonitorMesh } from '../slots/MonitorMesh';
import { ProjectileLayer } from '../slots/ProjectileLayer';
import { AvatarRig } from '../slots/AvatarRig';

/**
 * Slot id mapping — each must match an entry in hvcd-tabletop-contracts /
 * renderer-slots.md § SLOT_REGISTRY. The registry uses slightly different
 * dotted ids than the per-prompt list; authoritative ids are:
 *
 *   hvcd.cabinet         → CabinetChassis
 *   hvcd.timelineRail    → TimelineRail
 *   hvcd.sequenceLanes   → SequenceLane
 *   hvcd.chipTrays       → ChipTray
 *   hvcd.inventoryRack   → InventoryRack
 *   hvcd.monitorMesh     → MonitorMesh
 *   hvcd.projectileLayer → ProjectileLayer
 *   hvcd.avatarRig       → AvatarRig
 *
 * Plus, matching the Wave-2 prompt's explicit list:
 *   hvcd.cabinetChassis  → CabinetChassis (alias)
 *   hvcd.sideArea        → SideArea
 *
 * The prompt lists `hvcd.sideArea` as an owned slot even though the contract
 * registry shows side-area behavior folded into other slots today — we register
 * the impl under that id anyway so once the registry adds a side-area entry,
 * this code doesn't change. Platform refuses to mount slotIds not in the
 * registered list (renderer-slots.md §Registry shape), so extras are no-ops
 * until the contract catches up.
 */
/**
 * Decide whether the monitor mesh should mount as an in-module React
 * component (B4 fallback path) or as a WebSurfaceMesh (Track A10 portal
 * path).
 *
 * The platform reads the manifest's `rendererSlots[].mount` declaration
 * and decides on its end whether to mount the WebSurfaceMesh; this
 * function only governs whether THIS bundle still registers a React-impl
 * fallback.
 *
 * Selection precedence:
 *   1. `globalThis.__HVCD_MONITOR_MODE` — if set to `'inline'`, force the
 *      in-module Remotion path (used by Lovable smoke + offline tests).
 *      If set to `'web-surface'`, force the portal path (skip React impl).
 *   2. The manifest's `hvcd.monitorMesh` slot mount declaration. If it's
 *      `web-surface`, skip the React impl; otherwise register it.
 */
function shouldRegisterInlineMonitor(api: ModuleApi): boolean {
  const override = (globalThis as { __HVCD_MONITOR_MODE?: string }).__HVCD_MONITOR_MODE;
  if (override === 'inline') return true;
  if (override === 'web-surface') return false;
  const slot = api.manifest?.declarations?.rendererSlots?.find(
    (s) => s.slotId === 'hvcd.monitorMesh',
  );
  // No mount declaration / mount.type === 'react-component' → keep inline.
  // mount.type === 'web-surface' → suppress the inline React impl.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = (slot as { mount?: { type?: string } } | undefined)?.mount;
  return !mount || mount.type !== 'web-surface';
}

interface MonitorEventEnvelope {
  kind: 'resolverEvent';
  event: unknown;
}

/**
 * Forward resolver events into the WebSurfaceMesh hosting the monitor.
 *
 * The platform's `api.emitToWebSurface` is a no-op when no web-surface
 * mount is registered for the slot, so this handler is safe to install
 * unconditionally — but we only do so when the inline-monitor path is NOT
 * taking over (the inline path consumes the same events directly via the
 * in-module event bus).
 */
function installMonitorEventForwarder(api: ModuleApi): void {
  // The `resolverEvents` stream is declared in module-manifest.json. Using
  // subscribeToEvents here for forward-compat — the dedicated event-bus
  // multiplexer (Track A4) will replace this with a typed stream subscriber.
  api.subscribeToEvents<{ streamId?: string } & Record<string, unknown>>((event) => {
    // Filter to resolver events only; other module event streams (e.g.
    // monitorEvents) are not forwarded — the portal page reconstructs the
    // monitor view from raw resolver events.
    if (!event || typeof event !== 'object') return;
    // The current ModuleEventBus emits everything to subscribeAll without a
    // streamId tag. We forward all events as-is and let the portal page
    // discriminate. If A4 lands a typed stream, swap to subscribe('resolverEvents', ...).
    const envelope: MonitorEventEnvelope = {
      kind: 'resolverEvent',
      event,
    };
    api.emitToWebSurface('hvcd.monitorMesh', envelope);
  });
}

const SLOT_BINDINGS_NON_MONITOR = [
  // Registry-authoritative ids
  ['hvcd.cabinet', CabinetChassis],
  ['hvcd.timelineRail', TimelineRail],
  ['hvcd.sequenceLanes', SequenceLane],
  ['hvcd.chipTrays', ChipTray],
  ['hvcd.inventoryRack', InventoryRack],
  ['hvcd.projectileLayer', ProjectileLayer],
  ['hvcd.avatarRig', AvatarRig],
  // Alias / not-yet-registry ids (see doc comment above)
  ['hvcd.cabinetChassis', CabinetChassis],
  ['hvcd.sequenceLane', SequenceLane],
  ['hvcd.chipTray', ChipTray],
  ['hvcd.sideArea', SideArea],
] as const;

export default function register(api: ModuleApi): void {
  for (const [slotId, component] of SLOT_BINDINGS_NON_MONITOR) {
    // Using `as any` here to unify SessionSlotProps and PerSeatSlotProps under
    // the ModuleApi.registerRendererSlot generic — the platform keys by slotId
    // + dispatches the correct props shape per registry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.registerRendererSlot(slotId, component as any);
  }

  // Monitor: decide between inline B4 path and Track A10 portal path.
  if (shouldRegisterInlineMonitor(api)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.registerRendererSlot('hvcd.monitorMesh', MonitorMesh as any);
  } else {
    // Track A10: the platform mounts the WebSurfaceMesh from the manifest
    // declaration. We forward resolver events to it via postMessage.
    installMonitorEventForwarder(api);
  }
}
