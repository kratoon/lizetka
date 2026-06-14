# Lizetka

The website for the **Lizetka summer camp**, published at **[lizetka.cz](https://lizetka.cz)**.

It's a static [MkDocs](https://www.mkdocs.org/) (Material theme) site. Blog posts are
stored as JSON in `posts/`, converted to Markdown by a build script, and deployed to
GitHub Pages automatically when changes land on `main`.

---

## Writing a blog post

Use the built-in editor — no Git, JSON, or command line needed:

### 👉 [lizetka.cz/editor/](https://lizetka.cz/editor/)

1. Click **“Login with GitHub”** and authorize once (see *Who can publish?* below).
2. Write your post: add Heading / Text / Photo / Zonerama link / PDF / YouTube blocks,
   pick a date, category, and author.
3. Click **Publish**. That's it — the post is committed and the site redeploys within
   a couple of minutes. Made a mistake? Use **“Undo last publish.”**

The editor handles everything behind the scenes: it resizes photos, writes the post
JSON to `posts/`, uploads any PDFs to `docs/public/files/`, and commits it all to `main`
in one step, attributed to you.

> The old `editor.lizetka.cz` is retired — use `lizetka.cz/editor/`.

### Who can publish?

There is **no separate password or invite list to manage in the editor.** Anyone can
log in with GitHub, but you can only publish if you have **Write access to the
[`kratoon/lizetka`](https://github.com/kratoon/lizetka) repository**. GitHub enforces
this itself — non-collaborators just see a friendly “no access” screen.

**To add a new author:** the repo owner (kratoon) adds their GitHub account under
**repo Settings → Collaborators**. They then log into the editor once and can publish.
Nothing else to set up.

---

## How the editor works (architecture)

The editor is a **static page** (`docs/editor/`) that talks directly to the GitHub API
from the browser. The only backend is one tiny **Cloudflare Worker** (`auth-worker/`)
whose sole job is the GitHub OAuth token exchange — the one step a static page can't do,
because it requires a secret the browser must never hold.

- 📊 **Visual walkthrough:** open [`auth-worker/oauth-flow.html`](auth-worker/oauth-flow.html)
  in a browser — it diagrams the whole login-to-publish flow, what the Worker does, and
  which rules GitHub enforces.
- 🔧 **Worker setup / one-time deploy:** see [`auth-worker/README.md`](auth-worker/README.md).

In short: **identity** comes from GitHub OAuth login; **authorization to publish** comes
from your repo collaborator permission, enforced by GitHub. The Worker holds the OAuth
secret and nothing else — it stores no data and decides nothing about access.

---

## Local development

### One-time setup

```bash
python3 -m venv venv
source venv/bin/activate
make install-mkdocs    # installs MkDocs + Material + plugins
npm install            # deps for the post-build script
```

### Build & preview the site

```bash
source venv/bin/activate
make build             # converts posts/*.json → docs/posts/*.md, then builds to site/
make serve             # serves the built site at http://localhost:8000
```

For live-reload while editing the theme/content, run `make write-posts` once, then
`python3 -m mkdocs serve` (Material's dev server with hot reload).

### Run the editor locally (for developers)

```bash
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000/editor/
```

The live editor is wired to `main` and the production OAuth callback. To test editor
changes locally without touching production, point `window.CONFIG.branch` (in
`docs/editor/index.html`) at a throwaway branch and temporarily set the GitHub OAuth
App's callback URL to `http://localhost:8000/editor/`.

---

## Deployment

Deployment is automatic. **Merging to `main`** triggers a GitHub Actions workflow that:

1. Runs `scripts/bin/write-posts.sh` → converts `posts/*.json` into MkDocs pages at
   `docs/posts/*.md` (and decodes inline images).
2. Builds the MkDocs site and deploys it to **lizetka.cz** (GitHub Pages).

Posts published through the editor commit straight to `main`, so they go live the same
way — no manual step.

## Repository layout

| Path | What it is |
|------|------------|
| `posts/*.json` | Source of truth for blog posts (the editor reads/writes these). |
| `docs/` | MkDocs site content, theme overrides, and the static editor (`docs/editor/`). |
| `docs/public/files/` | Uploaded PDFs and other static assets. |
| `auth-worker/` | The Cloudflare Worker for OAuth + its docs and flow diagram. |
| `scripts/` | The `posts/*.json` → `docs/posts/*.md` build script. |
| `mkdocs.yml`, `Makefile` | Site config and build/serve commands. |
