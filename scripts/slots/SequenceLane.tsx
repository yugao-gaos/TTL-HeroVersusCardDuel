// hvcd.sequenceLane — per-seat, renderPhase: 'tick'
//
// Each seat's queue of face-down slots (ui §4a, §5b). Slot width is proportional
// to frame cost — publicly visible to both players at commit. Slot contents
// (cardId, kind, variant, rage-cancel-armed) are private until dequeue.
//
// Privacy note: slot *count* and *frame cost* are public per §15 of the UI spec
// and per the `RevealBeatEvent.publishedBySeat[seat].slotFrameCosts` contract.
// Therefore this slot renders for BOTH viewers (public) — it does NOT use the
// Layer-1-return-null pattern. Hidden fields are simply absent from the event
// payload this slot consumes.

import { memo, useMemo } from '@tabletoplabs/module-api';
import type { RendererSlotImpl, PerSeatSlotProps } from '@tabletoplabs/module-api';
import {
  SEQ_LANE_NEAR_Z,
  SEQ_LANE_FAR_Z,
  SEQ_LANE_WIDTH,
  seatCenterX,
} from './shared/layout';
import { Card3D } from './shared/Card3D';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';
type SlotKind = 'card' | 'block-spacer' | 'item';

interface PublicSlot {
  /** Stable client-side key — not necessarily the backend slotId. */
  key: string;
  slotIndex: number;
  frameCost: number;
  /** Known only for viewer's own seat post-commit, or post-dequeue to everyone. */
  kindHint?: SlotKind;
}

interface LaneState {
  slots: Record<SeatId, PublicSlot[]>;
}

const INITIAL: LaneState = { slots: { p1: [], p2: [] } };

type ResolverEvent =
  | {
      kind: 'slot-committed';
      seat: SeatId;
      slotIndex: number;
      slot: { frameCost: number; kind: SlotKind };
    }
  | { kind: 'slot-discarded-from-sequence'; seat: SeatId; slotIndex: number }
  | { kind: 'slot-reordered'; seat: SeatId; fromIndex: number; toIndex: number }
  | {
      kind: 'slot-dequeued';
      seat: SeatId;
      slot: { frameCost: number; kind: SlotKind };
    }
  | {
      kind: 'reveal-beat';
      publishedBySeat: Record<SeatId, { slotFrameCosts: number[] }>;
    };

function reduce(state: LaneState, event: ResolverEvent): LaneState {
  switch (event.kind) {
    case 'slot-committed': {
      const slots = state.slots[event.seat].slice();
      slots.splice(event.slotIndex, 0, {
        key: `${event.seat}-${event.slotIndex}-${Math.random().toString(36).slice(2, 8)}`,
        slotIndex: event.slotIndex,
        frameCost: event.slot.frameCost,
        kindHint: event.slot.kind,
      });
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case 'slot-discarded-from-sequence': {
      const slots = state.slots[event.seat].filter((s) => s.slotIndex !== event.slotIndex);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case 'slot-reordered': {
      const slots = state.slots[event.seat].slice();
      const [moved] = slots.splice(event.fromIndex, 1);
      if (moved) slots.splice(event.toIndex, 0, moved);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case 'slot-dequeued': {
      // Front-of-queue shift.
      const slots = state.slots[event.seat].slice(1);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case 'reveal-beat': {
      // Rebuild both seats from the authoritative published frame costs.
      const next: LaneState = { slots: { p1: [], p2: [] } };
      (Object.keys(event.publishedBySeat) as SeatId[]).forEach((seat) => {
        next.slots[seat] = event.publishedBySeat[seat].slotFrameCosts.map((cost, i) => ({
          key: `${seat}-reveal-${i}`,
          slotIndex: i,
          frameCost: cost,
        }));
      });
      return next;
    }
    default:
      return state;
  }
}

function SequenceLaneImpl({ seatId, events }: PerSeatSlotProps) {
  const state = useEventStream<ResolverEvent, LaneState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );
  const seatSlots = state.slots[seatId];

  // Lay slots out near->far, width scaled by frameCost. Wave-2 uses a simple
  // linear layout; overflow handling (>12 slots) is a later polish concern.
  const slotDepth = (SEQ_LANE_FAR_Z - SEQ_LANE_NEAR_Z) / 12;
  const MIN_FRAME = 1;
  const MAX_FRAME = 10;

  const positioned = useMemo(
    () =>
      seatSlots.map((slot, i) => {
        const normalizedWidth =
          (Math.min(Math.max(slot.frameCost, MIN_FRAME), MAX_FRAME) / MAX_FRAME) *
          SEQ_LANE_WIDTH;
        return {
          slot,
          position: [
            seatCenterX(seatId),
            0.008,
            SEQ_LANE_NEAR_Z + slotDepth * (i + 0.5),
          ] as [number, number, number],
          width: normalizedWidth,
          // block-spacer visual differs slightly (ui §5 spacer tile rendering)
          face: slot.kindHint === 'block-spacer' ? 'up' : ('down' as 'up' | 'down'),
          frontColor: slot.kindHint === 'block-spacer' ? '#3f6ed9' : '#d4c79a',
        };
      }),
    [seatSlots, seatId, slotDepth],
  );

  return (
    <group>
      {/* Lane inlay outline */}
      <mesh
        position={[
          seatCenterX(seatId),
          0.001,
          (SEQ_LANE_NEAR_Z + SEQ_LANE_FAR_Z) / 2,
        ]}
      >
        <planeGeometry
          args={[SEQ_LANE_WIDTH + 0.04, SEQ_LANE_FAR_Z - SEQ_LANE_NEAR_Z + 0.04]}
        />
        <meshStandardMaterial color="#16181c" roughness={0.9} />
      </mesh>

      {positioned.map(({ slot, position, width, face, frontColor }) => (
        <Card3D
          key={slot.key}
          position={position}
          width={width}
          face={face}
          frontColor={frontColor}
          frameCost={slot.frameCost}
        />
      ))}
    </group>
  );
}

export const SequenceLane: RendererSlotImpl<PerSeatSlotProps> = memo(SequenceLaneImpl);
