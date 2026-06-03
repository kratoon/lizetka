# Facelift — Design Pass Tracker

Working tracker for the visual polish of the **prod MkDocs site** (lizetka.cz) plus the
already-done editor polish. Lives on `vlado_facelift`; **delete before the PR** (working doc).
Preview: prod site `http://localhost:8001/` (auto-reload), editor `http://localhost:8000/editor/`.

Files in play: `mkdocs.yml`, `docs/stylesheets/extra.css`, `overrides/partials/post.html`,
`docs/index.md` / nav.

Legend: [ ] todo · [~] in progress · [x] done

---

## A. Fonts & headings (prod)
- [x] **A1 — Font** = **Baloo 2** (`theme.font.text`). Code font stays Roboto Mono.
- [x] **A2 — Heading hierarchy.** H2 teal `#2f6b6e`, semibold, `1.4em`; H3 black bold `1.15em`
      (H2 now clearly > H3). *Verify on `/2025/06/01/otabore/`, `/spoleklizetka/`.*
- [x] **A3 — Wrapping.** Hyphens removed (looked bad); body paragraphs **justified** (academic
      style); `overflow-wrap: break-word`; mobile body/heading sizes trimmed for Baloo 2.
- [x] **A4 — Title color unified.** Index excerpt titles were blue links, article title a gray H1.
      Now H1 = teal (matching H2) + excerpt heading links inherit → **teal title in both views**.

## B. Left sidebar (prod nav)
- [x] **B1 — Renamed** Kategorie → **Témata** (+ `archive_name: Archiv`).
- [x] **B2 — Sidebar entries** = **📰 Nejnovější** (frontpage/recent — index relabeled from
      "Táborové stránky") · 📅 Archiv · 🏷️ Témata. **"Lizetka" title hidden on desktop**
      (logo stays in the header); kept in the mobile drawer as the brand/close header.
- [x] **B3 — Section icons:** 📅 Archiv · 🏷️ Témata + 📰 frontpage (order-based selector).
- [x] **B4 — Per-topic icons** (nav only): ⛺ na táboře · 📖 o táboře · 📸 po táboře ·
      👪 informace pro rodiče · 🤝 spolková činnost. *(veto/swap any)*
- [x] **B5 — Desktop panel:** widened to `13.5rem` + right padding for breathing room; solid
      warm bg `#f7f5ee`, crisp border, roomier/bolder entries with hover. Mobile drawer untouched.
- [x] **B6 — Mobile arrows** on Archiv/Témata rotated to point **down** (were right).

## C. Post meta row (index excerpt — the header with the author avatar)
- [x] **C1 — Author avatar + GitHub name** stays as-is (liked).
- [x] **C2 — Even spacing** → killed Material's stray `·` separator; single centered `|`
      (`::before`, `.3rem` margins) → tight, even gaps on desktop + phone.
- [x] **C3 — Topic** → bold, not colored; **"v" prefix dropped**.
- [x] **C4 — Mobile 1-row (guaranteed):** show only the first topic AND drop the read-time on
      phones → date + topic only, always one line. Note: the separate in-page "Metadata" card
      (Material built-in, no avatar) still shows "v" — left as-is unless you want it matched.

## F. Zonerama gallery caption
- [x] **F1 — Caption** → bold, **always prefixed with 🖼️** (gallery icon) signalling the cover
      photo opens the Zonerama album.

## E. Responsive (desktop + mobile) — verify all of the above
- [ ] Desktop ≥1220px: sidebar border/tint, section + topic icons, headings, meta pipe.
- [ ] Mobile (narrow / drawer): drawer shows Archiv/Témata (no "Táborové stránky"); icons
      present; no sidebar border box; meta row wraps cleanly; Baloo 2 body size not too big.

## D. Editor polish (earlier, pending commit)
- [x] Teal accent, warm palette, beige footer
- [x] Default new-post block skeleton (Nadpis→Text→Zonerama→Konec náhledu); H2 default confirmed
- [x] Log → bigger header chip + dropdown panel

---

## G. Photos & PDF (the 2 big changes)
- [x] **G1 — Fotka sizing.** **Desktop = magazine banner** (full column width, center-crop via
      `object-fit: cover`, capped 32rem). **Mobile = whole photo** (no crop; width auto + caps
      preserve aspect ratio, capped 24rem). *(Vlado reviewing the desktop banner; the no-crop
      version is one toggle away.)* Gallery covers untouched (`:not([style])`).
- [x] **G2 — PDF icon** shrunk **4rem → 2.2rem** (CSS `!important` over the generated inline style).

## Open decisions
- ~~Font~~ → Baloo 2. ~~Topic icons~~ → set (veto anytime). ~~Sidebar label "Nejnovější"~~ → OK.
  ~~Mobile read-time dropped~~ → OK.
- **Desktop Fotka = magazine banner (crop)** — Vlado reviewing; revert to no-crop if disliked.

## Verify (per change)
- Prod: refresh `:8001` (auto-reloads); check a post page for headings + meta, and the left
  sidebar for names/icons/border. Editor: `:8000/editor/`.
- Before PR: revert generated build artifacts (`docs/posts/*.md`, `docs/public/build/images/`)
  and delete this file.
