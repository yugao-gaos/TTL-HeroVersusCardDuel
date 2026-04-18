/**
 * HVCD monitor — top-level Remotion composition.
 *
 * This is the exact structure from ui-design.md §10b, specialized to the
 * ResolverEvent union defined in event-log-schema.md.
 *
 * Wiring:
 *
 *     <Composition fps={30}>
 *       <Stage />
 *       <Fighter seat="p1" />
 *       <Fighter seat="p2" />
 *       {events.map(... => <Sequence><Layer/></Sequence>)}
 *       <ComboCounter />
 *       <FrameReadout />
 *       <HitStop />
 *     </Composition>
 *
 * Every layer is a `React.memo` component that, on mount, schedules a single
 * `DrawCommand` into the shared draw queue (canvasRuntime.ts). The queue is
 * flushed once per composition frame by the raf loop in
 * useMonitorCanvasTexture. Remotion's <Sequence> machinery handles
 * mount/unmount based on `from` / `durationInFrames`, so a layer only
 * contributes during its event's active window.
 *
 * HVCD-specific mapping from ResolverEvent -> Sequence -> Layer:
 *
 *   card-entered-timeline    -> FighterAttack (for owner seat, totalFrames)
 *   hit-connected            -> FighterReact + ImpactFlash + DamageNumeral
 *   hit-blocked              -> BlockSparks
 *   hit-parried              -> ParryGlint + FighterStagger
 *   projectile-launched      -> Projectile (spawn..arrive)
 *   projectile-clashed       -> ProjectileClash
 *   projectile-arrived       -> ImpactFlash (non-landed; landed piggybacks on
 *                                            hit-connected)
 *   knockdown-placed         -> Knockdown
 *   effect-activated         -> EffectOverlay (duration or fallback)
 *   effect-ended             -> (no dedicated layer; EffectOverlay auto-
 *                                expires via Sequence durationInFrames)
 *   cancel-fired             -> CancelFlash
 *   ko                       -> KoFlash
 *   combo-started / -dropped -> fold into ComboCounter state (no per-event layer)
 *
 * Deferred (no visual in wave 2):
 *   - stun-placed / block-stun-extended: covered by the hit-react / block-
 *     sparks visuals they cause; an explicit stun indicator over the
 *     defender's head could be added if spec needs it.
 *   - defense-precedence-resolved: internal bookkeeping, not rendered.
 *   - hit-armored / hit-evaded: hooks exist, but dedicated layers (armor ping
 *     + evasion afterimage) are deferred with a TODO below.
 *   - slot-dequeued / window-tokens-placed / cursor-advanced: timeline
 *     events, not monitor events.
 *   - match-started / turn-started / turn-ended / showdown-paused: consumed
 *     by FrameReadout selectors.
 *   - rage-gained / damage-applied / hp-restored: HUD selectors only.
 *   - card-left-timeline / card-parked-to-side-area / item-returned-*: off-
 *     monitor disposition (goes to the rail/hand).
 *
 * Every TODO-marked layer is swapped for a real alpha-WebM clip in the asset-
 * authoring wave.
 */

import { memo, useMemo, useRef } from '@tabletoplabs/module-api';
import type { ComponentType, ReactNode } from '@tabletoplabs/module-api';
import {
  Composition,
  Sequence,
  useCurrentFrame,
} from '@tabletoplabs/module-api/remotion';
import type { ResolverEvent, SeatId } from '../resolver/types';
import {
  DrawQueueCtx,
  createDrawQueue,
  DEFAULT_MONITOR_RES,
  type DrawQueue,
  type MonitorResolution,
} from './canvasRuntime';

