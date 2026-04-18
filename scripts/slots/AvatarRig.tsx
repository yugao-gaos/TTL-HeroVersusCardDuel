// hvcd.avatarRig — per-seat, renderPhase: 'frame'
//
// No-arms floating-hands cabinet avatar (ui §9). Overrides the TabletopLabs
// default `seatBodyRig.ts` when the module is active. The rig is a simple
// torso + head + two floating hand meshes tethered to wrist-height.
//
// Emotes: the avatar exposes an emote system hook via the event stream. The
// resolver (or a social-event stream — TBD per session-api.md presence lane)
// emits emote events; this slot folds them into transient expression state.
// Wave-2 placeholder: a single numeric "emoteId" that drives a head-tilt /
// bob; real expression blends land with A1's presence integration.
//
// Privacy: both avatars are public (ui §15 — avatar emotes visible to both).
// No isViewerSeat gating.

import { memo, useRef, useMemo, useFrame } from '../_stub/moduleApi';
import type { RendererSlotImpl, PerSeatSlotProps } from '../_stub/moduleApi';
import type { Group } from '../_stub/moduleApi';
import { seatCenterX, AVATAR_LOCAL, TABLE_HALF_Z } from './shared/layout';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';

type EmoteKind = 'idle' | 'flinch' | 'lean-in' | 'nod' | 'smirk' | 'scowl' | 'cheer';

interface AvatarState {
  currentEmote: EmoteKind;
  emoteStartedAt: number;
}

const INITIAL: AvatarState = { currentEmote: 'idle', emoteStartedAt: 0 };

// Avatar-relevant events. Emote channel is currently derived from resolver
// events (damage -> flinch, hit-parried -> smirk, knockdown -> nod) per ui §9
// "fire automatically from game events". Manual quick-chat emotes will flow
// through the presence lane once that contract is wired — not in Wave-2 scope.
type ResolverEvent =
  | { kind: 'damage-applied'; seat: SeatId }
  | { kind: 'hit-parried'; parrierSeat: SeatId }
  | { kind: 'knockdown-placed'; seat: SeatId }
  | { kind: 'ko'; losingSeat: SeatId };

function reducerForSeat(seatId: SeatId) {
  return function reduce(state: AvatarState, event: ResolverEvent): AvatarState {
    const now = Date.now();
    switch (event.kind) {
      case 'damage-applied':
        if (event.seat === seatId) {
          return { currentEmote: 'flinch', emoteStartedAt: now };
        }
        return state;
      case 'hit-parried':
        if (event.parrierSeat === seatId) {
          return { currentEmote: 'smirk', emoteStartedAt: now };
        }
        return state;
      case 'knockdown-placed':
        if (event.seat !== seatId) {
          return { currentEmote: 'nod', emoteStartedAt: now };
        }
        return state;
      case 'ko':
        if (event.losingSeat !== seatId) {
          return { currentEmote: 'cheer', emoteStartedAt: now };
        }
        return state;
      default:
        return state;
    }
  };
}

function AvatarRigImpl({ seatId, events }: PerSeatSlotProps) {
  const reduce = useMemo(() => reducerForSeat(seatId), [seatId]);
  const state = useEventStream<ResolverEvent, AvatarState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );

  // Refs for transform animation (idle bob, flinch jerk, etc.) — driven
  // imperatively in useFrame so emote changes don't force rerenders.
  const torsoRef = useRef<Group | null>(null);
  const handLRef = useRef<Group | null>(null);
  const handRRef = useRef<Group | null>(null);

  useFrame((_threeState, delta) => {
    if (!torsoRef.current) return;
    const time = performance.now() / 1000;

    // Idle breathing
    const breath = Math.sin(time * 1.2) * 0.006;
    torsoRef.current.position.y = 0.3 + breath;

    // Hand drift
    if (handLRef.current) {
      handLRef.current.position.y = 0.42 + Math.sin(time * 0.9 + 0.4) * 0.012;
    }
    if (handRRef.current) {
      handRRef.current.position.y = 0.42 + Math.sin(time * 0.9) * 0.012;
    }

    // Emote overlay
    const elapsed = (Date.now() - state.emoteStartedAt) / 1000;
    const fade = Math.max(0, 1 - elapsed / 0.8);
    if (fade > 0) {
      switch (state.currentEmote) {
        case 'flinch':
          torsoRef.current.position.z = -0.02 * fade;
          torsoRef.current.rotation.x = -0.08 * fade;
          break;
        case 'smirk':
          torsoRef.current.rotation.y = 0.04 * Math.sin(time * 12) * fade;
          break;
        case 'nod':
          torsoRef.current.rotation.x = 0.12 * Math.sin(time * 8) * fade;
          break;
        case 'cheer':
          if (handLRef.current && handRRef.current) {
            handLRef.current.position.y = 0.42 + 0.18 * fade;
            handRRef.current.position.y = 0.42 + 0.18 * fade;
          }
          break;
        default:
          break;
      }
    } else if (state.currentEmote !== 'idle') {
      // Reset transforms once the emote has faded.
      torsoRef.current.position.z = 0;
      torsoRef.current.rotation.x = 0;
      torsoRef.current.rotation.y = 0;
    }
  });

  const baseX = seatCenterX(seatId) + AVATAR_LOCAL.x;
  const baseY = AVATAR_LOCAL.y;
  const baseZ = -TABLE_HALF_Z - 0.4 + AVATAR_LOCAL.z;

  // Torso + head colors differ per seat so P1/P2 are visually distinguishable
  // even before cosmetic customization lands.
  const bodyColor = seatId === 'p1' ? '#3f6ed9' : '#d94a3e';
  const headColor = seatId === 'p1' ? '#8ec0ff' : '#ffc0b0';

  return (
    <group position={[baseX, baseY, baseZ]}>
      <group ref={torsoRef} position={[0, 0.3, 0]}>
        {/* torso */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.32, 0.48, 0.22]} />
          <meshStandardMaterial color={bodyColor} roughness={0.7} />
        </mesh>
        {/* head */}
        <mesh position={[0, 0.38, 0]} castShadow>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial color={headColor} roughness={0.6} />
        </mesh>
      </group>

      {/* Floating hands at wrist height — no arms (ui §9). */}
      <group ref={handLRef} position={[-0.28, 0.42, 0.25]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.08, 0.12]} />
          <meshStandardMaterial color={headColor} roughness={0.6} />
        </mesh>
      </group>
      <group ref={handRRef} position={[0.28, 0.42, 0.25]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.08, 0.12]} />
          <meshStandardMaterial color={headColor} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

export const AvatarRig: RendererSlotImpl<PerSeatSlotProps> = memo(AvatarRigImpl);
