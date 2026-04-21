import "./chat/widget-loader.js";
import { mountHero, unmountHero } from "./experience/hero.js";

function boot() {
  mountHero(document);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// The PJAX router in router.js dispatches custom events on navigation so
// we can tear the 3D scene down / mount it on the new page.
window.addEventListener("pjax:beforeswap", () => unmountHero());
window.addEventListener("pjax:afterswap", () => mountHero(document));
