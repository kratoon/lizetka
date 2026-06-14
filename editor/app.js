// app.js — boot, OAuth handshake, and view routing for the Lizetka editor.
// Phase 1 (login) logic is relocated here verbatim; Phase 2 adds the write-access
// gate, the post list, and a read-only post preview.

import {
  token,
  getUser,
  canPush,
  listPosts,
  listRecentCommits,
  getPostTextBySha,
  getPostDate,
  publish,
  slugify,
} from "./github.js";
import { createBlock, blockFromJSON, BLOCK_TYPES } from "./blocks.js";

const CONFIG = window.CONFIG;
const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; };

// Real values for the meta form (see new-post-editor-plan memory).
const CATEGORIES = [
  "na táboře",
  "informace pro rodiče",
  "o táboře",
  "po táboře",
  "spolková činnost",
];
const AUTHORS = [
  { key: "hlinkavl", name: "Vladimír Hlinka" },
  { key: "alzhli", name: "Alžběta Hlinková" },
  { key: "kratoon", name: "Ondrej Kratochvil" },
];

// Default block skeleton for a NEW post — Vlado's usual shape: Nadpis (H2) →
// Text → Zonerama link → ✂️ Konec náhledu. Pre-filled so the common case is one
// edit away; blocks can be added, removed, or reordered from here.
const DEFAULT_NEW_POST_BLOCKS = ["heading", "paragraph", "zonerama", "more"];

// Filled during boot / list load; used by the editor (author prefill, slug uniqueness).
let currentUser = null;
let currentPosts = [];

// Edit state. `editing` is null for a brand-new post, or { path } when editing
// an existing file (path = keep the same filename when saving).
let editing = null;
// The post currently open in the read-only preview + its file info, so the
// "Upravit" / "Odstranit" buttons can act on it.
let openedPost = null;
let openedFile = null;
// The exact post title the user must retype to confirm a delete.
let deleteExpected = "";

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
const VIEWS = ["view-login", "view-noAccess", "view-posts", "view-post", "view-editor"];
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
    `<button class="logout-btn" id="logoutBtn">🔒 Odhlásit a odvolat přístup</button></span>`;
  $("logoutBtn").onclick = logout;
}

// Log out = revoke the access token on GitHub (via the Worker) so it's dead
// everywhere — even a leaked copy — then forget it locally. Best-effort: if the
// revoke call can't reach GitHub we still log out locally rather than trapping
// the user in a half-logged-in state.
async function logout() {
  const t = token.get();
  // Build the confirmation the login screen will show after the reload below.
  // A line in the log panel isn't enough — the reload wipes it, so it only
  // flashes. This notice survives the reload (sessionStorage) and is rendered
  // by showLoggedOut(), so the user actually sees that they logged out safely.
  let notice = "Byl jsi odhlášen.";
  if (t) {
    try {
      const res = await fetch(CONFIG.workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: t }),
      });
      if (res.ok) {
        log("🔒 Přístupový token byl odvolán na GitHubu.");
        notice = "✅ Byl jsi odhlášen a přístupový token byl odvolán na GitHubu.";
      } else {
        log("⚠️ Odvolání tokenu vrátilo " + res.status + " — odhlašuji aspoň lokálně.");
        notice = "Byl jsi odhlášen. Token se ale nepodařilo odvolat na serveru (stav " + res.status + ").";
      }
    } catch (e) {
      log("⚠️ Nepodařilo se spojit s Workerem kvůli odvolání tokenu — odhlašuji lokálně: " + e.message);
      notice = "Byl jsi odhlášen lokálně. Server pro odvolání tokenu byl nedostupný.";
    }
  }
  try { sessionStorage.setItem("logout_notice", notice); } catch {}
  token.clear();
  location.reload();
}

