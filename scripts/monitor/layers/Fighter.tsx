/**
 * Per-seat fighter root — ui-design.md §10b `<Fighter seat="p1" ... />`.
 *
 * Renders the fighter's idle stance at their seat's monitor-half. All
 * sequence-driven overlays (FighterAttack / FighterReact / FighterStagger)
 * composite ON TOP of this via z-order.
 *
 * Placeholder visual: a labeled silhouette on the left or right half.
 * TODO: real asset per fighter x move manifest (alpha-WebM idle loop).
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface FighterProps {
  seat: SeatId;
  /** Fighter display name. */
  name: string;
}

const FIGHTER_Z = 5;

function FighterBase({ seat, name }: FighterProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, _frame: number, res: { width: number; height: number }) => {
        const w = res.width;
        const h = res.height;
        // p1 on the left, p2 on the right — mirrors seating.
        const cx = seat === 'p1' ? w * 0.3 : w * 0.7;
        const cy = h * 0.55;

        // Silhouette.
        ctx.fillStyle = seat === 'p1' ? '#3a5fe0' : '#e04a4a';
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 50, 90, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Nametag.
        ctx.fillStyle = '#eaeaf0';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name, cx, cy + 120);

        // Seat label tiny badge.
        ctx.fillStyle = '#8b8ca0';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(seat.toUpperCase(), cx, cy + 140);
      },
    [seat, name],
  );

  useEnqueueDraw(
    { z: FIGHTER_Z, layerKey: `fighter:${seat}`, draw },
    [seat, name, draw],
  );

  return null;
}

export const Fighter = memo(FighterBase);
