/**
 * Projectile in-flight visual and clash burst — ui-design.md §10c shared
 * effects include projectile clash.
 *
 * The in-flight projectile itself is drawn as a traveling blob between the
 * owner's seat and the opponent's seat, parameterized by spawnFrame /
 * arriveFrame. ui-design.md separates 3D airspace projectiles
 * (hvcd.projectileLayer — B3 territory) from monitor-internal visuals; on the
 * monitor, we draw the flight since the monitor is its own scene.
 *
 * Clash burst is a second component, emitted when two projectiles meet.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import type { SeatId } from '../../resolver/types';

// ---------------------------------------------------------------------------
// Projectile flight
// ---------------------------------------------------------------------------

export interface ProjectileProps {
  ownerSeat: SeatId;
  projectileId: string;
  spawnFrame: number;
  arriveFrame: number;
}

const PROJECTILE_Z = 30;

function ProjectileBase({ ownerSeat, projectileId, spawnFrame, arriveFrame }: ProjectileProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const total = Math.max(1, arriveFrame - spawnFrame);
        const t = Math.max(0, Math.min(1, (frame - spawnFrame) / total));

        const originX = ownerSeat === 'p1' ? res.width * 0.3 : res.width * 0.7;
        const targetX = ownerSeat === 'p1' ? res.width * 0.7 : res.width * 0.3;
        const x = originX + (targetX - originX) * t;
        const y = res.height * 0.5;

        // Trail.
        ctx.save();
        const trailColor = ownerSeat === 'p1' ? 'rgba(90, 150, 255, 0.65)' : 'rgba(255, 120, 90, 0.65)';
        ctx.fillStyle = trailColor;
        for (let i = 0; i < 6; i++) {
          const trailT = Math.max(0, t - i * 0.03);
          const tx = originX + (targetX - originX) * trailT;
          const alpha = (1 - i / 6) * 0.7;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(tx, y, 8 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Head.
        ctx.fillStyle = ownerSeat === 'p1' ? '#bfe0ff' : '#ffc0a0';
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    [ownerSeat, spawnFrame, arriveFrame],
  );

  useEnqueueDraw(
    {
      z: PROJECTILE_Z,
      layerKey: `projectile:${projectileId}`,
      draw,
    },
    [ownerSeat, projectileId, spawnFrame, arriveFrame, draw],
  );

  return null;
}

export const Projectile = memo(ProjectileBase);

// ---------------------------------------------------------------------------
// Projectile clash
// ---------------------------------------------------------------------------

export interface ProjectileClashProps {
  startFrame: number;
  durationFrames: number;
}

const CLASH_Z = 45;

function ProjectileClashBase({ startFrame, durationFrames }: ProjectileClashProps) {
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, frame: number, res: { width: number; height: number }) => {
        const phase = Math.max(0, frame - startFrame);
        const t = Math.min(1, phase / durationFrames);
        const cx = res.width / 2;
        const cy = res.height * 0.5;
        const radius = 20 + 70 * t;
        const alpha = 1 - t;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        grad.addColorStop(0.5, `rgba(255, 200, 120, ${alpha * 0.6})`);
        grad.addColorStop(1, 'rgba(180, 100, 60, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      },
    [startFrame, durationFrames],
  );

  useEnqueueDraw(
    {
      z: CLASH_Z,
      layerKey: `projectile-clash:${startFrame}`,
      draw,
    },
    [startFrame, durationFrames, draw],
  );

  return null;
}

export const ProjectileClash = memo(ProjectileClashBase);
