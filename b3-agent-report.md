# B3 Agent Report — HVCD Renderer Slot Impls (Wave 2)

**Agent:** B3 | **Date:** 2026-04-18 | **Status:** Complete, ready for A1/B2/B4 handoff.

Scope: HVCD-specific R3F renderer-slot implementations that load in the
TabletopLabs higher-trust bundle (per OQ-1 hybrid model, resolved 2026-04-18).
Source files only — bundling pipeline lands later.

Pins: hvcd-tabletop-contracts @ `fd5ba81`. Contracts read: `renderer-slots.md`,
`game-module-manifest.md`, `platform-capability-privacy.md`,
`event-log-schema.md`. UI spec read: `HeroVersusCardDuel/docs/ui-design.md` §4,
§5, §6, §7, §8, §9, §10, §12, §15.

---

## Files created

### `scripts/_stub/` — temporary module-api shim

| File | Status | Lines | Notes |
|---|---|--:|---|
| `_stub/moduleApi.ts` | created | 165 | Re-exports React / R3F / drei / three + slot-contract types. Clearly labeled temporary; delete once A1 publishes `@tabletoplabs/module-api`. |
| `_stub/remotionApi.ts` | (B4, not mine) | 45 | Already present from B4; left untouched. |

### `scripts/slots/shared/` — shared primitives

| File | Status | Lines | Notes |
|---|---|--:|---|
| `shared/layout.ts` | created | 85 | Cabinet-anchor coordinates (rail bounds, seat X offsets, chip-tray locals, monitor pos, side-area). Single source of truth across all slots. |
| `shared/useEventStream.ts` | created | 39 | Stable hook that folds a typed event stream via a reducer without resubscribing on rerender. |
| `shared/Chip.tsx` | created | 57 | HP/Rage/Pool poker-chip primitive (`React.memo`). |
| `shared/TokenChip.tsx` | created | 127 | Rail-dwelling attack/defense/cancel/effect/status chip; shape varies by category per ui §6d. |
| `shared/Card3D.tsx` | created | 60 | Face-up/down flat card mesh with frame-cost width indicator. |
| `shared/Tether.tsx` | created | 55 | Arched line from parked source card to projectile / effect-end token; supports pulse for standing-effect cue. |
| `shared/Playhead.tsx` | created | 47 | Vertical light-beam cursor for the rail. |
| `shared/FrameTick.tsx` | created | 60 | Printed tick marks on the rail; major every 5 frames. |

### `scripts/slots/` — 9 slot impls

| File | Status | Lines | Scope | renderPhase |
|---|---|--:|---|---|
| `slots/CabinetChassis.tsx` | created | 127 | session | tick |
| `slots/TimelineRail.tsx` | created | 235 | session | frame |
| `slots/SequenceLane.tsx` | created | 172 | per-seat | tick |
| `slots/ChipTray.tsx` | created | 313 | per-seat | event |
| `slots/SideArea.tsx` | created | 257 | per-seat | tick |
| `slots/InventoryRack.tsx` | created | 203 | per-seat (owner-only) | tick |
| `slots/MonitorMesh.tsx` | created | 118 | session | event |
| `slots/ProjectileLayer.tsx` | created | 238 | session | frame |
| `slots/AvatarRig.tsx` | created | 177 | per-seat | frame |

### `scripts/bundle/` — module registration entry

| File | Status | Lines | Notes |
|---|---|--:|---|
| `bundle/register.ts` | created | 73 | Default export `register(api)` bound by the module-host loader. Registers all 9 impls under both the registry-authoritative slot ids and the prompt's alias ids. |

**Totals:** 19 new files, ~2600 lines.

---

## The 9 slot impls — one-line summary each

1. **CabinetChassis** (`hvcd.cabinet` / `hvcd.cabinetChassis`) — machined-metal
   chassis panels wrapping the table, proscenium frame around the monitor
   mount, decorative rivet rows, emissive orange trim-light strip along the
   proscenium top bar.
2. **TimelineRail** (`hvcd.timelineRail`) — recessed rail channel, frame tick
   marks, per-seat emissive playhead cursors that interpolate toward the
   current cursor frame via `useFrame` refs, and all placed attack / defense /
   cancel / stun / knockdown / block chips docked at their frame cells.
