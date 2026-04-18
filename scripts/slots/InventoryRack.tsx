// hvcd.inventoryRack — per-seat, renderPhase: 'tick', privacy: 'owner-only'
//
// Item rack with Layer 1 privacy (ui §4a; renderer-slots.md §Privacy rule;
// platform-capability-privacy.md — Track A7 is the post-v1 generalization).
//
// v1 enforcement per OQ-18 resolution: if `isViewerSeat === false`, render
// `null`. Acknowledged leakage: a devtools-equipped attacker can still see
// inventory broadcast over the gameplay data channel. v2 (A7) switches this to
// `setEntityPrivacy(id, { mode: 'hidden', ownerSeat })` and removes the guard.
//
// Item usage-count data should live in the per-session private KV (OQ-3) so
// usages aren't broadcast; Wave-2 reads through world.readSeatData which is
// the same surface A7 will keep.

import { memo, useMemo } from '../_stub/moduleApi';
import type { RendererSlotImpl, PerSeatSlotProps } from '../_stub/moduleApi';
import { seatCenterX, RACK_LOCAL, RACK_TILT_DEG, TABLE_HALF_Z } from './shared/layout';
import { Card3D } from './shared/Card3D';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';

interface RackItem {
  instanceKey: string;
  itemId: string;
  usagesRemaining: number;
}

interface RackState {
  items: Record<SeatId, RackItem[]>;
}

const INITIAL: RackState = { items: { p1: [], p2: [] } };

type ResolverEvent =
  | {
      kind: 'match-started';
      setup: {
        seats: Record<
          SeatId,
          {
            inventory: Array<{ itemId: string; usages: number | null }>;
          }
        >;
      };
    }
  | {
      kind: 'item-returned-to-inventory';
      seat: SeatId;
      itemId: string;
      usagesRemaining: number;
    }
  | {
      kind: 'item-consumed';
      seat: SeatId;
      itemId: string;
    }
  | {
      kind: 'slot-committed';
      seat: SeatId;
      slot: { kind: string; itemId?: string };
    };

function reduce(state: RackState, event: ResolverEvent): RackState {
  switch (event.kind) {
    case 'match-started': {
      const next: RackState = { items: { p1: [], p2: [] } };
      (Object.keys(event.setup.seats) as SeatId[]).forEach((seat) => {
        next.items[seat] = event.setup.seats[seat].inventory.map((item, i) => ({
          instanceKey: `${seat}-${item.itemId}-${i}`,
          itemId: item.itemId,
          usagesRemaining: item.usages ?? 1,
        }));
      });
      return next;
    }
    case 'slot-committed': {
      // Item moved from rack to sequence slot (usage not decremented yet).
      if (event.slot.kind !== 'item' || !event.slot.itemId) return state;
      const arr = state.items[event.seat];
      const idx = arr.findIndex((i) => i.itemId === event.slot.itemId);
      if (idx < 0) return state;
      const next = arr.slice();
      next.splice(idx, 1);
      return { items: { ...state.items, [event.seat]: next } };
    }
    case 'item-returned-to-inventory': {
      const arr = state.items[event.seat];
      const idx = arr.findIndex((i) => i.itemId === event.itemId);
      if (idx >= 0) {
        const next = arr.slice();
        next[idx] = { ...next[idx], usagesRemaining: event.usagesRemaining };
        return { items: { ...state.items, [event.seat]: next } };
      }
      return {
        items: {
          ...state.items,
          [event.seat]: [
            ...arr,
            {
              instanceKey: `${event.seat}-${event.itemId}-${Date.now()}`,
              itemId: event.itemId,
              usagesRemaining: event.usagesRemaining,
            },
          ],
        },
      };
    }
    case 'item-consumed':
      return {
        items: {
          ...state.items,
          [event.seat]: state.items[event.seat].filter(
            (i) => i.itemId !== event.itemId,
          ),
        },
      };
    default:
      return state;
  }
}

function InventoryRackImpl({ seatId, isViewerSeat, events }: PerSeatSlotProps) {
  // ---- Layer 1 privacy gate (OQ-18 v1) ----
  // MUST be before any further rendering work. If this becomes a useEventStream
  // wrapper later, keep the early return here so React never allocates
  // geometry for the opponent's rack.
  if (!isViewerSeat) return null;

  const state = useEventStream<ResolverEvent, RackState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );
  const items = state.items[seatId];

  // Rack is angled toward the owner's camera (roughly -30° pitch so it tilts
  // up toward the over-the-shoulder POV).
  const tiltRad = (RACK_TILT_DEG * Math.PI) / 180;

  const positioned = useMemo(() => {
    // Items laid out along local X on the angled rack.
    const itemSpacing = 0.22;
    return items.map((item, i) => ({
      item,
      localPos: [(i - (items.length - 1) / 2) * itemSpacing, 0, 0] as [
        number,
        number,
        number,
      ],
    }));
  }, [items]);

  return (
    <group
      position={[
        seatCenterX(seatId) + RACK_LOCAL.x,
        RACK_LOCAL.y,
        -TABLE_HALF_Z + RACK_LOCAL.z + 0.2,
      ]}
      rotation={[-tiltRad, 0, 0]}
    >
      {/* rack shelf */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[Math.max(0.3, items.length * 0.22 + 0.1), 0.02, 0.28]} />
        <meshStandardMaterial color="#2b2d33" roughness={0.8} metalness={0.4} />
      </mesh>
      {/* shelf back-wall */}
      <mesh position={[0, 0.12, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(0.3, items.length * 0.22 + 0.1), 0.28]} />
        <meshStandardMaterial color="#1c1e22" roughness={0.95} />
      </mesh>

      {positioned.map(({ item, localPos }) => (
        <group key={item.instanceKey} position={localPos}>
          <Card3D
            position={[0, 0.01, 0]}
            width={0.18}
            height={0.26}
            face="up"
            frontColor="#c9a25e"
          />
          {/* Usage-count pips (ui §4a "usage counters as small pips") */}
          <group position={[-0.06, 0.02, 0.1]}>
            {Array.from({ length: Math.max(1, item.usagesRemaining) }).map((_, i) => (
              <mesh key={`pip-${i}`} position={[i * 0.022, 0.001, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 0.004, 12]} />
                <meshStandardMaterial
                  color={i < item.usagesRemaining ? '#f6d86a' : '#3a3a3a'}
                  emissive={i < item.usagesRemaining ? '#f6d86a' : '#000'}
                  emissiveIntensity={0.35}
                />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

export const InventoryRack: RendererSlotImpl<PerSeatSlotProps> = memo(InventoryRackImpl);
