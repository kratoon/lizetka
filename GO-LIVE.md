# Go-live checklist — rewiring after the facelift merges to `main`

This branch was developed against the **`vlado_facelift`** branch and **`localhost`**.
Once it merges to `main` and `lizetka.cz` redeploys, three things must be flipped
from their dev values to their prod values. Until they are, the public **site** is
fine, but the **editor** (`lizetka.cz/editor/`) won't work end to end.

## 1. Point the editor at `main` (required)

`docs/editor/index.html` → `window.CONFIG`:

```diff
-      branch: "vlado_facelift",   // dev target; switch to "main" to go live
+      branch: "main",
```

This is the single source of truth for which branch the editor reads from and
publishes to (`github.js` derives everything from `CONFIG.branch`). **Until this
is flipped, published posts get committed to the dead `vlado_facelift` branch and
never deploy.** Commit the change to `main`.

## 2. Update the GitHub OAuth App callback URL (required)

GitHub → **Settings → Developer settings → OAuth Apps → "Lizetka editor"**:

```diff
- Authorization callback URL:  http://localhost:8000/editor/
+ Authorization callback URL:  https://lizetka.cz/editor/
```

An OAuth App allows only one callback URL, so this is a straight swap (no second
app needed). Until it's changed, **"Login with GitHub" from the live editor fails**
the redirect back.

## 3. Confirm the Cloudflare Worker is live (one-time)

The token-exchange Worker (`auth-worker/`) must be deployed with its secret set:

```bash
cd auth-worker
npx wrangler deploy                            # if not already deployed
npx wrangler secret put GITHUB_CLIENT_SECRET   # if the secret was never set
```

The editor already points at `https://lizetka-auth.lizetka.workers.dev`
(`CONFIG.workerUrl`). If that URL responds, this step is already done — skip it.

## Already prod-ready — no change needed

- **Worker CORS** — `ALLOWED_ORIGINS` in `auth-worker/src/index.js` already lists
  `https://lizetka.cz` and `https://www.lizetka.cz`.
- **`clientId`, `workerUrl`, `repoOwner`, `repoName`** in `CONFIG` already hold
  their production values.

## Optional cleanup

- **Old `editor.lizetka.cz`** — if that subdomain still exists, redirect its DNS
  to `https://lizetka.cz/editor/` (or retire it). The new editor replaces it.

## Verify after rewiring

1. Open `https://lizetka.cz/editor/` → **Login with GitHub** (redirect succeeds).
2. The posts list loads and shows `kratoon/lizetka @ main`.
3. Publish a throwaway draft → confirm the commit lands on `main` and CI deploys.
4. Undo it (the editor's "undo last publish") to clean up.