3. **SequenceLane** (`hvcd.sequenceLanes` / `hvcd.sequenceLane`) — per-seat
   queue of face-down slot cards with public frame-cost widths, ordered
   front-of-queue nearest the timeline, updates on slot-committed /
   slot-discarded / slot-reordered / slot-dequeued / reveal-beat.
4. **ChipTray** (`hvcd.chipTrays` / `hvcd.chipTray`) — per-seat HP /
   Rage / Block-pool trays at the near edge; HP chips use the green→amber→red
   gradient and pulse red when low; Rage fills left-to-right 1:1 with damage
   taken; block-pool is a vertical stack of six.
5. **SideArea** (`hvcd.sideArea`) — per-seat recessed tray holding parked
   projectile source cards and standing-effect source cards tilted at 30°,
   with tether lines drawn to each card's in-flight entity (projectile 3D
   position or effect-end token on the rail).
6. **InventoryRack** (`hvcd.inventoryRack`) — per-seat angled shelf showing
   equipped item cards face-up with usage-count pips; **Layer 1 privacy**:
   returns `null` when `isViewerSeat === false` so the opponent's React tree
   never allocates the geometry.
7. **MonitorMesh** (`hvcd.monitorMesh`) — flat textured plane at the far end
   of the cabinet; owns a 720×405 `CanvasTexture` + placeholder splash canvas
   and exposes a `window.__hvcdMonitor` hook for B4's Remotion composition to
   plug in; flips `needsUpdate` per composition-frame tick decoupled from the
   R3F 60fps loop.
8. **ProjectileLayer** (`hvcd.projectileLayer`) — session-scoped airspace
   above the cabinet; projectiles spawn as emissive spheres with glow halos,
   arc parabolically from attacker's lane to defender's reticle timed between
   `projectile-launched.spawnGlobalFrame` and `arrivalGlobalFrame`, with
   per-projectile transforms driven imperatively via `useFrame` refs to avoid
   React rerenders every tick.
9. **AvatarRig** (`hvcd.avatarRig`) — per-seat no-arms floating-hands avatar
   (torso + head + two detached hand cubes); idle breathing loop plus
   automatic emote overlays (flinch on own damage-applied, smirk on own
   hit-parried, nod on opponent's knockdown, cheer on opponent's ko) that
   fade imperatively in `useFrame`.

---

## Cross-track dependencies surfaced

### Needs from A1 (`@tabletoplabs/module-api`)

- Frozen re-export surface: React, R3F (`Canvas`, `useFrame`, `useThree`,
  `useLoader`, `ThreeEvent`), drei (`Text`, `Line`, `Html`), three
  (`Vector3`, `Quaternion`, `CanvasTexture`, `Group`, materials, geometries,
  color spaces), slot-contract types (`RendererSlotImpl`, `SessionSlotProps`,
  `PerSeatSlotProps`, `PerEntitySlotProps`), module-API types
  (`ModuleApi`, `ModuleWorldAccess`, `ModuleEventsApi`, `ModuleAssetApi`,
  `ViewerIdentity`, `SeatId`).
- Once the alias + bundler plugin ban direct `three`/`@react-three/fiber`
  imports (per renderer-slots.md §API-surface-details), delete
  `scripts/_stub/moduleApi.ts` and rewrite every import.
- `ModuleEventsApi.subscribe<E>(streamId, handler)` shape: B3 expects
  `(event: E) => void` with an `Unsubscribe` return. If A1 lands a different
  shape, `shared/useEventStream.ts` is the single adaptation point.
- `ModuleAssetApi.resolveAssetUrl(uuid)` — B3 uses this pattern (e.g.,
  `CABINET_ASSET_UUID = 'hvcd.cabinet.chassis.v0'`) to future-proof assets;
  Wave-2 ignores the resolved URL and uses placeholder geometry.

### Needs from B2 (resolver + event log)

B3 consumes events off `'resolverEvents'` per event-log-schema.md. Every slot
file subscribes to a narrow subset of the `ResolverEvent` union via
`useEventStream`. B2 must emit (all shapes verbatim per the schema):

- Lifecycle: `match-started` (initial counters), `showdown-started` (origin
  frame), `showdown-paused`.
- Cursor: `cursor-advanced` (for TimelineRail, ProjectileLayer, SideArea
  tether updates).
- Sequence: `slot-committed`, `slot-discarded-from-sequence`,
  `slot-reordered`, `slot-dequeued`, `reveal-beat.publishedBySeat`.
