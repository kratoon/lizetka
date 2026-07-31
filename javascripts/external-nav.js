// Open external sidebar links (e.g. the Zonerama photo galleries under
// Fotogalerie) in a new tab. Links on lizetka.cz — including Kontakt — keep
// their default same-tab behaviour.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.md-nav__link[href^="http"]').forEach((a) => {
    if (!a.hostname.endsWith("lizetka.cz")) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  });
});