import { Stage } from './layers/Stage';
import { Fighter } from './layers/Fighter';
import { FighterAttack } from './layers/FighterAttack';
import { FighterReact } from './layers/FighterReact';
import { FighterStagger } from './layers/FighterStagger';
import { ImpactFlash } from './layers/ImpactFlash';
import { BlockSparks } from './layers/BlockSparks';
import { ParryGlint } from './layers/ParryGlint';
import { DamageNumeral } from './layers/DamageNumeral';
import { ComboCounter } from './layers/ComboCounter';
import { FrameReadout } from './layers/FrameReadout';
import { HitStop } from './layers/HitStop';
import { Projectile, ProjectileClash } from './layers/ProjectileLayer';
import { Knockdown } from './layers/Knockdown';
import { EffectOverlay } from './layers/EffectOverlay';
import { CancelFlash } from './layers/CancelFlash';
import { KoFlash } from './layers/KoFlash';

import { hitSize } from './eventSelectors';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const MONITOR_FPS = 30;
/** Max composition duration — generous to accommodate a full match replay. */
const MONITOR_DURATION_FRAMES = 18_000; // 10 minutes at 30fps

const PARRY_FLASH_FRAMES = 10;
const STAGGER_FRAMES = 14;
const BLOCK_SPARKS_FRAMES = 8;
const IMPACT_FLASH_FRAMES = 6;
const DAMAGE_NUMERAL_FRAMES = 30;
const EFFECT_DEFAULT_FRAMES = 30;
const CANCEL_FLASH_FRAMES = 6;
const KO_FLASH_FRAMES = 60;
const PROJECTILE_CLASH_FRAMES = 8;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MonitorCompositionProps {
  events: readonly ResolverEvent[];
  /** Fighter display names — drives idle / attack / react Fighter components. */
  fighters: Record<SeatId, string>;
  /** Stage plate id (background choice). Placeholder today; real plate later. */
  stageId: string;
  /** Resolution override — falls back to ui-design.md §10d default (720x405). */
  resolution?: MonitorResolution;
}

// ---------------------------------------------------------------------------
// Event -> Sequence dispatch
// ---------------------------------------------------------------------------

/**
 * Render one event as a <Sequence> wrapping the appropriate layer(s).
 * Returns null for events that don't have a visual (HUD state only).
 *
 * Uses a stable `key` derived from event identity so Remotion doesn't remount
 * a Sequence when the event log re-renders with the same prefix.
 */
