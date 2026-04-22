// Live search + filter for the writing archive.

const state = {
  items: [],
  query: "",
  kind: "all",
  tags: new Set(),
  bound: false,
};

export async function init() {
  const root = document.getElementById("archive-list");
  if (!root) return;
  // Elements are swapped on PJAX, so always (re)bind to the current DOM.
  const content = await loadContent();
  state.items = normalize(content);
  state.query = "";
  state.kind = "all";
  state.tags = new Set();
  const search = document.getElementById("archive-search-input");
  if (search) search.value = "";

  renderTagFilters();
  bindControls();
  render();
}

// First-page load: run immediately.
init();

async function loadContent() {
  try {
    const res = await fetch("/content.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return await res.json();
  } catch (e) {
    console.error("[archive] content.json load failed", e);
    return { essays: [], notes: [], drafts: [] };
  }
}

function normalize({ essays = [], notes = [], drafts = [], media = [] }) {
  const items = [];
  for (const e of essays) {
    items.push({ ...e, kind: "essay" });
  }
  for (const n of notes) {
    items.push({ ...n, kind: "note" });
  }
  for (const m of media) {
    const slug =
      m.slug ||
      (m.id || m.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    items.push({
      ...m,
      kind: "media",
      href: m.href || (slug ? `/media/${slug}` : null),
      external: false,
    });
  }
  for (const d of drafts) {
    items.push({
      ...d,
      kind: "draft",
      href: null,
      external: false,
      isDraft: true,
    });
  }
  // Sort by date desc; drafts (no date) sink to the end.
  items.sort((a, b) => {
    const ad = a.date ? Date.parse(a.date) : 0;
    const bd = b.date ? Date.parse(b.date) : 0;
    return bd - ad;
  });
  return items;
}

function allTags() {
  const set = new Map(); // tag -> count
  for (const it of state.items) {
    (it.tags || []).forEach((t) => set.set(t, (set.get(t) || 0) + 1));
  }
  return Array.from(set.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

function renderTagFilters() {
  const host = document.getElementById("archive-tags");
  if (!host) return;
  const tags = allTags();
  host.innerHTML = "";
  for (const { tag, count } of tags) {
    const btn = document.createElement("button");
    btn.className = "archive-tag-chip";
    btn.type = "button";
    btn.dataset.tag = tag;
    btn.innerHTML = `${escapeHtml(tag)} <span class="archive-tag-count">${count}</span>`;
    btn.addEventListener("click", () => {
      if (state.tags.has(tag)) state.tags.delete(tag);
      else state.tags.add(tag);
      btn.classList.toggle("is-active", state.tags.has(tag));
      render();
    });
    host.appendChild(btn);
  }
}

function bindControls() {
  const search = document.getElementById("archive-search-input");
  if (search) {
    search.addEventListener("input", () => {
      state.query = search.value.trim().toLowerCase();
      render();
    });
  }
  document.querySelectorAll(".archive-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".archive-tab")
        .forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      state.kind = tab.dataset.filter || "all";
      render();
    });
  });
}

function matches(item) {
  if (state.kind !== "all" && item.kind !== state.kind) return false;
  if (state.tags.size > 0) {
    const itags = new Set(item.tags || []);
    for (const t of state.tags) {
      if (!itags.has(t)) return false;
    }
  }
  if (state.query) {
    const hay = [item.title, item.description, ...(item.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}

function render() {
  const list = document.getElementById("archive-list");
  const empty = document.getElementById("archive-empty");
  const count = document.getElementById("archive-count");
  const active = document.getElementById("archive-active-filters");
  if (!list) return;

  const visible = state.items.filter(matches);
  list.innerHTML = "";

  visible.forEach((it, i) => {
    list.appendChild(renderItem(it, i));
  });

  if (count) {
    count.textContent =
      visible.length === 1
        ? "1 piece"
        : `${visible.length} pieces`;
  }
  if (active) {
    const parts = [];
    if (state.kind !== "all") parts.push(state.kind + "s");
    if (state.tags.size > 0)
      parts.push("tagged " + Array.from(state.tags).join(" + "));
    if (state.query) parts.push(`“${state.query}”`);
    active.textContent =
      parts.length === 0 ? "Showing everything" : "Filtered by " + parts.join(" · ");
  }
  if (empty) empty.hidden = visible.length > 0;
}

function renderItem(it, index) {
  const li = document.createElement("li");
  li.className = "blog-entry" + (it.isDraft ? " is-draft" : "");
  const num = String(index + 1).padStart(2, "0");

  const isLink = Boolean(it.href);
  const tag = isLink ? "a" : "div";
  const arrow = !isLink ? "" : it.external ? "↗" : "→";

  const extraAttr = isLink
    ? it.external
      ? ` href="${attr(it.href)}" target="_blank" rel="noopener"`
      : ` href="${attr(it.href)}"`
    : "";

  const meta = [];
  if (it.date) meta.push(`<span>${formatDate(it.date)}</span>`);
  if (it.readTime) {
    if (meta.length) meta.push(`<span>·</span>`);
    meta.push(`<span>${escapeHtml(it.readTime)}</span>`);
  }
  if (it.isDraft) {
    meta.push(`<span class="blog-badge">Coming soon</span>`);
  } else {
    const kindLabel =
      it.kind === "note"
        ? "Note"
        : it.kind === "essay"
        ? "Essay"
        : it.kind === "media"
        ? "Media"
        : null;
    if (kindLabel) meta.push(`<span class="archive-kind">${kindLabel}</span>`);
  }
  for (const t of it.tags || []) {
    meta.push(`<span class="blog-tag">${escapeHtml(t)}</span>`);
  }

  li.innerHTML = `
    <${tag} class="blog-entry-link"${extraAttr}>
      <span class="blog-entry-num">${num}</span>
      <div class="blog-entry-body">
        <h3 class="blog-entry-title">${escapeHtml(it.title || "")}</h3>
        ${
          it.description
            ? `<p class="blog-entry-desc">${escapeHtml(it.description)}</p>`
            : ""
        }
        <div class="blog-entry-meta">${meta.join("")}</div>
      </div>
      ${arrow ? `<span class="blog-entry-arrow" aria-hidden="true">${arrow}</span>` : ""}
    </${tag}>
  `;
  return li;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
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
