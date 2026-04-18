# B1 Agent Report — HVCD-on-TTL Scaffold

**Agent:** B1 | **Date:** 2026-04-18 | **Status:** Complete, ready for B2 handoff.

Scope: replace the TabletopLabs project-template demo content with HVCD-specific
kinds, traits, state machine, content, and scripts, as defined in combat-system.md.

---

## Files created / modified

### Project root
| File | Status | Lines | Notes |
|---|---|--:|---|
| `project.json` | modified | 28 | Seats fixed to `p1` + `p2` only; teams removed; minPlayers/maxPlayers = 2; `stateMachine.path` added; name/description updated. |
| `README.md` | modified | 9 | Pointer README. |
| `MIGRATION-NOTES.md` | created | 231 | Divergences, open questions, and B2 handoff items. |
| `b1-agent-report.md` | created | — | This file. |

### Config
| File | Status | Lines | Notes |
|---|---|--:|---|
| `config/state-machine.json` | rewritten | 99 | HVCD FSM: `match-setup -> commit -> reveal -> showdown -> pause-or-end -> match-end`, with reveal-to-commit (frame mismatch) loopback per §2. |
| `config/content.json` | rewritten | 41 | Manifest index for 7 blueprints + 26 objects. |
| `config/entities.json` | rewritten | 3 | Empty (match-setup state spawns entities from content). |
| `config/glossary.json` | created | 197 | 27 keywords, 13 tags, 7 keyword folders, 3 tag folders. |
| `config/room/default-room.json` | untouched | 13 | Starter room preset kept as-is (suitable for a 2-seat table). |

### Blueprints (7 files)
| File | Lines |
|---|--:|
| `config/blueprints/hvcd-hero-blueprint.json` | 21 |
| `config/blueprints/hvcd-card-blueprint.json` | 24 |
| `config/blueprints/hvcd-item-blueprint.json` | 29 |
| `config/blueprints/hero-blaze.json` | 30 |
| `config/blueprints/hero-aqua.json` | 30 |
| `config/blueprints/hero-terra.json` | 30 |
| `config/blueprints/hero-volt.json` | 30 |

### Object configs (26 files)
- 4 hero objects (`config/objects/heroes/hero-*.json`)
- 18 card objects (`config/objects/cards/*.json`) — full migration of SQL seed `20260416120000_card_frame_model.sql`
- 4 item objects (`config/objects/items/item-*.json`) — full migration of SQL seed `20260417000000_items_and_progression.sql`

### Scripts
| File | Status | Lines | Notes |
|---|---|--:|---|
| `scripts/manifest.json` | rewritten | 16 | 4 kind scripts + 5 trait scripts. |
| `scripts/game-rules.ts` | rewritten | 38 | Global-script stub; event-stream bridging is a B2 TODO. |
| `scripts/kinds/card.ts` | created | 142 | `hvcd.card`, extends built-in `card` engine kind, fields per §7. |
| `scripts/kinds/hero.ts` | created | 111 | `hvcd.hero`, fields + starter deck / inventory refs. |
| `scripts/kinds/item.ts` | created | 91 | `hvcd.item` extends `hvcd.card`. Per §12. |
| `scripts/kinds/token.ts` | created | 118 | All 12 token kinds + lifecycle + projectile. |
| `scripts/traits/rage-cost.ts` | created | 24 | Marker trait for cards/items with rage payments. |
| `scripts/traits/frame-cost.ts` | created | 25 | Marker trait for sequence frame cost reveal. |
| `scripts/traits/variant-override.ts` | created | 27 | Marker trait for rageVariant support. |
| `scripts/traits/cancel-window.ts` | created | 26 | Marker trait for cancelWindow support. |
| `scripts/traits/owner-only-visible.ts` | created | 27 | Marker trait — client-only hide, see OQ-18. |
| `scripts/states/match-setup.ts` | created | 30 | Stub with B2 TODOs for seat init + MatchStartedEvent. |
| `scripts/states/commit.ts` | created | 43 | Stub with B2 TODOs for slot add/discard/reorder, mulligan. |
| `scripts/states/reveal.ts` | created | 36 | Stub with B2 TODOs for frame-total compare + RevealBeatEvent. |
| `scripts/states/showdown.ts` | created | 51 | Stub — resolver port is the main B2 deliverable; §5 frame loop. |
| `scripts/states/pause-or-end.ts` | created | 34 | Stub — KO check + end-of-turn refills. |
| `scripts/states/match-end.ts` | created | 27 | Stub — MatchEndedEvent. |
| `scripts/transitions/setup-to-commit.ts` | created | 8 | Auto transition. |
| `scripts/transitions/commit-to-reveal.ts` | created | 15 | Guard stub. |
| `scripts/transitions/reveal-to-showdown.ts` | created | 14 | Guard stub. |
| `scripts/transitions/reveal-to-commit.ts` | created | 10 | Frame-mismatch loopback. |
| `scripts/transitions/showdown-to-pause.ts` | created | 10 | Pause trigger. |
| `scripts/transitions/pause-to-commit.ts` | created | 14 | Continue trigger. |
| `scripts/transitions/pause-to-end.ts` | created | 7 | KO trigger. |

