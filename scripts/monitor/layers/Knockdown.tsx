/**
 * Knockdown fall / ground-state visual — ui-design.md §10c references
 * "knockdown-fall, getup" as per-fighter reaction clips. We draw the
 * defender slumped at the floor plane for the knockdown duration.
 *
 * TODO: real asset per fighter x knockdown-fall / getup manifest.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface KnockdownProps {
  seat: SeatId;
  startFrame: number;
  durationFrames: number;
}

const KNOCKDOWN_Z = 25;

function KnockdownBase({ seat, startFrame, durationFrames }: KnockdownProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const fallT = Math.min(1, phase / 10);
        const getupT = Math.max(0, (phase - (durationFrames - 12)) / 12);
        const tilt = (seat === 'p1' ? 1 : -1) * Math.PI * 0.4 * fallT * (1 - getupT);

        const cx = seat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.55 + 30 * fallT * (1 - getupT);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.fillStyle = seat === 'p1' ? 'rgba(90, 130, 180, 0.7)' : 'rgba(180, 90, 90, 0.7)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 50, 90, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // "KD" badge.
        ctx.fillStyle = '#ffd860';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KD', cx, cy - 20);
      },
    [seat, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: KNOCKDOWN_Z,
      layerKey: `knockdown:${seat}:${startFrame}`,
      draw,
    },
    [seat, startFrame, durationFrames, draw],
  );

  return null;
}

export const Knockdown = memo(KnockdownBase);