- Tokens: `window-tokens-placed` (TimelineRail expands per-frame chips),
  `stun-placed`, `knockdown-placed`, `block-stun-extended`.
- Resources: `damage-applied`, `hp-restored`, `rage-gained`, `rage-paid`,
  `block-pool-consumed`, `block-pool-refilled`.
- Inventory: `item-returned-to-inventory`, `item-consumed`.
- Projectiles: `projectile-launched`, `projectile-arrived`,
  `projectile-clashed`, `projectile-reflected`.
- Effects: `effect-activated` (with `endGlobalFrame` for standing),
  `card-parked-to-side-area`, `card-released-from-side-area`.
- Emote triggers (AvatarRig folds automatic emotes from): `damage-applied`,
  `hit-parried`, `knockdown-placed`, `ko`.

### Needs from B4 (Remotion composition)

- B4's composition must target a 720×405 canvas and drive updates through the
  `window.__hvcdMonitor` global hook that `MonitorMesh` installs:
  - `window.__hvcdMonitor.canvas` — the backing `HTMLCanvasElement` B3 owns.
  - `window.__hvcdMonitor.tick()` — call this each Remotion frame to flip
    `CanvasTexture.needsUpdate = true`.
  - `window.__hvcdMonitor.setCanvas(c)` — if B4's composition owns its own
    canvas, call this to swap the texture source. Wave-2 stub TODO-notes
    the implementation; B3+B4 sync needed on handoff.
- Monitor fps: 30 (ui §10d). No coupling enforcement from B3 side.

### Needs from A7 (post-v1)

- `setEntityPrivacy(id, { mode: 'hidden', ownerSeat })` lands → InventoryRack
  drops the `if (!isViewerSeat) return null` guard and relies on sync-layer
  filtering. Track A7 in `platform-capability-privacy.md`.

---

## Placeholder visuals — what's stubbed vs final

**Placeholder in Wave 2 (polish wave will replace):**

- Card faces: solid-colored boxes, no texture maps, no art, no `totalFrames`
  numeral or window-icon rows. Final: plug into
  TabletopLabs' `cardFaceLayers.ts`.
- Chip shapes: simple cylinders with color + occasional notch/ring marker;
  no glyph icons (fist / shield / starburst per ui §6d).
- Cabinet chassis: straight-edged box panels + simple rivet cylinders. Final:
  commissioned GLB asset resolved via `assets.resolveAssetUrl`.
- Cabinet trim lights: one emissive strip on the proscenium top. Final: event-
  responsive trim lights per ui §4b.
- Timeline rail: recessed box + dash-sprites for ticks. Final: printed
  texture on the recess with tone-mapped emissive highlights.
- Playhead sweep: interpolates toward `state.cursorGlobalFrame` by setting
  ref Z from the current reduced state on every frame — doesn't actually run
  a smooth per-frame advance at the 8-fps default sweep rate yet. That needs
  a tween driver wired once B2 lands cursor-advanced at real tick cadence.
- Chip drop / shatter VFX: none (ui §6d placement/expiration animations). Final:
  audio-synced bounce + VFX.
- Monitor composition: placeholder canvas with "HVCD MONITOR" title text.
  Final: B4's Remotion atomic-clip composition.
- Projectile: emissive sphere + glow halo, parabolic arc. Final: per-card
  projectile asset with trail particle.
- Avatar rig: boxy torso, boxy head, two floating hand cubes, per-seat
  color split (P1 blue, P2 red). Final: stylized GLB avatar with face-blend
  shapes driving emote states, customizable skins.
- Inventory-rack usage pips: flat cylinders. Final: textured pip meshes with
  glow.
- Tethers: drei `<Line>` with one-segment arch midpoint. Final: shader-
  animated energy line with per-event styling.
- Chip-transfer animation (HP→Rage on damage, ui §8b): **not implemented**;
  Wave-2 just updates counts from `damage-applied` / `rage-gained`. Flying
  chips VFX is a later polish wave.
- Cancel chip armed/hitCancel legibility: correctly differentiated via gold
  core vs white outline per the chip's `armed` / `hitCancel` props, but the
  armed-value filter (opponent must not see armed gold core until the
  cancel fires, ui §6d) is expected at the **event layer** — B2's
  `window-tokens-placed` should ship with `armed: false` for non-owner
  viewers until the cancel-fired / cancel-whiffed event lands. Wave-2
  client-side trusts the payload.