### Files deleted (demo content)
- `scripts/demo-piece-rules.ts`
- `scripts/kinds/meeple-kind.ts`
- `scripts/kinds/meeple-kind.editor.ts`
- `scripts/traits/stackable-trait.ts`
- `config/blueprints/action-card-blueprint.json`
- `config/blueprints/hex-tile-blueprint.json`
- `config/blueprints/supply-crate-blueprint.json`
- `config/blueprints/treasure-deck-blueprint.json`
- `config/blueprints/worker-meeple-blueprint.json`
- `config/objects/attack-action-card.json`
- `config/objects/hex-forest-tile.json`
- `config/objects/supply-crate.json`
- `config/objects/treasure-deck.json`
- `config/objects/worker-meeple.json`

---

## Validation

- **JSON parse:** all 40 JSON files in the repo parse cleanly (verified via
  `node -e "JSON.parse(fs.readFileSync(...))"` walker).
- **Script compile:** not run — the ScriptEngine sandbox compiles files at
  load time via `new Function(...)`; static validation isn't part of this
  scaffold. All `.ts` files are CommonJS `exports.X = function(...) {...}`
  and use no DOM/network globals (matches sandbox rules in
  `TabletopLabs/code/src/ecs/ScriptEngine.ts`).
- **No TypeScript build:** these files run inside the platform's sandbox,
  not through tsc. No `package.json` / `tsconfig.json` was added.
- **No `find` / `grep` commands** — validation used ripgrep via the Grep
  tool and Node for JSON parse.

---

## Open questions surfaced (see MIGRATION-NOTES.md for detail)

| Ref | Topic | Conservative choice made |
|---|---|---|
| OQ-1 | Script execution model | Assumed ScriptEngine sandbox. Resolver TODOs in `showdown.ts` preserve hooks for a module-host port. |
| OQ-5 | Determinism mode | Assumed offline (recommended). `StateUpdate` on showdown is a documented no-op. |
| OQ-18 | Owner-only privacy | Client-only marker trait. Inventory bluff requires network-level channel (flagged). |
| (legacy) | Top-level `rage_cost` on cards | Dropped — not expressible under §7 (rage is per-variant or per-cancel-arm). See §2a of MIGRATION-NOTES. |
| (legacy) | `hitType` RPS layer | Dropped — not in §7. Every migrated card just uses `attackWindows.hit`. |
| (legacy) | `homing: boolean` on cards | Dropped — projectile is intrinsically homing. Fireball remodeled as projectile with `travelFrames: 8`. |
| (legacy) | Reactive item triggers (`onTakeHit`, `onRoundStart`, `onPlayCard`) | Not expressible under §12 dequeue-only model. Preserved as `props.trigger` informationally. B2 decision: expand spec or convert to active items. |
| (legacy) | `base_block = 2` on Terra | Modeled as `props.baseBlock` on hero, expected to extend the effective pool to 8. Terra's `Stone Bulwark` item also grants +2 block; potential redundancy flagged. |

---

## What B2 needs to know before porting the resolver

1. **Card roster is the SQL-seed baseline (18 cards + 4 items + 4 heroes).**
   If the target roster is larger, those cards must be authored as `config/objects/cards/<id>.json` before starter decks resolve cleanly.
2. **Effect registry is missing.** `scripts/effects/*.ts` (or equivalent) and a
   loader convention are B2's responsibility; effectIds are referenced on items
   (`bonusDamageFirstHit`, `healOnBlockBreak`, `bonusBlockTokens`,
   `interruptNextOpponentCard`) but nothing consumes them yet.
3. **Window -> token expansion.** Cards store windows as JSON on `props.*Windows`.
   The resolver owns the expansion into per-frame tokens on dequeue (§5 "Cards as manifests").
4. **Sequence slot modeling.** Not yet a kind. Decide between sub-entity-per-slot
   vs array-on-seat-customData; affects how `hvcd-tabletop-contracts/game-module-manifest.md`'s `hvcd.sequenceSlot` kind declaration is fulfilled.
5. **Block pool / rage / HP** live on seat (or hero entity) `customData` today
   — B2 to formalize the paths.
6. **Hand representation.** TabletopLabs has a built-in `hand` hidden kind
   (`game-config-loading.md` "built-in container-family direction"). B2 to
   decide if that's sufficient or if a `hvcd.hand` custom kind is needed.
7. **Side-area (parked cards)** per §2 / §9 / §11 is not modeled yet.
8. **Timeline is a renderer-slot concern**, not an entity. State lives on
   resolver output + event stream.
9. **Assets are empty** — hero portraits, card art, fighter clip manifests
   are not migrated. See also `ASSET-INVENTORY.md` (Agent B5) for a separate
   audit of what HVCD currently has and what needs to come across.

---

## Summary

- 33 files created, 6 files modified, 14 demo files deleted.
- ~2100 lines of scaffold (excluding B5's `ASSET-INVENTORY.md`).
- JSON config + script scaffolding is complete; no resolver logic included.
- All flagged divergences live in `MIGRATION-NOTES.md` with cross-references
  to combat-system.md sections and open-question numbers.
- No commits made (per instructions — user will review before committing).
