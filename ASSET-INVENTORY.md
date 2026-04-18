# HVCD Asset Inventory

**Agent:** B5 | **Date:** 2026-04-18 | **Status:** Draft — R2 migration planning

Read-only inventory of every asset currently committed to `HeroVersusCardDuel/` plus every code path that references an asset. Covers existing bundled assets (very thin) and the Supabase Storage–hosted art pipeline. Future asset categories enumerated from `docs/ui-design.md` are flagged separately — they do not exist in the repo yet.

---

## Section 1 — Summary table

| Category | Count | Total size | Location |
|---|---|---|---|
| Static bundled images (favicon, placeholder) | 2 | ~48 KB | `public/` |
| Static bundled text (robots) | 1 | 174 B | `public/` |
| Fonts | 0 | 0 | — (Tailwind default system stack only) |
| Audio SFX | 0 | 0 | — (not yet authored) |
| Video / Remotion clips | 0 | 0 | — (not yet authored) |
| 3D models (GLB/GLTF) | 0 | 0 | — (not yet authored) |
| HDR / IBL maps | 0 | 0 | — (not yet authored) |
| Hero portraits (Supabase bucket `hero-art`) | unknown (DB-driven) | unknown | Supabase Storage, not in repo |
| Card art (Supabase bucket `card-art`) | unknown (DB-driven) | unknown | Supabase Storage, not in repo |
| User avatars (via `profiles.avatar_url`) | unknown (user-generated) | unknown | External URLs (not bucket-pinned) |
| **Total committed to repo** | **3 files** | **~49 KB** | `public/` |

**Headline:** HVCD has essentially **no first-party assets committed to source**. Everything visual that ships with the running app today is either (a) a Vite-scaffold default, (b) Tailwind CSS primitives, (c) emoji literals in placeholder data, or (d) uploaded at runtime into two Supabase Storage buckets (`hero-art`, `card-art`). All the heavy asset categories the R2 migration is sizing for — rooms, fighter clips, cabinet models, chip meshes, SFX — **do not exist yet**. They are specified in `docs/ui-design.md` but no authoring has begun.

---

## Section 2 — Full inventory

### 2.1 Repo-committed static assets

Served verbatim from `public/` by Vite. No transforms.

| Path | Size | Format | Kind | Referenced by |
|---|---|---|---|---|
| `public/favicon.ico` | 20,373 B | ICO | Browser favicon | `index.html` (implicit — Vite serves at `/favicon.ico`) |
| `public/placeholder.svg` | 28,665 B | SVG | Scaffold placeholder image | No direct code reference found in `src/` — Vite scaffold default, never linked from the live app |
| `public/robots.txt` | 174 B | text/plain | SEO directives | Implicit — served at `/robots.txt` |

No files in `src/assets/`; no `src/assets/` directory exists. No `import foo from "*.png"` / `import foo from "*.svg"` statements anywhere in `src/`.

### 2.2 CSS / design tokens

- `src/index.css` — Tailwind base + custom HSL CSS variables (colors, radii, glow shadows). No `@font-face`, no `url(...)` imports, no external CSS asset.
- No font files in-repo. The app relies on Tailwind's default CSS `font-sans` / `font-mono` stacks (system fonts).

### 2.3 Runtime-served assets via Supabase Storage

The app reads two public buckets at runtime. The blobs are **not** committed to the repo — they live in the Supabase project referenced by `src/integrations/supabase/client.ts`. Sizes/counts can only be known by querying the Supabase instance.

| Bucket | Visibility | Purpose | Writer | DB reference |
|---|---|---|---|---|
| `hero-art` | public read | Hero portraits (one path per `heroes.portrait_path`) | admins only (RLS) | `public.heroes.portrait_path` (nullable) |
| `card-art` | public read | Card art (one path per `cards.art_path`, `items.art_path`) | admins only (RLS) | `public.cards.art_path`, `public.items.art_path` |

Bucket provisioning + RLS: `supabase/migrations/20260420000000_hero_editor.sql:86-120`.

Bucket shape: paths follow `<keyPrefix>/<uuid>.<ext>` (`src/lib/storage.ts:12-13`), where `keyPrefix` is chosen by the caller (no enforced taxonomy).

