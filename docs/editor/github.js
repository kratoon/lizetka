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
// `content` is base64 of the raw UTF-8 bytes, wrapped at 60 chars.
export async function getPostBySha(sha) {
  const { repoOwner, repoName } = window.CONFIG;
  const blob = await api(`/repos/${repoOwner}/${repoName}/git/blobs/${sha}`);
  const b64 = (blob.content || "").replace(/\n/g, "");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const text = new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(text);
}
