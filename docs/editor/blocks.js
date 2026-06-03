// blocks.js — editable block cards for the authoring form (Phase 3).
//
// Each block type is built by a factory that returns a DOM card. Every card
// carries two methods the publisher calls at save time:
//   card._read()  -> the JSON block object for `content[]`, or null to skip it
//   card._files() -> extra files to commit (PDFs); [] for everything else
//
// JSON contract (consumer = scripts/bin/write-posts.js), matching production:
//   heading   { type:'h1'|'h2'|'h3', content }
//   paragraph { type:'paragraph', content }
//   image     { type:'image', content:<base64> }   // "Fotka" — full-size inline
//   gallery   { type:'gallery', content:[ {type:'image', src, title?, link} ] }
//                                                   // "Cover fotka → Zonerama":
//                                                   // ONE cover + caption + link out
//   file      { type:'file', content:'<name>.pdf' } // bytes -> docs/public/files/
//   youtube   { type:'youtube', content:'<url|id>' }
//   comment   { type:'comment', content:'more' }   // the preview cutoff divider
//
// Why the split: the consumer renders an `image` with only `content` at full
// size, but renders a `gallery` cover at thumbnail size *with its title* and a
// click-through link. All 18 production galleries are a single cover photo +
// album caption + Zonerama link — never a multi-photo grid — so that's exactly
// what the Zonerama block emits.

import { compressImage, fileToBase64, base64Bytes } from "./image.js";
import { slugify } from "./github.js";

const PDF_DIR = "docs/public/files/";

// Human labels for the "Add block" menu, in display order.
export const BLOCK_TYPES = [
  { key: "heading", label: "Nadpis" },
  { key: "paragraph", label: "Text" },
  { key: "image", label: "Fotka" },
  { key: "zonerama", label: "Zonerama link" },
  { key: "file", label: "PDF" },
  { key: "youtube", label: "YouTube" },
  { key: "more", label: "✂️ Konec náhledu" },
];

// --- small DOM helpers ----------------------------------------------------
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  (Array.isArray(children) ? children : [children]).forEach((c) =>
    node.append(c?.nodeType ? c : document.createTextNode(String(c)))
  );
  return node;
}
const kb = (bytes) => Math.round(bytes / 1024) + " KB";

// Wrap type-specific body in a card with a header (title + ↑ ↓ ✕ controls).
function card(title, body) {
  const wrap = el("div", { className: "block-card" });
  const head = el("div", { className: "block-head" }, [
    el("strong", {}, title),
  ]);
  const controls = el("div", { className: "block-controls" });
  const up = el("button", { className: "secondary", title: "Nahoru", textContent: "↑" });
  const down = el("button", { className: "secondary", title: "Dolů", textContent: "↓" });
  const del = el("button", { className: "secondary", title: "Smazat", textContent: "✕" });
  up.onclick = () => wrap.previousElementSibling?.before(wrap);
  down.onclick = () => wrap.nextElementSibling?.after(wrap);
  del.onclick = () => wrap.remove();
  controls.append(up, down, del);
  head.append(controls);
  wrap.append(head, body);
  return wrap;
}

// --- block factories ------------------------------------------------------
function headingBlock(data = {}) {
  const level = el("select", { className: "heading-level" });
  // h4 is offered too so an edited post's h4 round-trips (write-posts.js renders
  // it); new posts realistically only use h1–h3 but the extra option is harmless.
  ["h1", "h2", "h3", "h4"].forEach((h) =>
    level.append(el("option", { value: h, textContent: h.toUpperCase() }))
  );
  level.value = ["h1", "h2", "h3", "h4"].includes(data.type) ? data.type : "h2";
  const text = el("input", { type: "text", placeholder: "Nadpis…", value: data.content || "" });
  const body = el("div", { className: "block-body heading-body" }, [level, text]);
  const wrap = card("Nadpis", body);
  wrap._read = () =>
    text.value.trim() ? { type: level.value, content: text.value.trim() } : null;
  wrap._files = () => [];
  wrap._validate = () =>
    text.value.trim() ? null : "Nadpis je prázdný. Doplň text, nebo blok smaž.";
  return wrap;
}

