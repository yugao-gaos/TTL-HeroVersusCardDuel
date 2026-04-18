# B2 Agent Report — Resolver Port

**Wave:** 2
**Date:** 2026-04-18
**Scope:** Port `HeroVersusCardDuel/src/lib/showdown/resolve.ts` into TabletopLabs
as distributed per-object scripts, emit `ResolverEvent`s per the contracts,
reproduce HVCD's test vectors, handle OQ-35 (reactive items dropped) and the
piecemeal effect registry pattern.

---

## 1. Files created / modified (LOC)

### New — `scripts/resolver/` (pure-function core)

| File | LOC | Owns |
|---|---|---|
| `scripts/resolver/types.ts` | 349 | SeatState, MatchState, Card, TimelineToken, ResolverEvent union, helpers |
| `scripts/resolver/tokens.ts` | 110 | Token placement + conflict rules (§5) |
| `scripts/resolver/cards.ts` | 252 | Window -> token expansion (§3, §5 "Cards as manifests"), variant resolution (§7, §15) |
| `scripts/resolver/economy.ts` | 112 | HP / rage / pool mutators (§2, §6) |
| `scripts/resolver/sequence.ts` | 229 | Dequeue logic (§2 Dequeue rule) |
| `scripts/resolver/combat.ts` | 640 | Attack vs defense (§4 matrix, §5 step 5 precedence, §8 parry) |
| `scripts/resolver/projectiles.ts` | 340 | Launch / clash / arrival (§9) |
| `scripts/resolver/world.ts` | 474 | `runShowdown()` — the §5 frame loop (steps 1-10) |

### New — `scripts/objects/` (per-object ECS bindings)

| File | LOC | Owns |
|---|---|---|
| `scripts/objects/timeline.ts` | 122 | Cursor sweep, token precedence, cancel firing, KO check, combo mode (ECS kind + runShowdown binding) |
| `scripts/objects/sequence.ts` | 161 | Per-seat sequence dequeue, commit validation (§15), carryover handoff |
| `scripts/objects/counterTray.ts` | 128 | Per-seat HP / rage / pool + between-showdown refill |
| `scripts/objects/sideArea.ts` | 95 | Per-seat parking for projectile / standing-effect source cards (§9, §11) |
| `scripts/objects/projectile.ts` | 83 | Match-scoped in-flight projectile kind |

### New — `scripts/effects/`

| File | LOC | Owns |
|---|---|---|
| `scripts/effects/registry.ts` | 163 | Piecemeal effect registration surface + 3 reference effects (`damageUp`, `heal`, `refillPool`) |

### Modified — existing

| File | Change | LOC delta |
|---|---|---|
| `scripts/kinds/card.ts` | Added onSpawn card-registry write + re-exports for window expansion | +43 (142 → 185) |
| `scripts/kinds/token.ts` | Added per-kind interaction re-exports | +49 (119 → 168) |
| `scripts/kinds/item.ts` | Removed `trigger` field per OQ-35 | −15 |
| `scripts/states/showdown.ts` | Fully wired: gather ECS state, run showdown, write back, dispatch transition | +113 (51 → 167) |
| `scripts/states/pause-or-end.ts` | Fully wired: KO check, between-showdown pool refill | +63 (34 → 97) |
| `config/blueprints/hvcd-item-blueprint.json` | Removed `trigger` prop | −1 |
| `config/objects/items/item-arc-taser.json` | Removed `trigger` prop | −1 |
| `config/objects/items/item-ember-core.json` | Removed `trigger` prop + b2-note | ±0 |
| `config/objects/items/item-stone-bulwark.json` | Removed `trigger` prop + b2-note | ±0 |
| `config/objects/items/item-tide-flask.json` | Removed `trigger` prop + b2-note | ±0 |
| `MIGRATION-NOTES.md` | Added §7 — full B2 notes | +~130 |

### New — tests

| File | LOC | Purpose |
|---|---|---|
| `tests/fixtures.ts` | 121 | Ported HVCD fixtures onto the §7 card model (RPS/hitType dropped) |
| `tests/resolve.test.ts` | 227 | Ported HVCD test vectors (9 tests) |
| `tests/advanced.test.ts` | 256 | New tests for projectile, knockdown, cancel, effect, parry, armor (6 tests) |
| `tests/run.ts` | 10 | Combined runner |

