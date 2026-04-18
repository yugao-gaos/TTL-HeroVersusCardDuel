// hvcd.monitorMesh — session-scoped, renderPhase: 'event'
//
// Flat rectangle at the far end of the cabinet (ui §10). The texture map is a
// THREE.CanvasTexture whose source canvas is the Remotion composition (B4).
// Wave-2 stubs that hookup: we create a CanvasTexture over a locally-owned
// <canvas> so the mesh boots with *something* on it, and we provide a named
// hook (window.__hvcdMonitorCanvas) that B4 will plug its Remotion composition
// canvas into once landed.
//
// Performance notes (renderer-slots.md + ui §10d):
//   - Monitor internal res: 720×405 (not 1080p).
//   - needsUpdate is flipped per composition frame, decoupled from scene 60fps.
//   - renderPhase: 'event' — the mesh itself only re-renders on monitor-frame
//     events routed through the event bus; useEffect installs the texture once.

import { useEffect, useMemo, useRef, memo } from '@tabletoplabs/module-api';
import type { RendererSlotImpl, SessionSlotProps } from '@tabletoplabs/module-api';
import { CanvasTexture, SRGBColorSpace } from '@tabletoplabs/module-api';
import { MONITOR_POS, MONITOR_SIZE } from './shared/layout';

const MONITOR_INTERNAL_W = 720;
const MONITOR_INTERNAL_H = 405;

function MonitorMeshImpl(_props: SessionSlotProps) {
  // Allocate a backing canvas once. B4 will replace this with its Remotion
  // composition canvas via the global hook below; until then, the canvas
  // renders a placeholder "HVCD monitor" splash so the mesh is visibly alive.
  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = MONITOR_INTERNAL_W;
    c.height = MONITOR_INTERNAL_H;
    const ctx = c.getContext('2d');
    if (ctx) {
      // placeholder fill + label
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ff6b3d';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HVCD MONITOR', c.width / 2, c.height / 2 - 20);
      ctx.fillStyle = '#6f7685';
      ctx.font = '20px sans-serif';
      ctx.fillText(
        'Remotion composition mounts here (B4)',
        c.width / 2,
        c.height / 2 + 40,
      );
    }
    return c;
  }, []);

  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [canvas]);

  const textureRef = useRef(texture);
  textureRef.current = texture;

  // Install a global hook B4 will use to push Remotion frame ticks at us.
  // When B4 lands they'll write their composition canvas to
  // `window.__hvcdMonitor.canvas` and call `window.__hvcdMonitor.tick()` each
  // Remotion frame.
  useEffect(() => {
    if (typeof window === 'undefined' || !texture) return;
    const hook = {
      canvas,
      tick: () => {
        if (textureRef.current) textureRef.current.needsUpdate = true;
      },
      /** B4 calls this if its composition owns its own canvas. */
      setCanvas: (_c: HTMLCanvasElement) => {
        // TODO(B4 integration): when B4's composition canvas is the source of
        // truth, swap the texture.image and flip needsUpdate. For Wave-2 we
        // leave the stub canvas wired so the mesh shows the placeholder.
      },
    };
    (window as unknown as { __hvcdMonitor?: typeof hook }).__hvcdMonitor = hook;
    return () => {
      if ((window as unknown as { __hvcdMonitor?: typeof hook }).__hvcdMonitor === hook) {
        delete (window as unknown as { __hvcdMonitor?: typeof hook }).__hvcdMonitor;
      }
    };
  }, [canvas, texture]);

  // Dispose texture on unmount so the renderer doesn't leak GPU memory.
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) {
    // SSR / no-document environments — render nothing.
    return null;
  }

  return (
    <group position={[MONITOR_POS.x, MONITOR_POS.y, MONITOR_POS.z]}>
      {/* Monitor panel plane facing -Z (toward players / camera). */}
      <mesh rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[MONITOR_SIZE.w, MONITOR_SIZE.h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* Bezel */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[MONITOR_SIZE.w + 0.06, MONITOR_SIZE.h + 0.06]} />
        <meshStandardMaterial color="#0a0c12" roughness={0.9} />
      </mesh>
    </group>
  );
}

export const MonitorMesh: RendererSlotImpl<SessionSlotProps> = memo(MonitorMeshImpl);
