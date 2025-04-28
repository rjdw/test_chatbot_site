// ────────────────────────────────────────────────────────────
// tiny PJAX router – keeps the chat widget alive
// ────────────────────────────────────────────────────────────

const container = document.getElementById("page-content");

async function navigate(url, push = true) {
  const txt = await (await fetch(url)).text();
  const frag = document.createRange().createContextualFragment(txt);
  const next = frag.querySelector("#page-content");

  /* 1 If the fetched page isn’t a full-shell HTML document
        (e.g. a PDF link) just let the browser load it normally. */
  if (!next) {
    location.href = url;
    return;
  }

  // swap only the <main> content
  container.innerHTML = next.innerHTML;
  document.title = frag.querySelector("title")?.textContent ?? document.title;

  /* 2 Footer management
        – if the fetched page has its own <footer>, use it
        – else clone a stored global footer so one is always visible */
  const curFooter = document.querySelector("footer");
  const newFooter = frag.querySelector("footer");

  if (newFooter) {
    curFooter ? curFooter.replaceWith(newFooter) : container.after(newFooter);
  } else if (!newFooter && !curFooter && window.__globalFooterTemplate) {
    container.after(window.__globalFooterTemplate.cloneNode(true));
  }

  if (push) history.pushState(null, "", url);
  window.scrollTo(0, 0);
}

// ── Intercept in-site HTML links only
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (
    !a || // not a link
    a.target === "_blank" || // opens new tab
    a.origin !== location.origin || // external site
    !a.pathname.endsWith(".html") // ignore PDFs, images, etc.
  )
    return;

  e.preventDefault();
  navigate(a.href);
});

// ── Handle back / forward buttons
window.addEventListener("popstate", () => navigate(location.href, false));

// ── Store a clone of the homepage footer for later reuse
window.addEventListener("DOMContentLoaded", () => {
  const f = document.querySelector("footer");
  if (f) window.__globalFooterTemplate = f.cloneNode(true);
});
