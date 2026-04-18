# HVCD -> TabletopLabs Migration Notes (B1 + B2)

This document records what Track B1 (scaffold) moved from HVCD onto this
TabletopLabs project, plus divergences, assumptions, and open items that
B2 (resolver port) will need to resolve.

All line references are to `HeroVersusCardDuel/docs/combat-system.md`
(authoritative spec) unless otherwise noted.

---

## 1. What moved and where it lives now

| From HVCD | Target in this repo |
|---|---|
| `src/lib/heroTypes.ts` (Hero interface) | `scripts/kinds/hero.ts` (kind schema) + `config/blueprints/hero-*.json` (per-hero instance) + `config/objects/heroes/hero-*.json` |
| `src/lib/cardTypes.ts` (Card + FrameWindow + card row shape) | `scripts/kinds/card.ts` (fields mapped to §7 target model, not the legacy model) |
| `src/lib/itemTypes.ts` (Item + ItemKind + ItemTrigger) | `scripts/kinds/item.ts` (extends `hvcd.card`) + `config/blueprints/hvcd-item-blueprint.json` + `config/objects/items/item-*.json` |
| `src/lib/cardCatalog.ts` (DB catalog loader) | No direct migration — the catalog is now expressed as authored `blueprint + object` files under `config/blueprints/` and `config/objects/cards/`. Rows in `cards` SQL seed (migration `20260416120000_card_frame_model.sql`) are mapped 1:1 to object configs. |
| `src/lib/modeConfigs.ts` (GamePhase, ModeConfig) | Not migrated — TabletopLabs session modes (`solo` / `shared` / `per_match` / `persistent` lifecycles) are platform-level concerns, not module-level. See `hvcd-tabletop-contracts/session-api.md`. |
| SQL seed migration `20260416120000_card_frame_model.sql` (shared + elemental card definitions + starter decks) | `config/objects/cards/*.json` for every seeded card; starter deck membership baked into `config/blueprints/hero-*.json` `props.starterDeck` |
| SQL seed migration `20260421000000_seed_heroes.sql` | `config/blueprints/hero-*.json` |
| SQL seed migration `20260417000000_items_and_progression.sql` (items insert) | `config/objects/items/item-*.json` |
| Token kinds (combat-system.md §5) | `scripts/kinds/token.ts` (all 12 kinds + lifecycle + projectile in-flight as the `tokenKind` enum) |
| Match FSM (combat-system.md §2) | `config/state-machine.json` — states `match-setup` / `commit` / `reveal` / `showdown` / `pause-or-end` / `match-end`, transitions per §2 |
| Rage / cancel / variant markers | `scripts/traits/rage-cost.ts`, `scripts/traits/cancel-window.ts`, `scripts/traits/variant-override.ts`, `scripts/traits/frame-cost.ts`, `scripts/traits/owner-only-visible.ts` |
| Glossary terms used in card text | `config/glossary.json` (27 keyword entries covering attack/defense window kinds, payloads, economy, sequence/timeline/inventory) |

Demo template content (Builders/Explorers teams, meeple kind, treasure deck,
supply crate, hex forest tile, etc.) was removed wholesale. `project.json`
now has exactly 2 seats `p1` / `p2` and no `teams` array.

---

## 2. HVCD code lag vs combat-system.md spec (divergences flagged)

`HeroVersusCardDuel/src/lib/cardTypes.ts` (the legacy code model) is *older*
than the target spec in `combat-system.md`. Several fields differ:

### 2a. Legacy card fields that changed

