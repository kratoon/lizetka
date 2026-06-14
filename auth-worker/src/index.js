// Lizetka editor — GitHub OAuth token exchange + revocation.
//
// The editor (a static page on lizetka.cz/editor/) cannot call the GitHub OAuth
// endpoints that need the OAuth App's `client_secret`: they require it and
// refuse cross-origin browser requests (no CORS). This Worker is the only
// backend in the system, and the secret lives only here. It does two things:
//   • Log in  — swap the temporary `code` for an access token.
//   • Log out — revoke that token on GitHub so it's dead everywhere (kill switch).
// Nothing is stored.

// Origins allowed to call this Worker. Add new ones if the editor moves.
const ALLOWED_ORIGINS = [
  "https://lizetka.cz",
  "https://www.lizetka.cz",
  "http://localhost:8000", // local dev: `python3 -m http.server 8000 --directory docs`
  "http://127.0.0.1:8000",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, cors);
    }

    // Two jobs, told apart by the body:
    //   { code }         → log in:  swap the OAuth code for an access token.
    //   { access_token } → log out: revoke that token on GitHub (kill switch).
    if (body?.access_token) {
      return revokeToken(body.access_token, env, cors);
    }
    if (body?.code) {
      return exchangeCode(body, env, cors);
    }
    return json({ error: "missing_code" }, 400, cors);
  },
};

// Log in: swap the temporary OAuth `code` for an access token. GitHub's token
// endpoint requires the client_secret, so a browser can't do this itself.
async function exchangeCode(body, env, cors) {
  // `redirect_uri` is forwarded so it matches the value used in the /authorize step.
  const ghResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: body.code,
      redirect_uri: body.redirect_uri,
    }),
  });

  const data = await ghResponse.json();
  if (data.error) {
    return json(
      { error: data.error, error_description: data.error_description },
      400,
      cors,
    );
  }

  // Return only what the browser needs — never echo the secret.
  return json(
    {
      access_token: data.access_token,
      token_type: data.token_type,
      scope: data.scope,
    },
    200,
    cors,
  );
}

// Log out: revoke a token on GitHub so it can never be used again — even a
// leaked copy, since revocation is server-side. GitHub's "Delete an app token"
// endpoint is authenticated with the OAuth App's client_id:client_secret
// (Basic auth), so it too must run here, never in the browser.
async function revokeToken(accessToken, env, cors) {
  const ghResponse = await fetch(
    `https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`,
    {
      method: "DELETE",
      headers: {
        Authorization:
          "Basic " + btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`),
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "lizetka-auth", // api.github.com rejects requests without one
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );

  // 204 = revoked, 404 = already gone — either way the token is dead, so the
  // editor can treat logout as complete.
  if (ghResponse.status === 204 || ghResponse.status === 404) {
    return json({ revoked: true }, 200, cors);
  }
  return json({ error: "revoke_failed", status: ghResponse.status }, 502, cors);
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