function paragraphBlock(data = {}) {
  const ta = el("textarea", { rows: 4, placeholder: "Text odstavce…", value: data.content || "" });
  const wrap = card("Text", el("div", { className: "block-body" }, ta));
  wrap._read = () => (ta.value.trim() ? { type: "paragraph", content: ta.value.trim() } : null);
  wrap._files = () => [];
  wrap._validate = () =>
    ta.value.trim() ? null : "Text je prázdný. Doplň text, nebo blok smaž.";
  return wrap;
}

// "Fotka" — a plain, full-size inline photo. Emits `image` with `content` (the
// shape every production Fotka uses), which the consumer renders at full size.
// Still compressed (JPEG ≤1600px) to keep posts from ballooning to tens of MB.
function imageBlock(data = {}) {
  let img = data.content || data.src || "";
  const preview = el("img", { className: "thumb", alt: "" });
  const info = el("span", { className: "muted" });
  const file = el("input", { type: "file", accept: "image/*" });

  function paint() {
    if (img) {
      preview.src = img;
      preview.classList.remove("hidden");
      info.textContent = "~" + kb(base64Bytes(img));
    } else {
      preview.classList.add("hidden");
      info.textContent = "";
    }
  }
  file.onchange = async () => {
    if (!file.files[0]) return;
    info.textContent = "Zpracovávám…";
    img = await compressImage(file.files[0]);
    paint();
  };
  paint();

  const body = el("div", { className: "block-body" }, [
    el("div", { className: "row" }, [file, info]),
    preview,
  ]);
  const wrap = card("Fotka", body);
  wrap._read = () => (img ? { type: "image", content: img } : null);
  wrap._files = () => [];
  wrap._validate = () =>
    img ? null : "Fotka nemá nahranou žádnou fotku. Nahraj fotku, nebo blok smaž.";
  return wrap;
}

// "Cover fotka → Zonerama" — one cover photo + album caption + a link out to the
// Zonerama album. Emits the single-item `gallery` shape so the site shows the
// caption above the cover and makes the cover click through to Zonerama.
// On edit, reads the existing gallery's first (and only) cover item.
function zoneramaBlock(data = {}) {
  const item = (data.content && data.content[0]) || data;
  let cover = item.src || item.content || "";
  const preview = el("img", { className: "thumb", alt: "" });
  const info = el("span", { className: "muted" });
  const file = el("input", { type: "file", accept: "image/*" });
  const caption = el("input", { type: "text", placeholder: "Název alba / popisek", value: item.title || "" });
  const link = el("input", {
    type: "url",
    placeholder: "Odkaz na Zonerama album (https://eu.zonerama.com/…)",
    value: item.link || "",
  });

  function paint() {
    if (cover) {
      preview.src = cover;
      preview.classList.remove("hidden");
      info.textContent = "~" + kb(base64Bytes(cover));
    } else {
      preview.classList.add("hidden");
      info.textContent = "";
    }
  }
  file.onchange = async () => {
    if (!file.files[0]) return;
    info.textContent = "Zpracovávám…";
    cover = await compressImage(file.files[0]);
    paint();
  };
  paint();

  const body = el("div", { className: "block-body" }, [
    el("div", { className: "row" }, [
      el("span", { className: "muted" }, "Náhledová fotka (povinné): "),
      file,
      info,
    ]),
    preview,
    caption,
    link,
  ]);
  const wrap = card("Zonerama link", body);
  wrap._read = () => {
    if (!cover) return null;
    const coverItem = { type: "image", src: cover };
    if (caption.value.trim()) coverItem.title = caption.value.trim();
    if (link.value.trim()) coverItem.link = link.value.trim();
    return { type: "gallery", content: [coverItem] };
  };
  wrap._files = () => [];
  // The cover photo is what the site renders and makes clickable, and the link
  // is the whole point — require both (matches all 18 production galleries).
  wrap._validate = () => {
    if (!cover) return "Zonerama link nemá náhledovou fotku. Nahraj fotku, nebo blok smaž.";
    if (!link.value.trim()) return "Zonerama link nemá vyplněný odkaz na album.";
    return null;
  };
  return wrap;
}