| Legacy field | Spec target | Handling in B1 |
|---|---|---|
| `hitWindow: FrameWindow \| null` | `attackWindows.hit: { frames, damage?, hits?, hitStun?, blockStun?, defenseBreaker?, knockdown? }` | Mapped into the dict key `attackWindows.hit` |
| `blockWindow: FrameWindow \| null` | `defenseWindows.block: { frames }` | Mapped into `defenseWindows.block` |
| `evasionWindow: FrameWindow \| null` | `defenseWindows.evasion: { frames }` | Mapped into `defenseWindows.evasion` |
| `hitType: 'rock' \| 'paper' \| 'scissors'` | No RPS layer in the spec. Attack-window sub-key (`hit` / `grab` / `projectile` / `parry` / `effect`) replaces `hitType`. | Dropped. Every seeded card that had `hitType` just uses `attackWindows.hit`. |
| `homing: boolean` on cards | Dropped from spec (§7 "Migration from the current model" — "homing is dropped; projectile is now intrinsically homing, and homing hit/grab were removed"). | Seeded `Fireball` (the only `homing=true` card with a non-projectile base) is remodeled as an `attackWindows.projectile` with a `travelFrames` (see below). |
| `damage: number` (top-level) | Per-window `damage?: number`. | Mapped to `attackWindows.hit.damage` (or `.projectile.damage` for Fireball). |
| `defense_breaker: boolean` (top-level) | Per-window `defenseBreaker?: boolean` on `hit` / `grab` / `projectile`. | Mapped to `attackWindows.hit.defenseBreaker` on the two seeded breakers (Ignite Strike, Boulder Smash). |
| `rage_cost: number` (top-level) | Rage is spent via `rageVariant.rageCost` (variant play) or `cancelWindow.rageCost` (armed cancel), never on base play (§6 "Base play is always free"). | **Divergence.** Seeded `Rage Surge` and `Thunder Clap` have `rage_cost=1` top-level, which the spec does not support. B1 kept those cards' base shapes intact, set `rageVariant=null`, and dropped the top-level rageCost. See §3 open items. |
| `total_frames` (top-level) | `totalFrames` (same). | 1:1 rename. |

### 2b. Fields missing in legacy that the spec requires

The spec requires these but the legacy `cardTypes.ts` model has no field for them:

- `attackWindows.hit.hits` (multi-hit count; defaults to 1)
- `attackWindows.hit.hitStun` (defaults to window length if omitted)
- `attackWindows.hit.blockStun` (omitted = block-extension is 0)
- `attackWindows.grab` (legacy has no grab concept)
- `attackWindows.parry` (legacy has no parry concept)
- `attackWindows.effect` (legacy has no effect window; item effects are a separate system)
- `attackWindows.projectile.travelFrames` (legacy only has `homing: boolean`)
- `defenseWindows.armor` / `defenseWindows.reflect` (legacy has neither)
- `cancelWindow` (legacy has no cancel system)
- `rageVariant` (legacy has no EX / Super variant system)

B1 authored these as absent/`null` for every migrated legacy card. **B2
authoring will need to back-fill hitStun / hits / cancelWindow / rageVariant
for cards that should have them.** The 18 seeded cards in this repo are a
baseline; full roster authoring is future work.

### 2c. Item model divergence

`itemTypes.ts` uses a legacy `ItemTrigger` enum
(`onRunStart`/`onRoundStart`/`onPlayCard`/`onTakeHit`/`onActivate`). The
combat-system.md §12 model normalizes all items to "resolve on dequeue"
just like cards. B1 authored each seeded item as:

- `props.itemKind` (legacy `passive` / `consumable` preserved informationally)
- `props.trigger` (legacy trigger preserved informationally)
- `props.usages`
- An `attackWindows.effect` window with `effectId` matching the legacy payload key
- `effectPayload` dict carrying the legacy effect values

Reactive triggers (`onTakeHit`, `onRoundStart`, `onPlayCard`) **cannot be
expressed** in the current §12 dequeue-only model. B1 flagged this on each
affected item's `customData.b1-note`. **Open for B2 decision**: either
(a) expand the spec to allow reactive items, or (b) convert every reactive
item to an active consumable (player chooses when to commit it to sequence).

### 2d. Starter hero stat: `base_block`

Legacy `heroes.base_block` is bonus block pool at run start. Terra is the
only hero with a non-zero value (`2`). The spec's block pool model is a
flat 6 per showdown that refills between showdowns (§2 End of turn / §5).
B1 added `props.baseBlock` to `hvcd.hero` and exposes it on Terra as `2`,
with the intention that **Terra's effective pool is 6 + baseBlock = 8**.
B2 needs to confirm whether:
- (a) `baseBlock` is a permanent additive cap (recommended; simpler), or
- (b) Terra's passive item `Stone Bulwark` should grant it dynamically
  each turn via an `effect` window (see `config/objects/items/item-stone-bulwark.json`
  `b1-note`).

If (a), `Stone Bulwark`'s effect is redundant with the hero stat and the
item should be repositioned (maybe into a different passive). If (b),
`baseBlock` on the hero should probably drop back to 0.

---

## 3. Conservative assumptions flagged for re-visit

### OQ-1 (script execution model) — UNRESOLVED