### 2.4 User-generated avatars

`public.profiles.avatar_url` and `public.bot_profiles.avatar_url` are `text | null` — arbitrary URLs, not bucket-pinned. Rendered via `<img src={fallbackAvatarUrl}>` in `VideoTile.tsx:49`. These are out-of-scope for R2 unless a policy decision moves avatar hosting in-house.

### 2.5 Placeholder / emoji content

`src/components/LeaderboardPreview.tsx` uses emoji literals (`🐉 🦊 ⚔️ 🌊 ⚡ 👑 🔥 🃏 🌿 👁️ 🍀 🧠 💰 🪙`) as avatar placeholders in the demo leaderboard. Not real assets; noted only so they aren't mistaken for missing ones.

---

## Section 3 — Code references to asset paths

### 3.1 Supabase Storage public-URL construction

`src/lib/storage.ts` is the single chokepoint — all runtime asset URL construction goes through `publicUrl(bucket, path)`.

| File:line | Bucket | Key source |
|---|---|---|
| `src/lib/storage.ts:3` | defines `ArtBucket = "hero-art" \| "card-art"` | — |
| `src/lib/storage.ts:7` | calls `supabase.storage.from(bucket).getPublicUrl(path)` | — |
| `src/lib/storage.ts:14` | admin upload into bucket | `uploadArt()` |
| `src/lib/storage.ts:25` | admin delete from bucket | `deleteArt()` |
| `src/components/game/HeroSelectPhase.tsx:52` | `hero-art` | `hero.portraitPath` |
| `src/pages/AdminHeroes.tsx:138` | `hero-art` | `hero.portraitPath` |
| `src/components/admin/heroes/HeroIdentityTab.tsx:119,129` | `hero-art` | portrait upload widget (bucket passed as prop) |
| `src/components/admin/heroes/HeroCardsTab.tsx:231` | `card-art` | `card.artPath` |
| `src/components/admin/heroes/HeroStarterDeckTab.tsx:163,194` | `card-art` | `card.artPath` |
| `src/components/admin/heroes/CardEditorDialog.tsx:279` | `card-art` | card art upload widget |
| `src/components/admin/heroes/CardEditorDialog.tsx:130` | DB write | `art_path: form.artPath` |
| `src/components/admin/heroes/HeroIdentityTab.tsx:36` | DB write | `portrait_path: patch.portraitPath` |

### 3.2 DB row → TS type mappers (where paths enter the app)

| File:line | Column | Maps to |
|---|---|---|
| `src/lib/heroTypes.ts:23` | `row.portrait_path` | `Hero.portraitPath` |
| `src/lib/cardTypes.ts:37` | `row.art_path` | `Card.artPath` |
| `src/lib/itemTypes.ts:70,86` | `row.art_path` | `Item.artPath` |

### 3.3 Avatars (not Storage-bucketed)

| File:line | Field |
|---|---|
| `src/pages/Leaderboard.tsx:10,27` | `profiles.avatar_url` |
| `src/pages/Play.tsx:32,39,58,61,148` | bot avatar lookup |
| `src/components/game/VideoTile.tsx:6,18,48-49` | `<img src={fallbackAvatarUrl} …>` |
| `src/components/game/BattlePhase.tsx:28,38,97` | prop plumbing |
| `src/components/admin/AdminDashboard.tsx:20` | admin-view type |
| `src/hooks/useMatchmaking.ts:11` | matchmaking type |

### 3.4 Imports of image/audio/video/3D/font files

**Zero matches.** No `import x from "…/foo.png"` (or `.svg`, `.mp3`, `.wav`, `.ogg`, `.mp4`, `.webm`, `.glb`, `.gltf`, `.hdr`, `.woff`, `.ttf`, etc.) anywhere in `src/`. No `new URL('…', import.meta.url)` asset patterns. No `<img src="/something.png">` literals.

### 3.5 Non-app asset references (documentation / reserved paths)

These appear in docs only — **no implementation references them yet**:

| File:line | Path | Status |
|---|---|---|
| `docs/ui-design.md:570` | `/rooms/neon-arcade/ibl.hdr` | pseudocode example |
| `docs/ui-design.md:780` | `/assets/rooms/<name>/room.glb` + `.hdr` | authoring-pipeline spec |
| `docs/ui-design.md:787` | `/assets/fighters/<fighter>/moves/<move>.webm` | authoring-pipeline spec |
| `docs/ui-design.md:794` | `/src/remotion/effects/` | authoring-pipeline spec |

