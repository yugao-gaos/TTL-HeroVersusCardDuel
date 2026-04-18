// hvcd.chipTray — per-seat, renderPhase: 'event'
//
// Renders HP, Rage, and Block-pool chip trays at each seat's near edge
// (ui-design.md §8a-c). A single component handles all three variants; the
// registered slot mounts once per seat and internally lays out three sub-trays.
// (The registry lists `hvcd.chipTrays` as a single per-seat slot mounting all
// three trays together; per the registry description: "HP + Rage + Block-pool
// chip trays at each seat near edge".)
//
// Privacy: all three trays are public (ui §15 — physical chips are visible to
// both players). No isViewerSeat gating.
//
// Animations:
//   - HP loss + Rage gain pair up on damage-applied / rage-gained — placeholder
//     in Wave-2 (no tween; just count changes). Chip-transfer flight VFX is a
//     later polish wave.
//   - Pool chips dim on block-pool-consumed, refill on block-pool-refilled.

import { memo, useMemo } from '../_stub/moduleApi';
import type { RendererSlotImpl, PerSeatSlotProps } from '../_stub/moduleApi';
import {
  HP_TRAY_LOCAL,
  RAGE_TRAY_LOCAL,
  POOL_TRAY_LOCAL,
  seatCenterX,
  TABLE_HALF_Z,
} from './shared/layout';
import { Chip } from './shared/Chip';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';

interface SeatCounters {
  hp: number;
  hpMax: number;
  rage: number;
  rageMax: number;
  pool: number;
  poolMax: number;
  /** Dimmed chips (committed to spacer / block-stun extension) — visually distinct. */
  poolDimmed: number;
}

interface TrayState {
  seats: Record<SeatId, SeatCounters>;
}

const DEFAULT_HP = 30;
const DEFAULT_RAGE_MAX = 20;
const DEFAULT_POOL_MAX = 6;

const INITIAL: TrayState = {
  seats: {
    p1: {
      hp: DEFAULT_HP,
      hpMax: DEFAULT_HP,
      rage: 0,
      rageMax: DEFAULT_RAGE_MAX,
      pool: DEFAULT_POOL_MAX,
      poolMax: DEFAULT_POOL_MAX,
      poolDimmed: 0,
    },
    p2: {
      hp: DEFAULT_HP,
      hpMax: DEFAULT_HP,
      rage: 0,
      rageMax: DEFAULT_RAGE_MAX,
      pool: DEFAULT_POOL_MAX,
      poolMax: DEFAULT_POOL_MAX,
      poolDimmed: 0,
    },
  },
};

type ResolverEvent =
  | {
      kind: 'match-started';
      setup: {
        seats: Record<
          SeatId,
          { hp: number; rage: number; blockPool: number }
        >;
      };
    }
  | {
      kind: 'damage-applied';
      seat: SeatId;
      amount: number;
      hpAfter: number;
    }
  | {
      kind: 'hp-restored';
      seat: SeatId;
      hpAfter: number;
    }
  | {
      kind: 'rage-gained';
      seat: SeatId;
      rageAfter: number;
    }
  | {
      kind: 'rage-paid';
      seat: SeatId;
      rageAfter: number;
    }
  | {
      kind: 'block-pool-consumed';
      seat: SeatId;
      poolAfter: number;
      amount: number;
      reason: string;
    }
  | {
      kind: 'block-pool-refilled';
      seat: SeatId;
      poolAfter: number;
    };

function reduce(state: TrayState, event: ResolverEvent): TrayState {
  switch (event.kind) {
    case 'match-started': {
      const next: TrayState = { seats: { ...state.seats } };
      (Object.keys(event.setup.seats) as SeatId[]).forEach((seat) => {
        const s = event.setup.seats[seat];
        next.seats[seat] = {
          hp: s.hp,
          hpMax: s.hp,
          rage: s.rage,
          rageMax: DEFAULT_RAGE_MAX,
          pool: s.blockPool,
          poolMax: s.blockPool,
          poolDimmed: 0,
        };
      });
      return next;
    }
    case 'damage-applied':
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], hp: event.hpAfter },
        },
      };
    case 'hp-restored':
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], hp: event.hpAfter },
        },
      };
    case 'rage-gained':
    case 'rage-paid':
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], rage: event.rageAfter },
        },
      };
    case 'block-pool-consumed':
      return {
        seats: {
          ...state.seats,
          [event.seat]: {
            ...state.seats[event.seat],
            pool: event.poolAfter,
            poolDimmed:
              event.reason === 'spacer-commit'
                ? state.seats[event.seat].poolDimmed + event.amount
                : state.seats[event.seat].poolDimmed,
          },
        },
      };
    case 'block-pool-refilled':
      return {
        seats: {
          ...state.seats,
          [event.seat]: {
            ...state.seats[event.seat],
            pool: event.poolAfter,
            poolDimmed: 0,
          },
        },
      };
    default:
      return state;
  }
}