B1 assumed scripts run inside TabletopLabs' existing ScriptEngine sandbox:
CommonJS `exports.X = function(ctx, ...) {...}`, no React, no three.js, no
Web Workers. Every state script, transition script, kind script, and trait
script in this repo fits that sandbox.

If OQ-1 resolves to **Option A (dedicated module host)** or **Option C
(hybrid)**, the resolver port (Track B2) may relocate out of these scripts
into a bundled module entrypoint. The state hooks in `scripts/states/*.ts`
still work as thin bindings that call into the module host.

Every resolver TODO in `scripts/states/showdown.ts` is written to keep that
door open.

### OQ-5 (determinism mode) — UNRESOLVED

B1 assumed **Option A (offline)** — resolver runs once per showdown after
commit. `scripts/states/showdown.ts` `StateUpdate` is a no-op comment
explaining that offline mode runs the whole pass on entry. If OQ-5
resolves to **Option B (deterministic fully-ticked)**, `StateUpdate`
becomes the hot path and the resolver must participate in rollback.

### OQ-18 (owner-only privacy) — UNRESOLVED

B1 implemented `hvcd.ownerOnlyVisible` as a client-only marker trait.
This is insufficient for the combat-system.md §12 inventory bluff rule
(opponent must not see inventory contents ever). A network-level private
channel is needed. Flagged in the trait's header comment.

---

## 4. Things B2 needs before porting the resolver

1. **Source of truth for card data.** The 18 cards authored here are the
   starter set from the SQL seed. If B2 finds the target roster is larger
   (e.g., hero unlock levels add cards), those additional objects need to
   be authored into `config/objects/cards/`. Starter decks in
   `config/blueprints/hero-*.json` reference cardIds that must exist as
   object configs before the draw pile can be built.

2. **Effect registry.** `combat-system.md §11` says "each effect's own
   logic ... lives in an effect registry indexed by effectId." The seeded
   items reference `effectId` values (`bonusDamageFirstHit`,
   `healOnBlockBreak`, `bonusBlockTokens`, `interruptNextOpponentCard`)
   but no registry exists yet. B2 must author `scripts/effects/*.ts` (or
   an equivalent) and a loader convention.

3. **Window -> token expansion.** `scripts/kinds/card.ts` stores windows
   as JSON dicts on `props.attackWindows` / `props.defenseWindows`. The
   resolver (per §5 "Cards as manifests") expands these into per-frame
   tokens at dequeue. B2 owns that expansion.

4. **SequenceSlot data model.** No kind exists for sequence slots
   themselves. The combat spec §15 defines three slot kinds
   (`card`/`block-spacer`/`item`). B2 should decide whether to represent
   these as an ECS sub-entity per slot or as an array stored on the seat's
   `customData`. The `hvcd-tabletop-contracts/game-module-manifest.md`
   declarations list includes `hvcd.sequenceSlot` — consider adding a
   `scripts/kinds/sequence-slot.ts` in B2 if the former is chosen.

5. **Block pool state.** Not represented as an entity today; lives
   logically in seat `customData` (e.g., `customData.hvcd.blockPool:
   number`). B2 to formalize.

6. **Rage economy state.** Same as block pool — per-seat `customData`.

7. **HP state.** Same — on the hero entity's `customData`.

8. **Hand / deck / discard state.** Probably modeled with the existing
   `deck` built-in kind (TabletopLabs' deck has `searchable`,
   `shufflable`, `contents`). But the hand is hidden-per-seat which may
   require the `hand` built-in kind (which is a hidden system kind per
   `game-config-loading.md`). B2 to decide if `hand` is usable or if a
   custom `hvcd.hand` is needed.

9. **Side-area (parked cards).** Combat-system.md §2 / §9 / §11. Cards
   parked as projectile source or standing-effect source need a distinct
   zone. Not modeled yet; B2 to author.

10. **Timeline representation.** Not an entity in this repo; will be a
    renderer slot per `hvcd-tabletop-contracts/renderer-slots.md`. The
    match state that drives it (token list, in-flight projectiles, seat
    cursors) lives in the resolver's state output and on the shared
    event stream.

---

## 5. Assets not provided

- Hero portraits / full-body art — `props.portraitPath` / `props.fullbodyPath`
  are `null` on every hero. B1 did not copy art from HVCD
  (`assets/` is empty save for the template `.gitkeep` + empty
  `models/` / `textures/` dirs). B2 (or an assets pass) will need to
  populate `assets/` with hero portraits, card art, item art, and any
  tokens/VFX referenced by the renderer.