function showLoggedOut() {
  $("account").innerHTML = "";
  // Show the post-logout confirmation set by logout() before it reloaded, then
  // consume it so it doesn't reappear on later reloads.
  const notice = sessionStorage.getItem("logout_notice");
  if (notice) {
    sessionStorage.removeItem("logout_notice");
    const el = $("logoutNotice");
    el.textContent = notice;
    el.classList.remove("hidden");
  }
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
  renderRecentActivity();

  const list = $("postList");
  list.innerHTML = `<div class="card muted">Načítám…</div>`;
  try {
    const posts = await listPosts();
    currentPosts = posts;
    if (!posts.length) {
      list.innerHTML = `<div class="card muted">Zatím žádné příspěvky.</div>`;
      return;
    }
    // Read each post's meta.date (cheap Range request) and sort newest → oldest;
    // filenames don't reflect chronology so we order by the real publish date.
    // A just-published post whose date isn't cached yet sorts to the top.
    await Promise.all(posts.map(async (p) => { p.date = await getPostDate(p.name); }));
    posts.sort(
      (a, b) =>
        (b.date || "9999-99-99").localeCompare(a.date || "9999-99-99") ||
        a.name.localeCompare(b.name)
    );
    log(`Loaded ${posts.length} posts (newest first).`);

    list.innerHTML = "";
    posts.forEach((p) => {
      const el = document.createElement("div");
      el.className = "card post-item";
      const left = document.createElement("span");
      const date = document.createElement("span");
      date.className = "post-date muted";
      date.textContent = p.date || "—";
      const nm = document.createElement("span");
      nm.textContent = " " + p.name;
      left.append(date, nm);
      const btn = document.createElement("button");
      btn.textContent = "Otevřít";
      btn.onclick = () => openPost(p);
      el.append(left, btn);
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
  $("editPostBtn").disabled = true;
  $("deletePostBtn").disabled = true;
  closeDeleteConfirm();
  openedPost = null;
  openedFile = null;
  try {
    const text = await getPostTextBySha(p.sha);
    const post = JSON.parse(text);
    openedPost = post;
    openedFile = { path: p.path, name: p.name };
    renderPost(post);
    $("editPostBtn").disabled = false;
    $("deletePostBtn").disabled = false;
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
    case "gallery": {
      const cover = (b.content || [])[0] || {};
      return "🔗 Zonerama link: " + clip(cover.title || "(bez popisku)", 60) + (cover.link ? ` → ${cover.link}` : "");
    }
    case "youtube": return "▶️ YouTube: " + clip(b.content, 80);
    case "file": return "📎 soubor: " + clip(b.content, 80);
    case "comment":
      return b.content === "more"
        ? "✂️ Konec náhledu (preview ends here)"
        : "💬 " + clip(b.content);
    default: return `[${b.type}] ` + clip(b.content);
  }
}

// ---- editor: new post (Phase 3) -----------------------------------------
function buildToolbar() {
  const bar = $("addBlockBar");
  bar.innerHTML = "";
  BLOCK_TYPES.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = "➕ " + t.label;
    btn.onclick = () => $("blocksContainer").append(createBlock(t.key));
    bar.append(btn);
  });
}

// Build the category + author checkbox grids. With no `prefill` (new post) the
// only thing pre-checked is the author matching the logged-in user. With a
// `prefill` (editing) the post's own categories/authors are checked instead —
// and any value not in the predefined lists is preserved as an extra checked box
// so editing never silently drops a category or author.
function buildMetaForm(prefill = null) {
  const cats = $("metaCategories");
  cats.innerHTML = "";
  const knownCats = new Set(CATEGORIES);
  CATEGORIES.forEach((c) => {
    const box = checkbox("cat_" + slugify(c), c, c);
    if (prefill && prefill.categories?.includes(c)) box.querySelector("input").checked = true;
    cats.append(box);
  });
  (prefill?.categories || [])
    .filter((c) => !knownCats.has(c))
    .forEach((c) => {
      const box = checkbox("cat_extra_" + slugify(c), c, c + " (vlastní)");
      box.querySelector("input").checked = true;
      cats.append(box);
    });

  const auth = $("metaAuthors");
  auth.innerHTML = "";
  const knownAuthors = new Set(AUTHORS.map((a) => a.key));
  AUTHORS.forEach((a) => {
    const box = checkbox("auth_" + a.key, a.key, a.name);
    const input = box.querySelector("input");
    if (prefill) {
      if (prefill.authors?.includes(a.key)) input.checked = true;
    } else if (currentUser && currentUser.login === a.key) {
      // New post: pre-check the author whose GitHub login matches the user.
      input.checked = true;
    }
    auth.append(box);
  });
  (prefill?.authors || [])
    .filter((k) => !knownAuthors.has(k))
    .forEach((k) => {
      const box = checkbox("auth_extra_" + slugify(k), k, k + " (vlastní)");
      box.querySelector("input").checked = true;
      auth.append(box);
    });
}

function checkbox(id, value, label) {
  const wrap = document.createElement("label");
  wrap.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.value = value;
  wrap.append(input, document.createTextNode(" " + label));
  return wrap;
}

function checkedValues(containerId) {
  return [...$(containerId).querySelectorAll("input:checked")].map((i) => i.value);
}

// New post: empty form, today's date, author defaulted to the logged-in user.
function openEditor() {
  editing = null;
  buildToolbar();
  buildMetaForm();
  $("editorTitle").textContent = "Nový příspěvek";
  $("metaDate").value = new Date().toISOString().slice(0, 10);
  $("metaTitle").value = "";
  const container = $("blocksContainer");
  container.innerHTML = "";
  DEFAULT_NEW_POST_BLOCKS.forEach((k) => container.append(createBlock(k)));
  $("publishStatus").textContent = "";
  $("publishBtn").disabled = false;
  show("view-editor");
}

// Edit an existing post: load its meta + blocks into the same form. The file is
// saved back over its original path (filename unchanged) on publish.
function editPost() {
  if (!openedPost || !openedFile) return;
  editing = { path: openedFile.path };
  const m = openedPost.meta || {};
  buildToolbar();
  buildMetaForm({ categories: m.categories || [], authors: m.authors || [] });
  $("editorTitle").textContent = "Upravit příspěvek";
  $("metaDate").value = m.date || "";
  $("metaTitle").value = m.title || "";
  const container = $("blocksContainer");
  container.innerHTML = "";
  (openedPost.content || []).forEach((b) => {
    const card = blockFromJSON(b);
    if (card) container.append(card);
  });
  $("publishStatus").textContent = "";
  $("publishBtn").disabled = false;
  show("view-editor");
}

// Pick a filename slug that doesn't collide with an existing post.
function uniqueSlug(base) {
  const taken = new Set(currentPosts.map((p) => p.name.replace(/\.json$/, "")));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

async function publishPost() {
  const title = $("metaTitle").value.trim();
  const date = $("metaDate").value;
  if (!title) return setStatus("⚠️ Doplň název příspěvku.");
  if (!date) return setStatus("⚠️ Vyber datum.");

  // Per-block validation — catch incomplete blocks here (empty heading/text,
  // a photo/PDF/YouTube with nothing chosen, a Zonerama link without its cover
  // or album link) so nothing is ever silently dropped on publish. Report which
  // block (1-based) so the user can find it.
  const blocks = [...$("blocksContainer").children];
  for (let i = 0; i < blocks.length; i++) {
    const err = blocks[i]._validate?.();
    if (err) return setStatus(`⚠️ Blok č. ${i + 1}: ${err}`);
  }

  // Collect blocks (skipping empty ones) and any attached PDF files.
  const content = [];
  const extraFiles = [];
  for (const cardEl of $("blocksContainer").children) {
    const block = cardEl._read?.();
    if (block) content.push(block);
    if (cardEl._files) extraFiles.push(...cardEl._files());
  }
  if (!content.length) return setStatus("⚠️ Přidej aspoň jeden blok obsahu.");

  const post = {
    meta: {
      date,
      title,
      categories: checkedValues("metaCategories"),
      authors: checkedValues("metaAuthors"),
    },
    content,
  };

  // Editing keeps the original filename; a new post mints a unique slug.
  const path = editing ? editing.path : `posts/${uniqueSlug(slugify(title))}.json`;
  const name = path.replace(/^posts\//, "");
  const files = [
    { path, content: JSON.stringify(post, null, 4), encoding: "utf-8" },
    ...extraFiles,
  ];

  $("publishBtn").disabled = true;
  setStatus(`Publikuji ${name}${extraFiles.length ? ` + ${extraFiles.length} PDF` : ""}…`);
  try {
    const message = editing ? `Edit post: ${title}` : `Add post: ${title}`;
    const commit = await publish({ files, message });
    log(`✅ Published ${name} as ${commit.sha.slice(0, 7)} (${files.length} file(s)).`);
    setStatus(`✅ Hotovo! Příspěvek "${title}" je publikován (commit ${commit.sha.slice(0, 7)}).`);
    editing = null;
    await loadPosts();
  } catch (e) {
    log("❌ publish: " + e.message);
    setStatus("❌ Publikace selhala — detaily v „Technickém logu\" dole.");
    $("publishBtn").disabled = false;
  }
}

// ---- recent activity ----------------------------------------------------
// The last few commits on the branch (replaces the old undo card). Read-only:
// a quick "what changed lately" feed above the post list. Non-critical — if the
// fetch fails we just skip the panel rather than blocking the list.
async function renderRecentActivity() {
  const area = $("recentActivity");
  area.innerHTML = "";
  let commits;
  try {
    commits = await listRecentCommits(3);
  } catch (e) {
    log("ℹ️ Nepodařilo se načíst poslední změny: " + e.message);
    return;
  }
  if (!commits.length) return;

  const card = document.createElement("div");
  card.className = "card";
  const h = document.createElement("h3");
  h.textContent = "Poslední změny";
  h.style.margin = "0 0 .6rem";
  card.append(h);

  commits.forEach((c) => {
    const row = document.createElement("div");
    row.className = "activity-row";
    const msg = document.createElement("a");
    msg.href = c.url;
    msg.target = "_blank";
    msg.rel = "noopener";
    msg.textContent = c.message;
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = ` — ${c.author}${c.date ? ", " + relativeTime(c.date) : ""}`;
    row.append(msg, meta);
    card.append(row);
  });
  area.append(card);
}

// Rough Czech relative time for the activity feed ("před 2 h", "včera", date).
function relativeTime(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "právě teď";
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "včera";
  if (d < 30) return `před ${d} dny`;
  return new Date(iso).toLocaleDateString("cs-CZ");
}

// ---- delete a post ------------------------------------------------------
// Guarded by a type-the-exact-title confirmation (no password — repo Write
// access is the real gate, and a delete is just a commit, recoverable from
// GitHub history). Removes the post's JSON in one commit; any attached PDFs are
// left in place (harmless — the build regenerates from the remaining posts).
function openDeleteConfirm() {
  if (!openedPost || !openedFile) return;
  deleteExpected = (openedPost.meta?.title || openedFile.name || "").trim();
  $("deleteConfirmTitle").textContent = `„${deleteExpected}"`;
  $("deleteConfirmInput").value = "";
  $("deleteConfirmBtn").disabled = true;
  $("deleteStatus").textContent = "";
  $("deleteConfirm").classList.remove("hidden");
  $("deleteConfirmInput").focus();
}

function closeDeleteConfirm() {
  $("deleteConfirm").classList.add("hidden");
}

// Enable the delete button only when the typed title matches exactly.
function onDeleteInput() {
  $("deleteConfirmBtn").disabled =
    $("deleteConfirmInput").value.trim() !== deleteExpected;
}

async function doDeletePost() {
  if (!openedFile) return;
  const title = deleteExpected;
  $("deleteConfirmBtn").disabled = true;
  $("deleteCancelBtn").disabled = true;
  $("deleteStatus").textContent = "Odstraňuji…";
  try {
    const commit = await publish({
      deletions: [openedFile.path],
      message: `Delete post: ${title}`,
    });
    log(`🗑️ Smazán ${openedFile.name} jako ${commit.sha.slice(0, 7)}.`);
    $("deleteCancelBtn").disabled = false;
    closeDeleteConfirm();
    show("view-posts");
    await loadPosts();
  } catch (e) {
    log("❌ delete: " + e.message);
    $("deleteStatus").textContent =
      "❌ Odstranění selhalo — detaily v „Technickém logu\" dole.";
    $("deleteCancelBtn").disabled = false;
    // The confirm button stays disabled; the input handler re-enables it on a valid retype.
  }
}

function setStatus(msg) {
  $("publishStatus").textContent = msg;
}

// ---- boot ---------------------------------------------------------------
async function start() {
  // Static buttons (present in the DOM from the start).
  $("backBtn").onclick = () => show("view-posts");
  $("refreshBtn").onclick = loadPosts;
  $("newPostBtn").onclick = openEditor;
  $("editPostBtn").onclick = editPost;
  $("deletePostBtn").onclick = openDeleteConfirm;
  $("deleteCancelBtn").onclick = closeDeleteConfirm;
  $("deleteConfirmBtn").onclick = doDeletePost;
  $("deleteConfirmInput").oninput = onDeleteInput;
  $("cancelEditBtn").onclick = () => show("view-posts");
  $("publishBtn").onclick = publishPost;

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
  currentUser = user;
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
