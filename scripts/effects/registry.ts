/**
 * HVCD effect registry
 *
 * Per combat-system.md §11, effect behaviors are registered piecemeal by
 * `effectId`. The spec does not enumerate effect behaviors beyond the
 * activate/standing/end lifecycle — each effectId describes its own logic.
 *
 * Registry surface:
 *   onActivate(ctx)  -> called when an effect activation window completes
 *                       (frame-loop step 7). For instant effects, this is the
 *                       whole effect; for standing effects, this is the kickoff
 *                       plus scheduling of the effect-end token.
 *   onFrame(ctx)     -> optional; called once per frame while the effect is
 *                       active (frame-loop step 1), allowing per-frame modifiers
 *                       (cursor slow, rage regen, etc.).
 *   onEnd(ctx)       -> called when the effect-end token fires.
 *   modifyDamage(ctx, damage) -> optional; per-hit damage modifier.
 *
 * Implementation notes:
 *   - New effects are added by calling `registerEffect({ id, impl })` from the
 *     effect file. See damageUp below for a reference.
 *   - The resolver looks up an effect by id on activation; unknown effectIds
 *     emit a diagnostic and fall through as no-ops (the window still consumes
 *     frames on the timeline).
 *   - Effects are the one place future reactive logic (e.g. "on taking damage,
 *     do X") lives legitimately in the §12 model — but only as a state
 *     transformer within the per-frame loop, not as a side-channel trigger.
 *
 * OQ-35 resolution: reactive items are dropped. If a design needs a
 * reactive pattern (e.g., retaliate-on-hit-taken), author it as a duration-30
 * standing effect with a modifyDamage hook rather than a new trigger.
 */
import type { ActiveEffect, MatchState, ResolverEvent, SeatId } from '../resolver/types.ts';
import { seatIndexOf, otherSeat } from '../resolver/types.ts';

export interface EffectContext {
  state: MatchState;
  effect: ActiveEffect;
  events: ResolverEvent[];
}

export interface DamageModifierContext extends EffectContext {
  attackerSeat: SeatId;
  defenderSeat: SeatId;
  attackKind: 'hit' | 'grab' | 'projectile' | 'parry';
  baseDamage: number;
}

export interface EffectImpl {
  /** Human-readable label for inspector / diagnostics. */
  label?: string;
  /** Called once at activation (frame-loop step 7). */
  onActivate?: (ctx: EffectContext) => void;
  /** Called once per frame while active (frame-loop step 1). */
  onFrame?: (ctx: EffectContext) => void;
  /** Called when the effect-end token fires. */
  onEnd?: (ctx: EffectContext) => void;
  /** Called per outgoing damage instance when the caster is the attacker. Returns modified damage. */
  modifyOutgoingDamage?: (ctx: DamageModifierContext) => number;
  /** Called per incoming damage instance when the target is the defender. */
  modifyIncomingDamage?: (ctx: DamageModifierContext) => number;
}

const registry = new Map<string, EffectImpl>();

export function registerEffect(id: string, impl: EffectImpl): void {
  registry.set(id, impl);
}

export function getEffect(id: string): EffectImpl | undefined {
  return registry.get(id);
}

export function listEffectIds(): string[] {
  return Array.from(registry.keys());
}

/**
 * Apply all active effects' modifyOutgoingDamage / modifyIncomingDamage hooks
 * to an incoming damage number. Called from the attack-resolution path.
 */
export function applyDamageModifiers(
  state: MatchState,
  attackerSeat: SeatId,
  defenderSeat: SeatId,
  attackKind: 'hit' | 'grab' | 'projectile' | 'parry',
  baseDamage: number,
  events: ResolverEvent[],
  cardIdForEvent: string,
): number {
  let damage = baseDamage;
  for (const effect of state.effects) {
    const impl = registry.get(effect.effectId);
    if (!impl) continue;
    const ctx: DamageModifierContext = {
      state,
      effect,
      events,
      attackerSeat,
      defenderSeat,
      attackKind,
      baseDamage,
    };
    if (effect.targetSeat === attackerSeat && impl.modifyOutgoingDamage) {
      damage = impl.modifyOutgoingDamage({ ...ctx, baseDamage: damage });
    }
    if (effect.targetSeat === defenderSeat && impl.modifyIncomingDamage) {
      damage = impl.modifyIncomingDamage({ ...ctx, baseDamage: damage });
    }
  }
  return Math.max(0, Math.floor(damage));
}

// ---------------------------------------------------------------------------
// Reference effect: damageUp
// ---------------------------------------------------------------------------
//
// Per combat-system.md §11 example: "Damage +1 on self (duration 20) — while
// active, all attack windows the seat plays deal +1 damage."
// Stacks additively (§11 Stacking).

registerEffect('damageUp', {
  label: 'Damage +1',
  modifyOutgoingDamage: (ctx) => {
    return ctx.baseDamage + 1;
  },
});

// ---------------------------------------------------------------------------
// Reference effect: heal (instant)
// ---------------------------------------------------------------------------

registerEffect('heal', {
  label: 'Heal +5 HP (instant)',
  onActivate: (ctx) => {
    const idx = seatIndexOf(ctx.effect.targetSeat);
    const target = ctx.state.seats[idx];
    const amount = (ctx.effect.payload.amount as number | undefined) ?? 5;
    const before = target.hp;
    target.hp = Math.min(target.hp + amount, 30);
    ctx.events.push({
      kind: 'hp-restored',
      seat: target.id,
      amount: target.hp - before,
      hpAfter: target.hp,
      reason: 'effect-heal',
    });
  },
});

// ---------------------------------------------------------------------------
// Reference effect: refillPool (instant)
// ---------------------------------------------------------------------------

registerEffect('refillPool', {
  label: 'Refill block pool',
  onActivate: (ctx) => {
    const idx = seatIndexOf(ctx.effect.targetSeat);
    const target = ctx.state.seats[idx];
    const amount = (ctx.effect.payload.amount as number | undefined) ?? 6;
    target.blockPool = Math.min(6, target.blockPool + amount);
  },
});
