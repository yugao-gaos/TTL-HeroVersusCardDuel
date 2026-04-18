/**
 * HVCD resolver — counter-tray economy (HP, Rage, Block Pool)
 *
 * Per combat-system.md §6 (rage), §2 (block pool).
 * All seat-scoped mutable numbers flow through these functions so the
 * per-object counterTray script can mirror changes back to ECS.
 */
import type { MatchState, ResolverEvent, SeatIndex } from './types.ts';

/**
 * Apply damage to the seat, emit damage + rage + ko events.
 * Returns true if the target was KO'd (hp <= 0).
 */
export function applyDamage(
  state: MatchState,
  targetIdx: SeatIndex,
  attackerIdx: SeatIndex | null,
  amount: number,
  attackKind: 'hit' | 'grab' | 'projectile' | 'parry',
  cardId: string,
  atFrame: number,
  events: ResolverEvent[],
): boolean {
  if (amount <= 0) return false;
  const target = state.seats[targetIdx];
  const hpBefore = target.hp;
  const actual = Math.min(amount, Math.max(0, target.hp));
  if (actual <= 0) return target.hp <= 0;
  target.hp -= actual;
  events.push({
    kind: 'damage-applied',
    seat: target.id,
    amount: actual,
    hpBefore,
    hpAfter: target.hp,
    attackerSeat: attackerIdx !== null ? state.seats[attackerIdx].id : target.id,
    attackKind,
    cardId,
    atGlobalFrame: atFrame,
  });
  // 1 rage per 1 damage taken (§6).
  target.rage += actual;
  events.push({
    kind: 'rage-gained',
    seat: target.id,
    amount: actual,
    rageAfter: target.rage,
    reason: 'damage-taken',
  });
  return target.hp <= 0;
}

export function restoreHp(
  state: MatchState,
  targetIdx: SeatIndex,
  amount: number,
  reason: 'effect-heal' | 'mutual-ko-restore',
  events: ResolverEvent[],
): void {
  if (amount <= 0) return;
  const target = state.seats[targetIdx];
  target.hp = Math.min(target.hp + amount, 30); // soft cap — tuning value
  events.push({
    kind: 'hp-restored',
    seat: target.id,
    amount,
    hpAfter: target.hp,
    reason,
  });
}

export function grantRage(
  state: MatchState,
  targetIdx: SeatIndex,
  amount: number,
  events: ResolverEvent[],
  reason: 'damage-taken' | 'effect-grant' = 'effect-grant',
): void {
  if (amount <= 0) return;
  state.seats[targetIdx].rage += amount;
  events.push({
    kind: 'rage-gained',
    seat: state.seats[targetIdx].id,
    amount,
    rageAfter: state.seats[targetIdx].rage,
    reason,
  });
}

export function consumeBlockPool(
  state: MatchState,
  targetIdx: SeatIndex,
  amount: number,
  events: ResolverEvent[],
): number {
  const seat = state.seats[targetIdx];
  const taken = Math.min(seat.blockPool, Math.max(0, amount));
  if (taken <= 0) return 0;
  seat.blockPool -= taken;
  return taken;
}

export function refillBlockPool(
  state: MatchState,
  targetIdx: SeatIndex,
  events: ResolverEvent[],
): void {
  const seat = state.seats[targetIdx];
  seat.blockPool = 6;
  // No dedicated BlockPoolRefilled event emission here — left for the
  // pause-or-end state which actually refills between showdowns.
}
