import { KleinScene } from "./klein-scene.js";

// One "journey" component. It expects a section with the following DOM:
//   .klein-journey
//     .klein-stage  (position: sticky, 100vh)
//       canvas.klein-canvas
//       .klein-overlay  (absolute; holds chapter panels & HUD)
//         .klein-chapter (one per step, data-step attr)
//
// Each chapter's opacity is a triangular falloff centered on its step
// fraction, so adjacent chapters cross-fade smoothly as the camera flies
// through the Klein bottle.

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// How long after the last scroll event we consider the scroll "settled"
// and are allowed to snap to the nearest chapter.
const SCROLL_IDLE_MS = 160;

// Suppress snapping for a short window after the user or code triggers
// an explicit jump (step-dot click, hash navigation), so we don't fight
// those scrolls mid-flight.
const SNAP_SUPPRESS_MS = 900;

export function initKleinJourney(root) {
  if (!root || root.dataset.kleinInitialized === "1") return;
  root.dataset.kleinInitialized = "1";

  const canvas = root.querySelector(".klein-canvas");
  const chapters = Array.from(root.querySelectorAll(".klein-chapter"));
  const progressBar = root.querySelector(".klein-progress-bar");
  const progressLabel = root.querySelector(".klein-progress-label");
  const stepDots = Array.from(root.querySelectorAll(".klein-step-dot"));

  if (!canvas || chapters.length === 0) return;

  chapters.forEach((el, i) => {
    el.dataset.index = String(i);
    if (!el.dataset.step) {
      el.dataset.step = String(i / Math.max(chapters.length - 1, 1));
    }
  });
  const stepFracs = chapters.map((el) => parseFloat(el.dataset.step));

  const scene = new KleinScene(canvas);
  scene.start();

  let snapSuppressUntil = 0;
  let scrollIdleTimer = 0;

  const journeyMetrics = () => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    const raw = total > 0 ? scrolled / total : 0;
    const p = Math.max(0, Math.min(1, raw));
    return { rect, total, scrolled, raw, p };
  };

  const onScroll = () => {
    const { p, rect, total, scrolled } = journeyMetrics();
    scene.setProgress(p);
    updateOverlay(p);
    scheduleSnap(rect, total, scrolled);
  };

  const updateOverlay = (p) => {
    if (progressBar) progressBar.style.transform = `scaleY(${p})`;
    if (progressLabel) progressLabel.textContent = formatProgress(p);

    const window0 = 1 / Math.max(chapters.length - 1, 1);
    let activeIdx = 0;
    let activeDist = Infinity;
    chapters.forEach((el, i) => {
      const step = stepFracs[i];
      const d = Math.abs(p - step);
      const opacity = Math.max(0, 1 - d / (window0 * 0.75));
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity > 0.55 ? "auto" : "none";
      const parallax = (p - step) * 22;
      el.style.transform = `translate3d(0, ${parallax.toFixed(2)}px, 0)`;
      if (d < activeDist) {
        activeDist = d;
        activeIdx = i;
      }
    });

    stepDots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === activeIdx);
    });
  };

  const scrollToStep = (stepFrac, { suppress = true } = {}) => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return;
    const targetTop = root.offsetTop + stepFrac * total;
    if (suppress) snapSuppressUntil = performance.now() + SNAP_SUPPRESS_MS;
    window.scrollTo({
      top: targetTop,
      behavior: REDUCED_MOTION ? "auto" : "smooth",
    });
  };

  stepDots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      const step = i / Math.max(stepDots.length - 1, 1);
      scrollToStep(step);
    });
  });

  /**
   * When the user stops scrolling inside the journey, bounce to the
   * nearest chapter so we never come to rest between chapters. We only
   * do this while the sticky stage is still in control — i.e., the
   * journey rect is still spanning the viewport (roughly top ≤ 0 ≤
   * bottom−vh). Once the user has scrolled past the journey into the
   * essays feed below, we leave them alone.
   */
  const scheduleSnap = (rect, total, scrolled) => {
    if (REDUCED_MOTION) return;
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => maybeSnap(), SCROLL_IDLE_MS);
  };

  const maybeSnap = () => {
    if (performance.now() < snapSuppressUntil) return;
    const { rect, total, scrolled, p } = journeyMetrics();

    // Only snap when the sticky journey is actively pinned. That is
    // true iff top < 0 and the bottom of the section is still below the
    // viewport bottom:  rect.bottom > window.innerHeight + epsilon
    const pinned =
      rect.top <= 0 && rect.bottom > window.innerHeight + 1 && total > 0;
    if (!pinned) return;

    // Find nearest chapter step by absolute distance.
    let nearest = stepFracs[0];
    let nearestDist = Math.abs(p - nearest);
    for (let i = 1; i < stepFracs.length; i++) {
      const d = Math.abs(p - stepFracs[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = stepFracs[i];
      }
    }

    // If we're essentially already there, don't fire a pointless scroll.
    const targetTop = root.offsetTop + nearest * total;
    const currentTop = window.scrollY;
    if (Math.abs(targetTop - currentTop) < 6) return;

    scrollToStep(nearest);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // Skip the snap logic while the user is actively interacting (touch
  // or wheel hold). We extend the suppression window on each event.
  const nudgeSuppress = () => {
    // Keep a minimum of SCROLL_IDLE_MS + small buffer so a mid-scroll
    // wheel tick doesn't trigger an immediate snap.
    snapSuppressUntil = Math.max(
      snapSuppressUntil,
      performance.now() + SCROLL_IDLE_MS + 60
    );
  };
  window.addEventListener("wheel", nudgeSuppress, { passive: true });
  window.addEventListener("touchmove", nudgeSuppress, { passive: true });
  window.addEventListener("keydown", (e) => {
    // Let the browser handle the scroll itself; we only care about
    // ensuring it settles onto a chapter.
    const scrollKeys = new Set([
      "PageDown",
      "PageUp",
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
      " ",
    ]);
    if (scrollKeys.has(e.key)) nudgeSuppress();
  });

  // Pause the render loop entirely when the section is off-screen.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) scene.start();
        else scene.stop();
      }
    },
    { threshold: 0 }
  );
  io.observe(root);

  return {
    dispose() {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", nudgeSuppress);
      window.removeEventListener("touchmove", nudgeSuppress);
      clearTimeout(scrollIdleTimer);
      scene.dispose();
      root.dataset.kleinInitialized = "";
    },
  };
}

function formatProgress(p) {
  const pct = Math.round(p * 100);
  return `${String(pct).padStart(2, "0")}%`;
}
