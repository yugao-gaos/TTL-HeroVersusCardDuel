/**
 * HVCD resolver — shared types
 *
 * Port of HeroVersusCardDuel/src/lib/showdown/types.ts plus extensions to
 * cover combat-system.md §§3-13 where the current HVCD resolver lags the
 * spec (windows-as-dicts instead of flat hit/block/evasion fields,
 * §7 card model, §5 token flat set of 12 kinds, §9 projectiles,
 * §11 effects, §12 items, §13 cancels).
 *
 * These types are consumed by:
 *   - scripts/resolver/world.ts (the showdown driver)
 *   - scripts/objects/*.ts (per-object board scripts)
 *   - scripts/kinds/card.ts (window -> token expansion)
 *   - scripts/effects/*.ts (effect registry entries)
 *   - tests/*.ts
 *
 * Plain data only — no ECS references. The per-object scripts handle all
 * ECS read/write; the world object is the pure-function core.
 */

// --- Atoms -----------------------------------------------------------------

export type SeatId = 'p1' | 'p2';
export type SeatIndex = 0 | 1;

export function seatIdOf(i: SeatIndex): SeatId {
  return i === 0 ? 'p1' : 'p2';
}
export function seatIndexOf(id: SeatId): SeatIndex {
  return id === 'p1' ? 0 : 1;
}
export function otherSeat(i: SeatIndex): SeatIndex {
  return (1 - i) as SeatIndex;
}

/** Card-local inclusive frame range. */
export type FrameRange = [start: number, end: number];

// --- Card model (combat-system.md §7) --------------------------------------

export interface HitWindow {
  frames: FrameRange;
  damage?: number;
  hits?: number;
  hitStun?: number;
  blockStun?: number;
  defenseBreaker?: boolean;
  knockdown?: boolean;
}
export interface GrabWindow {
  frames: FrameRange;
  damage?: number;
  hits?: number;
  hitStun?: number;
  defenseBreaker?: boolean;
}
export interface ProjectileWindow {
  frames: FrameRange;
  damage?: number;
  hits?: number;
  hitStun?: number;
  travelFrames: number;
  defenseBreaker?: boolean;
  knockdown?: boolean;
}
export interface ParryWindow {
  frames: FrameRange;
  damage?: number;
  hits?: number;
  hitStun?: number;
  blockStun?: number;
  knockdown?: boolean;
}
export interface EffectWindow {
  frames: FrameRange;
  effectId: string;
  target?: 'self' | 'opponent';
  duration?: number;
}

export interface AttackWindows {
  hit?: HitWindow | null;
  grab?: GrabWindow | null;
  projectile?: ProjectileWindow | null;
  parry?: ParryWindow | null;
  effect?: EffectWindow | null;
}

export interface BlockDefense {
  frames: FrameRange;
}
export interface ArmorDefense {
  frames: FrameRange;
  absorbs?: number;
}
export interface EvasionDefense {
  frames: FrameRange;
}
export interface ReflectDefense {
  frames: FrameRange;
  reflectTravel: number;
}

export interface DefenseWindows {
  block?: BlockDefense | null;
  armor?: ArmorDefense | null;
  evasion?: EvasionDefense | null;
  reflect?: ReflectDefense | null;
}

export interface CancelWindow {
  frame: number;
  hitCancel: boolean;
  rageCost?: number;
}

export interface RageVariant {
  required?: boolean;
  rageCost: number;
  totalFrames?: number;
  attackWindows?: AttackWindows;
  defenseWindows?: DefenseWindows;
  cancelWindow?: CancelWindow | null;
}

export interface Card {
  id: string;
  name: string;
  totalFrames: number;
  attackWindows?: AttackWindows | null;
  defenseWindows?: DefenseWindows | null;
  cancelWindow?: CancelWindow | null;
  rageVariant?: RageVariant | null;
  /** Item-specific (see combat-system.md §12). */
  isItem?: boolean;
  itemUsages?: number | null;
}

// --- Sequence slots (combat-system.md §15) ---------------------------------

export type SequenceSlot =
  | {
      kind: 'card';
      cardId: string;
      mode: 'base' | 'variant';
      rageCancelArmed: boolean;
    }
  | {
      kind: 'block-spacer';
      tokens: number;
    }
  | {
      kind: 'item';
      itemId: string;
      mode: 'base' | 'variant';
      rageCancelArmed: boolean;
    };

// --- Timeline tokens (combat-system.md §5) --------------------------------

export type WindowTokenKind =
  | 'hit'
  | 'grab'
  | 'projectile'
  | 'parry'
  | 'effect'
  | 'block'
  | 'armor'
  | 'evasion'
  | 'reflect'
  | 'cancel';
export type StatusTokenKind = 'stun' | 'knockdown' | 'effect-end';
export type TokenKind = WindowTokenKind | StatusTokenKind;

