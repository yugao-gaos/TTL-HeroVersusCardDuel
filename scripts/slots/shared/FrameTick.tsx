// FrameTick — printed frame-tick marks on the recessed rail (ui §6a).
//
// Rendered as a flat line of small dark dashes across the rail. Wave-2
// placeholder; final asset has ink-printed tick marks baked into the rail texture.

import { memo, useMemo } from '../../_stub/moduleApi';
import { RAIL_NEAR_Z, RAIL_WIDTH, frameToRailZ, RAIL_FRAME_CAPACITY } from './layout';

export interface FrameTicksProps {
  /** Origin frame for tick counting (carryover / cursor park position). */
  originFrame?: number;
  /** How many ticks to render. Defaults to rail capacity. */
  count?: number;
  y?: number;
}

function FrameTicksBase({
  originFrame = 0,
  count = RAIL_FRAME_CAPACITY,
  y = 0.002,
}: FrameTicksProps) {
  const ticks = useMemo(() => {
    const result: { position: [number, number, number]; major: boolean }[] = [];
    for (let i = 0; i <= count; i++) {
      const z = frameToRailZ(originFrame + i, originFrame);
      result.push({
        position: [0, y, z] as [number, number, number],
        major: i % 5 === 0,
      });
    }
    return result;
  }, [originFrame, count, y]);

  return (
    <group>
      {ticks.map((tick, i) => (
        <mesh key={i} position={tick.position}>
          <boxGeometry
            args={[
              tick.major ? RAIL_WIDTH * 0.85 : RAIL_WIDTH * 0.6,
              0.002,
              tick.major ? 0.008 : 0.004,
            ]}
          />
          <meshStandardMaterial
            color={tick.major ? '#2b2b2b' : '#555555'}
            roughness={1.0}
          />
        </mesh>
      ))}
      {/* near-end cap */}
      <mesh position={[0, y, RAIL_NEAR_Z - 0.02]}>
        <boxGeometry args={[RAIL_WIDTH, 0.004, 0.01]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

export const FrameTicks = memo(FrameTicksBase);