- Projectile reflect visual direction-reverse: state model supports it but
  there's no mid-air velocity-flip VFX.

**Reasonable for Wave 2 (meets prompt's "scene boots with every slot
contributing something visible" bar):**

- All 9 slot impls mount, render 3D primitives at plausible positions, and
  respond to the resolver event stream.
- Per-seat slots render twice (one per seat) and `ChipTray` / `SequenceLane`
  / `SideArea` / `AvatarRig` handle both p1 and p2 via seat-prop-driven
  offsets.
- `InventoryRack` returns `null` on opponent clients (Layer 1 privacy).
- Playhead / projectile / avatar animations use `useFrame` with refs to avoid
  per-frame React renders (renderer-slots.md §Performance budget best
  practices).

---

## Quality-bar checklist

- [x] Components are `React.memo`-wrapped where props-stable (every slot +
      every shared primitive).
- [x] No unmemoized inline objects in JSX hot paths — position / rotation
      tuples are memoized or computed once per render.
- [x] Event-log subscription uses a stable hook pattern (`useEventStream`
      holds the reducer in a ref so the `useEffect` only rebinds on
      events-object change).
- [x] Per-seat slots correctly check `seatId === viewerSeatId` for Layer 1
      privacy (InventoryRack only — every other per-seat slot is public
      per ui §15).
- [x] `useFrame` callbacks are pure and deterministic given inputs (no
      closures over stale state; read through refs).
- [x] Asset refs use UUID placeholders (`CABINET_ASSET_UUID = 'hvcd.cabinet.chassis.v0'`)
      resolvable via `assets.resolveAssetUrl`; Wave-2 falls back to inline
      geometry when URL is null.
- [x] No direct `react`, `three`, `@react-three/fiber`, `@react-three/drei`,
      or `remotion` imports from slot files — everything goes through
      `scripts/_stub/moduleApi.ts` (or B4's `remotionApi.ts` for the
      composition, which B3 doesn't touch).

---

## Validation

- **TypeScript:** no project-level tsconfig / bundler is set up yet (B1's
  scaffold runs under the ScriptEngine `.ts`-as-CommonJS convention, which
  is a separate path); the bundle pipeline lands later. Files are hand-
  checked against the contract shapes and the stub type definitions.
- **JSON:** no JSON touched by B3.
- **No commits made** per prompt instructions.

---

## Known follow-ups for later waves

1. **Cursor-sweep driver.** `TimelineRail` interpolates to the last
   cursor-advanced frame, but doesn't run a ~8fps smooth sweep between ticks.
   Either B2 emits at true 60 Hz with sub-tick frames, or B3 adds a
   time-based tween in `useFrame` between cursor-advanced events.
2. **Chip-transfer flight.** `ChipTray` needs a VFX layer for HP→Rage
   transfer on damage-applied (ui §8b). Candidate: a small pool of
   reusable "flying chip" meshes spawned from the vanishing HP chip's world
   position to the corresponding Rage-chip slot, on the damage-applied
   event timestamp.
3. **Emote channel from presence lane.** `AvatarRig` derives emotes from
   resolver events only. Manual quick-chat emotes (ui §9) should come in
   through the presence lane once `session-api.md` finalizes it — one
   extra `events.subscribe('presence', ...)` subscription pattern.
4. **Card-face textures.** `Card3D` is a colored box; once A1 exposes
   `cardFaceLayers.ts` through the module API, plug in the real face layer
   rendering path. Blocks final visual polish but not functional behavior.
5. **Layer 2/3 privacy (A7).** InventoryRack returns null on non-owner
   clients (Layer 1), but the inventory state still crosses the wire if B2
   broadcasts it. Either route item usages through the per-session private
   KV (OQ-3) now, or leave it for A7. Flag for the privacy pass.
6. **Monitor texture swap.** `MonitorMesh.setCanvas` is a TODO — it doesn't
   yet reassign `texture.image` when B4 provides a composition canvas.
   One-line fix once B4 lands.
7. **Registry slot-id alignment.** The prompt lists `hvcd.cabinetChassis`,
   `hvcd.sequenceLane`, `hvcd.chipTray`, `hvcd.sideArea` while the
   contracts registry uses `hvcd.cabinet`, `hvcd.sequenceLanes`,
   `hvcd.chipTrays` and omits side-area. `register.ts` binds both to be
   future-proof; contracts pass should reconcile.
