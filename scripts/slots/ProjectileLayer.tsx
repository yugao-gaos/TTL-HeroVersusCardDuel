// hvcd.projectileLayer — session-scoped, renderPhase: 'frame'
//
// The airspace above the cabinet where in-flight projectile 3D objects live
// (ui §6e). Projectiles spawn on `projectile-launched`, arc from the attacker's
// side toward the defender's reticle, and resolve on `projectile-arrived`.
// On clash we flash impact VFX; on reflect we reverse direction; on arrival we
// dissolve.
//
// Wave-2 placeholder: small emissive spheres following a sinusoidal arc
// between spawn and arrival frames, shadow cast onto the rail. Tethers back
// to parked source cards are drawn by SideArea, not here (they read
// projectilePositions from their own reduced state — same event stream).

import { memo, useRef, useMemo, useFrame } from '@tabletoplabs/module-api';
import type { RendererSlotImpl, SessionSlotProps } from '@tabletoplabs/module-api';
import type { Group } from '@tabletoplabs/module-api';
import {
  frameToRailZ,
  seatLaneX,
  PROJECTILE_Y,
  PROJECTILE_APEX_Y,
} from './shared/layout';
import { useEventStream } from './shared/useEventStream';

type SeatId = 'p1' | 'p2';

interface Projectile {
  id: string;
  ownerSeat: SeatId;
  targetSeat: SeatId;
  spawnFrame: number;
  arrivalFrame: number;
  /** Once arrived, used for fade-out animation. 0 == live. */
  resolvedAt: number | null;
  resolvedKind: 'landed' | 'clashed' | 'reflected' | null;
}

interface ProjectileState {
  projectiles: Projectile[];
  originFrame: number;
  cursorFrame: number;
}

const INITIAL: ProjectileState = {
  projectiles: [],
  originFrame: 0,
  cursorFrame: 0,
};

type ResolverEvent =
  | { kind: 'showdown-started'; startGlobalFrame: number }
  | { kind: 'cursor-advanced'; newGlobalFrame: number }
  | {
      kind: 'projectile-launched';
      projectileId: string;
      ownerSeat: SeatId;
      spawnGlobalFrame: number;
      arrivalGlobalFrame: number;
    }
  | {
      kind: 'projectile-arrived';
      projectileId: string;
      targetSeat?: SeatId;
      atGlobalFrame: number;
    }
  | {
      kind: 'projectile-clashed';
      atGlobalFrame: number;
      aProjectileId: string;
      bProjectileId: string;
      aRemainingHits: number;
      bRemainingHits: number;
    }
  | {
      kind: 'projectile-reflected';
      projectileId: string;
      newOwnerSeat: SeatId;
      newArrivalGlobalFrame: number;
    };

function reduce(state: ProjectileState, event: ResolverEvent): ProjectileState {
  switch (event.kind) {
    case 'showdown-started':
      return { ...state, originFrame: event.startGlobalFrame, cursorFrame: event.startGlobalFrame };
    case 'cursor-advanced':
      return { ...state, cursorFrame: event.newGlobalFrame };
    case 'projectile-launched': {
      const targetSeat: SeatId = event.ownerSeat === 'p1' ? 'p2' : 'p1';
      return {
        ...state,
        projectiles: [
          ...state.projectiles,
          {
            id: event.projectileId,
            ownerSeat: event.ownerSeat,
            targetSeat,
            spawnFrame: event.spawnGlobalFrame,
            arrivalFrame: event.arrivalGlobalFrame,
            resolvedAt: null,
            resolvedKind: null,
          },
        ],
      };
    }
    case 'projectile-arrived':
      return {
        ...state,
        projectiles: state.projectiles.map((p) =>
          p.id === event.projectileId
            ? { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: 'landed' }
            : p,
        ),
      };
    case 'projectile-clashed': {
      const aDead = event.aRemainingHits <= 0;
      const bDead = event.bRemainingHits <= 0;
      return {
        ...state,
        projectiles: state.projectiles.map((p) => {
          if (p.id === event.aProjectileId && aDead) {
            return { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: 'clashed' };
          }
          if (p.id === event.bProjectileId && bDead) {
            return { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: 'clashed' };
          }
          return p;
        }),
      };
    }
    case 'projectile-reflected': {
      const newTarget: SeatId = event.newOwnerSeat === 'p1' ? 'p2' : 'p1';
      return {
        ...state,
        projectiles: state.projectiles.map((p) =>
          p.id === event.projectileId
            ? {
                ...p,
                ownerSeat: event.newOwnerSeat,
                targetSeat: newTarget,
                spawnFrame: state.cursorFrame,
                arrivalFrame: event.newArrivalGlobalFrame,
                resolvedKind: 'reflected',
              }
            : p,
        ),
      };
    }
    default:
      return state;
  }
}

// -------------------------------------------------------------------------
// Per-projectile renderable — pulls transform off refs in useFrame so the
// outer component doesn't re-render every frame.
// -------------------------------------------------------------------------

interface ProjectileMeshProps {
  projectile: Projectile;
  cursorFrameRef: { current: number };
  originFrame: number;
}

function ProjectileMesh({ projectile, cursorFrameRef, originFrame }: ProjectileMeshProps) {
  const groupRef = useRef<Group | null>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const cursor = cursorFrameRef.current;
    const totalFrames = Math.max(1, projectile.arrivalFrame - projectile.spawnFrame);
    const rawT = (cursor - projectile.spawnFrame) / totalFrames;
    const t = Math.max(0, Math.min(1, rawT));

    const fromX = seatLaneX(projectile.ownerSeat);
    const toX = seatLaneX(projectile.targetSeat);
    const x = fromX + (toX - fromX) * t;

    const fromZ = frameToRailZ(projectile.spawnFrame, originFrame);
    const toZ = frameToRailZ(projectile.arrivalFrame, originFrame);
    const z = fromZ + (toZ - fromZ) * t;

    // Parabolic arc: apex at t=0.5
    const y = PROJECTILE_Y + (PROJECTILE_APEX_Y - PROJECTILE_Y) * 4 * t * (1 - t);

    groupRef.current.position.set(x, y, z);
    groupRef.current.visible = projectile.resolvedAt == null || t < 1.05;
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <sphereGeometry args={[0.06, 16, 12]} />
        <meshStandardMaterial
          color="#3fb8d9"
          emissive="#3fb8d9"
          emissiveIntensity={1.3}
        />
      </mesh>
      {/* Soft glow halo */}
      <mesh>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshBasicMaterial color="#3fb8d9" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function ProjectileLayerImpl({ events }: SessionSlotProps) {
  const state = useEventStream<ResolverEvent, ProjectileState>(
    events,
    'resolverEvents',
    INITIAL,
    reduce,
  );

  // Keep a ref of the cursor frame so per-projectile meshes can read without
  // re-subscribing; updated in useFrame.
  const cursorFrameRef = useRef(state.cursorFrame);
  cursorFrameRef.current = state.cursorFrame;

  // Stable key list to avoid child remounts across state renders.
  const live = useMemo(() => state.projectiles, [state.projectiles]);

  return (
    <group>
      {live.map((p) => (
        <ProjectileMesh
          key={p.id}
          projectile={p}
          cursorFrameRef={cursorFrameRef}
          originFrame={state.originFrame}
        />
      ))}
    </group>
  );
}

export const ProjectileLayer: RendererSlotImpl<SessionSlotProps> = memo(ProjectileLayerImpl);
