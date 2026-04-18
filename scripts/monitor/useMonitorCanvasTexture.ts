/**
 * HVCD monitor composition — public hook.
 *
 * B3's `hvcd.monitorMesh` slot calls this hook to get a stable
 * THREE.CanvasTexture whose backing canvas is driven by the Remotion
 * composition in `MonitorComposition.tsx`.
 *
 * Pipeline (ui-design.md §10d):
 *
 *     event log          this hook                                 B3
 *        │                   │                                     │
 *        ▼                   ▼                                     │
 *     Remotion tree → offscreen <canvas> → THREE.CanvasTexture ──► monitor mesh
 *
 * Stability contract:
 *   - The returned CanvasTexture has stable identity for the lifetime of
 *     the mount (even as `events` changes). B3 can build its material once
 *     and reuse.
 *   - `texture.needsUpdate = true` is flipped once per composition frame
 *     (30fps) via a requestAnimationFrame loop; 3D scene can render at 60fps
 *     without coupling.
 *   - `texture.colorSpace` is set to SRGBColorSpace to match the three.js
 *     color pipeline used elsewhere in the cabinet.
 *
 * Usage, from B3's monitor mesh slot:
 *
 *     import { useMonitorCanvasTexture } from '../monitor/useMonitorCanvasTexture';
 *     import { useEventStream } from '../slots/shared/useEventStream';
 *
 *     const MonitorMeshSlot: RendererSlotImpl<SessionSlotProps> = ({ events }) => {
 *       const eventLog = useEventStream<ResolverEvent, ResolverEvent[]>(
 *         events, 'resolverEvents', [], (log, ev) => [...log, ev],
 *       );
 *       const texture = useMonitorCanvasTexture(eventLog);
 *       return (
 *         <mesh position={MONITOR_POS} rotation={MONITOR_ROT}>
 *           <planeGeometry args={[MONITOR_W, MONITOR_H]} />
 *           <meshBasicMaterial map={texture} toneMapped={false} />
 *         </mesh>
 *       );
 *     };
 */

import { useEffect, useMemo, useRef } from '../_stub/moduleApi';
import { CanvasTexture, SRGBColorSpace } from '../_stub/moduleApi';
import type { ResolverEvent } from '../resolver/types';
import {
  createDrawQueue,
  createMonitorCanvas,
  flushDrawQueue,
  DEFAULT_MONITOR_RES,
  type DrawQueue,
  type MonitorResolution,
} from './canvasRuntime';

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

/**
 * The one-line API B3 consumes. Returns a stable handle; pass `.texture`
 * straight into a three.js material.
 *
 * @param events   The resolver event log (append-only, see event-log-schema.md)
 * @param options  Resolution / fps overrides (both default to §10d values)
 */
export function useMonitorCanvasTexture(
  events: readonly ResolverEvent[],
  options: MonitorCanvasTextureOptions = {},
): MonitorCanvasTextureHandle {
  const resolution = options.resolution ?? DEFAULT_MONITOR_RES;
  const fps = options.fps ?? 30;

  // --- One-time canvas + texture ------------------------------------------
  // useMemo (not useState) because we want the same reference on every render
  // and we don't need React to track it as state.
  const canvas = useMemo<HTMLCanvasElement>(
    () => createMonitorCanvas(resolution),
    // Intentionally stable across resolution changes for the lifetime of the
    // hook. If the caller wants to swap resolution mid-game, they can remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const texture = useMemo<CanvasTexture>(() => {
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    // Mark for upload once so the first frame before the raf loop is valid.
    tex.needsUpdate = true;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  // --- Mutable state the raf loop reads ------------------------------------
  const queueRef = useRef<DrawQueue>(createDrawQueue());
  const frameRef = useRef<number>(0);
  const eventsRef = useRef<readonly ResolverEvent[]>(events);
  eventsRef.current = events;

  // --- Raf loop ------------------------------------------------------------
  useEffect(() => {
    const ctx2d = canvas.getContext('2d', { alpha: true });
    if (!ctx2d) {
      // eslint-disable-next-line no-console
      console.error('[hvcd.monitor] 2d context unavailable; monitor will be blank');
      return;
    }
    const frameInterval = 1000 / fps;
    let lastTick = performance.now();
    let rafHandle = 0;
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      rafHandle = requestAnimationFrame(tick);
      const elapsed = now - lastTick;
      if (elapsed < frameInterval) return;
      // Catch up at most one frame per rAF; if the tab has been backgrounded
      // we'd rather skip than burn CPU catching up to realtime.
      lastTick = now;

      frameRef.current += 1;
      flushDrawQueue(queueRef.current, ctx2d, frameRef.current, resolution);
      texture.needsUpdate = true;
    };
    rafHandle = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafHandle);
    };
  }, [canvas, fps, resolution, texture]);

  // --- Dispose on unmount --------------------------------------------------
  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return useMemo<MonitorCanvasTextureHandle>(
    () => ({
      texture,
      canvas,
      frame: frameRef,
      _queueRef: queueRef,
      resolution,
    }),
    [texture, canvas, resolution],
  );
}

/**
 * Convenience: the shape B3 needs to render the MonitorComposition tree into
 * the canvas. B3's slot should:
 *
 *   1. Call `useMonitorCanvasTexture(events)`.
 *   2. Mount `<MonitorComposition events={events} handle={handle} />`
 *      somewhere in its render output (the composition produces no visible
 *      JSX for three.js — it's canvas-only, so it can live in a portal).
 *   3. Attach `handle.texture` to the monitor mesh material.
 *
 * A helper component that does step 2 lives in MonitorComposition.tsx as
 * `<MonitorCompositionHost />`.
 */
export type { DrawQueue, MonitorResolution };
