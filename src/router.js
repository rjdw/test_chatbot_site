// tiny PJAX: intercept internal links and swap content
const container = document.getElementById("page-content");

async function navigate(url, addToHistory = true) {
  const res = await fetch(url);
  const html = await res.text();

  // extract only the new <main> content
  const frag = document.createRange().createContextualFragment(html);
  const next = frag.querySelector("#page-content");
  container.innerHTML = next.innerHTML;

  document.title = frag.querySelector("title").textContent;

  if (addToHistory) history.pushState(null, "", url);
  window.scrollTo(0, 0);
}

// intercept clicks on internal <a>
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (
    !a || // not a link
    a.target === "_blank" || // opens new tab
    a.origin !== location.origin
  )
    return;

  e.preventDefault();
  navigate(a.href);
});

// handle back / forward buttons
window.addEventListener("popstate", () => navigate(location.href, false));
