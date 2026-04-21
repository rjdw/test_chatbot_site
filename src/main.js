import "./chat/widget-loader.js";
import { initKleinJourney } from "./klein/klein-journey.js";

function tryInit() {
  const root = document.getElementById("klein-journey");
  if (root) initKleinJourney(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryInit, { once: true });
} else {
  tryInit();
}