### 3.6 External hotlinks in HTML

`index.html:15,19` references `https://lovable.dev/opengraph-image-p98pqg.png` as og:image / twitter:image. This is a third-party Lovable-hosted asset; not migration-blocking but noted for completeness (should be replaced with a self-hosted OG image as part of de-Lovable-ization).

---

## Section 4 — Future asset categories (from `docs/ui-design.md`)

None of these exist in the repo; all are called out by the UI design spec as content-pipeline outputs the R2 layout must accommodate. Rough order-of-magnitude estimates assume a modest MVP roster (5–8 fighters, 5–8 rooms, ~30 moves/fighter).

| Category | Source authority | Per-item shape | MVP est. | Scale-up est. | R2 notes |
|---|---|---|---|---|---|
| **Skybox 3D room meshes** | `ui-design.md` §11 | `rooms/<name>/room.glb` | 5–8 rooms | 20–40 rooms | 20–100 MB per room (§11b). Bytes-dominant category. |
| **Room IBL HDR maps** | `ui-design.md` §11c | `rooms/<name>/ibl.hdr` | 5–8 files | 20–40 | ~4–8 MB each per sample manifest (4.8 MB in example). |
| **Fighter move clips** | `ui-design.md` §10c, §17b | `fighters/<fighter>/moves/<move>.webm` (alpha WebM) | ~200 clips (8 fighters × ~25 moves) | low thousands (roster × moves) | Alpha WebM, ~200-500 KB each (uppercut example: 234,912 B). |
| **Fighter reaction clips** | `ui-design.md` §10c | `fighters/<fighter>/reactions/<type>.webm` | ~72 (8 fighters × 9 reactions: hit-small/med/heavy, block, parry, evade, KD, getup, idle, hurt-idle) | ~300+ | Same shape as move clips. |
| **Shared effects library** | `ui-design.md` §10c, §17c | `src/remotion/effects/*` (React components, NOT blobs) | dozens | ~100 | Code, not assets — lives in bundle, not R2. Only if pre-rendered variants are used. |
| **Stage background plates** | `ui-design.md` §10c | `fighters/stages/<stage>.webm` or static | 5–8 | 20+ | Static or parallax, small. |
| **Cabinet 3D model** | `ui-design.md` §5,6 | `cabinet/chassis.glb` + accessories | 1 primary + a handful of variants | ~10 (seasonal skins) | Single-digit MB each. |
| **Cabinet avatar meshes** | `ui-design.md` §9 | `avatars/<variant>.glb` + emote anims | 2 default (P1/P2) | dozens (cosmetic skins) | Single-digit MB each. |
| **Chip / token 3D meshes** | `ui-design.md` §6d | `chips/<category>/<variant>.glb` | ~10 shapes (attack sharp, defense round, cancel thin, effect emissive, HP/rage/pool/block) | ~20 | Very small (kilobytes). Count × instancing, not size, dominates. |
| **Card meshes / textures** | `ui-design.md` §6b | card mesh (shared) + per-card face texture | 1 mesh + N face textures (current `card-art` bucket role) | — | Mesh ships with bundle; textures already in Supabase `card-art` — will migrate. |
| **SFX (cabinet)** | `ui-design.md` §6d ("audible clink"), §20 (open Q on audio) | per chip category, per card action | dozens (~40 short clips) | ~100 | Short WAV/OGG, small. **Architecture still open per §20.** |
| **SFX (monitor / Remotion)** | `ui-design.md` §10, §20 | per move impact, hit-react, parry, KO | hundreds (~200) | thousands | Alpha-WebM already carries some; discrete SFX layered. |
| **Ambient room audio** | `ui-design.md` §11 (implied) | `rooms/<name>/ambience.ogg` | 5–8 | 20–40 | Looping ambience, ~1-3 MB each. |
| **Fonts** | not spec'd | — | 0–3 | 5 | Likely a display face + body face once UI settles. |
| **Hero portraits** (existing, in `hero-art` bucket) | combat-system + admin UI | `<keyPrefix>/<uuid>.<ext>` | TBD (admin-uploaded) | ~30–50 | Already in Supabase. Migrate to `modules/<projectId>/<commitSha>/assets/heroes/<hero>/portrait.<ext>` per contract. |
| **Card art** (existing, in `card-art` bucket) | combat-system + admin UI | `<keyPrefix>/<uuid>.<ext>` | TBD | hundreds (one per card) | Same migration path, `assets/cards/...`. |

