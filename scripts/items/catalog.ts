/**
 * HVCD items catalog — Wave 4 / B8.
 *
 * Per memory/game_design_direction.md: hero identity is differentiated through
 * **items**, not hero passives. Each hero starts with one hero-locked starter
 * item; further items are acquired during a roguelike run from a shared global
 * pool.
 *
 * # Relationship to OQ-35 (open-questions.md)
 *
 * OQ-35 resolved the **resolver-frame-loop** layer of items: every item that
 * commits to a sequence slot resolves on dequeue, identical to a card. There
 * is no "reactive item" inside the per-frame combat resolver. That resolution
 * still holds — see scripts/kinds/item.ts and resolver/world.ts.
 *
 * The **state-machine lifecycle** layer (this catalog + scripts/items/triggers.ts)
 * is a *separate* surface that lives at HVCD state-script boundaries:
 * `match-setup`, `commit`'s round-start tick, `pause-or-end`'s post-damage
 * settle, etc. Triggers fire at deterministic state transitions, not in the
 * resolver-frame loop, so:
 *   - Replay determinism is preserved (state transitions are byte-stable).
 *   - The resolver's flat dispatch path is untouched.
 *   - Items that need richer "passive" feel (Iron Shield grants block, Lucky
 *     Coin biases rolls, etc.) get a home without complicating the §12 commit
 *     model.
 *
 * # Privacy (renderer-slots.md OQ-18)
 *
 * `chargesRemaining` and any per-run usage counter live in the per-session
 * **private KV** namespace (`__hidden`), not in public ECS state. That keeps
 * opponents from inferring the player's remaining charges by watching state
 * snapshots. Public emissions (e.g. an item firing a heal) still flow through
 * the resolver event log so spectators / opponent UI can see *that* something
 * happened — just not the residual charge count.
 *
 * # Default catalog (10 items)
 *
 * 3 hero-locked starters (Blaze / Volt / Aqua) + 7 generic global items. No
 * rarity-gated drop tables (memory: rarity tiers REJECTED — flat unlock cadence).
 * The `rarity` field is retained on the schema only as a label modifiers may
 * read; it does **not** drive any RNG.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemKind = 'passive' | 'consumable';

export type ItemTrigger =
  | 'onRoundStart'   // fires when a new commit phase opens
  | 'onTakeHit'      // fires after damage applies to the owning seat
  | 'onPlayCard'     // fires when the owning seat dequeues a hit/grab card
  | 'onActivate'     // fires when the player explicitly activates a consumable
  | 'onRunStart';    // fires once at the start of a run (granted-state init)

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/**
 * Discriminated effect-op union. Each op describes a state mutation the
 * trigger engine applies. New ops are added as design grows; the engine
 * emits a diagnostic and no-ops on unknown ops so a stale catalog does not
 * crash a live match.
 */
export type ItemEffect =
  | { op: 'add-burn'; target: 'opponent' | 'self'; tokens: number }
  | { op: 'apply-stun'; target: 'opponent' | 'self'; frames: number }
  | { op: 'heal'; target: 'self'; amount: number }
  | { op: 'grant-rage'; target: 'self'; amount: number }
  | { op: 'add-block-pool'; target: 'self'; amount: number }
  | { op: 'reflect-damage-chance'; target: 'attacker'; chancePercent: number; amount: number }
  | { op: 'first-card-rage-discount'; amount: number }
  | { op: 'survive-restore-hp'; amount: number }
  | { op: 'roll-bias'; amount: number };

