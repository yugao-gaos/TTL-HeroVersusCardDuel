/**
 * KO flash — shared effect from ui-design.md §10c.
 *
 * Fullscreen white burst + "K.O.!" title stamp over the losing seat.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface KoFlashProps {
  losingSeat: SeatId;
  startFrame: number;
  durationFrames: number;
}

const KO_FLASH_Z = 95;

function KoFlashBase({ losingSeat, startFrame, durationFrames }: KoFlashProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);

        // First ~8 frames: white fullscreen flash.
        const flashAlpha = Math.max(0, 1 - phase / 8);
        if (flashAlpha > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
          ctx.fillRect(0, 0, res.width, res.height);
        }

        // Then: big K.O.! stamp.
        const stampAlpha = Math.min(1, phase / 6) * (1 - Math.max(0, t - 0.75) * 4);
        if (stampAlpha > 0) {
          const cx = res.width / 2;
          const cy = res.height * 0.5;
          const scale = 1 + 0.2 * Math.max(0, 1 - phase / 15);

          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.globalAlpha = stampAlpha;
          ctx.fillStyle = '#ff2030';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 6;
          ctx.font = 'bold 92px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText('K.O.', 0, 0);
          ctx.fillText('K.O.', 0, 0);

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.fillText(`${losingSeat.toUpperCase()} DOWN`, 0, 70);
          ctx.restore();
        }
      },
    [losingSeat, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: KO_FLASH_Z,
      layerKey: `ko-flash:${losingSeat}:${startFrame}`,
      draw,
    },
    [losingSeat, startFrame, durationFrames, draw],
  );

  return null;
}

export const KoFlash = memo(KoFlashBase);
