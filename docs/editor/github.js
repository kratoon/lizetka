// github.js — thin wrapper around the GitHub REST API for the Lizetka editor.
// Reads CONFIG from window.CONFIG and the OAuth token from localStorage.
// Phase 2 (Read) surface: who-am-i, write-access gate, list posts, open a post.

const API = "https://api.github.com";
const TOKEN_KEY = "lizetka_gh_token";

// Single source of truth for the stored OAuth token. app.js writes it after the
// OAuth callback; everything here reads it.
export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function headers() {
  return {
    Authorization: "Bearer " + token.get(),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Throwing JSON GET for the happy paths (list/open). Surfaces status + body so
// app.js can log something useful.
async function api(path) {
  const res = await fetch(API + path, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

// Throwing JSON POST/PATCH for the write paths (blobs/trees/commits/refs).
async function apiSend(path, method, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} on ${method} ${path}: ${text}`);
  }
  return res.json();
}

// Validate a stored token by asking who we are. Returns null on a bad/expired
// token instead of throwing — the boot path uses this to decide login vs. clear.
export async function getUser() {
  const res = await fetch(API + "/user", { headers: headers() });
  if (!res.ok) return null;
  return res.json();
}

// The write-access gate: GET /repos returns a `permissions` block scoped to the
// authed user. push === true means they can commit (i.e. a repo collaborator).
export async function canPush() {
  const { repoOwner, repoName } = window.CONFIG;
  const repo = await api(`/repos/${repoOwner}/${repoName}`);
  return !!(repo.permissions && repo.permissions.push);
}

// List posts/*.json. The directory listing is cheap (no file contents), so the
// contents API is fine here — we only need each blob's name + sha.
export async function listPosts() {
  const { repoOwner, repoName, branch } = window.CONFIG;
  const items = await api(
    `/repos/${repoOwner}/${repoName}/contents/posts?ref=${branch}`
  );
  return items
    .filter((it) => it.type === "file" && it.name.endsWith(".json"))
    .map((it) => ({ name: it.name, sha: it.sha, path: it.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Open one post via the Git *blobs* API (NOT the contents API, which caps at
// 1 MB — real posts run 1–23 MB because images are inlined base64). The blob
// `content` is base64 of the raw UTF-8 bytes, wrapped at 60 chars. Returns the
// decoded UTF-8 string. Edit (Phase 4) keeps this raw text so an undo can
// restore the exact original bytes rather than a re-stringified approximation.
export async function getPostTextBySha(sha) {
  const { repoOwner, repoName } = window.CONFIG;
  const blob = await api(`/repos/${repoOwner}/${repoName}/git/blobs/${sha}`);
  const b64 = (blob.content || "").replace(/\n/g, "");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// The post's publish date (meta.date) lives at the very top of its JSON. Read
// only the first ~1 KB via a Range request to raw.githubusercontent.com — the
// repo is public, that host is CORS-enabled and supports ranges — so we can
// sort the list by date without pulling whole 1–23 MB files. Returns
// "YYYY-MM-DD" or null. (Filenames like "denctvrty" don't reflect order.)
export async function getPostDate(name) {
  const { repoOwner, repoName, branch } = window.CONFIG;
  const url =
    `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/posts/` +
    encodeURIComponent(name);
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    if (!res.ok && res.status !== 206) return null;
    const text = await res.text();
    const m = text.match(/"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Publish a set of files as ONE atomic commit via the Git Data API. Committing
// to the configured branch triggers existing CI (on `main` → deploys lizetka.cz).
//   files:     [{ path, content, encoding: 'utf-8' | 'base64' }]  (add or update)
//   deletions: [path]                                             (remove)
// Post JSON goes to posts/<slug>.json (utf-8); PDFs to docs/public/files/<name>
// (base64) — all in the same tree so the post and its attachments land together.
// Deletions (Phase 4 undo) drop a path via a tree entry with sha:null.
export async function publish({ files = [], deletions = [], message }) {
  const { repoOwner, repoName, branch } = window.CONFIG;
  const base = `/repos/${repoOwner}/${repoName}`;

  // 1. where the branch currently points
  const ref = await api(`${base}/git/ref/heads/${branch}`);
  const parentSha = ref.object.sha;
  // 2. its commit → the tree we build on top of
  const parentCommit = await api(`${base}/git/commits/${parentSha}`);
  const baseTree = parentCommit.tree.sha;

  // 3. one blob per file
  const tree = [];
  for (const f of files) {
    const blob = await apiSend(`${base}/git/blobs`, "POST", {
      content: f.content,
      encoding: f.encoding,
    });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  // 3b. removals: a tree entry with sha:null deletes the path from base_tree
  for (const path of deletions) {
    tree.push({ path, mode: "100644", type: "blob", sha: null });
  }
  // 4. a tree layered on the base
  const newTree = await apiSend(`${base}/git/trees`, "POST", {
    base_tree: baseTree,
    tree,
  });
  // 5. the commit (auto-attributed to the logged-in author via their token)
  const commit = await apiSend(`${base}/git/commits`, "POST", {
    message,
    tree: newTree.sha,
    parents: [parentSha],
  });
  // 6. fast-forward the branch
  await apiSend(`${base}/git/refs/heads/${branch}`, "PATCH", { sha: commit.sha });
  return commit;
}

// Filename-safe slug: strip Czech diacritics, lowercase, keep [a-z0-9] only.
// Matches the existing post-name style (e.g. "Tábor Blata" → "taborblata") and
// kills the "(1)" duplicate-download artifacts on PDF names.
export function slugify(s) {
  return (
    String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || "post"
  );
}