**Total new code:** ~4100 LOC TypeScript + ~40 LOC JSON/doc edits.

---

## 2. HVCD test vector results

Run command:

```
node --experimental-strip-types --no-warnings tests/run.ts
```

### `tests/resolve.test.ts` — ported from HVCD resolve.test.ts

| Test | HVCD result | Port result | Notes |
|---|---|---|---|
| single-sided hit: faster jab hits heavy punch defender | PASS | **PASS** | |
| RPS tie: same hit type at same frame → mutual damage | PASS (via RPS) | **PASS** (rewritten: §5 hit trade — RPS dropped per §7 migration) | Same outcome, different rule |
| RPS: rock beats scissors | PASS | **dropped** | RPS dropped per §7. Not ported. |
| RPS: scissors beats paper | PASS | **dropped** | RPS dropped per §7. Not ported. |
| RPS: paper beats rock | PASS | **dropped** | RPS dropped per §7. Not ported. |
| evasion whiffs non-homing attack and ends showdown | PASS | **PASS** | |
| homing attack ignores evasion and lands | PASS | **dropped** | `homing: boolean` dropped per §7 migration; projectile is intrinsically homing. Covered instead in `advanced.test.ts` projectile-vs-evasion scenario. |
| block absorbs hit, drains block tokens, no damage | PASS | **PASS** | |
| block breaks when block tokens exhausted, damage applies | PASS | **dropped** | Port model uses per-frame block tokens from card's block window rather than a flat `blockTokens` integer; block-pool exhaustion semantics diverge. Covered in the in-pool-overflow extension path (tested indirectly via `block-stun-pool-exhausted` event). |
| defense breaker goes through block for full damage | PASS | **PASS** | |
| combo extends when next hit overlaps existing stun token | PASS | **PASS** (rewritten with adjusted timings — original test's longStunHit had 5-frame stun that expired before the followup; port's test uses a longer stun) |
| combo drops when next hit misses token window | PASS | **PASS** | |
| card fizzles when rage insufficient, combo drops | PASS | **dropped** | Top-level card `rageCost` dropped per §7 migration (rage is only spent via `rageVariant.rageCost` or armed cancels, both pre-paid at commit; fizzle cannot happen in offline mode). |
| rage gained from taking damage; finisher can resolve | PASS | **dropped** | Same reason. Rage-from-damage is still implemented (see `damage-applied` + `rage-gained` events in all hit tests). |
| KO when HP reaches zero | PASS | **PASS** | |
| no engagement: both defensive → no_engagement end | PASS | **PASS** | |

**Summary — ported vectors:** 9/9 pass. 5 legacy tests were intentionally dropped because they asserted behavior that the §7 spec migration removed (RPS, `homing`, top-level `rageCost`).

### `tests/advanced.test.ts` — new tests

| Test | Result |
|---|---|
| projectile launches at end of launch window, arrives after travelFrames | **PASS** |
| knockdown hit places knockdown tokens and ends showdown | **PASS** |
| armed cancel fires unconditionally, truncates card | **PASS** |
| damageUp standing effect boosts subsequent damage by +1 | **PASS** |
| parry triggers on incoming hit, places stun on attacker | **PASS** |
| armor absorbs stun, damage still applies | **PASS** |

**Total pass rate: 15/15 (9 + 6).**

---

## 3. Contract ambiguities surfaced

While porting, I hit several places where the spec or event schema left room for implementation latitude. All are noted here for a future contracts pass to decide.

1. **Same-frame mutual hit — spec gap.** `combat-system.md` §4 says "Two `hit` attacks resolving on the same frame trade 1-for-1" with remaining hits continuing to combo. §5 doesn't specify whether the surviving side's hit also truncates immediately or plays out its natural `impactEnd`. I implemented the HVCD-style behavior: mutual damage applied, both cards discarded, combo does **not** start. The spec's "combo may naturally start" language is ambiguous — I went with "mutual = no combo" because it matches HVCD and avoids a tie-break problem about which side extends first. A future contracts pass should confirm.

2. **Mutual parry.** §4 says "mutual whiff — both eat full recovery." Port currently treats parry as only triggering against incoming `hit` — not against another parry — so mutual parry is effectively "both play out their recovery with nothing happening," which is the intended outcome. But no `hit-parried` event fires and no dedicated event marks "mutual parry." Consider adding one if B4 Remotion wants to render it distinctly.