/** HP chip color at a given fraction-of-max (ui §8a green -> amber -> red). */
function hpColor(fraction: number): string {
  if (fraction > 0.6) return '#5fd13f';
  if (fraction > 0.3) return '#e8b04d';
  return '#e8564d';
}

function ChipTrayImpl({ seatId, events }: PerSeatSlotProps) {
  const state = useEventStream<ResolverEvent, TrayState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );
  const counters = state.seats[seatId];

  // Base anchor at the seat's near edge.
  const baseX = seatCenterX(seatId);
  const baseZ = -TABLE_HALF_Z + 0.35;

  // Chip slot spacing
  const chipSpacingX = 0.03;

  // HP tray (horizontal, depletes from right)
  const hpChips = useMemo(() => {
    const chips: { key: string; x: number; color: string; pulse: boolean }[] = [];
    for (let i = 0; i < counters.hpMax; i++) {
      const filled = i < counters.hp;
      const fraction = counters.hp / Math.max(counters.hpMax, 1);
      chips.push({
        key: `hp-${i}`,
        x: i * chipSpacingX,
        color: filled ? hpColor(fraction) : '#2c2f36',
        pulse: filled && fraction <= 0.3,
      });
    }
    return chips;
  }, [counters.hp, counters.hpMax]);

  // Rage tray (horizontal, fills left-to-right)
  const rageChips = useMemo(() => {
    const chips: { key: string; x: number; color: string }[] = [];
    for (let i = 0; i < counters.rageMax; i++) {
      const filled = i < counters.rage;
      chips.push({
        key: `rage-${i}`,
        x: i * chipSpacingX,
        color: filled ? '#d94a3e' : '#2c2f36',
      });
    }
    return chips;
  }, [counters.rage, counters.rageMax]);

  // Pool tray (vertical stack of 6)
  const poolChips = useMemo(() => {
    const chips: { key: string; y: number; color: string; dim: boolean }[] = [];
    for (let i = 0; i < counters.poolMax; i++) {
      const remaining = i < counters.pool;
      const dimmed =
        i >= counters.pool && i < counters.pool + counters.poolDimmed;
      chips.push({
        key: `pool-${i}`,
        y: i * 0.02,
        color: remaining ? '#3f6ed9' : dimmed ? '#26385a' : '#1a1c20',
        dim: dimmed,
      });
    }
    return chips;
  }, [counters.pool, counters.poolMax, counters.poolDimmed]);

  return (
    <group position={[baseX, 0, baseZ]}>
      {/* HP tray */}
      <group position={[HP_TRAY_LOCAL.x, HP_TRAY_LOCAL.y, HP_TRAY_LOCAL.z]}>
        <mesh position={[((counters.hpMax - 1) * chipSpacingX) / 2, -0.012, 0]}>
          <boxGeometry args={[counters.hpMax * chipSpacingX + 0.02, 0.012, 0.08]} />
          <meshStandardMaterial color="#16181c" roughness={0.9} />
        </mesh>
        {hpChips.map((c) => (
          <Chip
            key={c.key}
            position={[c.x, 0, 0]}
            color={c.color}
            radius={0.013}
            thickness={0.01}
            emissiveIntensity={c.pulse ? 0.5 : 0.0}
          />
        ))}
      </group>

      {/* Rage tray */}
      <group position={[RAGE_TRAY_LOCAL.x, RAGE_TRAY_LOCAL.y, RAGE_TRAY_LOCAL.z]}>
        <mesh position={[((counters.rageMax - 1) * chipSpacingX) / 2, -0.012, 0]}>
          <boxGeometry args={[counters.rageMax * chipSpacingX + 0.02, 0.012, 0.08]} />
          <meshStandardMaterial color="#1a1214" roughness={0.9} />
        </mesh>
        {rageChips.map((c) => (
          <Chip
            key={c.key}
            position={[c.x, 0, 0]}
            color={c.color}
            radius={0.013}
            thickness={0.01}
          />
        ))}
      </group>

      {/* Block pool stack */}
      <group position={[POOL_TRAY_LOCAL.x, POOL_TRAY_LOCAL.y, POOL_TRAY_LOCAL.z]}>
        {poolChips.map((c) => (
          <Chip
            key={c.key}
            position={[0, c.y, 0]}
            color={c.color}
            radius={0.03}
            thickness={0.018}
            emissiveIntensity={c.dim ? 0.0 : 0.05}
          />
        ))}
      </group>
    </group>
  );
}

export const ChipTray: RendererSlotImpl<PerSeatSlotProps> = memo(ChipTrayImpl);
