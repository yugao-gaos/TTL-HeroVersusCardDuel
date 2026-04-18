// Card3D — a placeholder 3D card mesh.
//
// Used by SequenceLane (face-down queued cards), SideArea (parked source cards),
// and ProjectileLayer (projectile sources tethered to in-flight entities).
// Wave-2 placeholder: a flat box with a solid color face and a back sigil. Final
// card-face layering lives in cardFaceLayers.ts (TabletopLabs reference); HVCD
// will plug into that once A1's module-api surface re-exports it.

import { memo, useMemo } from '../../_stub/moduleApi';
import { Color } from '../../_stub/moduleApi';

export interface Card3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  /** Card width, height (X, Z in world space when laid flat). */
  width?: number;
  height?: number;
  /** 'down' = show back; 'up' = show front (placeholder). */
  face?: 'up' | 'down';
  /** Front face color (placeholder until real card art). */
  frontColor?: string;
  backColor?: string;
  /** Frame-cost width indicator (ui §5b) — renders a thin line on the long edge. */
  frameCost?: number | null;
}

function Card3DBase({
  position,
  rotation = [0, 0, 0],
  width = 0.22,
  height = 0.32,
  face = 'down',
  frontColor = '#d4c79a',
  backColor = '#2a2e55',
  frameCost = null,
}: Card3DProps) {
  const showFront = face === 'up';
  const cardColor = useMemo(
    () => new Color(showFront ? frontColor : backColor),
    [showFront, frontColor, backColor],
  );
  const thickness = 0.006;

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, thickness, height]} />
        <meshStandardMaterial color={cardColor} roughness={0.7} />
      </mesh>
      {frameCost != null ? (
        <mesh position={[0, thickness / 2 + 0.0005, 0]}>
          <planeGeometry args={[width * 0.85, 0.01]} />
          <meshBasicMaterial color="#f2c14e" />
        </mesh>
      ) : null}
    </group>
  );
}

export const Card3D = memo(Card3DBase);
