// ────────────────────────────────────────────────────────────
// tiny PJAX router – keeps the chat widget & Klein journey alive
// plus per-URL scroll restoration so "Back to essays" returns to
// the exact card the user clicked from.
// ────────────────────────────────────────────────────────────

const container = document.getElementById("page-content");

// The Klein journey module is loaded dynamically from main.js so that
// blog / archive / post pages don't pay the Three.js bundle cost. When
// the router injects the journey's DOM after a PJAX navigation we need
// a handle to the same init, but via a dynamic import so the big chunk
// stays separated.
async function dynamicallyInitJourney(root) {
  try {
    // Low-power / no-WebGL devices get the lite variant.
    const webglOk = (() => {
      try {
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl2") || c.getContext("webgl"));
      } catch {
        return false;
      }
    })();
    const prefersReduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!webglOk || prefersReduce) {
      const { initKleinJourney } = await import(
        "./klein/klein-journey-lite.js"
      );
      initKleinJourney(root);
      return;
    }
    const { initKleinJourney } = await import("./klein/klein-journey.js");
    initKleinJourney(root);
  } catch (e) {
    console.error("[router] journey init failed", e);
  }
}

// Own scroll restoration; the default "auto" restoration fires before our
// PJAX content swap finishes and is useless.
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

// ────────────────────────────────────────────────────────────
// Breadcrumb stack
//
// We track the pages a visitor has navigated through within this
// session so that the "← Back" links on posts / media / archive
// actually take them to the referring page, not a hardcoded default.
//
// Stack semantics:
//   - push() before every user-initiated forward navigation
//   - pop() on popstate
//   - back-link handlers peek() and route to that URL
//
// Stored in sessionStorage so a full refresh keeps context.
// ────────────────────────────────────────────────────────────
const BREADCRUMB_KEY = "rw:breadcrumbs";
function loadCrumbs() {
  try {
    const raw = sessionStorage.getItem(BREADCRUMB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveCrumbs(arr) {
  try {
    sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(arr.slice(-32)));
  } catch {}
}
function pushCrumb(url) {
  const arr = loadCrumbs();
  // Don't record consecutive dupes.
  if (arr[arr.length - 1] === url) return;
  arr.push(url);
  saveCrumbs(arr);
}
function popCrumb() {
  const arr = loadCrumbs();
  const last = arr.pop();
  saveCrumbs(arr);
  return last || null;
}
function peekCrumb() {
  const arr = loadCrumbs();
  return arr[arr.length - 1] || null;
}
function normalizeUrlForCrumb(href) {
  try {
    const u = new URL(href, location.origin);
    if (u.origin !== location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

// Exported via a data attribute so static HTML can find it.
window.__rwPeekBack = () => peekCrumb();

// pathname (without hash) → last-known scrollY at that URL.
const scrollMap = new Map();

function scrollKey(urlOrPath) {
  try {
    const u = new URL(urlOrPath, location.origin);
    return u.pathname;
  } catch {
    return String(urlOrPath);
  }
}

function rememberScroll(url = location.href) {
  const y = window.scrollY;
  scrollMap.set(scrollKey(url), y);
  // Also stash on the current history entry so hard refresh / new tab
  // still have access. replaceState keeps the URL intact.
  try {
    const state = { ...(history.state || {}), scroll: y };
    history.replaceState(state, "", location.href);
  } catch {}
}

function getStoredScroll(url, historyState) {
  if (historyState && typeof historyState.scroll === "number") {
    return historyState.scroll;
  }
  const v = scrollMap.get(scrollKey(url));
  return typeof v === "number" ? v : null;
}

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
 * on the home page.
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

  dynamicallyInitJourney(clonedJourney);
}

/**
 * Core navigation. `push` = true → user-driven forward navigation;
 * `push` = false → popstate (back/forward button).
 *
 * Forward nav: saves the current page's scroll position, then either
 *   - restores a previously-saved scroll for the *destination* URL
 *     (so e.g. clicking "Back to essays" from a post lands on the
 *      card the user came from), or
 *   - if there's no saved position (first visit to that URL), scrolls
 *     to top.
 *
 * popstate: uses history.state.scroll if present, else the in-memory map.
 */
// While a PJAX navigation is in flight we suspend the throttled scroll
// listener below. Otherwise a scroll event fired by the innerHTML swap
// (document shrinks, browser clamps scrollY) races ahead of pushState
// and rewrites the OLD URL's stored scroll position to 0.
let _navInFlight = false;

async function navigate(url, { push = true, popstateState = null } = {}) {
  // Before swapping anything, capture the current page's scroll so that
  // returning here later lands where the user left.
  if (push) {
    rememberScroll(location.href);
    // Record the page we're leaving so "Back" can return to it.
    const crumb = normalizeUrlForCrumb(location.href);
    if (crumb) pushCrumb(crumb);
  } else {
    // popstate — pop the top of the stack so back-links stay in sync
    // with the browser's own back/forward traversal.
    popCrumb();
  }

  _navInFlight = true;

  const txt = await (await fetch(url)).text();
  const frag = document.createRange().createContextualFragment(txt);
  const next = frag.querySelector("#page-content");

  if (!next) {
    _navInFlight = false;
    location.href = url;
    return;
  }

  // Flip the URL BEFORE the DOM swap so any scroll events emitted by
  // the height change are attributed to the new URL, not the old one.
  if (push) {
    const initial = { scroll: null };
    history.pushState(initial, "", url);
  }

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

  const home = isHomePath(url);
  if (home) ensureKleinJourney(frag);
  showHomeOnly(home);

  // Decide where to land. Priority:
  //   1. A remembered scroll position for this URL — returning users
  //      should see exactly the card they left from.
  //   2. A hash in the destination URL — e.g. /#essays scrolls to the
  //      section anchor.
  //   3. Scroll-to-top as a last resort.
  const stateToUse = popstateState ?? history.state;
  const restoreY = getStoredScroll(url, stateToUse);

  let hashTarget = null;
  try {
    const u = new URL(url, location.origin);
    if (u.hash) hashTarget = u.hash;
  } catch {}

  // Fire pjax:navigated FIRST so listeners (archive.js) hydrate their
  // state from the URL / inflate the list, which may change document
  // height. Then restore scroll on the next frame so the target Y is
  // valid against the final layout.
  document.dispatchEvent(
    new CustomEvent("pjax:navigated", { detail: { url } })
  );

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof restoreY === "number") {
        window.scrollTo(0, restoreY);
      } else if (hashTarget) {
        const el = document.querySelector(hashTarget);
        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
        else window.scrollTo(0, 0);
      } else {
        window.scrollTo(0, 0);
      }
      _navInFlight = false;
    });
  });
}

