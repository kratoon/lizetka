// app.js — boot, OAuth handshake, and view routing for the Lizetka editor.
// Phase 1 (login) logic is relocated here verbatim; Phase 2 adds the write-access
// gate, the post list, and a read-only post preview.

import { token, getUser, canPush, listPosts, getPostBySha } from "./github.js";

const CONFIG = window.CONFIG;
const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; };

// The editor's own URL, used as the OAuth redirect target. Register this exact
// value as the OAuth App's "Authorization callback URL".
const redirectUri =
  location.origin + location.pathname.replace(/index\.html$/, "");

function configReady() {
  return (
    !CONFIG.clientId.startsWith("REPLACE_") &&
    !CONFIG.workerUrl.startsWith("REPLACE_")
  );
}

// ---- view routing -------------------------------------------------------
const VIEWS = ["view-login", "view-noAccess", "view-posts", "view-post"];
function show(view) {
  VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== view));
}

// ---- OAuth: step 1 — send the user to GitHub ----------------------------
function login() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", CONFIG.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", CONFIG.scope);
  url.searchParams.set("state", state);
  location.href = url.toString();
}

// ---- OAuth: step 2 — handle the ?code= callback -------------------------
async function handleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return false;

  // Clean the code/state out of the URL right away.
  history.replaceState({}, "", redirectUri);

  if (state !== sessionStorage.getItem("oauth_state")) {
    log("⚠️ State mismatch — ignoring callback (possible CSRF).");
    return false;
  }
  log("Exchanging code for a token via the Worker…");

  const res = await fetch(CONFIG.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  const data = await res.json();
  if (data.error || !data.access_token) {
    log("❌ Token exchange failed: " + JSON.stringify(data));
    return false;
  }
  token.set(data.access_token);
  log("✅ Token received (scope: " + data.scope + ").");
  return true;
}

// ---- account header (shown across all logged-in views) ------------------
function renderAccount(user) {
  $("account").innerHTML =
    `<span class="user"><img src="${user.avatar_url}" alt="">` +
    `<span>${user.login}</span> ` +
    `<button class="secondary" id="logoutBtn">Odhlásit</button></span>`;
  $("logoutBtn").onclick = logout;
}

function logout() {
  token.clear();
  location.reload();
}

function showLoggedOut() {
  $("account").innerHTML = "";
  if (!configReady()) {
    $("loginBtn").disabled = true;
    $("configWarning").classList.remove("hidden");
    $("configWarning").innerHTML =
      "⚙️ Nejdřív vyplň <code>CONFIG.clientId</code> a <code>CONFIG.workerUrl</code> " +
      "v <code>docs/editor/index.html</code>.";
  }
  $("loginBtn").onclick = login;
  show("view-login");
}

// ---- post list ----------------------------------------------------------
async function loadPosts() {
  show("view-posts");
  $("postsRepo").textContent = CONFIG.repoOwner + "/" + CONFIG.repoName;
  $("postsBranch").textContent = CONFIG.branch;

  const list = $("postList");
  list.innerHTML = `<div class="card muted">Načítám…</div>`;
  try {
    const posts = await listPosts();
    log(`Loaded ${posts.length} posts.`);
    if (!posts.length) {
      list.innerHTML = `<div class="card muted">Zatím žádné příspěvky.</div>`;
      return;
    }
    list.innerHTML = "";
    posts.forEach((p) => {
      const el = document.createElement("div");
      el.className = "card post-item";
      const name = document.createElement("span");
      name.textContent = p.name;
      const btn = document.createElement("button");
      btn.textContent = "Otevřít";
      btn.onclick = () => openPost(p);
      el.append(name, btn);
      list.append(el);
    });
  } catch (e) {
    list.innerHTML = `<div class="card">❌ Nepodařilo se načíst příspěvky.</div>`;
    log("❌ listPosts: " + e.message);
  }
}

// ---- single post (read-only preview, Phase 2) ---------------------------
async function openPost(p) {
  show("view-post");
  $("postTitle").textContent = p.name;
  $("postMeta").textContent = "Načítám…";
  $("postBlocks").innerHTML = "";
  try {
    const post = await getPostBySha(p.sha);
    renderPost(post);
    log(`Opened ${p.name} (${post.content?.length ?? 0} blocks).`);
  } catch (e) {
    $("postMeta").textContent = "❌ Nepodařilo se otevřít příspěvek.";
    log("❌ openPost: " + e.message);
  }
}

function renderPost(post) {
  const m = post.meta || {};
  $("postTitle").textContent = m.title || "(bez názvu)";
  $("postMeta").textContent = [
    m.date,
    (m.categories || []).join(", "),
    "✍️ " + (m.authors || []).join(", "),
  ]
    .filter(Boolean)
    .join("  ·  ");

  const wrap = $("postBlocks");
  wrap.innerHTML = "";
  (post.content || []).forEach((b) => {
    const row = document.createElement("div");
    row.className = "block-row";
    row.textContent = blockSummary(b);
    wrap.append(row);
  });
}

// Barebones one-line summary per block — proves the decode/parse path. The real
// editable rendering arrives in Phase 3 (blocks.js).
function blockSummary(b) {
  const clip = (s, n = 120) => {
    s = String(s ?? "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  };
  switch (b.type) {
    case "h1": return "H1  " + clip(b.content);
    case "h2": return "H2  " + clip(b.content);
    case "h3": return "H3  " + clip(b.content);
    case "h4": return "H4  " + clip(b.content);
    case "paragraph": return "¶  " + clip(b.content);
    case "image": {
      const src = b.src ?? b.content ?? "";
      const kb = Math.round((src.length * 0.75) / 1024);
      return `🖼️ obrázek (~${kb} KB)` + (b.link ? ` 🔗 ${b.link}` : "");
    }
    case "gallery": return `🖼️ galerie (${(b.content || []).length} fotek)`;
    case "youtube": return "▶️ YouTube: " + clip(b.content, 80);
    case "file": return "📎 soubor: " + clip(b.content, 80);
    case "comment":
      return b.content === "more"
        ? "✂️ Konec náhledu (preview ends here)"
        : "💬 " + clip(b.content);
    default: return `[${b.type}] ` + clip(b.content);
  }
}

// ---- boot ---------------------------------------------------------------
async function start() {
  // Static buttons (present in the DOM from the start).
  $("backBtn").onclick = () => show("view-posts");
  $("refreshBtn").onclick = loadPosts;

  log("Callback URL to register on GitHub: " + redirectUri);
  if (!configReady()) {
    log("⚙️ CONFIG not filled in yet — see auth-worker/README.md.");
  }

  try {
    await handleCallback();
  } catch (e) {
    log("❌ Callback error: " + e.message);
  }

  if (!token.get()) return showLoggedOut();

  const user = await getUser();
  if (!user) {
    log("Stored token is invalid — clearing.");
    token.clear();
    return showLoggedOut();
  }
  log("Logged in as " + user.login + ".");
  renderAccount(user);

  // Write-access gate: only repo collaborators (push===true) can publish.
  let push = false;
  try {
    push = await canPush();
  } catch (e) {
    log("❌ Could not check access: " + e.message);
  }

  if (!push) {
    $("noAccessUser").textContent = user.login;
    $("noAccessRepo").textContent = CONFIG.repoOwner + "/" + CONFIG.repoName;
    return show("view-noAccess");
  }

  await loadPosts();
}

start();
