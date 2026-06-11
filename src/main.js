// Defer the chat widget until the browser is idle post-first-paint.
// It pulls in marked + DOMPurify + axios + Tailwind-in-shadow-DOM, all
// non-critical. Loading it inline on main.js caused ~200 ms of JS parse
// on first load that was competing with first paint.
const loadChatWhenIdle = () => import("./chat/widget-loader.js");
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(loadChatWhenIdle, { timeout: 3000 });
} else {
  setTimeout(loadChatWhenIdle, 1500);
}

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
    return `https://i.ytimg.com/vi/${encodeURIComponent(m.videoId)}/hqdefault.jpg`;
  }
  return null;
}

function mediaThumbnailFallback(m) {
  if (m.source === "youtube" && m.videoId) {
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
  const fallback = mediaThumbnailFallback(m);
  const fallbackAttr =
    fallback && fallback !== thumb ? ` data-fallback="${attr(fallback)}"` : "";
  const thumbBlock = thumb
    ? `<span class="media-card-thumb" style="background-image:url('${attr(thumb)}')"${fallbackAttr}>
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
  const all = (data.media || [])
    .slice()
    .sort(
      (a, b) =>
        (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0)
    );
  // Pinning: any media entry with `featured: true` is promoted to the
  // hero slot. If multiple are featured, the most recent among them
  // wins (date-desc above already handles that). If none are featured,
  // fall back to the most recent overall.
  const featuredIdx = all.findIndex((m) => m.featured);
  let media;
  if (featuredIdx >= 0) {
    const hero = all[featuredIdx];
    const rest = all.filter((_, i) => i !== featuredIdx);
    media = [hero, ...rest].slice(0, 5);
  } else {
    media = all.slice(0, 5);
  }
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
  probeThumbnails(host);
}

// Probe any element whose background-image is author-set; if it 404s or
// returns YouTube's 120x90 missing-art placeholder, swap in data-fallback.
function probeThumbnails(root) {
  root.querySelectorAll("[data-fallback]").forEach((el) => {
    const match = (el.style.backgroundImage || "").match(
      /url\(['"]?([^'")]+)['"]?\)/
    );
    if (!match) return;
    const primary = match[1];
    const fallback = el.dataset.fallback;
    if (!primary || !fallback || primary === fallback) return;
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth <= 120) {
        el.style.backgroundImage = `url('${fallback}')`;
      }
    };
    probe.onerror = () => {
      el.style.backgroundImage = `url('${fallback}')`;
    };
    probe.src = primary;
  });
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

async function bootMediaIfPresent() {
  if (!document.querySelector(".media-embed")) return;
  try {
    const mod = await import("./media-player.js");
    if (mod.init) mod.init();
  } catch (e) {
    console.error("[media] init failed", e);
  }
}

// Label the "← Back" link based on where the breadcrumb stack will take
// the user. Runs on every page paint.
function relabelBackLinks() {
  const prev = (window.__rwPeekBack && window.__rwPeekBack()) || null;
  document.querySelectorAll("a.post-back[data-back-link]").forEach((a) => {
    const label = (() => {
      if (!prev) {
        const fb = a.dataset.backFallback || "/";
        if (fb.startsWith("/#media")) return "← Back";
        if (fb.startsWith("/#essays") || fb === "/") return "← Back home";
        return "← Back";
      }
      try {
        const u = new URL(prev, location.origin);
        const p = u.pathname;
        if (p === "/" || p === "/index.html") return "← Back home";
        if (p.startsWith("/writing")) return "← Back to archive";
        if (p.startsWith("/posts/")) return "← Back to essay";
        if (p.startsWith("/media/")) return "← Back to media";
      } catch {}
      return "← Back";
    })();
    a.textContent = label;
  });
}

function boot() {
  renderHomeEssays();
  renderHomeMedia();
  renderHomeNotes();
  bootArchiveIfPresent();
  bootMediaIfPresent();
  relabelBackLinks();
}

// Re-run the lightweight hooks after PJAX navigations too.
document.addEventListener("pjax:navigated", () => {
  _contentCache = null; // allow fresh data on nav
  renderHomeEssays();
  renderHomeMedia();
  renderHomeNotes();
  bootArchiveIfPresent();
  bootMediaIfPresent();
  relabelBackLinks();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
