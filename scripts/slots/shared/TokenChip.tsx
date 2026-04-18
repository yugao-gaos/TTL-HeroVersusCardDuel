// TokenChip — rail-dwelling attack / defense / cancel / effect chip.
//
// Matches the unified token model (ui-design.md §6c-d). Square-cornered for
// attack kinds, round for defense, low-profile for cancel, emissive for effect.
// Wave-2 placeholder: a colored cylinder with a small glyph cap; polish comes later.

import { memo, useMemo } from '../../_stub/moduleApi';
import { Color } from '../../_stub/moduleApi';

type TokenKind =
  | 'hit' | 'grab' | 'projectile' | 'parry' | 'effect'
  | 'block' | 'armor' | 'evasion' | 'reflect'
  | 'cancel'
  | 'stun' | 'knockdown' | 'effect-end';

export interface TokenChipProps {
  position: [number, number, number];
  kind: TokenKind;
  /** For block chips: was it from pool (notched rim) vs inherent. */
  fromPool?: boolean;
  /** For cancel chips: whether armed (opponent can't see this — caller filters). */
  armed?: boolean;
  /** For cancel chips: whether hitCancel-capable. */
  hitCancel?: boolean;
  /** Dim activation-window effect chips (ui §6g). */
  dim?: boolean;
}

const KIND_COLOR: Record<TokenKind, string> = {
  hit: '#d94a3e',
  grab: '#8b3fb8',
  projectile: '#3fb8d9',
  parry: '#d9b83f',
  effect: '#3fb8a5',
  block: '#3f6ed9',
  armor: '#d98a3f',
  evasion: '#5fd13f',
  reflect: '#a43fd9',
  cancel: '#f5f5f5',
  stun: '#e8564d',
  knockdown: '#e8564d',
  'effect-end': '#3fb8a5',
};

const ATTACK_KINDS = new Set(['hit', 'grab', 'projectile', 'parry', 'effect']);
const DEFENSE_KINDS = new Set(['block', 'armor', 'evasion', 'reflect']);

function TokenChipBase({
  position,
  kind,
  fromPool = false,
  armed = false,
  hitCancel = false,
  dim = false,
}: TokenChipProps) {
  const baseColor = KIND_COLOR[kind] ?? '#888888';
  const color = useMemo(() => new Color(baseColor), [baseColor]);
  const emissive = useMemo(
    () =>
      new Color(baseColor).multiplyScalar(kind === 'stun' || kind === 'knockdown' ? 0.9 : 0.25),
    [baseColor, kind],
  );

  // Shape family — attack: hex/square-ish; defense: round; cancel: thin disc;
  // effect: round + emissive. We approximate with slightly different cylinder
  // segment counts & aspect ratios for categorical legibility at a glance.
  const isAttack = ATTACK_KINDS.has(kind);
  const isDefense = DEFENSE_KINDS.has(kind);
  const isCancel = kind === 'cancel';
  const isEffect = kind === 'effect' || kind === 'stun' || kind === 'knockdown' || kind === 'effect-end';

  const radius = isCancel ? 0.036 : 0.042;
  const height = isCancel ? 0.008 : 0.018;
  const segments = isAttack ? 6 : isDefense ? 24 : isCancel ? 32 : 24;

  const emissiveIntensity = dim ? 0.08 : isEffect ? 0.9 : armed ? 0.6 : 0.15;
  const opacity = dim ? 0.55 : 1.0;

  // Knockdown gets a gold rim ring (ui §6d).
  const hasGoldRing = kind === 'knockdown';
  // Cancel armed = gold core (only visible to owner; caller filters armed prop).
  const hasGoldCore = isCancel && armed;

  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, height, segments]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={isCancel ? 0.25 : 0.5}
          metalness={0.2}
          transparent={dim}
          opacity={opacity}
        />
      </mesh>
      {hasGoldRing ? (
        <mesh position={[0, height / 2 + 0.002, 0]}>
          <torusGeometry args={[radius * 1.05, 0.004, 8, 24]} />
          <meshStandardMaterial color="#d9b83f" emissive="#d9b83f" emissiveIntensity={0.9} />
        </mesh>
      ) : null}
      {hasGoldCore ? (
        <mesh position={[0, height / 2 + 0.002, 0]}>
          <cylinderGeometry args={[radius * 0.5, radius * 0.5, height * 0.6, 24]} />
          <meshStandardMaterial color="#d9b83f" emissive="#d9b83f" emissiveIntensity={0.8} />
        </mesh>
      ) : null}
      {fromPool ? (
        <mesh position={[radius * 0.9, 0, 0]}>
          <boxGeometry args={[radius * 0.15, height * 1.05, radius * 0.25]} />
          <meshStandardMaterial color="#000" roughness={0.9} />
        </mesh>
      ) : null}
      {isCancel && hitCancel ? (
        <mesh position={[0, height / 2 + 0.003, 0]}>
          <ringGeometry args={[radius * 0.9, radius, 24]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ) : null}
    </group>
  );
}

export const TokenChip = memo(TokenChipBase);
export type { TokenKind };
