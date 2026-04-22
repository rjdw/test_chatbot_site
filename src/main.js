import "./chat/widget-loader.js";

// ────────────────────────────────────────────────────────────
// Home notes preview (populated from /content.json)
// ────────────────────────────────────────────────────────────

async function renderHomeNotes() {
  const host = document.getElementById("home-notes-list");
  if (!host) return;
  try {
    const res = await fetch("/content.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("content.json " + res.status);
    const data = await res.json();
    const notes = (data.notes || []).slice(0, 3);
    if (notes.length === 0) {
      host.innerHTML = `
        <li class="blog-entry is-draft">
          <div class="blog-entry-link">
            <span class="blog-entry-num">—</span>
            <div class="blog-entry-body">
              <h3 class="blog-entry-title">First notes on the way</h3>
              <p class="blog-entry-desc">Check back soon.</p>
            </div>
          </div>
        </li>`;
      return;
    }
    host.innerHTML = notes.map((n, i) => noteCard(n, i)).join("");
  } catch (e) {
    console.error("[home] notes load failed", e);
  }
}

function noteCard(n, i) {
  const num = String(i + 1).padStart(2, "0");
  const href = n.href || "#";
  const external = !!n.external;
  const arrow = external ? "↗" : "→";
  const attrs = external ? ' target="_blank" rel="noopener"' : "";
  const date = n.date
    ? new Date(n.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const tags = (n.tags || [])
    .map(
      (t) =>
        `<span class="blog-tag">${escapeHtml(t)}</span>`
    )
    .join("");
  return `
    <li class="blog-entry">
      <a class="blog-entry-link" href="${attr(href)}"${attrs}>
        <span class="blog-entry-num">${num}</span>
        <div class="blog-entry-body">
          <h3 class="blog-entry-title">${escapeHtml(n.title || "")}</h3>
          ${
            n.description
              ? `<p class="blog-entry-desc">${escapeHtml(n.description)}</p>`
              : ""
          }
          <div class="blog-entry-meta">
            ${date ? `<span>${date}</span>` : ""}
            ${tags}
          </div>
        </div>
        <span class="blog-entry-arrow" aria-hidden="true">${arrow}</span>
      </a>
    </li>`;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}
function attr(s) {
  return escapeHtml(s);
}

// ────────────────────────────────────────────────────────────
// Klein journey bootstrap with WebGL fallback + dynamic import
// ────────────────────────────────────────────────────────────

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function isLowPower() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  // Coarse heuristic: low device memory or very low hardware concurrency.
  const mem = navigator.deviceMemory || 8;
  const cpu = navigator.hardwareConcurrency || 8;
  if (mem && mem <= 1) return true;
  if (cpu && cpu <= 2) return true;
  return false;
}

function renderFallback(root) {
  const canvas = root.querySelector(".klein-canvas");
  if (canvas) canvas.remove();
  // Swap in a static visual: radial gradient + a large SVG infinity.
  const bg = document.createElement("div");
  bg.className = "klein-fallback";
  bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = `
    <svg class="klein-fallback-infinity" viewBox="-60 -20 120 40" aria-hidden="true">
      <defs>
        <linearGradient id="k-fg" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"  stop-color="#8fd2ff"/>
          <stop offset="55%" stop-color="#d5a0ff"/>
          <stop offset="100%" stop-color="#ffb194"/>
        </linearGradient>
      </defs>
      <path
        fill="none"
        stroke="url(#k-fg)"
        stroke-width="1.1"
        stroke-linecap="round"
        d="
          M -45 0
          C -45 -18, -15 -18, 0 0
          C 15 18, 45 18, 45 0
          C 45 -18, 15 -18, 0 0
          C -15 18, -45 18, -45 0 Z"
      />
    </svg>`;
  const stage = root.querySelector(".klein-stage");
  if (stage) stage.prepend(bg);
  root.classList.add("is-fallback");
}

async function bootKlein() {
  const root = document.getElementById("klein-journey");
  if (!root) return;

  if (!supportsWebGL() || isLowPower()) {
    renderFallback(root);
    // Still wire up chapter cross-fade + snap so scrolling works.
    try {
      const { initKleinJourney } = await import(
        /* webpackChunkName: "klein" */ "./klein/klein-journey-lite.js"
      );
      initKleinJourney(root);
    } catch {
      /* lite may not exist; non-fatal */
    }
    return;
  }

  try {
    const { initKleinJourney } = await import("./klein/klein-journey.js");
    initKleinJourney(root);
  } catch (err) {
    console.warn("[klein] WebGL journey failed to load, falling back", err);
    renderFallback(root);
  }
}

async function bootArchiveIfPresent() {
  const list = document.getElementById("archive-list");
  if (!list) return;
  try {
    const mod = await import("./archive.js");
    if (mod.init) mod.init();
  } catch (e) {
    console.error("[archive] init failed", e);
  }
}

function boot() {
  bootKlein();
  renderHomeNotes();
  bootArchiveIfPresent();
}

// Re-run the lightweight hooks after PJAX navigations too.
document.addEventListener("pjax:navigated", () => {
  renderHomeNotes();
  bootArchiveIfPresent();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
