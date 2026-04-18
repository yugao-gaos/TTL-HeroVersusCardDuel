// hvcd.sideArea — per-seat, renderPhase: 'tick'
//
// Recessed tray holding parked projectile source cards and standing-effect
// source cards while their entities live on the timeline (ui §6e, §6g, §7d).
// Each parked card has a tether line to its in-flight entity (projectile or
// effect-end token) — ui §6g:
//   "There is no separate bar. To see what's active at any moment, look at
//    each seat's side-area + the tether lines."
//
// Privacy: parked cards + tethers are public (ui §15). Both clients render
// everyone's side-area fully.
//
// The tether target position is looked up from the projectile/effect event
// stream — events fed into state include projectile arrival frames and
// effect-end frames so tethers know where to point.

import { memo, useMemo } from '@tabletoplabs/module-api';
import type { RendererSlotImpl, PerSeatSlotProps } from '@tabletoplabs/module-api';
import {
  seatCenterX,
  SIDE_AREA_LOCAL_X_OFFSET,
  SIDE_AREA_NEAR_Z,
  SIDE_AREA_FAR_Z,
  frameToRailZ,
  seatLaneX,
  PROJECTILE_Y,
} from './shared/layout';
import { Card3D } from './shared/Card3D';
import { Tether } from './shared/Tether';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';

interface ParkedCard {
  cardId: string;
  reason: 'projectile' | 'standing-effect';
  /** For projectile parks: the in-flight projectile id. */
  projectileId?: string;
  /** For standing-effect parks: the effect's end frame on target seat's lane. */
  effectEndFrame?: number;
  /** For standing-effect parks: which seat the effect-end token sits on. */
  effectTargetSeat?: SeatId;
}

interface SideAreaState {
  seats: Record<SeatId, ParkedCard[]>;
  /** Projectile positions cached so tethers can point at moving objects. */
  projectilePositions: Record<
    string,
    { x: number; y: number; z: number }
  >;
  originFrame: number;
  cursorFrame: number;
}

const INITIAL: SideAreaState = {
  seats: { p1: [], p2: [] },
  projectilePositions: {},
  originFrame: 0,
  cursorFrame: 0,
};

type ResolverEvent =
  | {
      kind: 'card-parked-to-side-area';
      seat: SeatId;
      cardId: string;
      reason: 'projectile' | 'standing-effect';
      tetherTargetId: string;
    }
  | {
      kind: 'card-released-from-side-area';
      seat: SeatId;
      cardId: string;
    }
  | {
      kind: 'projectile-launched';
      projectileId: string;
      ownerSeat: SeatId;
      spawnGlobalFrame: number;
      arrivalGlobalFrame: number;
    }
  | { kind: 'projectile-arrived'; projectileId: string }
  | {
      kind: 'effect-activated';
      casterSeat: SeatId;
      targetSeat: SeatId;
      effectId: string;
      endGlobalFrame?: number;
    }
  | { kind: 'cursor-advanced'; newGlobalFrame: number }
  | { kind: 'showdown-started'; startGlobalFrame: number };

function reduce(state: SideAreaState, event: ResolverEvent): SideAreaState {
  switch (event.kind) {
    case 'showdown-started':
      return { ...state, originFrame: event.startGlobalFrame, cursorFrame: event.startGlobalFrame };
    case 'cursor-advanced':
      return { ...state, cursorFrame: event.newGlobalFrame };
    case 'card-parked-to-side-area': {
      const parked: ParkedCard = {
        cardId: event.cardId,
        reason: event.reason,
        ...(event.reason === 'projectile'
          ? { projectileId: event.tetherTargetId }
          : {}),
      };
      return {
        ...state,
        seats: {
          ...state.seats,
          [event.seat]: [...state.seats[event.seat], parked],
        },
      };
    }
    case 'card-released-from-side-area': {
      const filtered = state.seats[event.seat].filter(
        (c) => c.cardId !== event.cardId,
      );
      return {
        ...state,
        seats: { ...state.seats, [event.seat]: filtered },
      };
    }
    case 'projectile-launched':
      // Initialize projectile position at the owner's near lane.
      return {
        ...state,
        projectilePositions: {
          ...state.projectilePositions,
          [event.projectileId]: {
            x: seatLaneX(event.ownerSeat),
            y: PROJECTILE_Y,
            z: frameToRailZ(event.spawnGlobalFrame, state.originFrame),
          },
        },
      };
    case 'projectile-arrived': {
      const next = { ...state.projectilePositions };
      delete next[event.projectileId];
      return { ...state, projectilePositions: next };
    }
    case 'effect-activated':
      // Stash the effect-end frame on whichever parked card matches.
      // Since we only track by cardId (the source card) and the pair event is
      // card-parked-to-side-area + effect-activated, we patch on last parked.
      if (event.endGlobalFrame == null) return state;
      return {
        ...state,
        seats: {
          ...state.seats,
          [event.casterSeat]: state.seats[event.casterSeat].map((c, i, arr) =>
            i === arr.length - 1 && c.reason === 'standing-effect'
              ? {
                  ...c,
                  effectEndFrame: event.endGlobalFrame,
                  effectTargetSeat: event.targetSeat,
                }
              : c,
          ),
        },
      };
    default:
      return state;
  }
}

