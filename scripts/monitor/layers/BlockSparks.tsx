/**
 * Block sparks — shared effect from ui-design.md §10c.
 *
 * Emitted on hit-blocked; a shower of short cyan sparks at the defender's
 * guard plane. Canvas-drawn.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface BlockSparksProps {
  at: SeatId;
  startFrame: number;
  durationFrames: number;
}

const BLOCK_SPARKS_Z = 38;

function BlockSparksBase({ at, startFrame, durationFrames }: BlockSparksProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);

        const cx = at === 'p1' ? res.width * 0.35 : res.width * 0.65;
        const cy = res.height * 0.48;

        ctx.save();
        ctx.strokeStyle = `rgba(120, 220, 255, ${1 - t})`;
        ctx.lineWidth = 2;
        const sparkCount = 8;
        // Deterministic pseudo-random based on (cx, frame) so the pattern is
        // stable within a given flash. We want monitor output to be
        // reproducible for replay / spectator parity.
        for (let i = 0; i < sparkCount; i++) {
          const ang = (i / sparkCount) * Math.PI * 2 + phase * 0.2;
          const len = 10 + 30 * t;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.stroke();
        }
        ctx.restore();
      },
    [at, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: BLOCK_SPARKS_Z,
      layerKey: `block-sparks:${at}:${startFrame}`,
      draw,
    },
    [at, startFrame, durationFrames, draw],
  );

  return null;
}

export const BlockSparks = memo(BlockSparksBase);