**Totals (rough):** the MVP alone implies ~300–400 media files and ~1–3 GB; full roster scaling pushes this to low thousands of files and 10–50 GB. The R2 migration planning should absolutely be sized for the post-migration future state, not today's 49 KB.

---

## Section 5 — Proposed R2 layout

Grounded in `hvcd-tabletop-contracts/asset-protocol.md`. That spec proposes three prefixes (`modules/`, `portals/`, `sessions/`) on a shared bucket `tabletop-assets-prod`. HVCD's project sits under `modules/<projectId>/<commitSha>/assets/…`.

### 5.1 Mapping existing HVCD assets → R2 prefixes

| Existing location | R2 prefix (proposed) | Category in asset-protocol.md | Notes |
|---|---|---|---|
| `public/favicon.ico` | N/A — stays in bundle / portal static | — | Tiny; served from portal origin, not R2. |
| `public/placeholder.svg` | N/A — likely deletable | — | Unreferenced Vite scaffold leftover. Candidate for removal. |
| `public/robots.txt` | N/A — portal-served | — | Stays in HVCD bundle. |
| Supabase `hero-art` bucket | `modules/hvcd/<commitSha>/assets/heroes/<heroSlug>/portrait.<ext>` | **Module-owned** | Will need a stable slug per hero (currently random UUID path). See §5.3 re-mint. |
| Supabase `card-art` bucket | `modules/hvcd/<commitSha>/assets/cards/<cardSlug>/art.<ext>` | **Module-owned** | Same re-mint concern. |
| `profiles.avatar_url` (user-uploaded) | `portals/hvcd-prod/users/<userId>/avatar.<ext>` | **Portal-owned** | Currently external arbitrary URLs — out of current R2 scope unless policy changes. |
| Future `rooms/<name>/room.glb` + `ibl.hdr` | `modules/hvcd/<commitSha>/assets/rooms/<name>/...` | **Module-owned** | Matches the asset-protocol example verbatim. |
| Future `fighters/<fighter>/moves/<move>.webm` | `modules/hvcd/<commitSha>/assets/fighters/<fighter>/moves/<move>.webm` | **Module-owned** | Matches the asset-protocol example verbatim. |
| Future fighter reactions | `modules/hvcd/<commitSha>/assets/fighters/<fighter>/reactions/<type>.webm` | **Module-owned** | — |
| Future stages | `modules/hvcd/<commitSha>/assets/fighters/stages/<stage>.<ext>` | **Module-owned** | — |
| Future cabinet 3D | `modules/hvcd/<commitSha>/assets/cabinet/<part>.glb` | **Module-owned** | — |
| Future avatar 3D | `modules/hvcd/<commitSha>/assets/avatars/<variant>.glb` | **Module-owned** | — |
| Future chip meshes | `modules/hvcd/<commitSha>/assets/chips/<category>/<variant>.glb` | **Module-owned** | — |
| Future cabinet SFX | `modules/hvcd/<commitSha>/assets/audio/cabinet/<event>.<ext>` | **Module-owned** | — |
| Future monitor SFX | `modules/hvcd/<commitSha>/assets/audio/monitor/<event>.<ext>` | **Module-owned** | — |
| Future room ambience | `modules/hvcd/<commitSha>/assets/rooms/<name>/ambience.<ext>` | **Module-owned** | Co-located with room mesh. |
| Match replay artifacts (not yet implemented) | `sessions/<sessionId>/replay.hvcdreplay` | **Session-owned** | Spec'd in asset-protocol §Session-owned; HVCD hasn't built it. |

### 5.2 Shape fits the contract

All existing and planned HVCD assets map cleanly onto the three-category model (module / portal / session). Nothing in HVCD sits outside these categories. No custom prefix required.

