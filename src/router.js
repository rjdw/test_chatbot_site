// ────────────────────────────────────────────────────────────
// tiny PJAX router – keeps the chat widget & Klein journey alive
// ────────────────────────────────────────────────────────────

import { initKleinJourney } from "./klein/klein-journey.js";

const container = document.getElementById("page-content");

function isHomePath(url) {
  try {
    const u = new URL(url, location.origin);
    return u.pathname === "/" || u.pathname === "/index.html";
  } catch {
    return false;
  }
}

function showHomeOnly(show) {
  document.querySelectorAll(".home-only").forEach((el) => {
    el.style.display = show ? "" : "none";
  });
  document.documentElement.classList.toggle("is-home", show);
  document.documentElement.classList.toggle("is-post", !show);
}

/**
 * Ensure the Klein journey markup exists at the top of <body> when we are
 * on the home page. If it's missing (e.g. the user first landed on a
 * post page and then navigated to `/`), clone the elements from the
 * fetched home document and insert them.
 */
function ensureKleinJourney(frag) {
  if (document.getElementById("klein-journey")) return;
  if (!frag) return;

  const journey = frag.getElementById
    ? frag.getElementById("klein-journey")
    : frag.querySelector("#klein-journey");
  const tail = frag.querySelector(".klein-tail");

  if (!journey) return;

  const body = document.body;
  const mainEl = document.querySelector("main#page-content");

  const clonedJourney = journey.cloneNode(true);
  clonedJourney.dataset.kleinInitialized = "";
  const clonedTail = tail ? tail.cloneNode(true) : null;

  if (mainEl) {
    body.insertBefore(clonedJourney, mainEl);
    if (clonedTail) body.insertBefore(clonedTail, mainEl);
  } else {
    body.prepend(clonedJourney);
    if (clonedTail) clonedJourney.after(clonedTail);
  }

  initKleinJourney(clonedJourney);
}

async function navigate(url, push = true) {
  const txt = await (await fetch(url)).text();
  const frag = document.createRange().createContextualFragment(txt);
  const next = frag.querySelector("#page-content");

  if (!next) {
    location.href = url;
    return;
  }

  // Sync the wrapper class too — home uses `.blog-surface`, posts use
  // an unclassed main holding an `.post-page` article. Without this
  // the layout wouldn't change between the two.
  container.className = next.className || "";
  container.innerHTML = next.innerHTML;
  document.title = frag.querySelector("title")?.textContent ?? document.title;

  const curFooter = document.querySelector("footer");
  const newFooter = frag.querySelector("footer");

  if (newFooter) {
    curFooter ? curFooter.replaceWith(newFooter) : container.after(newFooter);
  } else if (!newFooter && !curFooter && window.__globalFooterTemplate) {
    container.after(window.__globalFooterTemplate.cloneNode(true));
  }

  if (push) history.pushState(null, "", url);

  const home = isHomePath(url);
  if (home) ensureKleinJourney(frag);
  showHomeOnly(home);

  window.scrollTo(0, 0);
}

function scrollToHash(hash) {
  if (!hash || hash === "#") return false;
  const el = document.querySelector(hash);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank") return;

  // In-page anchors (e.g. top-right Essays / FAQ nav) must explicitly
  // scroll — the default browser jump misses when the target sits past
  // a 620vh sticky section with scroll-driven sub-sections.
  if (a.origin === location.origin && a.pathname === location.pathname && a.hash) {
    if (scrollToHash(a.hash)) {
      e.preventDefault();
      history.replaceState(null, "", a.hash);
    }
    return;
  }

  if (
    a.origin !== location.origin ||
    !a.pathname.endsWith(".html")
  )
    return;

  e.preventDefault();
  navigate(a.href);
});

window.addEventListener("popstate", () => navigate(location.href, false));

window.addEventListener("DOMContentLoaded", () => {
  const f = document.querySelector("footer");
  if (f) window.__globalFooterTemplate = f.cloneNode(true);
  showHomeOnly(isHomePath(location.href));
});
