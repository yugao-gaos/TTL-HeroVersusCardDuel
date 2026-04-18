/**
 * Standing / instant effect overlay — visual placeholder for effect-activated.
 *
 * ui-design.md §6g describes "standing effects use the projectile pattern" in
 * the commit spec, but on the monitor an active effect wants a visible aura
 * over the target. Single placeholder glow; real per-effect visuals come with
 * the shared-effects asset wave.
 *
 * TODO: real asset per effectId manifest (healing pulse, poison fume, etc.).
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

export interface EffectOverlayProps {
  targetSeat: SeatId;
  effectId: string;
  startFrame: number;
  durationFrames: number;
}

const EFFECT_Z = 35;

function EffectOverlayBase({ targetSeat, effectId, startFrame, durationFrames }: EffectOverlayProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const pulse = 0.5 + 0.5 * Math.sin(phase * 0.2);
        const fadeOut = Math.max(0, 1 - Math.max(0, phase - (durationFrames - 10)) / 10);

        const cx = targetSeat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const cy = res.height * 0.55;

        ctx.save();
        ctx.globalAlpha = 0.5 * fadeOut * (0.6 + 0.4 * pulse);
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
        grad.addColorStop(0, '#a0f0c0');
        grad.addColorStop(1, 'rgba(160, 240, 192, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Effect id label (debug during dev; stays small).
        ctx.fillStyle = 'rgba(160, 240, 192, 0.8)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(effectId, cx, cy + 110);
      },
    [targetSeat, effectId, startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: EFFECT_Z,
      layerKey: `effect:${effectId}:${targetSeat}:${startFrame}`,
      draw,
    },
    [targetSeat, effectId, startFrame, durationFrames, draw],
  );

  return null;
}

export const EffectOverlay = memo(EffectOverlayBase);
