# Lizetka Editor — Build Plan

Replacing the old, unfriendly `editor.lizetka.cz` (source lost) with a new, friendly
**static post editor**: a static page + one tiny Cloudflare Worker (the only backend, just
for the OAuth code→token exchange). The editor emits the **exact JSON** that
`scripts/bin/write-posts.js` consumes — a drop-in with zero pipeline changes.

All work is built and tested on the **`vlado_facelift`** branch; CI only deploys from `main`,
so nothing touches production (lizetka.cz) until we flip the go-live switch.

---

## Phase 1 — Login (Auth) ✅ DONE & verified (2026-05-31)
"Login with GitHub" via an OAuth App + Cloudflare Worker `lizetka-auth` (which holds the
`client_secret` and does the code→token exchange). Token stored in the browser; identity
confirmed. Login once, no re-auth. Commit `93802d7` (local on `vlado_facelift`).

## Phase 2 — Read: access gate + browse posts ✅ DONE & verified (2026-05-31)
- After login, check the user's **repo Write access** (`GET /repos` → `permissions.push`);
  no rights → friendly "ask the admin for access" message.
- **List** existing posts and **open** one (read-only preview; editable form lands in Phase 3).
- Split the editor into ES modules: `app.js` (boot + OAuth + routing), `github.js` (API).
  Opening a post uses the Git **blobs** API (posts run up to 23 MB, past the contents-API cap).

## Phase 3 — Author: block editor + publish new posts ✅ DONE & verified (2026-05-31)
- Block-based form. Blocks: **Nadpis** (H1–H3) / **Text** / **Fotka** / **Zonerama link** /
  **PDF** / **YouTube** / the **✂️ Konec náhledu** divider. Each has ↑ ↓ ✕ controls.
- New modules: `image.js` (compress JPEG ≤1600px + PDF→base64), `blocks.js` (editable cards).
- Meta form: date (today by default), title, categories + authors (prefilled; author
  auto-checked to match the logged-in user).
- **Photo split** (matches production exactly): **Fotka** = full-size inline photo →
  `{type:'image', content:<base64>}`; **Zonerama link** = one cover + caption + album link →
  single-item `{type:'gallery', content:[{type:'image', src, title, link}]}`. (All 18 prod
  galleries are a single Zonerama cover, never a multi-photo grid.)
- Auto **image compress** + auto **clean slug** (diacritic-free, unique vs existing).
- **Per-block validation** on publish — refuses to publish an incomplete block (reports
  "Blok č. N: …") so nothing is silently dropped.
- Post list **sorted newest→oldest** by `meta.date` (read via cheap Range requests to
  raw.githubusercontent — filenames don't reflect order).
- **Publish** = one atomic commit (post JSON + any PDFs) via the Git Data API.

## Phase 4 — Edit, Undo & Go-Live
- Open an existing post, edit it, save over the same file.
- **Undo** the last publish.
- **Go live**: switch the OAuth callback to `https://lizetka.cz/editor/`, flip
  `CONFIG.branch` → `main`, first production deploy.

## Phase 5 — UI/UX polish (non-technical)
Visual design pass to match the site, drag-to-reorder, faithful live preview, friendlier copy.

---

### Key facts
- **Auth backend**: Cloudflare Worker `lizetka-auth` (free tier, Vlado's CF account) — holds the
  OAuth `client_secret`. One-time setup; see `auth-worker/README.md`.
- **Who can publish**: governed by GitHub **repo collaborator (Write)** permission — manage via
  repo *Settings → Collaborators* (needs owner/admin = kratoon). The 3 authors need no per-user
  secret; each just logs in + authorizes once.
- **Hosting**: the editor ships from the existing site (`docs/editor/`), riding the current
  GitHub Pages deploy — no separate host.
- **JSON contract** (consumer = `scripts/bin/write-posts.js`): `posts/<slug>.json` =
  `{ meta:{date,title,categories[],authors[]}, content:[blocks] }`; PDFs live in
  `docs/public/files/`.