function scrollToHash(hash) {
  if (!hash || hash === "#") return false;
  const el = document.querySelector(hash);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

// Domains that should receive UTM decoration on outbound clicks. These
// are sites where I want analytics to credit richardjdwang.com as the
// referring source (beyond the browser's Referer header, which only
// sends the origin under strict-origin-when-cross-origin).
const UTM_HOSTS = new Set([
  "cladlabs.ai",
  "www.cladlabs.ai",
  "useclad.ai",
  "www.useclad.ai",
]);

function decorateOutbound(a) {
  if (a.dataset.utmApplied === "1") return;
  const href = a.getAttribute("href");
  if (!href) return;
  let u;
  try {
    u = new URL(href, location.origin);
  } catch {
    return;
  }
  if (u.origin === location.origin) return;
  if (!UTM_HOSTS.has(u.hostname)) return;
  // Respect hand-set utm params; only fill in what's missing.
  if (!u.searchParams.has("utm_source"))
    u.searchParams.set("utm_source", "richardjdwang.com");
  if (!u.searchParams.has("utm_medium"))
    u.searchParams.set("utm_medium", "referral");
  if (!u.searchParams.has("utm_campaign"))
    u.searchParams.set("utm_campaign", "personal_site");
  a.href = u.toString();
  a.dataset.utmApplied = "1";
}

document.addEventListener(
  "pointerdown",
  (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (a) decorateOutbound(a);
  },
  true
);

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;

  // Outbound: decorate with UTM (covers links that ignored pointerdown,
  // e.g. keyboard activation).
  decorateOutbound(a);

  // Smart back-link: data-back-link anchors go to the previous page in
  // this session's breadcrumb stack when one exists, with the anchor's
  // own href as the fallback. Lets a single `<a data-back-link href="/">`
  // land the user wherever they actually came from.
  if (a.dataset.backLink != null) {
    e.preventDefault();
    const prev = peekCrumb();
    const dest = prev
      ? new URL(prev, location.origin).toString()
      : a.href;
    navigate(dest);
    return;
  }

  if (a.target === "_blank") return;

  // In-page anchors.
  if (
    a.origin === location.origin &&
    a.pathname === location.pathname &&
    a.hash
  ) {
    if (scrollToHash(a.hash)) {
      e.preventDefault();
      history.replaceState(
        { ...(history.state || {}), scroll: window.scrollY },
        "",
        a.hash
      );
    }
    return;
  }

  if (a.origin !== location.origin) return;

  // Clean routes Cloudflare Pages serves as HTML: `/`, `/writing`, and
  // any path ending in `.html` (posts). We treat anything that doesn't
  // have a file extension other than `.html` as navigable.
  const p = a.pathname;
  const navigable =
    p === "/" ||
    p.endsWith(".html") ||
    /^\/[a-zA-Z0-9\-_/]+$/.test(p); // no extension → pretty URL
  if (!navigable) return;

  e.preventDefault();
  navigate(a.href);
});

// Also persist the current scroll whenever the user might leave the page
// via means we don't control (browser reload, external tab, etc.).
window.addEventListener("beforeunload", () => rememberScroll());
// A throttled listener so the active entry's state is kept fresh for
// popstate (some browsers don't deliver scrollY inside popstate payload).
let scrollStoreTimer = 0;
window.addEventListener(
  "scroll",
  () => {
    // Do not record scroll during a PJAX transition — the document
    // height is changing and scrollY is transient.
    if (_navInFlight) return;
    clearTimeout(scrollStoreTimer);
    scrollStoreTimer = setTimeout(() => {
      if (_navInFlight) return;
      rememberScroll();
    }, 120);
  },
  { passive: true }
);

window.addEventListener("popstate", (ev) => {
  navigate(location.href, { push: false, popstateState: ev.state });
});

window.addEventListener("DOMContentLoaded", () => {
  const f = document.querySelector("footer");
  if (f) window.__globalFooterTemplate = f.cloneNode(true);
  showHomeOnly(isHomePath(location.href));

  // If we arrived with state (e.g. full refresh after we'd stashed
  // a scroll), try to honor it on first paint too.
  const s = history.state;
  if (s && typeof s.scroll === "number") {
    requestAnimationFrame(() => window.scrollTo(0, s.scroll));
  }
});
