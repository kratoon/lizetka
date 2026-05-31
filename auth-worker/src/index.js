// Lizetka editor — GitHub OAuth token exchange.
//
// The editor (a static page on lizetka.cz/editor/) cannot complete the GitHub
// OAuth flow on its own: GitHub's token endpoint requires the OAuth App's
// `client_secret` and refuses cross-origin browser requests (no CORS). This
// Worker is the only backend in the system. Its single job: take the temporary
// `code` from the browser, swap it for an access token using the secret (which
// lives only here), and hand the token back. Nothing is stored.

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

    const code = body?.code;
    if (!code) {
      return json({ error: "missing_code" }, 400, cors);
    }

    // Exchange the code for an access token. `redirect_uri` is forwarded so it
    // matches the value used in the /authorize step.
    const ghResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: body?.redirect_uri,
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
  },
};

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
