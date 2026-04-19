/**
 * HVCD resolver — projectile lifecycle
 *
 * Per combat-system.md §9.
 * Logic owned by scripts/objects/projectile.ts; this file contains the
 * pure-function core.
 *
 * Frame-loop ordering (§5 — OQ-31 11-step order):
 *   - step 4 — launchProjectile fires when a projectile launch window's
 *     last frame equals the current frame (pure placement — spawns in-flight
 *     projectile, no resolution)
 *   - step 6 — resolveClashes resolves projectile↔projectile mid-flight
 *     collisions; resolveArrivals then resolves projectile↔defender
 *     precedence (parry > evasion > block > reflect > armor > damage-lands)
 */
import { applyDamage } from './economy.ts';
import { applyDamageModifiers } from '../effects/registry.ts';
import { hasToken, placeToken, removeTokens } from './tokens.ts';
import { placeStun } from './combat.ts';
import type {
  MatchState,
  ProjectileEntity,
  ResolverEvent,
  SeatId,
  SeatIndex,
  TimelineToken,
} from './types.ts';
import { otherSeat, seatIdOf, seatIndexOf, tokenCoversFrame } from './types.ts';

/**
 * Called on a projectile attack window's last launch frame (frame-loop step 4
 * per OQ-31 — pure placement, no resolution). Creates the in-flight entity +
 * parks the source card.
 *
 * Caller (timeline frame-loop) is responsible for detecting the launch-end
 * frame and invoking this; projectile window tokens on the timeline are kept
 * as display markers but the spawn fires via this function.
 */
export function launchProjectile(
  state: MatchState,
  ownerSeat: SeatId,
  launchToken: TimelineToken,
  events: ResolverEvent[],
): ProjectileEntity {
  const p = (launchToken.payload ?? {}) as {
    damage?: number;
    hits?: number;
    hitStun?: number;
    travelFrames: number;
    defenseBreaker?: boolean;
    knockdown?: boolean;
  };
  const spawnFrame = state.frame;
  const id = `proj-${state.nextProjectileId++}`;
  const projectile: ProjectileEntity = {
    id,
    owner: ownerSeat,
    sourceCardId: launchToken.cardId ?? '',
    spawnFrame,
    arrivalFrame: spawnFrame + p.travelFrames,
    damage: p.damage ?? 0,
    hits: p.hits ?? 1,
    hitStun: p.hitStun ?? 4,
    defenseBreaker: !!p.defenseBreaker,
    knockdown: !!p.knockdown,
  };
  state.projectiles.push(projectile);
  events.push({
    kind: 'projectile-launched',
    ownerSeat,
    cardId: projectile.sourceCardId,
    spawnGlobalFrame: spawnFrame,
    arrivalGlobalFrame: projectile.arrivalFrame,
    travelFrames: p.travelFrames,
    hits: projectile.hits,
    damage: projectile.damage,
    defenseBreaker: projectile.defenseBreaker,
    knockdown: projectile.knockdown,
    projectileId: id,
  });

  // Park the source card.
  const ownerIdx = seatIndexOf(ownerSeat);
  const seat = state.seats[ownerIdx];
  seat.sideArea.push({ cardId: projectile.sourceCardId, reason: 'projectile', tether: id });
  events.push({
    kind: 'card-parked-to-side-area',
    seat: ownerSeat,
    cardId: projectile.sourceCardId,
    reason: 'projectile',
    tetherTargetId: id,
  });

  return projectile;
}

/**
 * Frame-loop step 6 (projectile↔projectile): check for projectile clashes.
 * Two opposing projectiles in flight clash if their in-flight intervals overlap.
 */
export function resolveClashes(state: MatchState, events: ResolverEvent[]): void {
  const alive = state.projectiles;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      if (!a || !b) continue;
      if (a.owner === b.owner) continue;
      // Both in-flight at state.frame?
      if (state.frame < Math.max(a.spawnFrame, b.spawnFrame)) continue;
      if (state.frame > Math.min(a.arrivalFrame, b.arrivalFrame)) continue;
      const cancelled = Math.min(a.hits, b.hits);
      a.hits -= cancelled;
      b.hits -= cancelled;
      events.push({
        kind: 'projectile-clashed',
        atGlobalFrame: state.frame,
        aProjectileId: a.id,
        bProjectileId: b.id,
        hitsCancelled: cancelled,
        aRemainingHits: a.hits,
        bRemainingHits: b.hits,
      });
    }
  }
  // Prune depleted projectiles and release their source cards to discard.
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    if (p.hits <= 0) {
      state.projectiles.splice(i, 1);
      releaseSourceCard(state, p, 'discard', events);
    }
  }
}