- Card art — `props.artPath` is `null` on every card object.

- Fighter clip manifests (HVCD's Remotion monitor expects these per the
  `game-module-manifest.md` description). Not in scope for B1.

---

## 6. Files intentionally not touched

- `hvcd-tabletop-contracts/` — frozen for this wave per user instructions.
- `HeroVersusCardDuel/` — read-only.
- `TabletopLabs/` — read-only reference.
- No `module-manifest.json` in this repo — that file is specced in
  `hvcd-tabletop-contracts/game-module-manifest.md` but cannot be written
  until OQ-1 through OQ-8 resolve. Stub deferred.
- No `snapshot/*.json` — snapshot export is an editor workflow, not a B1
  scaffolding concern. `config/snapshot/.gitkeep` preserved.
- `config/entities.json` is now `{"entities": []}` — the match-setup
  state script is expected to spawn from authored content on entry rather
  than bake entities into the initial scene. If the TabletopLabs loader
  requires at least the hero entities pre-spawned, this can change in B2.

---

## 7. B2 resolver port (2026-04-18)

This wave ports `HeroVersusCardDuel/src/lib/showdown/resolve.ts` across
**per-object board scripts** (not a monolithic resolver) per user guidance
and the `game-module-manifest.md` B2 module-structure clarification.

### 7.1. Layout

```
scripts/
├── resolver/               # pure-function core shared by all per-object scripts
│   ├── types.ts            # SeatState / MatchState / Card / Token / ResolverEvent
│   ├── tokens.ts           # placement + conflict rules (§5)
│   ├── cards.ts            # window -> token expansion (§3, §5 "Cards as manifests")
│   ├── economy.ts          # HP / rage / block pool mutators (§6, §2)
│   ├── sequence.ts         # dequeue logic (§2 Dequeue rule)
│   ├── combat.ts           # attack vs defense resolution (§4, §5 step 5, §8)
│   ├── projectiles.ts      # launch / clash / arrival (§9)
│   └── world.ts            # runShowdown() — the frame loop (§5 steps 1-10)
│
├── objects/                # per-object ECS bindings (kind defs + hooks)
│   ├── timeline.ts         # cursor sweep, token precedence, cancels, KO check, combo mode
│   ├── sequence.ts         # dequeue + commit validation + carryover (one per seat)
│   ├── counterTray.ts      # HP / rage / pool mutation (one per seat)
│   ├── sideArea.ts         # parked projectile / standing-effect source cards (one per seat)
│   └── projectile.ts       # in-flight projectile entity kind (match-scoped)
│
├── effects/
│   └── registry.ts         # piecemeal effect registry — damageUp / heal / refillPool reference impls
│
├── kinds/
│   ├── card.ts             # (extended) — onSpawn registers into world.globalState.hvcdCardRegistry
│   ├── token.ts            # (extended) — re-exports per-kind interaction entry points
│   ├── hero.ts             # unchanged
│   └── item.ts             # (modified) — trigger field removed per OQ-35
│
└── states/
    ├── commit.ts           # (stub — B2 did not touch; commit-phase input routing is future work)
    ├── reveal.ts           # (stub)
    ├── showdown.ts         # (fully wired) — gathers ECS state, calls timeline.runShowdown(), writes back
    ├── pause-or-end.ts     # (fully wired) — KO check + between-showdown pool refill
    ├── match-setup.ts      # (stub)
    └── match-end.ts        # (stub)
```

### 7.2. State storage decisions (answering prereqs 4, 5, 6, 7, 8, 9)

| Prereq | Answer |
|---|---|
| 4. SequenceSlot data model | Array on `scripts/objects/sequence.ts` entity's `customData.slots`. No per-slot ECS sub-entity; slots are opaque to the opponent via the hidden/owner-only state-sync layer. |
| 5. Block pool state | Scalar on `scripts/objects/counterTray.ts` entity's `props.blockPool` (one tray entity per seat). |
| 6. Rage economy state | Scalar on counterTray `props.rage`. |
| 7. HP state | Scalar on counterTray `props.hp`. (Moved off the hero entity so all per-seat mutable state lives on one object.) |
| 8. Hand / deck / discard | Built-in TTL `hand(hidden)` kind used directly for the hand, per the 2026-04-18 manifest guidance. Deck / discard use built-in `deck`. Not wired through the resolver — the resolver reads committed sequences only; hand refill is in `pause-or-end.ts`. |
| 9. Side-area | `scripts/objects/sideArea.ts` — one entity per seat, `customData.parked` array of `{ cardId, reason, tether }`. Tether is the projectileId or effect-end token id. |
| 10. Timeline representation | `scripts/objects/timeline.ts` — one match-scoped entity with `customData.{ tokens, projectiles, activeEffects, currentFrame, turnIndex }`. |

