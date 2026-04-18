/**
 * Fighter attack clip — ui-design.md §10c "per fighter x per move" alpha clip.
 *
 * Placeholder: shows `[P1 atk: card.id]` text and a yellow burst at the
 * attacker's position. Real assets come later — the component is marked
 * `alphaDecode: true` to reserve an alpha-decode budget slot, matching the
 * eventual alpha-WebM clip.
 *
 * TODO: real asset per fighter x move manifest.
 */

import { memo, useMemo } from '@tabletoplabs/module-api';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface FighterAttackProps {
  seat: SeatId;
  fighter: string;
  move: string;
  /** Global frame when the card enters the timeline; used for phase math. */
  startFrame: number;
}

const FIGHTER_ATTACK_Z = 20;

function FighterAttackBase({ seat, fighter, move, startFrame }: FighterAttackProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const cx = seat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.55;
        const phase = Math.max(0, frame - startFrame);
        const pulse = 0.5 + 0.5 * Math.sin(phase * 0.5);

        // Burst.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = `rgba(255, 205, 60, ${0.4 + pulse * 0.4})`;
        ctx.beginPath();
        const r = 60 + pulse * 20;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.55;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Placeholder label.
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`[${fighter}:${move}]`, cx, cy - 110);
      },
    [seat, fighter, move, startFrame],
  );

  useEnqueueDraw(
    {
      z: FIGHTER_ATTACK_Z,
      layerKey: `fighter-attack:${seat}:${move}:${startFrame}`,
      draw,
      alphaDecode: true, // reserve budget slot per ui-design.md §10d
    },
    [seat, fighter, move, startFrame, draw],
  );

  return null;
}

export const FighterAttack = memo(FighterAttackBase);