export interface UnlockRequirement {
  heroId?: string;
  level?: number;
}

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** null for passives (always-on). Integer charges for consumables. */
  charges: number | null;
  trigger: ItemTrigger;
  effect: ItemEffect;
  rarity: ItemRarity;
  /** If `heroId` is set, item is hero-locked; if `level` is set, level-gated. */
  unlockRequirement?: UnlockRequirement;
  /** Free-form description — used by inspector UI; not load-bearing. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Default catalog
// ---------------------------------------------------------------------------

export const ITEMS: ReadonlyArray<Item> = [
  // --- Hero-locked starters ----------------------------------------------
  {
    id: 'ignite',
    name: 'Ignite',
    kind: 'passive',
    charges: null,
    trigger: 'onPlayCard',
    effect: { op: 'add-burn', target: 'opponent', tokens: 1 },
    rarity: 'common',
    unlockRequirement: { heroId: 'blaze' },
    description: "Blaze's signature: each hit-card placed adds a burn token to the opponent.",
  },
  {
    id: 'taser',
    name: 'Taser',
    kind: 'consumable',
    charges: 2,
    trigger: 'onActivate',
    effect: { op: 'apply-stun', target: 'opponent', frames: 1 },
    rarity: 'common',
    unlockRequirement: { heroId: 'volt' },
    description: "Volt's signature: 2-charge consumable; 1-frame stun on opponent.",
  },
  {
    id: 'flask',
    name: 'Flask',
    kind: 'consumable',
    charges: 3,
    trigger: 'onActivate',
    effect: { op: 'heal', target: 'self', amount: 4 },
    rarity: 'common',
    unlockRequirement: { heroId: 'aqua' },
    description: "Aqua's signature: 3-charge consumable; restores 4 HP on use.",
  },

  // --- Generic global items ----------------------------------------------
  {
    id: 'focus-flask',
    name: 'Focus Flask',
    kind: 'consumable',
    charges: 2,
    trigger: 'onRoundStart',
    effect: { op: 'grant-rage', target: 'self', amount: 2 },
    rarity: 'common',
    description: 'At the start of a round, gain 2 rage. 2 charges per run.',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    kind: 'passive',
    charges: null,
    trigger: 'onTakeHit',
    effect: { op: 'reflect-damage-chance', target: 'attacker', chancePercent: 25, amount: 2 },
    rarity: 'uncommon',
    description: 'When taking a hit, 25% chance to reflect 2 damage to the attacker.',
  },
  {
    id: 'bandage',
    name: 'Bandage',
    kind: 'consumable',
    charges: 1,
    trigger: 'onActivate',
    effect: { op: 'heal', target: 'self', amount: 6 },
    rarity: 'common',
    description: 'One-shot consumable; restores 6 HP.',
  },
  {
    id: 'iron-shield',
    name: 'Iron Shield',
    kind: 'passive',
    charges: null,
    trigger: 'onRoundStart',
    effect: { op: 'add-block-pool', target: 'self', amount: 2 },
    rarity: 'uncommon',
    description: 'At the start of every round, add 2 to your block pool.',
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    kind: 'passive',
    charges: null,
    trigger: 'onRunStart',
    effect: { op: 'roll-bias', amount: 1 },
    rarity: 'rare',
    description: 'Run-start passive: +1 to all rolls (placeholder semantics; refines later).',
  },
  {
    id: 'swift-boots',
    name: 'Swift Boots',
    kind: 'passive',
    charges: null,
    trigger: 'onPlayCard',
    effect: { op: 'first-card-rage-discount', amount: 1 },
    rarity: 'uncommon',
    description: 'First card you play each round costs 1 less rage.',
  },
  {
    id: 'vampiric-edge',
    name: 'Vampiric Edge',
    kind: 'passive',
    charges: null,
    trigger: 'onTakeHit',
    effect: { op: 'survive-restore-hp', amount: 1 },
    rarity: 'rare',
    description: 'When you take damage and survive, restore 1 HP.',
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const BY_ID: ReadonlyMap<string, Item> = new Map(ITEMS.map((it) => [it.id, it]));

export function getItem(id: string): Item | undefined {
  return BY_ID.get(id);
}

export function listItems(): ReadonlyArray<Item> {
  return ITEMS;
}

/**
 * Resolve a hero slug to its starter item id, if any. Mirrors the per-hero
 * starterInventory wiring in config/blueprints/hero-*.json (one item per hero).
 */
export function getHeroStarterItem(heroSlug: string): Item | undefined {
  for (const it of ITEMS) {
    if (it.unlockRequirement?.heroId === heroSlug) return it;
  }
  return undefined;
}
