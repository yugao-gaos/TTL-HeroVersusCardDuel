/**
 * HVCD monitor composition — pure event selectors.
 *
 * Fold the resolver's event log into per-frame layer state. Every function in
 * this file is pure: no React, no three, no canvas. They exist so the
 * composition layers can be memoized cheaply and so the monitor logic is
 * unit-testable without a DOM.
 *
 * Contract source: hvcd-tabletop-contracts/event-log-schema.md (the
 * ResolverEvent discriminated union). UI mapping: ui-design.md §10b.
 *
 * Design notes:
 *   - `currentFrame` is the Remotion global frame (30fps, derived from the
 *     composition clock). The resolver emits events with `atGlobalFrame` /
 *     `newGlobalFrame` / `cardStartGlobalFrame` — those are in resolver frames
 *     (§5 frame-loop). The monitor assumes a 1:1 mapping today; the composition
 *     sits at fps=30 and the resolver ticks at whatever cadence it prefers, so
 *     the translation is simply "treat `atGlobalFrame` as a Remotion frame
 *     index." If a later wave introduces time-stretching (slow-mo replay, for
 *     example), this module is the only consumer that needs a scaling factor.
 *   - Selectors return plain value objects so React.memo can cheaply compare
 *     them at render time.
 */

import type {
  ResolverEvent,
  SeatId,
  WindowTokenKind,
  WindowPayload,
} from '../resolver/types';

// ---------------------------------------------------------------------------
// Active-sequence selection
// ---------------------------------------------------------------------------

/**
 * A single composition layer active at a given frame. The layer kinds map 1:1
 * onto the visual layer components in `scripts/monitor/layers/`.
 */
export type ActiveLayer =
  | { kind: 'fighter-attack'; seat: SeatId; cardId: string; startFrame: number; durationFrames: number }
  | { kind: 'fighter-react'; seat: SeatId; size: HitSize; startFrame: number; durationFrames: number }
  | { kind: 'fighter-stagger'; seat: SeatId; startFrame: number; durationFrames: number }
  | { kind: 'impact-flash'; at: SeatId; intensity: number; startFrame: number; durationFrames: number }
  | { kind: 'block-sparks'; at: SeatId; startFrame: number; durationFrames: number }
  | { kind: 'parry-glint'; at: SeatId; startFrame: number; durationFrames: number }
  | { kind: 'damage-numeral'; seat: SeatId; value: number; startFrame: number; durationFrames: number }
  | { kind: 'projectile'; ownerSeat: SeatId; projectileId: string; spawnFrame: number; arriveFrame: number }
  | { kind: 'projectile-clash'; startFrame: number; durationFrames: number }
  | { kind: 'knockdown'; seat: SeatId; startFrame: number; durationFrames: number }
  | { kind: 'effect'; targetSeat: SeatId; effectId: string; startFrame: number; durationFrames: number }
  | { kind: 'cancel-flash'; seat: SeatId; startFrame: number; durationFrames: number }
  | { kind: 'ko-flash'; losingSeat: SeatId; startFrame: number; durationFrames: number };

export type HitSize = 'small' | 'medium' | 'heavy';

/** Frame cost constants — tuned for readability, not for sim accuracy. */
const IMPACT_FLASH_FRAMES = 6;
const BLOCK_SPARK_FRAMES = 8;
const PARRY_GLINT_FRAMES = 10;
const PARRY_STAGGER_FRAMES = 14;
const DAMAGE_NUMERAL_FRAMES = 30;
const PROJECTILE_CLASH_FRAMES = 8;
const CANCEL_FLASH_FRAMES = 6;
const KO_FLASH_FRAMES = 60;
const EFFECT_DEFAULT_FRAMES = 30;

/** Hit-stop table — ui-design.md §12d. Longer stop on heavier hits. */
const HIT_STOP_BY_SIZE: Record<HitSize, number> = {
  small: 2,
  medium: 4,
  heavy: 7,
};

