// Playhead — the vertical light-beam cursor that sweeps the rail (ui §6b).
//
// Wave-2 placeholder: a thin emissive cylinder pulsing at the cursor X/Z.
// Sweep animation lives in the TimelineRail impl via useFrame; this component
// just renders where it's told.

import { memo, useMemo } from '../../_stub/moduleApi';
import { Color } from '../../_stub/moduleApi';

export interface PlayheadProps {
  position: [number, number, number];
  width: number;
  height?: number;
  color?: string;
}

function PlayheadBase({
  position,
  width,
  height = 0.35,
  color = '#aee4ff',
}: PlayheadProps) {
  const colorObj = useMemo(() => new Color(color), [color]);

  return (
    <group position={position}>
      {/* beam */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.008]} />
        <meshStandardMaterial
          color={colorObj}
          emissive={colorObj}
          emissiveIntensity={1.6}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* base marker */}
      <mesh position={[0, 0.004, 0]}>
        <boxGeometry args={[width * 1.1, 0.008, 0.03]} />
        <meshStandardMaterial color={colorObj} emissive={colorObj} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export const Playhead = memo(PlayheadBase);