### 5.3 Fit concerns / mismatches

Two real mismatches worth flagging before the migration runs:

1. **Opaque UUID key paths vs. manifest-declared paths.** Current `hero-art` / `card-art` entries live at `<keyPrefix>/<uuid>.<ext>` (see `src/lib/storage.ts:12-13`). The asset-protocol.md manifest model (§Manifest-driven preload) requires *stable, declarative paths* listed in a published manifest. On migration we need to re-key each portrait / card art blob to a deterministic slug (`heroes/<heroSlug>/portrait.png`) and update the DB column from "storage bucket path" to "manifest-relative path" — or keep the UUID names and list them as manifest entries. The former is cleaner; the latter requires zero migration of content metadata. **This is the single biggest content-schema decision** the migration has to make.

2. **Admin-editable at runtime vs. commit-SHA-immutable.** The asset-protocol model pins all module-owned assets to a `commitSha` and treats them as immutable per version. Today's HVCD admin panel lets admins upload new hero/card art at runtime without cutting a new project version (`HeroIdentityTab.tsx`, `CardEditorDialog.tsx`). If the R2 model freezes assets per commit, the admin UX must change: either every art edit triggers a new `project_versions` row (+ manifest publish), or hero/card art is reclassified as **portal-owned** (mutable) rather than module-owned (immutable). **This is a module-governance question, not a bytes question** — flag for open-questions OQ-20/OQ-21 deliberation.

3. **User avatars live on external URLs.** `profiles.avatar_url` is a free-form string, not a bucket reference. If the platform wants to own avatar delivery (for privacy / deletion-compliance / CDN-cache coherence), that's a second, smaller migration (external → `portals/hvcd-prod/users/…`). Independent from the module-asset migration; can defer.

4. **Lovable og:image hotlink.** `index.html:15,19` points at `lovable.dev`. Replace with self-hosted (portal static, not R2) as part of brand cleanup; not R2-migration-blocking.

---

## Section 6 — Migration plan

### 6.1 Sequencing overview

Migration breaks into four waves. Only Wave 1 is blocked on the R2 open questions; Waves 2–4 can be lifted-and-shifted independently.

### 6.2 Wave 0 — Housekeeping (unblocked, mechanical, do now)

- Audit and delete `public/placeholder.svg` (unreferenced).
- Replace `lovable.dev` og:image in `index.html` with a self-hosted PNG (lives in HVCD bundle or portal static; not R2).
- No R2 dependency. Trivial.

### 6.3 Wave 1 — Contract-freeze-blocked migration of existing Supabase art

