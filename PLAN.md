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

## Phase 2 — Read: access gate + browse posts
- After login, check the user's **repo Write access** (`GET /repos` → `permissions.push`);
  no rights → friendly "ask the admin for access" message.
- **List** existing posts and **open** one (load it into the editor view).
- Split the editor into ES modules for maintainability.

## Phase 3 — Author: block editor + publish new posts
- Block-based form for every block type: heading / text / photo / gallery / PDF / YouTube /
  the `✂️ preview-ends-here` divider.
- Meta form: date, title, categories + authors (prefilled from real values).
- Auto **image resize/compress** before base64; auto **clean slug** filenames.
- **Save/Publish** a brand-new post as **one atomic commit** (post JSON + any PDFs together).

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