/** Classify a damage value into a visual size bucket for react / flash props. */
export function hitSize(damage: number): HitSize {
  if (damage >= 25) return 'heavy';
  if (damage >= 12) return 'medium';
  return 'small';
}

/**
 * Expand every event in the log into the set of layers it contributes. This is
 * pure and cheap; we do it once per (eventLog) change, not per frame.
 *
 * The returned list is NOT sorted — consumers filter by `currentFrame` against
 * `[startFrame, startFrame + durationFrames)`.
 */
export function expandEventsToLayers(events: readonly ResolverEvent[]): ActiveLayer[] {
  const out: ActiveLayer[] = [];

  for (const e of events) {
    switch (e.kind) {
      // --- Attacks ---------------------------------------------------------
      case 'card-entered-timeline': {
        // The attacker's own fighter action layer — lasts for the full card.
        out.push({
          kind: 'fighter-attack',
          seat: e.seat,
          cardId: e.cardId,
          startFrame: e.atGlobalFrame,
          durationFrames: e.totalFrames,
        });
        break;
      }

      // --- Hits ------------------------------------------------------------
      case 'hit-connected': {
        const size = hitSize(e.damage);
        out.push({
          kind: 'fighter-react',
          seat: e.defenderSeat,
          size,
          startFrame: e.atGlobalFrame,
          durationFrames: Math.max(e.hitStunFrames, 1),
        });
        out.push({
          kind: 'impact-flash',
          at: e.defenderSeat,
          intensity: Math.max(1, e.damage),
          startFrame: e.atGlobalFrame,
          durationFrames: IMPACT_FLASH_FRAMES,
        });
        out.push({
          kind: 'damage-numeral',
          seat: e.defenderSeat,
          value: e.damage,
          startFrame: e.atGlobalFrame,
          durationFrames: DAMAGE_NUMERAL_FRAMES,
        });
        break;
      }
      case 'hit-blocked': {
        out.push({
          kind: 'block-sparks',
          at: e.defenderSeat,
          startFrame: e.atGlobalFrame,
          durationFrames: BLOCK_SPARK_FRAMES,
        });
        break;
      }
      case 'hit-parried': {
        out.push({
          kind: 'parry-glint',
          at: e.parrierSeat,
          startFrame: e.atGlobalFrame,
          durationFrames: PARRY_GLINT_FRAMES,
        });
        out.push({
          kind: 'fighter-stagger',
          seat: e.attackerSeat,
          startFrame: e.atGlobalFrame,
          durationFrames: PARRY_STAGGER_FRAMES,
        });
        // The parry counter also deals damage — stamp a numeral.
        if (e.counterDamage > 0) {
          out.push({
            kind: 'damage-numeral',
            seat: e.attackerSeat,
            value: e.counterDamage,
            startFrame: e.atGlobalFrame + 2,
            durationFrames: DAMAGE_NUMERAL_FRAMES,
          });
        }
        break;
      }

      // --- Projectiles -----------------------------------------------------
      case 'projectile-launched': {
        out.push({
          kind: 'projectile',
          ownerSeat: e.ownerSeat,
          projectileId: e.projectileId,
          spawnFrame: e.spawnGlobalFrame,
          arriveFrame: e.arrivalGlobalFrame,
        });
        break;
      }
      case 'projectile-clashed': {
        out.push({
          kind: 'projectile-clash',
          startFrame: e.atGlobalFrame,
          durationFrames: PROJECTILE_CLASH_FRAMES,
        });
        break;
      }
      case 'projectile-arrived': {
        // Arrival that LANDED is drawn by hit-connected; we only need a
        // dedicated visual for whiff/blocked/armored outcomes where no hit
        // event fires. The impact flash below covers both.
        if (e.resolution === 'landed') break;
        out.push({
          kind: 'impact-flash',
          at: e.targetSeat,
          intensity: 1,
          startFrame: e.atGlobalFrame,
          durationFrames: IMPACT_FLASH_FRAMES,
        });
        break;
      }

      // --- Knockdown -------------------------------------------------------
      case 'knockdown-placed': {
        const [start, end] = e.frames;
        out.push({
          kind: 'knockdown',
          seat: e.seat,
          startFrame: start,
          durationFrames: Math.max(1, end - start + 1),
        });
        break;
      }

      // --- Effects ---------------------------------------------------------
      case 'effect-activated': {
        const duration = e.duration ?? EFFECT_DEFAULT_FRAMES;
        out.push({
          kind: 'effect',
          targetSeat: e.targetSeat,
          effectId: e.effectId,
          startFrame: e.activationGlobalFrame,
          durationFrames: duration,
        });
        break;
      }
      case 'effect-ended': {
        // No dedicated visual — the `effect` layer auto-expires on its own
        // duration. If a real spec requires an explicit out-animation, it
        // would be added here.
        break;
      }

      // --- Cancels ---------------------------------------------------------
      case 'cancel-fired': {
        out.push({
          kind: 'cancel-flash',
          seat: e.seat,
          startFrame: e.atGlobalFrame,
          durationFrames: CANCEL_FLASH_FRAMES,
        });
        break;
      }

      // --- KO --------------------------------------------------------------
      case 'ko': {
        out.push({
          kind: 'ko-flash',
          losingSeat: e.losingSeat,
          startFrame: e.atGlobalFrame,
          durationFrames: KO_FLASH_FRAMES,
        });
        break;
      }

      // Everything else (match-started, cursor-advanced, rage-gained, etc.)
      // has no visible monitor layer of its own — it affects HUD state
      // (combo counter, frame readout) which has its own selector.
      default:
        break;
    }
  }

  return out;
}