/**
 * Frame-loop step 6 (projectile↔defender): resolve projectile arrivals for
 * the current frame. Precedence: block > reflect > armor > damage-lands.
 * Projectiles bypass parry and evasion per §9 (projectile > hit in OQ-31).
 *
 * Returns true if any projectile stunned its target (used by caller to gate
 * subsequent card-window interactions this frame per §5 "fireball-then-hit"
 * rule).
 */
export function resolveArrivals(state: MatchState, events: ResolverEvent[]): boolean {
  let interruptedDefender = false;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    if (p.arrivalFrame !== state.frame) continue;
    const targetSeat = otherSeat(seatIndexOf(p.owner));
    const target = state.seats[targetSeat];

    // Knockdown invincibility
    if (hasToken(state, target.id, state.frame, 'knockdown')) {
      events.push({
        kind: 'projectile-arrived',
        projectileId: p.id,
        ownerSeat: p.owner,
        targetSeat: target.id,
        atGlobalFrame: state.frame,
        resolution: 'whiff-invincible',
      });
      state.projectiles.splice(i, 1);
      releaseSourceCard(state, p, 'discard', events);
      continue;
    }

    // Defender's active defenses at current frame
    const def = target.activeCard;
    let defenseKind: 'parry' | 'evasion' | 'block' | 'reflect' | 'armor' | 'none' = 'none';
    let reflectToken: TimelineToken | null = null;
    let blockToken: TimelineToken | null = null;
    let armorToken: TimelineToken | null = null;

    if (def) {
      for (const t of state.tokens) {
        if (t.seat !== target.id) continue;
        // block/armor are per-frame (frame === state.frame); reflect is a
        // multi-frame window token (range covers state.frame). Per OQ-32.
        if (!tokenCoversFrame(t, state.frame)) continue;
        if (t.cardId !== def.cardId && t.kind !== 'block') continue; // block can be from spacer
        if (t.kind === 'reflect') reflectToken = t;
        if (t.kind === 'block') blockToken = t;
        if (t.kind === 'armor') armorToken = t;
      }
    } else {
      // between-cards: spacer block tokens still apply
      for (const t of state.tokens) {
        if (t.seat !== target.id || t.frame !== state.frame) continue;
        if (t.kind === 'block' && !t.cardId) blockToken = t;
      }
    }

    // Projectile precedence: parry loses, evasion loses (homing).
    // block > reflect > armor > damage.
    if (blockToken && !p.defenseBreaker) {
      defenseKind = 'block';
      const hitsAbsorbed = Math.min(1, p.hits);
      const fallThrough = p.hits - hitsAbsorbed;
      removeTokens(state, (t) => t === blockToken);
      events.push({
        kind: 'projectile-arrived',
        projectileId: p.id,
        ownerSeat: p.owner,
        targetSeat: target.id,
        atGlobalFrame: state.frame,
        resolution: 'blocked',
      });
      events.push({
        kind: 'hit-blocked',
        attackerSeat: p.owner,
        defenderSeat: target.id,
        attackKind: 'projectile',
        cardId: p.sourceCardId,
        atGlobalFrame: state.frame,
        hitsAbsorbed,
        hitsFallingThrough: fallThrough,
      });
      if (fallThrough > 0) {
        const dmg = applyDamageModifiers(state, p.owner, target.id, 'projectile', p.damage, events, p.sourceCardId);
        const ko = applyDamage(state, targetSeat, seatIndexOf(p.owner), dmg * fallThrough, 'projectile', p.sourceCardId, state.frame, events);
        placeStun(state, targetSeat, state.frame + 1, p.hitStun, p.knockdown ? 'knockdown' : 'stun', 'hit', events);
        interruptedDefender = true;
        if (ko) {
          events.push({ kind: 'ko', losingSeat: target.id, atGlobalFrame: state.frame });
        }
      }
      state.projectiles.splice(i, 1);
      releaseSourceCard(state, p, 'discard', events);
      continue;
    }

    if (reflectToken) {
      const reflectKey = `${target.id}|${reflectToken.cardId ?? ''}|${state.frame}`;
      if (!state.reflectFiredThisFrame.has(reflectKey)) {
        state.reflectFiredThisFrame.add(reflectKey);
        defenseKind = 'reflect';
        const rp = (reflectToken.payload ?? {}) as { reflectTravel?: number };
        p.owner = target.id; // owner flip
        p.arrivalFrame = state.frame + (rp.reflectTravel ?? 1);
        p.spawnFrame = state.frame;
        events.push({
          kind: 'projectile-arrived',
          projectileId: p.id,
          ownerSeat: target.id,
          targetSeat: target.id,
          atGlobalFrame: state.frame,
          resolution: 'reflected',
        });
        events.push({
          kind: 'projectile-reflected',
          projectileId: p.id,
          newOwnerSeat: target.id,
          newArrivalGlobalFrame: p.arrivalFrame,
        });
        // Stay in flight; source card remains parked (spec §9).
        continue;
      }
    }

    if (armorToken && !p.defenseBreaker) {
      const ap = (armorToken.payload ?? {}) as { absorbs?: number };
      const remaining = (ap.absorbs ?? Infinity) - 1;
      defenseKind = 'armor';
      const broken = remaining <= 0 && Number.isFinite(remaining);
      if (broken) removeTokens(state, (t) => t === armorToken);
      else if (Number.isFinite(remaining)) armorToken.payload = { ...(armorToken.payload ?? {}), absorbs: remaining };

      const dmg = applyDamageModifiers(state, p.owner, target.id, 'projectile', p.damage, events, p.sourceCardId);
      const ko = applyDamage(state, targetSeat, seatIndexOf(p.owner), dmg, 'projectile', p.sourceCardId, state.frame, events);
      events.push({
        kind: 'projectile-arrived',
        projectileId: p.id,
        ownerSeat: p.owner,
        targetSeat: target.id,
        atGlobalFrame: state.frame,
        resolution: 'armored',
      });
      events.push({
        kind: 'hit-armored',
        attackerSeat: p.owner,
        defenderSeat: target.id,
        attackKind: 'projectile',
        cardId: p.sourceCardId,
        atGlobalFrame: state.frame,
        damage: dmg,
        armorAbsorbsRemaining: Number.isFinite(remaining) ? (remaining as number) : -1,
        armorBroken: broken,
      });
      if (broken) {
        placeStun(state, targetSeat, state.frame + 1, p.hitStun, p.knockdown ? 'knockdown' : 'stun', 'hit', events);
        interruptedDefender = true;
      }
      state.projectiles.splice(i, 1);
      releaseSourceCard(state, p, 'discard', events);
      if (ko) events.push({ kind: 'ko', losingSeat: target.id, atGlobalFrame: state.frame });
      continue;
    }

    // No defense — projectile lands raw.
    defenseKind = 'none';
    const dmg = applyDamageModifiers(state, p.owner, target.id, 'projectile', p.damage, events, p.sourceCardId);
    const ko = applyDamage(state, targetSeat, seatIndexOf(p.owner), dmg * p.hits, 'projectile', p.sourceCardId, state.frame, events);
    events.push({
      kind: 'projectile-arrived',
      projectileId: p.id,
      ownerSeat: p.owner,
      targetSeat: target.id,
      atGlobalFrame: state.frame,
      resolution: 'landed',
    });
    events.push({
      kind: 'hit-connected',
      attackerSeat: p.owner,
      defenderSeat: target.id,
      attackKind: 'projectile',
      cardId: p.sourceCardId,
      atGlobalFrame: state.frame,
      damage: dmg * p.hits,
      hits: p.hits,
      hitStunFrames: p.hitStun,
      comboExtend: hasToken(state, target.id, state.frame, 'stun'),
    });
    placeStun(state, targetSeat, state.frame + 1, p.hitStun, p.knockdown ? 'knockdown' : 'stun', 'hit', events);
    interruptedDefender = true;
    state.projectiles.splice(i, 1);
    releaseSourceCard(state, p, 'discard', events);
    if (ko) events.push({ kind: 'ko', losingSeat: target.id, atGlobalFrame: state.frame });
  }
  return interruptedDefender;
}

function releaseSourceCard(
  state: MatchState,
  projectile: ProjectileEntity,
  dest: 'discard' | 'inventory-retained' | 'inventory-consumed',
  events: ResolverEvent[],
): void {
  const idx = seatIndexOf(projectile.owner);
  const seat = state.seats[idx];
  const pIndex = seat.sideArea.findIndex((p) => p.tether === projectile.id);
  if (pIndex < 0) return;
  const parked = seat.sideArea[pIndex];
  seat.sideArea.splice(pIndex, 1);
  if (dest === 'discard') seat.discard.push(parked.cardId);
  events.push({
    kind: 'card-released-from-side-area',
    seat: seat.id,
    cardId: parked.cardId,
    destination: dest,
  });
}