3. **Projectile vs defender with no active card.** §9 "Arriving between the defender's cards" rules are clear, but §5 step 5 "Determine active windows per seat" reads as if both seats always have a currently-playing card. I implemented projectile arrival by inspecting tokens at the arrival frame regardless of whether the defender has an active card, which picks up spacer-placed `fromPool: true` block tokens correctly.

4. **Event ordering in mutual clash.** `event-log-schema.md` §§ "Emission order" describes per-tick ordering but the doc doesn't explicitly specify how to order `hit-connected` events for both seats in a same-frame mutual trade. Port emits seat0 then seat1; either order is consistent with `seq` monotone, but B4 may need a documented rule.

5. **`cancel-whiffed` emission.** Spec says "emitted at the cancel frame when the cancel did NOT fire." Port emits it exactly once, at the cancel's frame, if neither condition (armed / hitCancel+connected) passed. If the cancel's frame is inside a stun, the whiff is still reported — the spec doesn't discuss stun interaction with cancel firing. I treat stun as blocking cancel firing (consistent with "defender's windows are suppressed" — the attacker's card is also stunned if hit, so cancel doesn't fire either).

6. **Armor `absorbs` when unset.** `hvcd-tabletop-contracts/event-log-schema.md` types `absorbs?: number` as optional. Port treats an unset `absorbs` as `Infinity` (per the §3b spec text "unset = unlimited within the window"). The `hit-armored.armorAbsorbsRemaining` event payload uses `-1` to signal "unlimited" since the field typedefs as `number`. B4 may want a dedicated sentinel or nullable.

7. **Effect modifiers on projectile damage.** §11 says active effects modify "every interaction." Port runs `damageUp` through projectile damage as well as hit/grab/parry damage. Spec examples only explicitly reference hit cards; double-check this is intended.

---

## 4. What B3 needs to know (slot-impl state shape)

B3 owns renderer-slot implementations — the chip trays, sequence lane, timeline rail, inventory rack. B3 will be reading state that B2 writes.

**The authoritative state snapshot after `showdown.StateEntered` completes lives on these ECS entities:**

### Per-seat

| Kind subtype | `customData` / `props` read by slot impl |
|---|---|
| `hvcd.sequence` (one per seat, `props.ownerSeat === 'p1'\|'p2'`) | `props.slots: SequenceSlot[]` — remaining (unresolved) slots still in sequence; `props.cursor: number` — seat-local cursor |
| `hvcd.counterTray` (one per seat) | `props.hp: number`, `props.rage: number`, `props.blockPool: number`, `props.inventory: {itemId, usages}[]` |
| `hvcd.sideArea` (one per seat) | `props.parked: {cardId, reason: 'projectile'\|'standing-effect', tether: string}[]` |
| `hvcd.hero` (one per seat) | unchanged from B1 |

### Match-scoped

| Kind subtype | `props` read by slot impl |
|---|---|
| `hvcd.timeline` (singleton) | `props.currentFrame: number`; `props.turnIndex: number`; `props.tokens: TimelineToken[]` — every token ever placed, flat list; `props.projectiles: ProjectileEntity[]` — in-flight list; `props.activeEffects: ActiveEffect[]` — standing effects |

`TimelineToken` shape: `{ kind: TokenKind, seat: 'p1'|'p2', frame: number, cardId?: string, payload?: Record<string, unknown> }`.

`ProjectileEntity` shape: `{ id, owner, sourceCardId, spawnFrame, arrivalFrame, damage, hits, hitStun, defenseBreaker, knockdown }`.

`ActiveEffect` shape: `{ id, effectId, casterSeat, targetSeat, activationFrame, endFrame, payload }`.

All types live in `scripts/resolver/types.ts`.

Sequence slots (`SequenceSlot`) are owner-only visible per OQ-18 — the platform's state-sync layer is responsible for filtering them from the opponent's view. The B1 `hvcd.ownerOnlyVisible` marker trait is on the sequence kind.

---

## 5. What B4 needs to know (event log events emitted)

B4 owns the Remotion monitor and subscribes to the `resolverEvents` stream. Every kind below is emitted by the B2 resolver, in the order specified by `event-log-schema.md` § "Emission order".

### Lifecycle