**Blocked on:** OQ-20 (per-module vs shared bucket), OQ-21 (Cloudflare account ownership), OQ-23 (sha256 required for module-owned — yes per draft), plus HVCD-internal decision on UUID-keyed vs slug-keyed paths (§5.3 concern #1) and mutable vs immutable admin uploads (§5.3 concern #2).

Once unblocked:

1. Decide hero/card art classification: module-owned (pin per commit, admin = content-pipeline) or portal-owned (mutable, admin UX stays). Recommend **module-owned** for parity with the asset-protocol example manifest and with all the future categories — otherwise admin art edits and future fighter-clip edits need two different trust models.
2. Write a one-shot `tools/migrate-hero-art.ts`: enumerate `hero-art` + `card-art` bucket blobs, compute sha256, re-upload to `modules/hvcd/<commitSha>/assets/heroes/<slug>/portrait.<ext>` (and the parallel card path), update DB columns (`heroes.portrait_path`, `cards.art_path`, `items.art_path`) to manifest-relative paths, and emit a `config/assets.json` manifest entry per blob.
3. Change `src/lib/storage.ts#publicUrl` from "Supabase Storage getPublicUrl" to "platform `requestSignedUrl` wrapper" per asset-protocol §Minting protocol. This is the only runtime code-change of the migration — swap the URL minter, leave the two callers (`publicUrl("hero-art", …)` / `publicUrl("card-art", …)`) alone at call sites.
4. Retire `hero-art` and `card-art` Supabase buckets + their RLS migrations once the cutover is verified.

**Size:** tiny (admin-uploaded, likely sub-100-MB total). This is the rehearsal migration — should be done even if fighter-clip authoring is still months out, because it proves the contract.

### 6.4 Wave 2 — New asset categories, authored directly into R2

**Not blocked on migration — blocked on content authoring.**

As fighter clips / room GLBs / chip meshes / cabinet audio come online in the content pipeline (per `ui-design.md` §17), they go **directly** into `modules/hvcd/<commitSha>/assets/...` following the asset-protocol upload flow (`POST /modules/upload-token`). No intermediate Supabase bucket step. Each asset authored has a manifest entry committed alongside it; sha256 verified at publish time.

This wave doesn't migrate anything — it just ensures the first piece of new content uses the contract end-to-end.

### 6.5 Wave 3 — Replay storage (session-owned)

**Blocked on:** OQ-12 (replay storage bucket + retention) and the session-api spec's webhook/GET-replay paths being implemented on the platform side.

HVCD today has no replay storage (no references to `sessions/` prefix, no `.hvcdreplay` references in code). When replay capture is built, it writes directly to `sessions/<sessionId>/replay.hvcdreplay` per asset-protocol §Asset categories. No pre-existing data to migrate.

### 6.6 Wave 4 — Avatar hosting migration (optional, portal-owned)

**Not blocked on migration — blocked on policy.**

If the platform wants to own avatar hosting, migrate `profiles.avatar_url` external URLs to `portals/hvcd-prod/users/<userId>/avatar.<ext>`. Requires user consent / re-upload flow. Defer until there's a privacy / compliance reason.

### 6.7 Risk register

Top 3 risks, ranked:

1. **Admin-editable-art vs. module-commit-immutability mismatch.** The hero/card art is admin-editable-at-runtime today (§5.3 concern #2). The module-owned classification in the asset-protocol draft assumes commit-SHA immutability. Resolving this is product/policy, not engineering — it changes how the admin panel works. **Surface to open-questions review before starting Wave 1.**

2. **UUID-keyed storage paths vs. manifest-declared paths.** Current DB columns store `<keyPrefix>/<uuid>.<ext>` opaque paths (`src/lib/storage.ts:12-13`). Manifest-driven preload (asset-protocol §Manifest-driven) requires stable, meaningful paths so the manifest is authorable. Migration has to rewrite all `heroes.portrait_path` / `cards.art_path` / `items.art_path` rows. One-shot script, but it's an inline-data migration that has to coordinate with a bucket migration — easy to get out of sync if interrupted.

3. **Byte volume is deceptive.** Today = 49 KB + a modest Supabase bucket. Post-migration-spec-compliance roster = 1–3 GB MVP, 10–50 GB at full scale (room GLBs at 20–100 MB each and hundreds of fighter clips dominate). The R2 cost model, signed-URL lifetimes, preload policy, and `AssetCache` sizing (asset-protocol cites 1 GB cap on the client) must be sized for the scale-up number, not today's footprint. **A working migration on today's data does not validate the contract for the real workload** — a synthetic-load dry-run with ~1 GB of dummy GLB/WebM should be part of the acceptance test.

---

## Appendix A — Methodology

- `Glob` across the HVCD repo for every image, audio, video, 3D, and font file extension (both `public/` and `src/` trees, excluding `node_modules/` and `.claude/worktrees/` duplicates).
- `Grep` across `src/` for: filename suffixes (`\.png|jpg|…`), `import` statements referencing asset modules, hardcoded asset paths (`art_path|portrait_path|avatar_url|…`), `supabase.storage` usage, bucket names (`hero-art`, `card-art`), and `url(`/`@font-face`/`@import` CSS directives.
- `Read` on `src/lib/storage.ts`, `src/lib/heroTypes.ts`, `src/lib/cardTypes.ts`, `src/lib/itemTypes.ts`, `src/index.css`, `index.html`, `supabase/migrations/20260420000000_hero_editor.sql`, and targeted regions of `docs/ui-design.md` to confirm each asset path's call graph.
- Cross-reference against `hvcd-tabletop-contracts/asset-protocol.md` for the target R2 shape.

Worktrees (`.claude/worktrees/*/`) mirror the main repo; not double-counted. `node_modules/` dependencies contain their own bundled assets (Playwright logos, Supabase phoenix icons, codicon font) — not HVCD-owned, not in inventory scope.