function pdfBlock(data = {}) {
  // On edit, data.content is just the existing filename (bytes already in repo).
  let filename = data.content || "";
  let base64 = null; // set only when a new PDF is picked this session
  const info = el("span", { className: "muted" }, filename || "");
  const file = el("input", { type: "file", accept: "application/pdf" });

  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    const dot = f.name.lastIndexOf(".");
    const stem = dot > 0 ? f.name.slice(0, dot) : f.name;
    filename = slugify(stem) + ".pdf";
    info.textContent = "Zpracovávám…";
    base64 = await fileToBase64(f);
    info.textContent = `${filename} (~${kb((base64.length * 3) / 4)})`;
  };

  const body = el("div", { className: "block-body" }, [el("div", { className: "row" }, [file, info])]);
  const wrap = card("PDF", body);
  wrap._read = () => (filename ? { type: "file", content: filename } : null);
  wrap._files = () =>
    base64 ? [{ path: PDF_DIR + filename, content: base64, encoding: "base64" }] : [];
  wrap._validate = () =>
    filename ? null : "PDF blok nemá nahraný žádný soubor. Nahraj PDF, nebo blok smaž.";
  return wrap;
}

function youtubeBlock(data = {}) {
  const input = el("input", {
    type: "text",
    placeholder: "YouTube URL nebo ID videa",
    value: data.content || "",
  });
  const wrap = card("YouTube", el("div", { className: "block-body" }, input));
  wrap._read = () => (input.value.trim() ? { type: "youtube", content: input.value.trim() } : null);
  wrap._files = () => [];
  wrap._validate = () =>
    input.value.trim() ? null : "YouTube blok nemá vyplněné video. Vlož odkaz nebo ID, nebo blok smaž.";
  return wrap;
}

function moreBlock() {
  const body = el("div", { className: "block-body muted" }, "Vše nad tímto řádkem se ukáže jako úryvek na blogu; zbytek až po rozkliknutí.");
  const wrap = card("✂️ Konec náhledu", body);
  wrap._read = () => ({ type: "comment", content: "more" });
  wrap._files = () => [];
  return wrap;
}

// Safety net for editing: any block type the editor has no UI for (a future
// `video`, a multi-photo gallery, a non-"more" comment, …) is shown as a
// read-only card and re-emitted byte-for-byte on save, so opening a post to edit
// can never silently drop content. No production post needs this today — pure
// insurance for the "never drop a block" rule (which bit us once already).
function passthroughBlock(block) {
  const body = el(
    "div",
    { className: "block-body muted" },
    `Tento blok (typ "${block.type}") editor neumí upravit, ale zůstane v příspěvku beze změny.`
  );
  const wrap = card("⚠️ Neznámý blok (zachován beze změny)", body);
  wrap._read = () => block;
  wrap._files = () => [];
  wrap._validate = () => null;
  return wrap;
}

const FACTORIES = {
  heading: headingBlock,
  paragraph: paragraphBlock,
  image: imageBlock,
  zonerama: zoneramaBlock,
  file: pdfBlock,
  youtube: youtubeBlock,
  more: moreBlock,
};

// Create a fresh empty block of a menu type ("heading", "image", …).
export function createBlock(typeKey) {
  return (FACTORIES[typeKey] || paragraphBlock)();
}

// Rebuild a card from an existing JSON block (used by Phase 4 edit). Maps the
// stored `type` back to a factory; headings (h1/h2/h3) share one factory.
export function blockFromJSON(block) {
  if (!block || !block.type) return null;
  if (["h1", "h2", "h3", "h4"].includes(block.type)) return headingBlock(block);
  // Only the "more" cutoff has an editable card; any other comment falls through
  // to the passthrough so it survives the edit untouched.
  if (block.type === "comment" && block.content === "more") return moreBlock();
  // Existing posts' `gallery` blocks open in the Zonerama cover block.
  const map = { paragraph: paragraphBlock, image: imageBlock, gallery: zoneramaBlock, file: pdfBlock, youtube: youtubeBlock };
  const factory = map[block.type];
  // Unknown/unsupported types are preserved verbatim rather than dropped.
  return factory ? factory(block) : passthroughBlock(block);
}
