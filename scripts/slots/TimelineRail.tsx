// hvcd.timelineRail — session-scoped, renderPhase: 'frame'
//
// The recessed channel running near->far down the cabinet's spine. Carries:
//   - Frame tick marks (§6a)
//   - Per-seat playhead cursor sweeping through frames (§6b)
//   - Per-seat active cards and window/effect tokens (§6c-d)
//   - Cancel-chip "hats" on top of frames
// The two seat lanes split the rail along X (P1 left half, P2 right half).
//
// Projectile airspace and parked-source tethers live in ProjectileLayer and
// SideArea; this slot only handles what physically sits on the rail surface.

import { memo, useMemo, useRef, useFrame } from '@tabletoplabs/module-api';
import type { RendererSlotImpl, SessionSlotProps } from '@tabletoplabs/module-api';
import type { Group } from '@tabletoplabs/module-api';
import {
  RAIL_WIDTH,
  RAIL_DEPTH_RECESS,
  RAIL_NEAR_Z,
  RAIL_LENGTH,
  frameToRailZ,
  seatLaneX,
} from './shared/layout';
import { FrameTicks } from './shared/FrameTick';
import { Playhead } from './shared/Playhead';
import { TokenChip } from './shared/TokenChip';
import type { TokenKind } from './shared/TokenChip';
import { useEventStream } from './shared/useEventStream';

// -------------------------------------------------------------------------
// Rail state folded from the resolver event stream.
// -------------------------------------------------------------------------

type SeatId = 'p1' | 'p2';

interface PlacedToken {
  id: string;
  seat: SeatId;
  kind: TokenKind;
  /** Global frame cell this token docks at. */
  frame: number;
  fromPool?: boolean;
  armed?: boolean;
  hitCancel?: boolean;
  dim?: boolean;
}

interface RailState {
  tokens: PlacedToken[];
  cursorGlobalFrame: number;
  /** Fractional frame for smooth interpolation between cursor-advanced events. */
  cursorFrac: number;
  originFrame: number;
}

const INITIAL: RailState = {
  tokens: [],
  cursorGlobalFrame: 0,
  cursorFrac: 0,
  originFrame: 0,
};

// Narrow resolver-event shapes we consume here. Full schema in
// hvcd-tabletop-contracts/event-log-schema.md.
type ResolverEvent =
  | { kind: 'cursor-advanced'; newGlobalFrame: number; skipped: number }
  | {
      kind: 'window-tokens-placed';
      seat: SeatId;
      cardStartGlobalFrame: number;
      cardId: string;
      windowKind: TokenKind;
      frames: [number, number];
      payload: {
        kind: string;
        fromPool?: boolean;
        armed?: boolean;
        hitCancel?: boolean;
      };
    }
  | { kind: 'stun-placed'; seat: SeatId; frames: [number, number] }
  | { kind: 'knockdown-placed'; seat: SeatId; frames: [number, number] }
  | {
      kind: 'block-stun-extended';
      seat: SeatId;
      extensionFrames: [number, number];
      tokensPlaced: number;
    }
  | { kind: 'showdown-started'; startGlobalFrame: number }
  | { kind: 'showdown-paused' };

