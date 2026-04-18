# B4 Agent Report — HVCD monitor Remotion pipeline

**Agent:** B4 (Wave 2) | **Date:** 2026-04-18 | **Status:** Complete, ready for B3 consumption.

Scope: build the Remotion composition pipeline that drives the HVCD cabinet monitor mesh. Event log → Remotion React tree → offscreen canvas → `THREE.CanvasTexture` → (handed to B3's `hvcd.monitorMesh` slot).

Source of truth for this work:
- `HeroVersusCardDuel/docs/ui-design.md` §10 — monitor composition structure, direct-canvas pipeline, 30fps, 720×405 internal res, 2-concurrent-alpha-decode cap, React.memo discipline.
- `hvcd-tabletop-contracts/event-log-schema.md` — the `ResolverEvent` discriminated union consumed by this pipeline.
- `hvcd-tabletop-contracts/renderer-slots.md` §`hvcd.monitorMesh` — slot B3 will consume the CanvasTexture through.
- `hvcd-tabletop-contracts/game-module-manifest.md` OQ-1 — Remotion lives in the higher-trust bundle.

---

## 1. Files created

### Stub (temporary)
| File | Lines | Notes |
|---|--:|---|
| `scripts/_stub/remotionApi.ts` | 45 | Re-exports `Composition`, `Sequence`, `useCurrentFrame`, `useVideoConfig`, `AbsoluteFill`, `Series`, `Loop` from the `remotion` package. Mirrors `_stub/moduleApi.ts` conventions; labeled "DO NOT SHIP" and scheduled for removal when A1 publishes `@tabletoplabs/module-api/remotion`. Declares the required package version (`remotion ^4.0.0`). |

### Monitor composition (`scripts/monitor/`)
| File | Lines | Notes |
|---|--:|---|
| `scripts/monitor/MonitorComposition.tsx` | 470 | Top-level composition. Mirrors ui-design.md §10b example: Stage + two Fighters + per-event <Sequence> dispatch + ComboCounter/FrameReadout/HitStop. Exports `MonitorCompositionHost` (React subtree B3 mounts) and `MonitorComposition` (standalone inner tree for tests). |
| `scripts/monitor/useMonitorCanvasTexture.ts` | 185 | Public hook returning a stable `THREE.CanvasTexture` handle. 720×405 default, 30fps rAF loop, `needsUpdate` flipping, SRGBColorSpace, dispose on unmount. Includes docstring with usage snippet for B3. |
| `scripts/monitor/canvasRuntime.ts` | 218 | The canvas-native authoring plumbing: `DrawQueue`, `DrawQueueCtx`, `useEnqueueDraw` hook, `flushDrawQueue` with the 2-alpha-decode cap enforced, `createMonitorCanvas` helper, `MAX_CONCURRENT_ALPHA_DECODES = 2`. |
| `scripts/monitor/eventSelectors.ts` | 557 | Pure selectors — `expandEventsToLayers`, `selectActiveLayersAt`, `selectActiveSequences`, `selectComboState`, `selectHitStop`, `selectFrameReadout`, `hitSize`. Plus `eventFrame(e)` helper covering every ResolverEvent variant. |

### Layer components (`scripts/monitor/layers/`, every one `React.memo`-wrapped)
| File | Lines | Event kinds it serves |
|---|--:|---|
| `Stage.tsx` | 37 | Background plate, always-on. |
| `Fighter.tsx` | 64 | Idle stance per seat, always-on. |
| `FighterAttack.tsx` | 75 | `card-entered-timeline`. `alphaDecode: true`. |
| `FighterReact.tsx` | 64 | `hit-connected` defender. `alphaDecode: true`. |
| `FighterStagger.tsx` | 54 | `hit-parried` attacker recoil. |
| `ImpactFlash.tsx` | 57 | `hit-connected`, non-landed `projectile-arrived`. |
| `BlockSparks.tsx` | 62 | `hit-blocked`. |
| `ParryGlint.tsx` | 63 | `hit-parried`. |
| `DamageNumeral.tsx` | 64 | `hit-connected` + parry counter. |
| `ComboCounter.tsx` | 62 | HUD, derives via `selectComboState`. |
| `FrameReadout.tsx` | 101 | HUD HP bars / rage pips / frame counter, derives via `selectFrameReadout`. |
| `HitStop.tsx` | 66 | Full-screen vignette, derives via `selectHitStop`. |
| `ProjectileLayer.tsx` | 128 | `projectile-launched` (flight) + `projectile-clashed` (burst). |
| `Knockdown.tsx` | 63 | `knockdown-placed`. |
| `EffectOverlay.tsx` | 68 | `effect-activated` (auto-expires via Sequence duration). |
| `CancelFlash.tsx` | 54 | `cancel-fired`. |
| `KoFlash.tsx` | 74 | `ko`. |

### Tests
| File | Lines | Notes |
|---|--:|---|
| `tests/monitor.eventSelectors.test.ts` | 480 | Vitest-style tests for every selector — hitSize bucketing, expandEventsToLayers per event kind, selectActiveLayersAt window math, selectComboState lifecycle (start/drop/ko/pause/turn-end resets), selectHitStop freeze/slow windows, selectFrameReadout HP/rage/combo state scrubbing across frames. Pure — no DOM, no Remotion. Runs under any describe/it/expect harness. |

Totals: **23 new files, 3110 lines.**

No existing files were modified. No commit was made (per scope rules).

---

## 2. Canvas-native layer choice + justification

**Choice:** Custom hook + `drawImage` calls via a shared `DrawQueue` (`canvasRuntime.ts`). No react-konva, no pixi-react.

**Justification (one paragraph):** The hardest runtime constraint on this pipeline is the "≤2 concurrent alpha-decode assets per frame" cap from ui-design.md §10d, and that's easiest to enforce when we own the draw pipeline directly — each layer declares `alphaDecode: true` in its `DrawCommand` and `flushDrawQueue` drops surplus ones deterministically. A second renderer (Konva's stage or Pixi's ticker) would compete with Remotion's own reconciler for the main thread and complicate enforcement of that cap. Pragmatically, B5's future fighter-clip assets are alpha-WebM (or PNG sequence fallback), both of which are native `drawImage` inputs — no adapter layer is needed. Bundle delta is the smallest available since the higher-trust bundle already ships React + three + r3f + remotion and a raw 2D renderer adds nothing. The per-layer authoring surface stays narrow: each component is a `React.memo` that calls `useEnqueueDraw({ z, layerKey, draw })` with a memoized `draw(ctx, frame, res) => void` — about as close to "canvas-native authoring discipline" as §10d could ask for.

---

## 3. Event kinds handled vs. stubbed / deferred

Required by the task prompt (all handled with a dedicated layer + Sequence dispatch):

| Event kind | Layer(s) | Sequence framing |
|---|---|---|
| `card-entered-timeline` (the "attack" wave-2 equivalent) | FighterAttack | `from=atGlobalFrame`, `durationInFrames=totalFrames` |
| `hit-connected` | FighterReact + ImpactFlash + DamageNumeral | `from=atGlobalFrame`, `durationInFrames=max(hitStun, numeralFrames)` |
| `hit-blocked` ("block-absorb") | BlockSparks | `from=atGlobalFrame`, `durationInFrames=BLOCK_SPARKS_FRAMES` |
| `hit-parried` ("parry-fire") | ParryGlint + FighterStagger + (counter DamageNumeral) | `from=atGlobalFrame`, `durationInFrames=max(parryFlash, stagger, numeral)` |
| `cancel-fired` ("cancel-fire") | CancelFlash | `from=atGlobalFrame`, `durationInFrames=CANCEL_FLASH_FRAMES` |
| `projectile-launched` ("projectile-spawn") | Projectile (in-flight) | `from=spawnGlobalFrame`, `durationInFrames=arrivalGlobalFrame - spawnGlobalFrame` |
| `projectile-clashed` ("projectile-clash") | ProjectileClash | `from=atGlobalFrame`, `durationInFrames=PROJECTILE_CLASH_FRAMES` |
| `projectile-arrived` | ImpactFlash (non-landed only; landed piggybacks on hit-connected) | `from=atGlobalFrame`, `durationInFrames=IMPACT_FLASH_FRAMES` |
| `knockdown-placed` ("knockdown") | Knockdown | `from=frames[0]`, `durationInFrames=frames[1]-frames[0]+1` |
| `effect-activated` | EffectOverlay | `from=activationGlobalFrame`, `durationInFrames=duration ?? 30` |
| `effect-ended` | (no dedicated layer — EffectOverlay auto-expires on its Sequence) | — |
| `ko` | KoFlash | `from=atGlobalFrame`, `durationInFrames=KO_FLASH_FRAMES` |
| `combo-started` / `combo-dropped` ("combo-tick" equivalent) | ComboCounter (HUD) | No per-event Sequence — folded into selector state |

Stubbed placeholder visuals (real assets in a later wave, marked with `// TODO: real asset per fighter x move manifest` inside each layer file): **Stage**, **Fighter**, **FighterAttack**, **FighterReact**, **FighterStagger**, **Knockdown**, **EffectOverlay**.

Intentionally deferred with no visual this wave (documented in MonitorComposition.tsx header):
- `hit-armored` / `hit-evaded` — no dedicated sprite (armor ping, evasion afterimage). Could be added when shared-effects library is authored.
- `stun-placed` / `block-stun-extended` / `block-stun-pool-exhausted` — covered implicitly by the hit-react and block-sparks layers they cause. A dedicated stun indicator is not in the §10b example.
- `defense-precedence-resolved` — internal bookkeeping.
- `slot-dequeued` / `window-tokens-placed` / `cursor-advanced` — timeline-rail events, not monitor events (B3 rail).
- `match-started` / `turn-started` / `turn-ended` / `showdown-paused` / `reveal-beat` / `commit-phase-entered` — FrameReadout HUD selectors only.
- `rage-gained` / `damage-applied` / `hp-restored` / `rage-paid` / `block-pool-consumed` / `block-pool-refilled` — HUD selectors only.
- `cancel-armed` / `cancel-whiffed` / `card-truncated-by-cancel` — no visible monitor visual; `cancel-fired` carries the cinematic beat.
- `card-left-timeline` / `item-consumed` / `item-returned-to-inventory` / `card-parked-to-side-area` / `card-released-from-side-area` — off-monitor disposition.
- `effect-end-scheduled` / `effect-interrupted` — no dedicated visual (could get an aura-crack effect later).
- `projectile-reflected` — not yet visualized; would want a "direction-reverse" animation. Flagged for a later wave.
- `slot-committed` / `slot-discarded-from-sequence` / `slot-reordered` / `rage-paid` — commit-phase events, not monitor events.
- `match-ended` / `mutual-ko-draw` — KoFlash covers the cinematic; the match-end screen is cabinet UI, not monitor composition.
- `diagnostic` — log-only by design.

---

## 4. `useMonitorCanvasTexture` API signature (copy)

```ts
// scripts/monitor/useMonitorCanvasTexture.ts

export interface MonitorCanvasTextureOptions {
  /** Override the 720x405 default if a sharper/coarser panel is desired. */
  resolution?: MonitorResolution;
  /**
   * Composition fps (default 30, per ui-design.md §10d). Decoupled from the
   * r3f scene's 60fps — the texture is updated at this cadence regardless of
   * how fast three.js renders.
   */
  fps?: number;
}

export interface MonitorCanvasTextureHandle {
  /** Stable CanvasTexture — feed to `<meshBasicMaterial map={...} />`. */
  texture: CanvasTexture;
  /** The HTMLCanvasElement backing the texture (exposed for debug overlays). */
  canvas: HTMLCanvasElement;
  /** Monotone frame counter — increments once per composition tick. */
  readonly frame: { current: number };
  /** The draw-queue ref used by the Remotion composition. Opaque to B3. */
  readonly _queueRef: { current: DrawQueue };
  /** The composition's internal resolution. Useful for layout math. */
  resolution: MonitorResolution;
}

export function useMonitorCanvasTexture(
  events: readonly ResolverEvent[],
  options?: MonitorCanvasTextureOptions,
): MonitorCanvasTextureHandle;
```

Stability guarantees:
- `texture` reference is stable across event-log changes (suitable for building a material once).
- `canvas` reference is stable for the lifetime of the hook.
- `texture.needsUpdate = true` is flipped once per composition frame (30fps). The 3D scene can re-render at 60fps without coupling.
- `texture.colorSpace = SRGBColorSpace` on creation.
- Disposes the texture on unmount.

---

## 5. What B3 needs to do to wire the CanvasTexture into `hvcd.monitorMesh`

Minimal wiring inside B3's `MonitorMeshSlot` (a `RendererSlotImpl<SessionSlotProps>`):

```tsx
import { useMonitorCanvasTexture } from '../monitor/useMonitorCanvasTexture';
import { MonitorCompositionHost } from '../monitor/MonitorComposition';
import { useEventStream } from '../slots/shared/useEventStream';
import type { ResolverEvent } from '../resolver/types';

const MonitorMeshSlot: RendererSlotImpl<SessionSlotProps> = ({ events, world, assets }) => {
  // 1. Fold the event stream into an append-only log.
  const eventLog = useEventStream<ResolverEvent, ResolverEvent[]>(
    events,
    'resolverEvents',
    [],
    (log, ev) => [...log, ev],
  );

  // 2. Get a stable CanvasTexture handle.
  const handle = useMonitorCanvasTexture(eventLog);

  // 3. Mount the Remotion composition into the shared draw queue. This
  //    subtree produces no visible DOM — it only enqueues drawCommands.
  //    B3 renders it inside an R3F <Html transform={false}/> portal, a
  //    display:none wrapper, or directly inside the slot root. It doesn't
  //    matter where — the output flows through the canvas, not the DOM.
  return (
    <>
      <MonitorCompositionHost
        events={eventLog}
        fighters={{ p1: 'Blaze', p2: 'Aqua' }}   // resolved from world.readSeatData
        stageId="default-stage"                   // TODO: resolve from session state
        queueRef={handle._queueRef}
      />

      {/* 4. The actual monitor mesh in 3D space. */}
      <mesh position={MONITOR_POS} rotation={MONITOR_ROT}>
        <planeGeometry args={[MONITOR_WIDTH, MONITOR_HEIGHT]} />
        <meshBasicMaterial map={handle.texture} toneMapped={false} />
      </mesh>
    </>
  );
};
```

Notes for B3:
- The monitor mesh is a flat plane UV-mapped 1:1 to the canvas. Canvas is 720×405 (16:9); plane geometry should match aspect. Final plane size in meters is B3's call per cabinet geometry.
- `map={handle.texture}` is all that's needed — the texture uploads itself on each `needsUpdate` flag set by the hook's rAF loop.
- Use `meshBasicMaterial` + `toneMapped={false}` so the monitor's self-emitted light isn't flattened by the scene tone mapper; the composition already bakes in its own lighting/contrast.
- If B3 wants a pixel-art feel, set `texture.minFilter = NearestFilter` / `texture.magFilter = NearestFilter` on the returned handle (exposed via `handle.texture`).
- The slot is declared `renderPhase: 'event'` in renderer-slots.md — which is compatible: the texture updates itself via the rAF loop, so the mesh only needs to upload when `needsUpdate` is flipped. No per-frame React work on B3's side.
- If the CanvasTexture needs to be re-created (resolution change, for example), unmount + remount the slot. The hook intentionally does NOT hot-swap canvases mid-life.

The composition is entirely canvas-based — no DOM rasterization per frame. This is the pipeline ui-design.md §10d requires; do NOT introduce a MediaStream / video-element round-trip.

---

## 6. Open items / handoffs

Flagged for follow-up waves:
- **Stub removal**: `scripts/_stub/remotionApi.ts` (and `scripts/_stub/moduleApi.ts`, owned by B1/A1) disappears when A1 publishes `@tabletoplabs/module-api` + its `/remotion` subpath. Simple find-and-replace, no logic changes.
- **Asset wave**: every `TODO: real asset per fighter x move manifest` comment marks a placeholder canvas-drawn visual that gets replaced with an alpha-WebM or PNG-sequence loader. The `alphaDecode: true` flag on the `DrawCommand` is already set correctly so the 2-concurrent cap takes effect once real decodes appear.
- **Reflect visualization**: `projectile-reflected` has no layer yet. When a "direction-reverse" shared effect exists, add dispatch to MonitorComposition and a selector entry in eventSelectors.
- **Armor/evasion dedicated visuals**: `hit-armored`, `hit-evaded` hooks exist but no visual — defer to when the shared-effects library is authored.
- **Composition render test**: I wrote pure selector tests (fast, harness-agnostic). A full Remotion headless render test is deferred — it requires `@remotion/renderer` + Node canvas polyfill, too heavy for this wave. The selector tests cover the derivation logic end-to-end and the layer components are thin (memoized draw fns); the main thing a render test would add is verifying the Sequence dispatch math, which is tested indirectly through the event-log fixtures.
- **Replay mode**: `useMonitorCanvasTexture` doesn't yet expose a `playbackRate` knob (ui-design.md §10f mentions 0.25× slow-mo review). Add it when replay UI arrives; the selector API already accepts an arbitrary `currentFrame` so selectors are already replay-friendly.

---

## 7. Coordination with other agents

- **A1** — We import `React`, `three`, `@react-three/fiber` via the existing `scripts/_stub/moduleApi.ts` (B1's shim). Remotion goes through the new `scripts/_stub/remotionApi.ts`. Both are labeled temporary and share the same removal trigger: A1 publishing the module-api package.
- **B2** — We consume `ResolverEvent` (already present in `scripts/resolver/types.ts`). Every event kind from `event-log-schema.md` is handled either with a dedicated layer or explicitly deferred; no spec drift.
- **B3** — We publish `useMonitorCanvasTexture(events)` + `<MonitorCompositionHost />`. B3's `MonitorMeshSlot` is the only external consumer. See §5 for the exact wiring.
- **B5** — Every layer marked `TODO: real asset per …` has a stable layerKey so B5's asset swap is a pure drop-in replacement of the draw fn body.

No changes to `hvcd-tabletop-contracts`.

---

## 8. Directory summary

```
scripts/
  _stub/
    remotionApi.ts                 (new — temporary Remotion re-export)
  monitor/                         (new)
    MonitorComposition.tsx
    useMonitorCanvasTexture.ts
    canvasRuntime.ts
    eventSelectors.ts
    layers/
      Stage.tsx
      Fighter.tsx
      FighterAttack.tsx
      FighterReact.tsx
      FighterStagger.tsx
      ImpactFlash.tsx
      BlockSparks.tsx
      ParryGlint.tsx
      DamageNumeral.tsx
      ComboCounter.tsx
      FrameReadout.tsx
      HitStop.tsx
      ProjectileLayer.tsx          (exports Projectile + ProjectileClash)
      Knockdown.tsx
      EffectOverlay.tsx
      CancelFlash.tsx
      KoFlash.tsx
tests/
  monitor.eventSelectors.test.ts   (new)
```