/**
 * All layers currently active at `currentFrame`. Use this per render tick.
 * Callers pass the pre-expanded layer list (stable identity); this is a cheap
 * filter + occasional array allocation.
 */
export function selectActiveLayersAt(
  layers: readonly ActiveLayer[],
  currentFrame: number,
): ActiveLayer[] {
  const out: ActiveLayer[] = [];
  for (const l of layers) {
    const start = layerStart(l);
    const end = start + layerDuration(l);
    if (currentFrame >= start && currentFrame < end) out.push(l);
  }
  return out;
}

function layerStart(l: ActiveLayer): number {
  if (l.kind === 'projectile') return l.spawnFrame;
  return l.startFrame;
}

function layerDuration(l: ActiveLayer): number {
  if (l.kind === 'projectile') return Math.max(1, l.arriveFrame - l.spawnFrame);
  return l.durationFrames;
}

/**
 * Convenience wrapper: expand + filter in one pass. Prefer the split API in
 * components that can memoize the expansion step independently.
 */
export function selectActiveSequences(
  events: readonly ResolverEvent[],
  currentFrame: number,
): ActiveLayer[] {
  return selectActiveLayersAt(expandEventsToLayers(events), currentFrame);
}

// ---------------------------------------------------------------------------
// Combo state
// ---------------------------------------------------------------------------

export interface ComboState {
  /** Currently active attacker seat, or null if no combo is running. */
  attackerSeat: SeatId | null;
  /** Number of confirmed hit-connected events since the last combo-started. */
  hitCount: number;
  /** Global frame the combo started at (for in-counter fade-in). */
  startedAtFrame: number | null;
}

const EMPTY_COMBO: ComboState = {
  attackerSeat: null,
  hitCount: 0,
  startedAtFrame: null,
};

/**
 * Fold combo lifecycle events into the current combo. Processes the whole log
 * each time — callers should memoize against log identity.
 */