function reduceRail(state: RailState, event: ResolverEvent): RailState {
  switch (event.kind) {
    case 'showdown-started':
      return {
        ...state,
        cursorGlobalFrame: event.startGlobalFrame,
        cursorFrac: 0,
        originFrame: event.startGlobalFrame,
      };
    case 'cursor-advanced':
      return { ...state, cursorGlobalFrame: event.newGlobalFrame, cursorFrac: 0 };
    case 'showdown-paused':
      return { ...state, cursorFrac: 0 };
    case 'window-tokens-placed': {
      const [cardStart, cardEnd] = event.frames;
      const newTokens: PlacedToken[] = [];
      for (let f = cardStart; f <= cardEnd; f++) {
        const global = event.cardStartGlobalFrame + f;
        newTokens.push({
          id: `${event.cardId}@${event.seat}@${event.windowKind}@${global}`,
          seat: event.seat,
          kind: event.windowKind,
          frame: global,
          fromPool: event.payload.fromPool,
          armed: event.payload.armed,
          hitCancel: event.payload.hitCancel,
          dim: event.windowKind === 'effect',
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    case 'stun-placed':
    case 'knockdown-placed': {
      const [start, end] = event.frames;
      const kind: TokenKind = event.kind === 'stun-placed' ? 'stun' : 'knockdown';
      const newTokens: PlacedToken[] = [];
      for (let f = start; f <= end; f++) {
        newTokens.push({
          id: `${kind}@${event.seat}@${f}`,
          seat: event.seat,
          kind,
          frame: f,
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    case 'block-stun-extended': {
      const [start, end] = event.extensionFrames;
      const newTokens: PlacedToken[] = [];
      for (let f = start; f < start + event.tokensPlaced && f <= end; f++) {
        newTokens.push({
          id: `block-ext@${event.seat}@${f}`,
          seat: event.seat,
          kind: 'block',
          frame: f,
          fromPool: true,
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    default:
      return state;
  }
}

// -------------------------------------------------------------------------
// Slot impl
// -------------------------------------------------------------------------

function TimelineRailImpl({ events }: SessionSlotProps) {
  const state = useEventStream<ResolverEvent, RailState>(
    events,
    'resolverEvents',
    INITIAL,
    reduceRail,
  );

  // Playhead group ref — useFrame drives its Z via interpolation between ticks
  // so we don't trigger React renders every rAF.
  const playheadP1Ref = useRef<Group | null>(null);
  const playheadP2Ref = useRef<Group | null>(null);

  // Default sweep speed; real speed comes from tunable config (ui §6b ~8 fps
  // default, slowing to near-zero on clash/hit-stop). Wave-2 uses a fixed rate.
  const FRAMES_PER_SEC = 8;

  useFrame((_threeState, delta) => {
    const effectiveFrame =
      state.cursorGlobalFrame + state.cursorFrac + delta * FRAMES_PER_SEC * 0;
    // Placeholder: we don't mutate state.cursorFrac every frame to avoid rerenders;
    // instead we interpolate imperatively on the refs.
    const z = frameToRailZ(effectiveFrame, state.originFrame);
    if (playheadP1Ref.current) playheadP1Ref.current.position.z = z;
    if (playheadP2Ref.current) playheadP2Ref.current.position.z = z;
  });

  const cursorZ = useMemo(
    () => frameToRailZ(state.cursorGlobalFrame, state.originFrame),
    [state.cursorGlobalFrame, state.originFrame],
  );

  return (
    <group>
      {/* Recessed rail channel */}
      <mesh
        position={[0, -RAIL_DEPTH_RECESS / 2, RAIL_NEAR_Z + RAIL_LENGTH / 2]}
        receiveShadow
      >
        <boxGeometry args={[RAIL_WIDTH, RAIL_DEPTH_RECESS, RAIL_LENGTH]} />
        <meshStandardMaterial color="#1f2228" roughness={0.9} metalness={0.2} />
      </mesh>

      {/* Frame ticks */}
      <FrameTicks originFrame={state.originFrame} y={0.001} />

      {/* Per-seat playheads */}
      <group ref={playheadP1Ref} position={[seatLaneX('p1'), 0, cursorZ]}>
        <Playhead position={[0, 0, 0]} width={RAIL_WIDTH / 2 - 0.02} />
      </group>
      <group ref={playheadP2Ref} position={[seatLaneX('p2'), 0, cursorZ]}>
        <Playhead position={[0, 0, 0]} width={RAIL_WIDTH / 2 - 0.02} />
      </group>

      {/* Placed tokens */}
      {state.tokens.map((token) => (
        <TokenChip
          key={token.id}
          position={[
            seatLaneX(token.seat),
            0.01,
            frameToRailZ(token.frame, state.originFrame),
          ]}
          kind={token.kind}
          fromPool={token.fromPool}
          armed={token.armed}
          hitCancel={token.hitCancel}
          dim={token.dim}
        />
      ))}
    </group>
  );
}

export const TimelineRail: RendererSlotImpl<SessionSlotProps> = memo(TimelineRailImpl);