/**
 * A single token on the shared timeline.
 *
 * Per OQ-32 (combat-system.md §5 "Per-kind token consumption"): consumption
 * is per-kind, not uniform per-frame. The on-the-wire model accordingly mixes
 * single-frame tokens (per-frame kinds) and multi-frame windows-as-one-token.
 *
 *   - Multi-frame, fires-once kinds (`hit`, `grab`, `projectile`, `parry`,
 *     `evasion`, `reflect`, `effect`) are **one logical token** spanning
 *     `frame .. frameEnd` inclusive. They occupy every frame in that range
 *     for activeness checks but are consumed once. The per-frame chip
 *     visualization in the UI is purely a rendering choice.
 *   - Per-frame kinds (`block`, `armor`, `stun`, `knockdown`) place one
 *     token per frame (each absorbs / suppresses independently).
 *   - Single-frame kinds (`cancel`, `effect-end`) place one token at one
 *     frame (`frame === frameEnd`).
 *
 * `frame` is the first global frame the token is active. `frameEnd` is the
 * inclusive last frame. For single-frame tokens omit `frameEnd` (defaults
 * to `frame`).
 *
 * `payload` is freeform per-kind. Fields used by the resolver:
 *   hit / grab / projectile / parry: damage, hits, hitStun, blockStun,
 *     knockdown, defenseBreaker, travelFrames (projectile only)
 *   effect: effectId, target, duration
 *   block: fromPool
 *   armor: absorbs
 *   reflect: reflectTravel
 *   cancel: hitCancel, armed, rageCost
 *   effect-end: effectId
 */
export interface TimelineToken {
  kind: TokenKind;
  seat: SeatId;
  /** First global frame the token is active (inclusive). */
  frame: number;
  /**
   * Last global frame the token is active (inclusive). Defaults to `frame`
   * when omitted (single-frame token). Only meaningful for the multi-frame
   * window kinds (hit/grab/projectile/parry/evasion/reflect/effect).
   */
  frameEnd?: number;
  cardId?: string;
  payload?: Record<string, unknown>;
}

/** True if a token is active at the given global frame (inclusive range). */
export function tokenCoversFrame(t: TimelineToken, frame: number): boolean {
  return frame >= t.frame && frame <= (t.frameEnd ?? t.frame);
}

/** Last global frame this token is active (inclusive). */
export function tokenLastFrame(t: TimelineToken): number {
  return t.frameEnd ?? t.frame;
}

/**
 * Per-kind classification used by the resolver to decide placement granularity.
 * Per OQ-32 / combat-system.md §5.
 */
export const PER_FRAME_KINDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  'block',
  'armor',
  'stun',
  'knockdown',
]);

/** Multi-frame, fires-once-per-window kinds (single logical token). */
export const WINDOW_RANGE_KINDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  'hit',
  'grab',
  'projectile',
  'parry',
  'evasion',
  'reflect',
  'effect',
]);

/**
 * In-flight projectile — match-scoped, not seat-scoped.
 */
export interface ProjectileEntity {
  id: string;
  owner: SeatId;
  sourceCardId: string;
  spawnFrame: number;
  arrivalFrame: number;
  damage: number;
  hits: number;
  hitStun: number;
  defenseBreaker: boolean;
  knockdown: boolean;
}

// --- Seat state ------------------------------------------------------------

export interface ActiveCard {
  cardId: string;
  card: Card;
  startFrame: number;
  mode: 'base' | 'variant';
  rageCancelArmed: boolean;
  connectedDamage: boolean; // whether this card has connected at least one hit (for hitCancel)
}

export interface ActiveEffect {
  id: string; // unique — `${effectId}:${casterSeat}:${activationFrame}`
  effectId: string;
  casterSeat: SeatId;
  targetSeat: SeatId;
  activationFrame: number;
  endFrame: number | null; // null for instant (never actually stored here)
  payload: Record<string, unknown>;
}

export interface SeatState {
  id: SeatId;
  index: SeatIndex;
  heroId: string;
  hp: number;
  rage: number;
  blockPool: number;
  sequence: SequenceSlot[];
  activeCard: ActiveCard | null;
  cursor: number;
  discard: string[]; // cardIds sent to discard
  sideArea: { cardId: string; reason: 'projectile' | 'standing-effect'; tether: string }[];
  inventory: Array<{ itemId: string; usages: number | null }>;
  reservedItems: string[]; // itemIds held in sequence slots
}

