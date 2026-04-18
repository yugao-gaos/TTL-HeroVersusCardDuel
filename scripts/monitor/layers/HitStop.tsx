/**
 * Hit-stop — ui-design.md §10b `<HitStop events={events} />`.
 *
 * Not a visible layer in the literal sense. It darkens / desaturates the
 * whole composition for the hit-stop window so the impact "reads" harder,
 * per §12d. We implement as a full-screen overlay at very high z — it
 * draws a translucent black / red vignette scaled by the hit-stop factor
 * returned by selectHitStop.
 *
 * This layer is always mounted; its draw fn is a no-op when `scale >= 1`.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import { selectHitStop } from '../eventSelectors';
import type { ResolverEvent } from '../../resolver/types';

export interface HitStopProps {
  events: readonly ResolverEvent[];
  currentFrame: number;
}

const HIT_STOP_Z = 100;

function HitStopBase({ events, currentFrame }: HitStopProps) {
  const scale = useMemo(
    () => selectHitStop(events, currentFrame),
    [events, currentFrame],
  );

  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, _frame: number, res: { width: number; height: number }) => {
        if (scale >= 1) return;
        const intensity = 1 - scale;

        // Radial vignette — darker at the edges.
        const grad = ctx.createRadialGradient(
          res.width / 2,
          res.height / 2,
          res.height * 0.3,
          res.width / 2,
          res.height / 2,
          res.width * 0.7,
        );
        grad.addColorStop(0, `rgba(0, 0, 0, 0)`);
        grad.addColorStop(1, `rgba(10, 0, 0, ${0.45 * intensity})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, res.width, res.height);
      },
    [scale],
  );

  useEnqueueDraw(
    {
      z: HIT_STOP_Z,
      layerKey: `hit-stop`,
      draw,
    },
    [draw],
  );

  return null;
}

export const HitStop = memo(HitStopBase);
