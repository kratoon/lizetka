# Lizetka editor — auth Worker

The only backend in the editor system. It exchanges a GitHub OAuth `code` for an
access token, keeping the OAuth App's `client_secret` server-side. See
`src/index.js` for the (tiny) logic.

This is a **one-time setup**. Once done, nobody touches it again.

## 1. Register a GitHub OAuth App

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

- **Application name:** `Lizetka editor` (anything)
- **Homepage URL:** `https://lizetka.cz/editor/`
- **Authorization callback URL:** for development use
  `http://localhost:8000/editor/` — we'll switch this to
  `https://lizetka.cz/editor/` when the editor goes live.

Click **Register**, then:
- Copy the **Client ID**.
- Click **Generate a new client secret** and copy it (shown only once).

> An OAuth App allows a single callback URL. During development register the
> `localhost` one; change it to the production URL (or create a second
> "Lizetka editor (prod)" app) when we deploy.

## 2. Deploy the Worker to Cloudflare

Needs a free Cloudflare account. From this folder:

```bash
cd auth-worker
npx wrangler login                       # opens browser, one time
# put the Client ID into wrangler.toml -> [vars].GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret when prompted
npx wrangler deploy
```

`deploy` prints the Worker URL, e.g. `https://lizetka-auth.<your-subdomain>.workers.dev`.

## 3. Wire the editor

Open `docs/editor/index.html` and fill the `CONFIG` block at the top:

- `clientId`  → the OAuth App **Client ID**
- `workerUrl` → the Worker URL from step 2

That's it — open the editor and click **Login with GitHub**.

## Going live later

- Change the OAuth App's callback URL to `https://lizetka.cz/editor/`.
- (Optional) the Worker already allows the `lizetka.cz` origin in
  `ALLOWED_ORIGINS`, so no Worker change is needed.
