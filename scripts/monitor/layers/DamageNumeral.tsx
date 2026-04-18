/**
 * Damage numeral — shared effect from ui-design.md §10c.
 *
 * Pops up over the defender's head on each damage tick; floats up and fades
 * over `durationFrames`.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface DamageNumeralProps {
  seat: SeatId;
  value: number;
  startFrame: number;
  durationFrames: number;
}

const DAMAGE_NUMERAL_Z = 80;

function DamageNumeralBase({ seat, value, startFrame, durationFrames }: DamageNumeralProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);
        const cx = seat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.35 - 40 * t;
        const alpha = 1 - t * t;
        const scale = 1 + 0.3 * (1 - Math.min(1, phase / 6));

        // Color based on magnitude — bigger hits get hotter reds.
        const color = value >= 25 ? '#ff5050' : value >= 12 ? '#ffaa40' : '#ffe090';

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = alpha;
        const label = `-${value}`;
        ctx.strokeText(label, 0, 0);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      },
    [seat, value, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: DAMAGE_NUMERAL_Z,
      layerKey: `damage-numeral:${seat}:${startFrame}:${value}`,
      draw,
    },
    [seat, value, startFrame, durationFrames, draw],
  );

  return null;
}

export const DamageNumeral = memo(DamageNumeralBase);
