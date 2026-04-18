// Cabinet-surface anchor coordinates used across HVCD slot impls.
//
// The platform guarantees slot anchors by name (renderer-slots.md §Anchors),
// but the implementations need concrete offsets to position chips, rails, etc.
// These constants are the single source of truth so all slot impls agree on
// where P1/P2 zones land.
//
// Axis convention mirrors ui-design.md §3c:
//   +X right (P2 zone), -X left (P1 zone)
//   +Z far (toward monitor), -Z near (toward camera)
//   +Y up (above the table plane)
//
// All numbers are in meters (platform world units).

export const TABLE_HALF_X = 1.6;
export const TABLE_HALF_Z = 2.4;

/** Table surface Y. Chips, rail, cards sit at or slightly above this plane. */
export const TABLE_Y = 0.0;

/** Rail runs along the table's spine (X = 0), near -> far. */
export const RAIL_WIDTH = 0.5;
export const RAIL_DEPTH_RECESS = 0.02;
export const RAIL_NEAR_Z = -TABLE_HALF_Z + 0.6;
export const RAIL_FAR_Z = TABLE_HALF_Z - 0.8;
export const RAIL_LENGTH = RAIL_FAR_Z - RAIL_NEAR_Z;

/** Max frames displayed on the rail before overflow scaling. */
export const RAIL_FRAME_CAPACITY = 60;

/** Per-seat X offsets. */
export const P1_CENTER_X = -0.9;
export const P2_CENTER_X = 0.9;

export function seatCenterX(seatId: 'p1' | 'p2'): number {
  return seatId === 'p1' ? P1_CENTER_X : P2_CENTER_X;
}

/** Chip tray offsets relative to the seat's near-edge anchor. */
export const HP_TRAY_LOCAL = { x: -0.35, y: 0.02, z: 0.0 } as const;
export const RAGE_TRAY_LOCAL = { x: 0.05, y: 0.02, z: 0.0 } as const;
export const POOL_TRAY_LOCAL = { x: 0.45, y: 0.02, z: 0.0 } as const;

/** Sequence lane extends near -> far between the seat and the rail. */
export const SEQ_LANE_NEAR_Z = -TABLE_HALF_Z + 1.3;
export const SEQ_LANE_FAR_Z = RAIL_NEAR_Z - 0.1;
export const SEQ_LANE_WIDTH = 0.45;

/** Inventory rack is tucked behind the seat's chip trays, angled toward owner. */
export const RACK_LOCAL = { x: -0.95, y: 0.25, z: -0.15 } as const;
export const RACK_TILT_DEG = 35;

/** Side-area (parked projectile/effect source cards) is outboard of the sequence lane. */
export const SIDE_AREA_LOCAL_X_OFFSET = 0.65;
export const SIDE_AREA_NEAR_Z = SEQ_LANE_NEAR_Z + 0.2;
export const SIDE_AREA_FAR_Z = SEQ_LANE_FAR_Z;

/** Monitor mesh at far end of cabinet. */
export const MONITOR_POS = { x: 0, y: 1.2, z: TABLE_HALF_Z } as const;
export const MONITOR_SIZE = { w: 2.2, h: 1.24 } as const;

/** Projectile airspace bounds. */
export const PROJECTILE_Y = 0.4;
export const PROJECTILE_APEX_Y = 0.9;

/** Avatar rig anchor offset from seat near-edge. */
export const AVATAR_LOCAL = { x: 0, y: 0.3, z: -0.4 } as const;

/**
 * Convert a global frame to its rail Z coordinate.
 * Frames beyond RAIL_FRAME_CAPACITY compress toward RAIL_FAR_Z so the rail
 * never runs off the table — placeholder behavior; real scaling will be
 * decided once cursor-sweep animation lands.
 */
export function frameToRailZ(frame: number, originFrame = 0): number {
  const offset = frame - originFrame;
  const clamped = Math.max(0, Math.min(offset, RAIL_FRAME_CAPACITY));
  const t = clamped / RAIL_FRAME_CAPACITY;
  return RAIL_NEAR_Z + t * RAIL_LENGTH;
}

/** Per-seat X inside the rail lanes (rail splits into P1/P2 lanes along X). */
export function seatLaneX(seatId: 'p1' | 'p2'): number {
  return seatId === 'p1' ? -RAIL_WIDTH / 4 : RAIL_WIDTH / 4;
}