function SideAreaImpl({ seatId, events }: PerSeatSlotProps) {
  const state = useEventStream<ResolverEvent, SideAreaState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );
  const parked = state.seats[seatId];

  // Side-area lives outboard of the seat's sequence lane, tilted upright.
  const sign = seatId === 'p1' ? -1 : 1;
  const baseX = seatCenterX(seatId) + sign * SIDE_AREA_LOCAL_X_OFFSET;

  const positioned = useMemo(() => {
    return parked.map((card, i) => {
      const z =
        SIDE_AREA_NEAR_Z +
        ((SIDE_AREA_FAR_Z - SIDE_AREA_NEAR_Z) / 6) * (i + 0.5);
      const cardPos: [number, number, number] = [baseX, 0.08, z];
      const tiltX = -Math.PI / 6; // ~30° upright tilt
      const cardRot: [number, number, number] = [tiltX, 0, 0];

      let tetherTarget: [number, number, number] | null = null;
      if (card.reason === 'projectile' && card.projectileId) {
        const p = state.projectilePositions[card.projectileId];
        if (p) tetherTarget = [p.x, p.y, p.z];
      } else if (
        card.reason === 'standing-effect' &&
        card.effectEndFrame != null &&
        card.effectTargetSeat
      ) {
        tetherTarget = [
          seatLaneX(card.effectTargetSeat),
          0.05,
          frameToRailZ(card.effectEndFrame, state.originFrame),
        ];
      }

      return { card, cardPos, cardRot, tetherTarget };
    });
  }, [parked, baseX, state.projectilePositions, state.originFrame]);

  // Pulse cue for active standing effects (ui §6g) — a cheap sinusoidal
  // driven by the cursor frame delta since effect start. Wave-2 uses a
  // static mild value; useFrame-driven pulse is a later polish pass.
  const pulse = 0.6;

  return (
    <group>
      {/* Recessed tray */}
      <mesh
        position={[
          baseX,
          0.001,
          (SIDE_AREA_NEAR_Z + SIDE_AREA_FAR_Z) / 2,
        ]}
      >
        <planeGeometry args={[0.28, SIDE_AREA_FAR_Z - SIDE_AREA_NEAR_Z + 0.04]} />
        <meshStandardMaterial color="#131518" roughness={0.95} />
      </mesh>

      {positioned.map(({ card, cardPos, cardRot, tetherTarget }) => (
        <group key={`${seatId}-parked-${card.cardId}`}>
          <Card3D
            position={cardPos}
            rotation={cardRot}
            width={0.18}
            height={0.26}
            face="up"
            frontColor={
              card.reason === 'standing-effect' ? '#5fb09a' : '#6aa4c4'
            }
          />
          {tetherTarget ? (
            <Tether
              from={cardPos}
              to={tetherTarget}
              color={
                card.reason === 'standing-effect' ? '#8effd9' : '#ffe493'
              }
              pulse={card.reason === 'standing-effect' ? pulse : 0}
            />
          ) : null}
        </group>
      ))}
    </group>
  );
}

export const SideArea: RendererSlotImpl<PerSeatSlotProps> = memo(SideAreaImpl);