export interface MatchState {
  seats: [SeatState, SeatState];
  projectiles: ProjectileEntity[];
  effects: ActiveEffect[];
  /** (seat, reflectCardId, frame) triples — reflect fires at most once per frame. */
  reflectFiredThisFrame: Set<string>;
  /** (seat, parryCardId, frame) triples — parry fires at most once per frame. */
  parryFiredThisFrame: Set<string>;
  /** All tokens ever placed; pruned by some resolver steps. Keyed by array index. */
  tokens: TimelineToken[];
  frame: number; // current global frame
  turnIndex: number;
  /** Monotone projectile id generator. */
  nextProjectileId: number;
  /** Monotone effect activation id generator. */
  nextEffectId: number;
}

// --- ResolverEvent — matches hvcd-tabletop-contracts/event-log-schema.md ----

export type WindowPayload =
  | { kind: 'hit'; damage?: number; hits?: number; hitStun?: number; blockStun?: number; knockdown?: boolean; defenseBreaker?: boolean }
  | { kind: 'grab'; damage?: number; hits?: number; hitStun?: number; defenseBreaker?: boolean }
  | { kind: 'projectile'; damage?: number; hits?: number; hitStun?: number; travelFrames: number; knockdown?: boolean; defenseBreaker?: boolean }
  | { kind: 'parry'; damage?: number; hits?: number; hitStun?: number; blockStun?: number }
  | { kind: 'effect'; effectId: string; target: 'self' | 'opponent'; duration?: number }
  | { kind: 'block'; fromPool: boolean }
  | { kind: 'armor'; absorbs?: number }
  | { kind: 'evasion' }
  | { kind: 'reflect'; reflectTravel: number }
  | { kind: 'cancel'; hitCancel: boolean; armed: boolean };