export function selectComboState(events: readonly ResolverEvent[]): ComboState {
  let state: ComboState = EMPTY_COMBO;
  for (const e of events) {
    if (e.kind === 'combo-started') {
      state = {
        attackerSeat: e.attackerSeat,
        hitCount: 0,
        startedAtFrame: e.atGlobalFrame,
      };
    } else if (e.kind === 'combo-dropped') {
      state = EMPTY_COMBO;
    } else if (e.kind === 'hit-connected' && state.attackerSeat === e.attackerSeat) {
      state = {
        ...state,
        hitCount: state.hitCount + Math.max(1, e.hits),
      };
    } else if (e.kind === 'showdown-paused' || e.kind === 'turn-ended' || e.kind === 'match-ended') {
      state = EMPTY_COMBO;
    } else if (e.kind === 'ko' || e.kind === 'mutual-ko-draw') {
      state = EMPTY_COMBO;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Hit-stop
// ---------------------------------------------------------------------------

/**
 * How much to scale the playback rate "around" currentFrame. 1.0 = normal,
 * 0 = frozen, 0.5 = slow-mo. The monitor composition applies this as a
 * compounded scale to its internal animation updates; it does NOT feed back
 * into the resolver.
 *
 * Implementation: find the latest hit-connected / parry-fired / projectile-
 * clashed event whose hit-stop window covers currentFrame, return its stop
 * intensity as a scalar ∈ [0,1].
 */
export function selectHitStop(events: readonly ResolverEvent[], currentFrame: number): number {
  let scale = 1;
  for (const e of events) {
    if (e.kind === 'hit-connected') {
      const stopFrames = HIT_STOP_BY_SIZE[hitSize(e.damage)];
      if (currentFrame >= e.atGlobalFrame && currentFrame < e.atGlobalFrame + stopFrames) {
        // heavier hit wins — 0 = freeze, 1 = normal.
        scale = Math.min(scale, 0);
      }
    } else if (e.kind === 'hit-parried') {
      const stopFrames = 6;
      if (currentFrame >= e.atGlobalFrame && currentFrame < e.atGlobalFrame + stopFrames) {
        scale = Math.min(scale, 0);
      }
    } else if (e.kind === 'projectile-clashed') {
      const stopFrames = 4;
      if (currentFrame >= e.atGlobalFrame && currentFrame < e.atGlobalFrame + stopFrames) {
        scale = Math.min(scale, 0.25);
      }
    }
  }
  return scale;
}

// ---------------------------------------------------------------------------
// Frame readout / HUD strip
// ---------------------------------------------------------------------------

export interface FrameReadout {
  /** HP for each seat at `currentFrame`, folding damage/heal events. */
  hp: Record<SeatId, number>;
  /** Rage for each seat, folding rage-gained / cancel-armed. */
  rage: Record<SeatId, number>;
  /** Combo hit counter, mirrors selectComboState. */
  comboHits: number;
  /** Global frame. */
  frame: number;
}

const ZERO_READOUT: FrameReadout = {
  hp: { p1: 0, p2: 0 },
  rage: { p1: 0, p2: 0 },
  comboHits: 0,
  frame: 0,
};

/**
 * Derive the per-seat HUD numbers at `currentFrame`. Only events with
 * atGlobalFrame ≤ currentFrame contribute — this lets replay scrubbing work
 * by changing currentFrame alone.
 */
export function selectFrameReadout(
  events: readonly ResolverEvent[],
  currentFrame: number,
): FrameReadout {
  const state: FrameReadout = {
    hp: { p1: 0, p2: 0 },
    rage: { p1: 0, p2: 0 },
    comboHits: 0,
    frame: currentFrame,
  };
  let currentComboAttacker: SeatId | null = null;

  for (const e of events) {
    // Events without a clock anchor are always considered "already happened"
    // (match-started, turn-started, etc.). Events with a clock anchor only
    // count if they're at or before currentFrame. We use `continue` rather
    // than `break` so this remains correct even if the input log is not
    // monotonic — it costs one extra iteration per out-of-range event.
    const at = eventFrame(e);
    if (at !== null && at > currentFrame) continue;

    switch (e.kind) {
      case 'match-started': {
        state.hp.p1 = e.setup.seats.p1.hp;
        state.hp.p2 = e.setup.seats.p2.hp;
        state.rage.p1 = e.setup.seats.p1.rage;
        state.rage.p2 = e.setup.seats.p2.rage;
        break;
      }
      case 'damage-applied': {
        state.hp[e.seat] = e.hpAfter;
        break;
      }
      case 'hp-restored': {
        state.hp[e.seat] = e.hpAfter;
        break;
      }
      case 'rage-gained': {
        state.rage[e.seat] = e.rageAfter;
        break;
      }
      case 'cancel-armed': {
        state.rage[e.seat] = Math.max(0, state.rage[e.seat] - e.rageSpent);
        break;
      }
      case 'mutual-ko-draw': {
        state.hp.p1 = e.restoredHp;
        state.hp.p2 = e.restoredHp;
        break;
      }
      case 'combo-started': {
        currentComboAttacker = e.attackerSeat;
        state.comboHits = 0;
        break;
      }
      case 'combo-dropped': {
        currentComboAttacker = null;
        state.comboHits = 0;
        break;
      }
      case 'hit-connected': {
        if (currentComboAttacker === e.attackerSeat) {
          state.comboHits += Math.max(1, e.hits);
        }
        break;
      }
      case 'showdown-paused':
      case 'turn-ended':
      case 'match-ended':
      case 'ko': {
        currentComboAttacker = null;
        state.comboHits = 0;
        break;
      }
      default:
        break;
    }
  }

  return state;
}

/** Extract the global frame associated with an event, or null if not anchored. */
function eventFrame(e: ResolverEvent): number | null {
  // Explicit per-kind dispatch — the type system won't let us read `atGlobalFrame`
  // off the union because some variants don't have it. Hand-maintained list.
  switch (e.kind) {
    case 'cursor-advanced': return e.newGlobalFrame;
    case 'slot-dequeued': return e.atGlobalFrame;
    case 'window-tokens-placed': return e.cardStartGlobalFrame;
    case 'projectile-launched': return e.spawnGlobalFrame;
    case 'projectile-arrived': return e.atGlobalFrame;
    case 'projectile-clashed': return e.atGlobalFrame;
    case 'projectile-reflected': return e.newArrivalGlobalFrame;
    case 'effect-activated': return e.activationGlobalFrame;
    case 'effect-ended': return e.atGlobalFrame;
    case 'effect-interrupted': return e.atGlobalFrame;
    case 'effect-end-scheduled': return e.endGlobalFrame;
    case 'defense-precedence-resolved': return e.atGlobalFrame;
    case 'hit-connected': return e.atGlobalFrame;
    case 'hit-blocked': return e.atGlobalFrame;
    case 'hit-armored': return e.atGlobalFrame;
    case 'hit-evaded': return e.atGlobalFrame;
    case 'hit-parried': return e.atGlobalFrame;
    case 'stun-placed': return e.frames[0];
    case 'knockdown-placed': return e.frames[0];
    case 'block-stun-extended': return e.extensionFrames[0];
    case 'block-stun-pool-exhausted': return e.atGlobalFrame;
    case 'damage-applied': return e.atGlobalFrame;
    case 'hp-restored': return null;
    case 'cancel-fired': return e.atGlobalFrame;
    case 'cancel-whiffed': return e.atGlobalFrame;
    case 'card-truncated-by-cancel': return e.atGlobalFrame;
    case 'card-entered-timeline': return e.atGlobalFrame;
    case 'card-left-timeline': return e.atGlobalFrame;
    case 'item-consumed': return e.atGlobalFrame;
    case 'combo-started': return e.atGlobalFrame;
    case 'combo-dropped': return e.atGlobalFrame;
    case 'ko': return e.atGlobalFrame;
    case 'mutual-ko-draw': return e.atGlobalFrame;
    case 'showdown-started': return e.startGlobalFrame;
    case 'turn-ended': return e.endGlobalFrame;
    // Lifecycle events with no global frame anchor.
    case 'match-started':
    case 'turn-started':
    case 'showdown-paused':
    case 'match-ended':
    case 'rage-gained':
    case 'cancel-armed':
    case 'item-returned-to-inventory':
    case 'card-parked-to-side-area':
    case 'card-released-from-side-area':
    case 'diagnostic':
      return null;
  }
  return null;
}

// Also re-export helper atoms for tests.
export { HIT_STOP_BY_SIZE };
export type { ResolverEvent, WindowTokenKind, WindowPayload };