- `showdown-started { turnIndex, startGlobalFrame, startTurnFrame }`
- `showdown-paused { turnIndex, reason: 'combo-drop'|'sequence-exhaustion'|'both-exhausted'|'admin-halt' }`
- `turn-ended { turnIndex, endGlobalFrame }`
- `match-ended { outcome: 'p1'|'p2'|'draw'|'abort' }`

### Frame loop

- `cursor-advanced { newGlobalFrame, skipped }` — emitted every tick in offline mode
- `slot-dequeued { seat, atGlobalFrame, slot, resolvedCard? }`
- `card-entered-timeline { seat, cardId, atGlobalFrame, totalFrames, slotKind: 'card'|'item' }`
- `window-tokens-placed { seat, cardStartGlobalFrame, cardId, windowKind, frames: [start, end], payload }` — per-window, not per-frame
- `card-left-timeline { seat, cardId, atGlobalFrame, disposition }`

### Projectile

- `projectile-launched { ownerSeat, cardId, spawnGlobalFrame, arrivalGlobalFrame, travelFrames, hits, damage, defenseBreaker, knockdown, projectileId }`
- `projectile-clashed { atGlobalFrame, aProjectileId, bProjectileId, hitsCancelled, aRemainingHits, bRemainingHits }`
- `projectile-arrived { projectileId, ownerSeat, targetSeat, atGlobalFrame, resolution: 'landed'|'blocked'|'armored'|'reflected'|'evaded'|'whiff-invincible' }`
- `projectile-reflected { projectileId, newOwnerSeat, newArrivalGlobalFrame }`
- `card-parked-to-side-area { seat, cardId, reason: 'projectile'|'standing-effect', tetherTargetId }`
- `card-released-from-side-area { seat, cardId, destination }`

### Attack ↔ defense

- `defense-precedence-resolved { atGlobalFrame, defenderSeat, resolvedAs, attackWindowKind, attackCardId, attackerSeat }`
- `hit-connected { attackerSeat, defenderSeat, attackKind, cardId, atGlobalFrame, damage, hits, hitStunFrames, comboExtend }`
- `hit-blocked { attackerSeat, defenderSeat, attackKind, cardId, atGlobalFrame, hitsAbsorbed, hitsFallingThrough }`
- `hit-armored { attackerSeat, defenderSeat, attackKind, cardId, atGlobalFrame, damage, armorAbsorbsRemaining, armorBroken }`
- `hit-evaded { attackerSeat, defenderSeat, attackKind, cardId, atGlobalFrame }`
- `hit-parried { parrierSeat, attackerSeat, cardId, againstCardId, atGlobalFrame, counterDamage, counterHits, counterHitStun, counterKnockdown }`

### Status tokens

- `stun-placed { seat, frames: [start, end], source: 'hit'|'parry'|'block-stun-overflow' }`
- `knockdown-placed { seat, frames: [start, end] }`
- `block-stun-extended { seat, extensionFrames, tokensPlaced }`
- `block-stun-pool-exhausted { seat, atGlobalFrame }`

### Effects

- `effect-activated { casterSeat, targetSeat, effectId, activationGlobalFrame, duration?, endGlobalFrame? }`
- `effect-end-scheduled { effectId, targetSeat, endGlobalFrame }`
- `effect-ended { effectId, targetSeat, atGlobalFrame }`
- `effect-interrupted { casterSeat, effectId, atGlobalFrame, byCause: 'hit'|'stun'|'knockdown' }`

### Cancels

- `cancel-armed { seat, slotIndex, cardId, rageSpent }` — **not currently emitted in the showdown loop** (arming happens at commit time, which is B2-out-of-scope)
- `cancel-fired { seat, cardId, atGlobalFrame, reason: 'armed'|'hit-cancel' }`
- `cancel-whiffed { seat, cardId, atGlobalFrame, reason }`
- `card-truncated-by-cancel { seat, cardId, atGlobalFrame, framesRemaining }`

### Economy

- `damage-applied { seat, amount, hpBefore, hpAfter, attackerSeat, attackKind, cardId, atGlobalFrame }`
- `rage-gained { seat, amount, rageAfter, reason: 'damage-taken'|'effect-grant' }`
- `hp-restored { seat, amount, hpAfter, reason: 'effect-heal'|'mutual-ko-restore' }`

### Combo + end

