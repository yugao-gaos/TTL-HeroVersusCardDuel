/**
 * HVCD monitor composition — canvas runtime.
 *
 * Implements the "canvas-native authoring discipline" described in
 * ui-design.md §10d. Every layer in the composition is a pure draw function:
 *
 *     type CanvasDraw = (ctx, frame, resolution) => void;
 *
 * Layers never touch the DOM. Remotion's React tree ORCHESTRATES which
 * layers run at which frames (via <Sequence/>), and the composition-level
 * hook collects their draw fns and executes them into a single offscreen
 * <canvas>. That canvas is then wrapped in THREE.CanvasTexture and handed to
 * B3's monitor mesh — zero DOM rasterization cost per frame.
 *
 * Why custom drawImage and not react-konva / pixi-react?
 *
 *   - Our bottleneck is the 2-concurrent-alpha-decode cap (ui-design.md §10d).
 *     That's easiest to enforce by controlling `drawImage(video, ...)` calls
 *     directly: we can detect video elements in the drawable list and refuse
 *     to schedule more than two per frame.
 *   - Remotion already has its own React reconciler loop driving frame
 *     advance; adding a second renderer (Konva's stage, Pixi's ticker) means
 *     two schedulers competing for the main thread. A raw canvas keeps the
 *     scheduling story single-authority.
 *   - The asset pipeline from B5 (alpha-WebM + shared effect sprites)
 *     produces exactly the kind of input drawImage eats natively. No adapter
 *     layer needed.
 *   - Smallest bundle delta in the higher-trust loader per OQ-1. The
 *     higher-trust bundle is already paying for React + three + r3f +
 *     remotion; a 2D renderer on top of that is avoidable weight.
 *
 * Future authoring can still reach for react-konva later if a HUD primitive
 * becomes tedious to draw by hand — this runtime is a thin adapter, not a
 * wall.
 */

import { createContext, useContext, useEffect, useRef } from '../_stub/moduleApi';
import type { RefObject, ReactNode } from '../_stub/moduleApi';

// ---------------------------------------------------------------------------
// The shared draw queue
// ---------------------------------------------------------------------------

/**
 * A draw command enqueued by a Remotion layer during its React render. The
 * parent MonitorComposition flushes these in z-order once per composition
 * frame.
 */
export interface DrawCommand {
  /** Z-order; higher draws on top. Ties broken by enqueue order. */
  z: number;
  /** Draw callback; receives the 2D context sized to the internal resolution. */
  draw: (ctx: CanvasRenderingContext2D, frame: number, res: MonitorResolution) => void;
  /** Cheap identity tag for debugging / React key. */
  layerKey: string;
  /** True if this layer uses an alpha-decoded asset (video). Budget-counted. */
  alphaDecode?: boolean;
}

export interface MonitorResolution {
  width: number;
  height: number;
}

/** Default internal resolution — ui-design.md §10d. */
export const DEFAULT_MONITOR_RES: MonitorResolution = { width: 720, height: 405 };

/** ui-design.md §10d budget — enforced at flush time. */
export const MAX_CONCURRENT_ALPHA_DECODES = 2;

/**
 * Each render, layers push draw commands into a ref-shared queue. The queue
 * is created and owned by MonitorComposition and read by the raf loop in
 * useMonitorCanvasTexture. Keeping it in a ref avoids React state churn.
 */
export interface DrawQueue {
  commands: DrawCommand[];
  /** Monotone counter — useful for debugging "did my layer run?" */
  flushCounter: number;
}

export function createDrawQueue(): DrawQueue {
  return { commands: [], flushCounter: 0 };
}

// ---------------------------------------------------------------------------
// React plumbing
// ---------------------------------------------------------------------------

export interface DrawQueueContext {
  queueRef: RefObject<DrawQueue>;
  resolution: MonitorResolution;
}

/**
 * Context the MonitorComposition populates so every layer can enqueue its
 * draw fn without prop-drilling.
 */
