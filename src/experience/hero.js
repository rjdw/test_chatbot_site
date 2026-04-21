// ─────────────────────────────────────────────────────────────────────
//  Hero scroll-experience controller.
//
//  Wires up the Klein bottle canvas, the sticky scroll stage, and the
//  cross-fading chapter overlays. Scroll progress through the stage
//  drives both the 3D camera path and which chapter is visible.
// ─────────────────────────────────────────────────────────────────────

import { initKleinScene } from "./klein.js";

let current = null;

export function mountHero(root = document) {
  // Only mount once, and only if the stage exists on the page.
  const stage = root.querySelector("[data-klein-stage]");
  if (!stage) return;
  if (current) return;

  const canvas = stage.querySelector("[data-klein-canvas]");
  const chapters = Array.from(stage.querySelectorAll("[data-chapter]"));
  const indicators = Array.from(stage.querySelectorAll("[data-indicator]"));
  const progressBar = stage.querySelector("[data-progress]");

  if (!canvas || chapters.length === 0) return;

  // Detect "reduced motion" and "no-webgl" to show a graceful fallback.
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let scene = null;
  try {
    scene = initKleinScene(canvas);
  } catch (err) {
    console.warn("Klein scene failed to initialise:", err);
    canvas.style.display = "none";
    stage.classList.add("klein-stage--fallback");
  }

  // ── Scroll → progress ────────────────────────────────────────────
  // The stage is `position: sticky` inside a taller track so scrolling
  // through the track yields an unambiguous 0..1 progress number.
  const track = stage.closest("[data-klein-track]");

  let currentChapter = -1;

  function setActiveChapter(idx) {
    if (idx === currentChapter) return;
    currentChapter = idx;
    chapters.forEach((el, i) => {
      el.classList.toggle("is-active", i === idx);
    });
    indicators.forEach((el, i) => {
      el.classList.toggle("is-active", i === idx);
      el.setAttribute("aria-current", i === idx ? "true" : "false");
    });
  }

  function onScroll() {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = rect.height - viewport;
    const scrolled = Math.max(0, Math.min(total, -rect.top));
    const t = total > 0 ? scrolled / total : 0;

    if (scene) scene.setScroll(t);
    if (progressBar) progressBar.style.transform = `scaleX(${t})`;

    // Pick which chapter is "current" — evenly distributed milestones.
    const n = chapters.length;
    // Slight bias so each chapter holds through its band.
    const idx = Math.min(n - 1, Math.floor(t * n * 0.9999));
    setActiveChapter(idx);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // Indicator clicks — jump to a chapter by scroll offset.
  indicators.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = rect.height - viewport;
      const frac = chapters.length > 1 ? i / (chapters.length - 1) : 0;
      const targetTop = window.scrollY + rect.top + total * frac;
      window.scrollTo({
        top: targetTop,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    });
  });

  current = {
    dispose() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (scene) scene.dispose();
      current = null;
    },
  };

  return current;
}

export function unmountHero() {
  if (current) current.dispose();
}
