// hvcd.cabinetChassis — session-scoped
//
// Arcade cabinet frame around the table plane. Machined metal + rivets
// aesthetic (ui-design.md §4b). Wraps the table surface, provides the
// proscenium around the monitor, and carries accent trim lights.
//
// Wave-2 placeholder: two boxy side chassis pieces, a far-end proscenium
// frame around the monitor mount, and a simple rim at the near edge.
// Final asset: commissioned GLB + PBR materials, loaded via assets.resolveAssetUrl.

import { memo, useMemo } from '../_stub/moduleApi';
import { Color } from '../_stub/moduleApi';
import type { RendererSlotImpl, SessionSlotProps } from '../_stub/moduleApi';
import {
  TABLE_HALF_X,
  TABLE_HALF_Z,
  MONITOR_POS,
  MONITOR_SIZE,
} from './shared/layout';

const CABINET_ASSET_UUID = 'hvcd.cabinet.chassis.v0';

function CabinetChassisImpl({ assets }: SessionSlotProps) {
  // Final-asset path: glb loaded from the resolved URL. For now we stub the
  // resolve call (so switching to a real asset is a one-line change) and
  // render placeholder geometry.
  const _glbUrl = useMemo(() => assets.resolveAssetUrl(CABINET_ASSET_UUID), [assets]);

  const metalColor = useMemo(() => new Color('#3c4148'), []);
  const rimColor = useMemo(() => new Color('#1b1d22'), []);
  const trimColor = useMemo(() => new Color('#ff6b3d'), []);

  const sideHeight = 0.85;
  const sideThickness = 0.18;
  const prosceniumHeight = 1.9;
  const prosceniumDepth = 0.22;

  return (
    <group>
      {/* Left side panel (P1 flank) */}
      <mesh
        position={[-TABLE_HALF_X - sideThickness / 2, sideHeight / 2 - 0.05, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideThickness, sideHeight, TABLE_HALF_Z * 2]} />
        <meshStandardMaterial color={metalColor} roughness={0.55} metalness={0.6} />
      </mesh>

      {/* Right side panel (P2 flank) */}
      <mesh
        position={[TABLE_HALF_X + sideThickness / 2, sideHeight / 2 - 0.05, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideThickness, sideHeight, TABLE_HALF_Z * 2]} />
        <meshStandardMaterial color={metalColor} roughness={0.55} metalness={0.6} />
      </mesh>

      {/* Near-edge rim */}
      <mesh
        position={[0, 0.03, -TABLE_HALF_Z - 0.04]}
        castShadow
      >
        <boxGeometry args={[TABLE_HALF_X * 2 + sideThickness * 2, 0.06, 0.08]} />
        <meshStandardMaterial color={rimColor} roughness={0.7} metalness={0.45} />
      </mesh>

      {/* Far-end proscenium frame around monitor */}
      <group position={[0, MONITOR_POS.y, TABLE_HALF_Z]}>
        {/* top bar */}
        <mesh position={[0, MONITOR_SIZE.h / 2 + 0.12, prosceniumDepth / 2]}>
          <boxGeometry args={[MONITOR_SIZE.w + 0.6, 0.24, prosceniumDepth]} />
          <meshStandardMaterial color={metalColor} roughness={0.5} metalness={0.65} />
        </mesh>
        {/* bottom bar */}
        <mesh position={[0, -MONITOR_SIZE.h / 2 - 0.12, prosceniumDepth / 2]}>
          <boxGeometry args={[MONITOR_SIZE.w + 0.6, 0.24, prosceniumDepth]} />
          <meshStandardMaterial color={metalColor} roughness={0.5} metalness={0.65} />
        </mesh>
        {/* left bar */}
        <mesh position={[-MONITOR_SIZE.w / 2 - 0.18, 0, prosceniumDepth / 2]}>
          <boxGeometry args={[0.36, prosceniumHeight, prosceniumDepth]} />
          <meshStandardMaterial color={metalColor} roughness={0.5} metalness={0.65} />
        </mesh>
        {/* right bar */}
        <mesh position={[MONITOR_SIZE.w / 2 + 0.18, 0, prosceniumDepth / 2]}>
          <boxGeometry args={[0.36, prosceniumHeight, prosceniumDepth]} />
          <meshStandardMaterial color={metalColor} roughness={0.5} metalness={0.65} />
        </mesh>

        {/* trim light strip along the top bar (ui §4b accent trim lights) */}
        <mesh position={[0, MONITOR_SIZE.h / 2 + 0.12, prosceniumDepth + 0.001]}>
          <boxGeometry args={[MONITOR_SIZE.w + 0.3, 0.02, 0.006]} />
          <meshStandardMaterial
            color={trimColor}
            emissive={trimColor}
            emissiveIntensity={1.3}
          />
        </mesh>
      </group>

      {/* Rivets along the side panels — purely decorative placeholder */}
      {[-1, 1].map((sideSign) =>
        Array.from({ length: 8 }, (_, i) => {
          const z = -TABLE_HALF_Z + 0.25 + i * ((TABLE_HALF_Z * 2 - 0.5) / 7);
          return (
            <mesh
              key={`rivet-${sideSign}-${i}`}
              position={[
                sideSign * (TABLE_HALF_X + sideThickness + 0.001),
                0.25,
                z,
              ]}
              rotation={[0, 0, (sideSign * Math.PI) / 2]}
            >
              <cylinderGeometry args={[0.015, 0.015, 0.012, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.9} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

export const CabinetChassis: RendererSlotImpl<SessionSlotProps> = memo(CabinetChassisImpl);
