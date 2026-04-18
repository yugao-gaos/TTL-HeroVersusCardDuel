/**
 * Cancel fire flash — brief purple ring around the attacker when a cancel
 * fires (§13 of combat-system.md). Signals to the spectator that the
 * attacker spent rage/connect-credit to cut out of their own startup.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface CancelFlashProps {
  seat: SeatId;
  startFrame: number;
  durationFrames: number;
}

const CANCEL_FLASH_Z = 44;

function CancelFlashBase({ seat, startFrame, durationFrames }: CancelFlashProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);
        const alpha = 1 - t;
        const radius = 40 + t * 60;

        const cx = seat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.5;

        ctx.save();
        ctx.strokeStyle = `rgba(200, 110, 255, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    [seat, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: CANCEL_FLASH_Z,
      layerKey: `cancel-flash:${seat}:${startFrame}`,
      draw,
    },
    [seat, startFrame, durationFrames, draw],
  );

  return null;
}

export const CancelFlash = memo(CancelFlashBase);