### 7.3. What got cut vs the legacy HVCD resolver

- **RPS hitType** (rock/paper/scissors) — dropped per §7 migration note. HVCD's resolver branched on `rpsWinner(a,b)`; the spec treats simultaneous same-kind hits as §5 "hit trade" (both take damage, cards discarded, no combo). Test `same-frame hit on both sides: mutual trade` exercises this.
- **`homing: boolean`** — dropped; projectile is intrinsically homing (§7), and homing-hit/grab were removed.
- **Top-level `rageCost` on cards** — dropped. Rage spending is now only via `rageVariant.rageCost` (§6) or armed cancels (`cancelWindow.rageCost`). Legacy fixture `rageFinisher` and the rage-cost test were dropped because the model has no way to express top-level rage cost.

### 7.4. ResolverEvent emission

Every significant frame-loop step emits a `ResolverEvent` matching the
`hvcd-tabletop-contracts/event-log-schema.md` discriminated union. See
§§8.1 + 8.2 in `b2-agent-report.md` for the full list of emitted kinds and
per-kind payloads.

### 7.5. OQ-35 — reactive items dropped

Per the 2026-04-18 resolution, reactive item triggers are removed. Affected:

| Item | Was | Now |
|---|---|---|
| `config/objects/items/item-stone-bulwark.json` | `trigger: onRoundStart` | no trigger; Terra's `baseBlock: 2` covers the +2 pool statically |
| `config/objects/items/item-tide-flask.json` | `trigger: onTakeHit`, uses 3 | no trigger; plain active consumable that heals on dequeue |
| `config/objects/items/item-ember-core.json` | `trigger: onPlayCard` | no trigger; instant damage-up effect on dequeue |
| `config/objects/items/item-arc-taser.json` | `trigger: onActivate` (already dequeue-compatible) | no trigger; unchanged semantics |
| `config/blueprints/hvcd-item-blueprint.json` | `trigger: onActivate` default | field removed |
| `scripts/kinds/item.ts` | `props.trigger` field definition + default | field removed; comment added citing OQ-35 |

Each affected object-config has a `customData.b2-note` describing the
resolution choice.

### 7.6. Effect registry

Created `scripts/effects/registry.ts` with a pluggable registration API
(`registerEffect`, `getEffect`, `applyDamageModifiers`) and three reference
implementations: `damageUp` (per-frame damage modifier per §11 example),
`heal` (instant HP restore), `refillPool` (instant pool top-up). Additional
effect authors call `registerEffect(id, impl)` from their own file; the
resolver looks up effects lazily on activation. Unknown effectIds emit a
`diagnostic` event and no-op (the activation window still plays on the
timeline).

### 7.7. Tests

- `tests/fixtures.ts` + `tests/resolve.test.ts` — port of
  `HeroVersusCardDuel/src/lib/showdown/__tests__/*.ts` onto the §7 card
  model. 9 tests, all passing.
- `tests/advanced.test.ts` — new tests for features unique to this port
  (projectile, effect, cancel, knockdown, parry, armor). 6 tests, all
  passing.
- Run with `node --experimental-strip-types --no-warnings tests/run.ts`
  (requires Node 22+).

### 7.8. Outstanding B2 items

- Hand / deck draw logic for between-showdown refills is not implemented
  in `pause-or-end.ts`. The block-pool refill is; the hand top-up and
  free-mulligan step (§2 End of turn) need wiring once the built-in
  `hand(hidden)` kind's draw API is available.
- Commit-phase input handlers in `commit.ts` are still the B1 stub — they
  need `slot_add / slot_discard / slot_reorder / mulligan / commit_ready`
  implementations. B2's scope was the showdown resolver; commit-phase UX
  was left for a later pass.
- The `reveal.ts` state is a stub — it should emit the `reveal-beat` event
  with per-seat slot counts and frame costs per §2. One-liner to add
  once the sequence state is read accessibly.
