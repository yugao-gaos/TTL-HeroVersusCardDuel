/**
 * Fighter hit-react — ui-design.md §10c "per fighter x reaction type"
 * small/medium/heavy hit-react clip.
 *
 * TODO: real asset per fighter x hit-size manifest.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';
import type { HitSize } from '../eventSelectors';

export interface FighterReactProps {
  seat: SeatId;
  size: HitSize;
  startFrame: number;
}

const FIGHTER_REACT_Z = 22;
const SHAKE_AMPLITUDE_BY_SIZE: Record<HitSize, number> = {
  small: 2,
  medium: 5,
  heavy: 9,
};

function FighterReactBase({ seat, size, startFrame }: FighterReactProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const amp = SHAKE_AMPLITUDE_BY_SIZE[size];
        // Damped shake.
        const damping = Math.max(0, 1 - phase / 20);
        const shakeX = Math.sin(phase * 2.3) * amp * damping;
        const shakeY = Math.cos(phase * 3.1) * amp * 0.6 * damping;

        const cx = (seat === 'p1' ? res.width * 0.3 : res.width * 0.7) + shakeX;
        const cy = res.height * 0.55 + shakeY;

        // Red tint outline.
        ctx.save();
        ctx.fillStyle = 'rgba(220, 40, 40, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 55, 95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    [seat, size, startFrame],
  );

  useEnqueueDraw(
    {
      z: FIGHTER_REACT_Z,
      layerKey: `fighter-react:${seat}:${size}:${startFrame}`,
      draw,
      alphaDecode: true, // reserved slot (two fighters max concurrent)
    },
    [seat, size, startFrame, draw],
  );

  return null;
}

export const FighterReact = memo(FighterReactBase);