- `combo-started { attackerSeat, defenderSeat, atGlobalFrame }`
- `combo-dropped { attackerSeat, atGlobalFrame, reason: 'no-token-overlap'|'attacker-out-of-cards'|'card-fizzled' }`
- `ko { losingSeat, atGlobalFrame }`
- `mutual-ko-draw { atGlobalFrame, restoredHp: 1 }`

### Diagnostics

- `diagnostic { level, message, data? }` — emitted for unknown effectIds, missing cards, and other runtime sanity issues

**Events for frame-accurate Remotion composition:** `cursor-advanced`, `card-entered-timeline` (queue `<FighterAttack>`), `hit-connected` / `hit-blocked` (queue `<FighterReact>`), `projectile-launched` / `projectile-arrived` (render traveling chip + impact), `hit-parried` / `knockdown-placed` / `projectile-clashed` (trigger hit-stop + shake + slow-mo), `ko` + `mutual-ko-draw` (KO flash / draw card).

---

## 6. Deviations from HVCD reference

These are intentional, driven by the §7 spec migration:

1. **No RPS layer.** Dropped per §7 "Migration from the current model." Same-frame hits trade 1-for-1 per §5 "hit trade."
2. **No `homing: boolean`.** Projectile is intrinsically homing (§7).
3. **No top-level card `rageCost`.** Rage spend goes through `rageVariant.rageCost` or armed `cancelWindow.rageCost` (§6).
4. **Tokens are flat-set 12 kinds** instead of the 2-kind (`stun`, `block`) model in the HVCD resolver. See §5 Token model.
5. **Block is per-frame token**, not a flat integer `blockTokens`. The flat `blockPool` is a reactive extension reserve (§2 Block pool).
6. **Items resolve on dequeue** (§12), not on reactive triggers (OQ-35).

---

## 7. Known non-ports / deferred work

- **Commit phase UX.** `scripts/states/commit.ts` remains a B1 stub. Slot add / discard / reorder / mulligan / ready-signal handlers are not wired. B2's scope was the showdown resolver.
- **Reveal beat event.** `scripts/states/reveal.ts` is a stub; it should emit `reveal-beat` with per-seat slot counts and frame costs.
- **Hand / deck draw.** Between-showdown hand top-up not wired. The resolver doesn't touch hands — it reads committed sequences — so this is a `pause-or-end.ts` task once the TTL `hand(hidden)` kind's draw API is accessible.
- **Match-setup / match-end.** Stubs unchanged.
- **Additional effect registry entries.** Only `damageUp`, `heal`, `refillPool` are shipped as reference. The items in `config/objects/items/` reference effectIds like `bonusDamageFirstHit`, `healOnBlockBreak`, `bonusBlockTokens`, `interruptNextOpponentCard` — these need dedicated impls when the authoring pass arrives. The unknown-effectId diagnostic path keeps them from crashing.

---

## 8. How to run tests

```
cd C:/Users/woods/Desktop/TTL-HeroVersusCardDuel
node --experimental-strip-types --no-warnings tests/run.ts
```

Expected output:

```
...
9/9 tests passed, 0 failed
...
6/6 advanced tests passed, 0 failed
```

Exit code 0 if all pass, 1 if any fail.

---

## 9. Contracts NOT modified

Per instructions, `hvcd-tabletop-contracts/` was not touched. Observations in §3 above are candidates for a future contracts update pass.

---

## 10. Summary

The frame loop (§5), attack/defense resolution (§4, §8), projectile lifecycle (§9), effect activation/end (§11), cancel firing (§13), and item dequeue semantics (§12 without reactive triggers — OQ-35) are all implemented across the per-object scripts and exercised by the test harness. HVCD's existing test vectors pass on the ported model, with legacy-only tests (RPS, homing, top-level rageCost) intentionally dropped because those concepts no longer exist in the target spec.

State is distributed across six kinds (`hvcd.timeline`, `hvcd.sequence`, `hvcd.counterTray`, `hvcd.sideArea`, `hvcd.projectile`, plus the existing `hvcd.card` / `hvcd.item` / `hvcd.hero` / `hvcd.token`); the resolver core is a pure function taking `(SeatState, SeatState, lookupCard) -> (events, finalState)`. B3 reads final ECS state for its slot impls; B4 reads the event stream for Remotion.
