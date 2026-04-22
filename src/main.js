import "./chat/widget-loader.js";

// ────────────────────────────────────────────────────────────
// Home notes preview (populated from /content.json)
// ────────────────────────────────────────────────────────────

let _contentCache = null;
async function loadContent() {
  if (_contentCache) return _contentCache;
  try {
    const res = await fetch("/content.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("content.json " + res.status);
    _contentCache = await res.json();
  } catch (e) {
    console.error("[content] load failed", e);
    _contentCache = { essays: [], notes: [], drafts: [] };
  }
  return _contentCache;
}

async function renderHomeEssays() {
  const host = document.getElementById("home-essays-list");
  if (!host) return;
  const data = await loadContent();
  const essays = (data.essays || [])
    .slice()
    .sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0));
  const featured = essays.filter((e) => e.featured);
  const pick = (featured.length >= 4 ? featured : essays).slice(0, 4);
  host.innerHTML = pick.map((e, i) => entryCard(e, i)).join("");
}

function mediaSlug(m) {
  return (
    m.slug ||
    (m.id || m.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

function mediaThumbnail(m) {
  if (m.thumbnail) return m.thumbnail;
  if (m.source === "youtube" && m.videoId) {
    // hqdefault is the most reliable YouTube fallback — maxresdefault
    // 404s for videos that weren't uploaded at >=1280x720.
    return `https://i.ytimg.com/vi/${encodeURIComponent(m.videoId)}/hqdefault.jpg`;
  }
  return null;
}

function mediaKindLabel(m) {
  return (
    { video: "Video", podcast: "Podcast", talk: "Talk" }[m.kind] || "Media"
  );
}

function mediaCardHtml(m, { variant = "grid" } = {}) {
  const slug = mediaSlug(m);
  const href = slug ? `/media/${slug}` : "#";
  const thumb = mediaThumbnail(m);
  const date = m.date
    ? new Date(m.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const tags = (m.tags || [])
    .slice(0, 2)
    .map((t) => `<span class="blog-tag">${escapeHtml(t)}</span>`)
    .join("");
  const meta = [
    `<span class="media-card-kind">${mediaKindLabel(m)}</span>`,
    m.venue ? `<span>${escapeHtml(m.venue)}</span>` : "",
    date ? `<span>·</span><span>${date}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const thumbBlock = thumb
    ? `<span class="media-card-thumb" style="background-image:url('${attr(thumb)}')">
         <span class="media-card-play" aria-hidden="true">
           <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="rgba(11,13,24,0.72)"/><path d="M19 15 L19 33 L33 24 Z" fill="#fff"/></svg>
         </span>
       </span>`
    : `<span class="media-card-thumb media-card-thumb--empty"></span>`;
  return `
    <li class="media-card media-card--${variant}">
      <a class="media-card-link" href="${attr(href)}">
        ${thumbBlock}
        <span class="media-card-body">
          <span class="media-card-meta">${meta}</span>
          <span class="media-card-title">${escapeHtml(m.title || "")}</span>
          ${m.description ? `<span class="media-card-desc">${escapeHtml(m.description)}</span>` : ""}
          ${tags ? `<span class="media-card-tags">${tags}</span>` : ""}
        </span>
      </a>
    </li>`;
}

async function renderHomeMedia() {
  const host = document.getElementById("home-media-list");
  if (!host) return;
  const data = await loadContent();
  const media = (data.media || [])
    .slice()
    .sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0))
    .slice(0, 5);
  if (media.length === 0) {
    host.innerHTML = `
      <li class="media-card media-card--empty">
        <div class="media-card-body">
          <span class="media-card-title">First media appearance coming soon</span>
          <span class="media-card-desc">Videos, talks, and podcasts will show up here.</span>
        </div>
      </li>`;
    host.className = "media-grid media-grid--empty";
    return;
  }
  host.className = media.length === 1 ? "media-grid media-grid--single" : "media-grid";
  const [hero, ...rest] = media;
  host.innerHTML =
    mediaCardHtml(hero, { variant: "hero" }) +
    rest.map((m) => mediaCardHtml(m, { variant: "grid" })).join("");
}

async function renderHomeNotes() {
  const host = document.getElementById("home-notes-list");
  if (!host) return;
  const data = await loadContent();
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
  host.innerHTML = notes.map((n, i) => entryCard(n, i)).join("");
}

function entryCard(it, i) {
  const num = String(i + 1).padStart(2, "0");
  const href = it.href || "#";
  const external = !!it.external;
  const arrow = external ? "↗" : "→";
  const attrs = external ? ' target="_blank" rel="noopener"' : "";
  const date = it.date
    ? new Date(it.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const readTime = it.readTime
    ? `<span>·</span><span>${escapeHtml(it.readTime)}</span>`
    : "";
  const tags = (it.tags || [])
    .slice(0, 2)
    .map((t) => `<span class="blog-tag">${escapeHtml(t)}</span>`)
    .join("");
  return `
    <li class="blog-entry">
      <a class="blog-entry-link" href="${attr(href)}"${attrs}>
        <span class="blog-entry-num">${num}</span>
        <div class="blog-entry-body">
          <h3 class="blog-entry-title">${escapeHtml(it.title || "")}</h3>
          ${
            it.description
              ? `<p class="blog-entry-desc">${escapeHtml(it.description)}</p>`
              : ""
          }
          <div class="blog-entry-meta">
            ${date ? `<span>${date}</span>` : ""}
            ${readTime}
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
  renderHomeEssays();
  renderHomeMedia();
  renderHomeNotes();
  bootArchiveIfPresent();
}

// Re-run the lightweight hooks after PJAX navigations too.
document.addEventListener("pjax:navigated", () => {
  _contentCache = null; // allow fresh data on nav
  renderHomeEssays();
  renderHomeMedia();
  renderHomeNotes();
  bootArchiveIfPresent();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