function renderEventSequence(e: ResolverEvent, index: number): ReactNode {
  switch (e.kind) {
    case 'card-entered-timeline': {
      const key = `attack:${e.seat}:${e.cardId}:${e.atGlobalFrame}:${index}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={Math.max(1, e.totalFrames)}
        >
          <FighterAttack
            seat={e.seat}
            fighter={e.seat /* TODO: real fighter id per seat */}
            move={e.cardId}
            startFrame={e.atGlobalFrame}
          />
        </Sequence>
      );
    }

    case 'hit-connected': {
      const key = `hit:${e.defenderSeat}:${e.atGlobalFrame}:${index}`;
      const size = hitSize(e.damage);
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={Math.max(e.hitStunFrames, DAMAGE_NUMERAL_FRAMES)}
        >
          <FighterReact
            seat={e.defenderSeat}
            size={size}
            startFrame={e.atGlobalFrame}
          />
          <ImpactFlash
            at={e.defenderSeat}
            intensity={e.damage}
            startFrame={e.atGlobalFrame}
            durationFrames={IMPACT_FLASH_FRAMES}
          />
          <DamageNumeral
            seat={e.defenderSeat}
            value={e.damage}
            startFrame={e.atGlobalFrame}
            durationFrames={DAMAGE_NUMERAL_FRAMES}
          />
        </Sequence>
      );
    }

    case 'hit-blocked': {
      const key = `block:${e.defenderSeat}:${e.atGlobalFrame}:${index}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={BLOCK_SPARKS_FRAMES}
        >
          <BlockSparks
            at={e.defenderSeat}
            startFrame={e.atGlobalFrame}
            durationFrames={BLOCK_SPARKS_FRAMES}
          />
        </Sequence>
      );
    }

    case 'hit-parried': {
      const key = `parry:${e.parrierSeat}:${e.atGlobalFrame}:${index}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={Math.max(PARRY_FLASH_FRAMES, STAGGER_FRAMES, DAMAGE_NUMERAL_FRAMES)}
        >
          <ParryGlint
            at={e.parrierSeat}
            startFrame={e.atGlobalFrame}
            durationFrames={PARRY_FLASH_FRAMES}
          />
          <FighterStagger
            seat={e.attackerSeat}
            startFrame={e.atGlobalFrame}
          />
          {e.counterDamage > 0 ? (
            <DamageNumeral
              seat={e.attackerSeat}
              value={e.counterDamage}
              startFrame={e.atGlobalFrame + 2}
              durationFrames={DAMAGE_NUMERAL_FRAMES}
            />
          ) : null}
        </Sequence>
      );
    }

    case 'projectile-launched': {
      const key = `proj:${e.projectileId}`;
      return (
        <Sequence
          key={key}
          from={e.spawnGlobalFrame}
          durationInFrames={Math.max(1, e.arrivalGlobalFrame - e.spawnGlobalFrame)}
        >
          <Projectile
            ownerSeat={e.ownerSeat}
            projectileId={e.projectileId}
            spawnFrame={e.spawnGlobalFrame}
            arriveFrame={e.arrivalGlobalFrame}
          />
        </Sequence>
      );
    }

    case 'projectile-clashed': {
      const key = `clash:${e.aProjectileId}:${e.bProjectileId}:${e.atGlobalFrame}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={PROJECTILE_CLASH_FRAMES}
        >
          <ProjectileClash
            startFrame={e.atGlobalFrame}
            durationFrames={PROJECTILE_CLASH_FRAMES}
          />
        </Sequence>
      );
    }

    case 'projectile-arrived': {
      // 'landed' is handled by hit-connected; we only flash the non-landed
      // arrivals (blocked/armored/reflected/evaded/whiff-invincible) so the
      // spectator sees SOMETHING happen at the target.
      if (e.resolution === 'landed') return null;
      const key = `proj-arrive:${e.projectileId}:${e.atGlobalFrame}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={IMPACT_FLASH_FRAMES}
        >
          <ImpactFlash
            at={e.targetSeat}
            intensity={8}
            startFrame={e.atGlobalFrame}
            durationFrames={IMPACT_FLASH_FRAMES}
          />
        </Sequence>
      );
    }

    case 'knockdown-placed': {
      const [start, end] = e.frames;
      const duration = Math.max(1, end - start + 1);
      const key = `kd:${e.seat}:${start}:${index}`;
      return (
        <Sequence key={key} from={start} durationInFrames={duration}>
          <Knockdown
            seat={e.seat}
            startFrame={start}
            durationFrames={duration}
          />
        </Sequence>
      );
    }

    case 'effect-activated': {
      const duration = e.duration ?? EFFECT_DEFAULT_FRAMES;
      const key = `effect:${e.effectId}:${e.targetSeat}:${e.activationGlobalFrame}:${index}`;
      return (
        <Sequence
          key={key}
          from={e.activationGlobalFrame}
          durationInFrames={duration}
        >
          <EffectOverlay
            targetSeat={e.targetSeat}
            effectId={e.effectId}
            startFrame={e.activationGlobalFrame}
            durationFrames={duration}
          />
        </Sequence>
      );
    }

    case 'effect-ended': {
      // Covered by effect-activated's sequence duration. Nothing to render.
      return null;
    }

    case 'cancel-fired': {
      const key = `cancel:${e.seat}:${e.atGlobalFrame}:${index}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={CANCEL_FLASH_FRAMES}
        >
          <CancelFlash
            seat={e.seat}
            startFrame={e.atGlobalFrame}
            durationFrames={CANCEL_FLASH_FRAMES}
          />
        </Sequence>
      );
    }

    case 'ko': {
      const key = `ko:${e.losingSeat}:${e.atGlobalFrame}`;
      return (
        <Sequence
          key={key}
          from={e.atGlobalFrame}
          durationInFrames={KO_FLASH_FRAMES}
        >
          <KoFlash
            losingSeat={e.losingSeat}
            startFrame={e.atGlobalFrame}
            durationFrames={KO_FLASH_FRAMES}
          />
        </Sequence>
      );
    }

    // TODO: hit-armored / hit-evaded dedicated visuals (armor ping, evasion
    // afterimage). Deferred per scope note.

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Inner tree (mounted inside Remotion's <Composition/>)
// ---------------------------------------------------------------------------

function MonitorCompositionInnerBase({
  events,
  fighters,
  stageId,
}: Omit<MonitorCompositionProps, 'resolution'>) {
  // Live frame only needed by HUD selectors; layers themselves own their
  // draw-time animation via (frame - startFrame) math.
  const frame = useCurrentFrame();

  const eventNodes = useMemo(
    () => events.map((e, i) => renderEventSequence(e, i)).filter(Boolean),
    [events],
  );

  return (
    <>
      <Stage plate={stageId} />
      <Fighter seat="p1" name={fighters.p1} />
      <Fighter seat="p2" name={fighters.p2} />
      {eventNodes}
      <ComboCounter events={events} />
      <FrameReadout events={events} currentFrame={frame} />
      <HitStop events={events} currentFrame={frame} />
    </>
  );
}

const MonitorCompositionInner = memo(MonitorCompositionInnerBase);

// ---------------------------------------------------------------------------
// Host component — mounted inside B3's monitor mesh slot
// ---------------------------------------------------------------------------

export interface MonitorCompositionHostProps {
  events: readonly ResolverEvent[];
  fighters: Record<SeatId, string>;
  stageId: string;
  /**
   * The DrawQueue ref from useMonitorCanvasTexture. Wiring the provider here
   * lets every layer enqueue draw commands into the shared queue.
   */
  queueRef: { current: DrawQueue | null };
  resolution?: MonitorResolution;
}

/**
 * The component B3 actually mounts. It's a thin provider + Remotion
 * <Composition /> shell; the visible output is 0x0 because the monitor mesh
 * reads pixels from the shared canvas, not from the DOM.
 *
 * In practice B3 renders this inside a CSS `display: none` wrapper or a
 * hidden r3f `<Html/>` portal — we don't care, it produces no visible DOM.
 */
export const MonitorCompositionHost = memo(function MonitorCompositionHost({
  events,
  fighters,
  stageId,
  queueRef,
  resolution = DEFAULT_MONITOR_RES,
}: MonitorCompositionHostProps) {
  // Fallback queue if caller hasn't wired one yet (dev-time safety).
  const localQueueRef = useRef<DrawQueue>(queueRef.current ?? createDrawQueue());
  if (!queueRef.current) {
    queueRef.current = localQueueRef.current;
  }

  const ctxValue = useMemo(
    () => ({ queueRef: queueRef as { current: DrawQueue }, resolution }),
    [queueRef, resolution],
  );

  return (
    <DrawQueueCtx.Provider value={ctxValue}>
      <Composition
        id="hvcd-monitor"
        component={MonitorCompositionInner as unknown as ComponentType<Record<string, unknown>>}
        durationInFrames={MONITOR_DURATION_FRAMES}
        fps={MONITOR_FPS}
        width={resolution.width}
        height={resolution.height}
        defaultProps={{ events, fighters, stageId }}
      />
    </DrawQueueCtx.Provider>
  );
});

/**
 * Standalone export — a plain React subtree matching the ui-design.md §10b
 * example. Useful for snapshot tests that don't want to spin up the full
 * Remotion <Composition /> shell.
 */
export const MonitorComposition = MonitorCompositionInner;
