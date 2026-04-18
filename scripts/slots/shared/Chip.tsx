// HP / Rage / Pool chip mesh — a simple colored cylinder, placeholder for
// the final poker-chip-style asset (ui-design.md §8a).
//
// The color gradient green -> amber -> red on HP is handled by the ChipTray
// impl choosing per-chip colors; this primitive just renders what it's given.

import { memo, useMemo } from '@tabletoplabs/module-api';
import { Color } from '@tabletoplabs/module-api';

export interface ChipProps {
  position: [number, number, number];
  /** CSS / hex color. */
  color: string;
  /** Radius in meters. */
  radius?: number;
  /** Thickness in meters. */
  thickness?: number;
  /** Optional emissive glow (low-HP pulse etc.). 0 = off. */
  emissiveIntensity?: number;
  /** Marker for inherent vs pool-consumed block chips (notch on rim). */
  notched?: boolean;
}

function ChipBase({
  position,
  color,
  radius = 0.045,
  thickness = 0.018,
  emissiveIntensity = 0,
  notched = false,
}: ChipProps) {
  const colorObj = useMemo(() => new Color(color), [color]);
  const emissive = useMemo(() => new Color(color).multiplyScalar(0.4), [color]);

  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, thickness, 24]} />
        <meshStandardMaterial
          color={colorObj}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>
      {notched ? (
        <mesh position={[radius * 0.9, 0, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[radius * 0.15, thickness * 1.05, radius * 0.25]} />
          <meshStandardMaterial color="#000000" roughness={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

export const Chip = memo(ChipBase);
