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

import type { ModuleApi } from '../_stub/moduleApi';
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
const SLOT_BINDINGS = [
  // Registry-authoritative ids
  ['hvcd.cabinet', CabinetChassis],
  ['hvcd.timelineRail', TimelineRail],
  ['hvcd.sequenceLanes', SequenceLane],
  ['hvcd.chipTrays', ChipTray],
  ['hvcd.inventoryRack', InventoryRack],
  ['hvcd.monitorMesh', MonitorMesh],
  ['hvcd.projectileLayer', ProjectileLayer],
  ['hvcd.avatarRig', AvatarRig],
  // Alias / not-yet-registry ids (see doc comment above)
  ['hvcd.cabinetChassis', CabinetChassis],
  ['hvcd.sequenceLane', SequenceLane],
  ['hvcd.chipTray', ChipTray],
  ['hvcd.sideArea', SideArea],
] as const;

export default function register(api: ModuleApi): void {
  for (const [slotId, component] of SLOT_BINDINGS) {
    // Using `as any` here to unify SessionSlotProps and PerSeatSlotProps under
    // the ModuleApi.registerRendererSlot generic — the platform keys by slotId
    // + dispatches the correct props shape per registry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.registerRendererSlot(slotId, component as any);
  }
}
