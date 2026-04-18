/**
 * Impact flash — shared effect from ui-design.md §10c.
 *
 * Bright radial burst at the defender's position on a hit-connected or
 * projectile-arrived event. Canvas-drawn, not video — cheap.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface ImpactFlashProps {
  at: SeatId;
  intensity: number;
  startFrame: number;
  durationFrames: number;
}

const IMPACT_FLASH_Z = 40;

function ImpactFlashBase({ at, intensity, startFrame, durationFrames }: ImpactFlashProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);
        const alpha = 1 - t;
        const radius = 40 + 140 * Math.min(1, intensity / 30) * t;

        const cx = at === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.5;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
        grad.addColorStop(0.4, `rgba(255, 210, 100, ${alpha * 0.7})`);
        grad.addColorStop(1, 'rgba(255, 140, 20, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      },
    [at, intensity, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: IMPACT_FLASH_Z,
      layerKey: `impact-flash:${at}:${startFrame}`,
      draw,
    },
    [at, intensity, startFrame, durationFrames, draw],
  );

  return null;
}

export const ImpactFlash = memo(ImpactFlashBase);