export type ResolverEvent =
  // Lifecycle
  | { kind: 'match-started'; setup: { seats: Record<SeatId, { heroId: string; hp: number; rage: number; blockPool: number; inventory: Array<{ itemId: string; usages: number | null }> }>; rngSeed: number } }
  | { kind: 'turn-started'; turnIndex: number }
  | { kind: 'showdown-started'; turnIndex: number; startGlobalFrame: number; startTurnFrame: number }
  | { kind: 'showdown-paused'; turnIndex: number; reason: 'combo-drop' | 'sequence-exhaustion' | 'both-exhausted' | 'admin-halt'; seat?: SeatId }
  | { kind: 'turn-ended'; turnIndex: number; endGlobalFrame: number }
  | { kind: 'match-ended'; outcome: 'p1' | 'p2' | 'draw' | 'abort'; abortReason?: string }

  // Showdown frame-loop
  | { kind: 'cursor-advanced'; newGlobalFrame: number; skipped: number }
  | { kind: 'slot-dequeued'; seat: SeatId; atGlobalFrame: number; slot: SequenceSlot; resolvedCard?: { id: string; name: string; totalFrames: number } }
  | { kind: 'window-tokens-placed'; seat: SeatId; cardStartGlobalFrame: number; cardId: string; windowKind: WindowTokenKind; frames: FrameRange; payload: WindowPayload }
  | { kind: 'projectile-launched'; ownerSeat: SeatId; cardId: string; spawnGlobalFrame: number; arrivalGlobalFrame: number; travelFrames: number; hits: number; damage: number; defenseBreaker: boolean; knockdown: boolean; projectileId: string }
  | { kind: 'projectile-arrived'; projectileId: string; ownerSeat: SeatId; targetSeat: SeatId; atGlobalFrame: number; resolution: 'landed' | 'blocked' | 'armored' | 'reflected' | 'evaded' | 'whiff-invincible' }
  | { kind: 'projectile-clashed'; atGlobalFrame: number; aProjectileId: string; bProjectileId: string; hitsCancelled: number; aRemainingHits: number; bRemainingHits: number }
  | { kind: 'projectile-reflected'; projectileId: string; newOwnerSeat: SeatId; newArrivalGlobalFrame: number }
  | { kind: 'effect-activated'; casterSeat: SeatId; targetSeat: SeatId; effectId: string; activationGlobalFrame: number; duration?: number; endGlobalFrame?: number }
  | { kind: 'effect-end-scheduled'; effectId: string; targetSeat: SeatId; endGlobalFrame: number }
  | { kind: 'effect-ended'; effectId: string; targetSeat: SeatId; atGlobalFrame: number }
  | { kind: 'effect-interrupted'; casterSeat: SeatId; effectId: string; atGlobalFrame: number; byCause: 'hit' | 'stun' | 'knockdown' }
  | { kind: 'defense-precedence-resolved'; atGlobalFrame: number; defenderSeat: SeatId; resolvedAs: 'parry' | 'evasion' | 'block' | 'reflect' | 'armor' | 'none'; attackWindowKind: 'hit' | 'grab' | 'projectile'; attackCardId: string; attackerSeat: SeatId }
  | { kind: 'hit-connected'; attackerSeat: SeatId; defenderSeat: SeatId; attackKind: 'hit' | 'grab' | 'projectile'; cardId: string; atGlobalFrame: number; damage: number; hits: number; hitStunFrames: number; comboExtend: boolean }
  | { kind: 'hit-blocked'; attackerSeat: SeatId; defenderSeat: SeatId; attackKind: 'hit' | 'projectile'; cardId: string; atGlobalFrame: number; hitsAbsorbed: number; hitsFallingThrough: number }
  | { kind: 'hit-armored'; attackerSeat: SeatId; defenderSeat: SeatId; attackKind: 'hit' | 'projectile'; cardId: string; atGlobalFrame: number; damage: number; armorAbsorbsRemaining: number; armorBroken: boolean }
  | { kind: 'hit-evaded'; attackerSeat: SeatId; defenderSeat: SeatId; attackKind: 'hit' | 'grab'; cardId: string; atGlobalFrame: number }
  | { kind: 'hit-parried'; parrierSeat: SeatId; attackerSeat: SeatId; cardId: string; againstCardId: string; atGlobalFrame: number; counterDamage: number; counterHits: number; counterHitStun: number; counterKnockdown: boolean }
  | { kind: 'stun-placed'; seat: SeatId; frames: FrameRange; source: 'hit' | 'parry' | 'block-stun-overflow' }
  | { kind: 'knockdown-placed'; seat: SeatId; frames: FrameRange }
  | { kind: 'block-stun-extended'; seat: SeatId; extensionFrames: FrameRange; tokensPlaced: number }
  | { kind: 'block-stun-pool-exhausted'; seat: SeatId; atGlobalFrame: number }
  | { kind: 'damage-applied'; seat: SeatId; amount: number; hpBefore: number; hpAfter: number; attackerSeat: SeatId; attackKind: 'hit' | 'grab' | 'projectile' | 'parry'; cardId: string; atGlobalFrame: number }
  | { kind: 'rage-gained'; seat: SeatId; amount: number; rageAfter: number; reason: 'damage-taken' | 'effect-grant' }
  | { kind: 'hp-restored'; seat: SeatId; amount: number; hpAfter: number; reason: 'effect-heal' | 'mutual-ko-restore' }

  // Cancels
  | { kind: 'cancel-armed'; seat: SeatId; slotIndex: number; cardId: string; rageSpent: number }
  | { kind: 'cancel-fired'; seat: SeatId; cardId: string; atGlobalFrame: number; reason: 'armed' | 'hit-cancel' }
  | { kind: 'cancel-whiffed'; seat: SeatId; cardId: string; atGlobalFrame: number; reason: 'not-armed-no-hit-connect' | 'hit-cancel-not-connected' }
  | { kind: 'card-truncated-by-cancel'; seat: SeatId; cardId: string; atGlobalFrame: number; framesRemaining: number }

  // Card / item disposition
  | { kind: 'card-entered-timeline'; seat: SeatId; cardId: string; atGlobalFrame: number; totalFrames: number; slotKind: 'card' | 'item' }
  | { kind: 'card-left-timeline'; seat: SeatId; cardId: string; atGlobalFrame: number; disposition: 'to-discard' | 'to-side-area-projectile' | 'to-side-area-standing-effect' | 'to-inventory-retained' | 'to-inventory-consumed' }
  | { kind: 'item-returned-to-inventory'; seat: SeatId; itemId: string; usagesRemaining: number; reason: 'resolution' | 'sequence-discard' }
  | { kind: 'item-consumed'; seat: SeatId; itemId: string; atGlobalFrame: number }
  | { kind: 'card-parked-to-side-area'; seat: SeatId; cardId: string; reason: 'projectile' | 'standing-effect'; tetherTargetId: string }
  | { kind: 'card-released-from-side-area'; seat: SeatId; cardId: string; destination: 'discard' | 'inventory-retained' | 'inventory-consumed' }

  // Combo
  | { kind: 'combo-started'; attackerSeat: SeatId; defenderSeat: SeatId; atGlobalFrame: number }
  | { kind: 'combo-dropped'; attackerSeat: SeatId; atGlobalFrame: number; reason: 'no-token-overlap' | 'attacker-out-of-cards' | 'card-fizzled' }

  // End
  | { kind: 'ko'; losingSeat: SeatId; atGlobalFrame: number }
  | { kind: 'mutual-ko-draw'; atGlobalFrame: number; restoredHp: 1 }
  | { kind: 'diagnostic'; level: 'debug' | 'info' | 'warn' | 'error'; message: string; data?: Record<string, unknown> };

/** Result of one run of the showdown pure function. */
export interface ShowdownRunResult {
  events: ResolverEvent[];
  finalState: MatchState;
  endReason: 'ko' | 'mutual-ko' | 'combo-drop' | 'sequence-exhaustion' | 'both-exhausted' | 'no-engagement' | 'safety';
  attacker: SeatId | null;
  durationFrames: number;
  ko: SeatId | null;
  draw: boolean;
}