export const DrawQueueCtx = createContext<DrawQueueContext | null>(null);

/**
 * Inside a layer component: schedule a draw this render. The effect cleanup
 * removes the command when the layer unmounts (or its deps change), so a
 * <Sequence> expiring cleanly stops contributing.
 *
 * Usage (inside a React.memo layer):
 *
 *     useEnqueueDraw({
 *       z: 10,
 *       layerKey: `impact-flash:${seat}:${startFrame}`,
 *       draw: (ctx, frame, res) => { ... },
 *     }, [seat, startFrame]);
 */
export function useEnqueueDraw(
  command: DrawCommand,
  deps: readonly unknown[],
): void {
  const ctx = useContext(DrawQueueCtx);
  // Stable ref to the latest command so we don't churn the deps array.
  const latest = useRef(command);
  latest.current = command;

  useEffect(() => {
    if (!ctx) return;
    const q = ctx.queueRef.current;
    if (!q) return;
    const cmd = latest.current;
    q.commands.push(cmd);
    return () => {
      const curr = ctx.queueRef.current;
      if (!curr) return;
      const ix = curr.commands.indexOf(cmd);
      if (ix >= 0) curr.commands.splice(ix, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

/**
 * Execute every draw command in z-order into the target canvas. Enforces the
 * alpha-decode cap by skipping surplus alpha-decode commands (they simply
 * don't draw this frame; the resolver's event will re-emit them on the
 * next if still active).
 */
export function flushDrawQueue(
  queue: DrawQueue,
  ctx: CanvasRenderingContext2D,
  frame: number,
  resolution: MonitorResolution,
): void {
  queue.flushCounter++;

  ctx.save();
  // Clear. Remotion owns pixel state; we rewrite fully each frame.
  ctx.clearRect(0, 0, resolution.width, resolution.height);

  // Sort by z. The list is tiny (~dozens) so a per-frame sort is fine; we
  // avoid mutating the source array.
  const sorted = queue.commands.slice().sort((a, b) => a.z - b.z);

  let alphaDecodeBudget = MAX_CONCURRENT_ALPHA_DECODES;
  for (const cmd of sorted) {
    if (cmd.alphaDecode) {
      if (alphaDecodeBudget <= 0) continue;
      alphaDecodeBudget--;
    }
    try {
      cmd.draw(ctx, frame, resolution);
    } catch (err) {
      // Don't let one misbehaving layer poison the whole frame.
      // eslint-disable-next-line no-console
      console.warn('[hvcd.monitor] layer draw failed', cmd.layerKey, err);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Offscreen canvas setup
// ---------------------------------------------------------------------------

/**
 * Create the offscreen HTMLCanvasElement the composition renders into.
 *
 * We use HTMLCanvasElement rather than OffscreenCanvas so the CanvasTexture
 * integration stays on the main thread — three.js already requires a main-
 * thread upload, and OffscreenCanvas buys nothing when we can't move the
 * GL upload off the main thread anyway.
 */
export function createMonitorCanvas(resolution: MonitorResolution): HTMLCanvasElement {
  // Happy-path: we're in a DOM. The higher-trust bundle is browser-only per
  // OQ-1, so this is always true in production. Tests mock via a polyfill.
  if (typeof document === 'undefined') {
    throw new Error(
      '[hvcd.monitor] createMonitorCanvas called without a DOM. ' +
      'Tests should mock `document.createElement(\'canvas\')` via jsdom or similar.',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = resolution.width;
  canvas.height = resolution.height;
  return canvas;
}

/**
 * Provider props for DrawQueueCtx. Top-level `MonitorComposition` wraps its
 * children in this; every layer below it can call `useEnqueueDraw`.
 */
export interface DrawQueueProviderProps {
  queueRef: RefObject<DrawQueue>;
  resolution: MonitorResolution;
  children: ReactNode;
}
