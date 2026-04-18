/**
 * Parry glint — shared effect from ui-design.md §10c.
 *
 * A bright crescent sweep across the parrier's guard plane when a parry
 * connects. Paired with a FighterStagger on the attacker.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface ParryGlintProps {
  at: SeatId;
  startFrame: number;
  durationFrames: number;
}

const PARRY_GLINT_Z = 42;

function ParryGlintBase({ at, startFrame, durationFrames }: ParryGlintProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);
        const alpha = 0.9 * Math.sin(Math.PI * t); // fade-in-fade-out

        const cx = at === 'p1' ? res.width * 0.35 : res.width * 0.65;
        const cy = res.height * 0.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((at === 'p1' ? 1 : -1) * (Math.PI * 0.25 - t * Math.PI * 0.5));

        ctx.strokeStyle = `rgba(255, 255, 240, ${alpha})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 50, -Math.PI * 0.35, Math.PI * 0.35);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 240, 140, ${alpha * 0.5})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(0, 0, 50, -Math.PI * 0.3, Math.PI * 0.3);
        ctx.stroke();
        ctx.restore();
      },
    [at, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: PARRY_GLINT_Z,
      layerKey: `parry-glint:${at}:${startFrame}`,
      draw,
    },
    [at, startFrame, durationFrames, draw],
  );

  return null;
}

export const ParryGlint = memo(ParryGlintBase);
