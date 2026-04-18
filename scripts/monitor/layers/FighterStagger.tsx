/**
 * Fighter stagger — recoil after a parry. ui-design.md §10b references this
 * as the attacker-side visual when the defender parries.
 *
 * TODO: real asset — fighter-specific stagger clip.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface FighterStaggerProps {
  seat: SeatId;
  startFrame: number;
}

const FIGHTER_STAGGER_Z = 23;

function FighterStaggerBase({ seat, startFrame }: FighterStaggerProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        // Leaning recoil + rotation.
        const tilt = Math.min(0.4, phase / 30);
        const dx = (seat === 'p1' ? -1 : 1) * phase * 0.6;
        const cx = (seat === 'p1' ? res.width * 0.3 : res.width * 0.7) + dx;
        const cy = res.height * 0.55;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(seat === 'p1' ? -tilt : tilt);
        ctx.fillStyle = 'rgba(180, 120, 220, 0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 50, 90, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    [seat, startFrame],
  );

  useEnqueueDraw(
    {
      z: FIGHTER_STAGGER_Z,
      layerKey: `fighter-stagger:${seat}:${startFrame}`,
      draw,
    },
    [seat, startFrame, draw],
  );

  return null;
}

export const FighterStagger = memo(FighterStaggerBase);
