/**
 * Frame readout strip — ui-design.md §10b `<FrameReadout events={events} />`.
 *
 * Bottom HUD strip showing HP bars + rage meters + current global frame.
 * Reads derived state via selectFrameReadout so the visuals stay aligned
 * with whatever the resolver said at `currentFrame`.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import { selectFrameReadout } from '../eventSelectors';
import type { ResolverEvent } from '../../resolver/types';

export interface FrameReadoutProps {
  events: readonly ResolverEvent[];
  /** Current Remotion frame; the HUD reflects state at this point in time. */
  currentFrame: number;
  /** Max HP for scaling; default matches combat-system.md starting HP. */
  maxHp?: number;
}

const FRAME_READOUT_Z = 85;

function FrameReadoutBase({ events, currentFrame, maxHp = 16 }: FrameReadoutProps) {
  const readout = useMemo(
    () => selectFrameReadout(events, currentFrame),
    [events, currentFrame],
  );

  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, _frame: number, res: { width: number; height: number }) => {
        // Bottom strip background.
        const stripY = res.height - 34;
        ctx.fillStyle = 'rgba(10, 10, 14, 0.75)';
        ctx.fillRect(0, stripY, res.width, 34);

        // HP bars.
        const barW = res.width * 0.42;
        const barH = 10;
        const barY = stripY + 6;

        // p1 HP (left-to-right, anchored at left).
        const p1hpRatio = Math.max(0, Math.min(1, readout.hp.p1 / maxHp));
        ctx.fillStyle = '#222';
        ctx.fillRect(12, barY, barW, barH);
        ctx.fillStyle = p1hpRatio > 0.5 ? '#5be07e' : p1hpRatio > 0.25 ? '#e0c050' : '#e05050';
        ctx.fillRect(12, barY, barW * p1hpRatio, barH);

        // p2 HP (right-to-left, anchored at right).
        const p2hpRatio = Math.max(0, Math.min(1, readout.hp.p2 / maxHp));
        ctx.fillStyle = '#222';
        ctx.fillRect(res.width - 12 - barW, barY, barW, barH);
        ctx.fillStyle = p2hpRatio > 0.5 ? '#5be07e' : p2hpRatio > 0.25 ? '#e0c050' : '#e05050';
        const p2Bar = barW * p2hpRatio;
        ctx.fillRect(res.width - 12 - p2Bar, barY, p2Bar, barH);

        // Rage pips — a row of 5 dots below each HP bar.
        const drawRagePips = (cx: number, rage: number) => {
          const pipRadius = 3;
          const spacing = 10;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(cx + i * spacing, barY + barH + 8, pipRadius, 0, Math.PI * 2);
            ctx.fillStyle = i < rage ? '#d050e0' : 'rgba(90, 90, 100, 0.5)';
            ctx.fill();
          }
        };
        drawRagePips(14, readout.rage.p1);
        drawRagePips(res.width - 14 - 40, readout.rage.p2);

        // Frame counter center.
        ctx.fillStyle = '#8b8ca0';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`F ${readout.frame}`, res.width / 2, stripY + 22);

        // HP numerics.
        ctx.fillStyle = '#eaeaf0';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(readout.hp.p1), 12, barY - 2);
        ctx.textAlign = 'right';
        ctx.fillText(String(readout.hp.p2), res.width - 12, barY - 2);
      },
    [readout.hp.p1, readout.hp.p2, readout.rage.p1, readout.rage.p2, readout.frame, maxHp],
  );

  useEnqueueDraw(
    {
      z: FRAME_READOUT_Z,
      layerKey: `frame-readout`,
      draw,
    },
    [draw],
  );

  return null;
}

export const FrameReadout = memo(FrameReadoutBase);
