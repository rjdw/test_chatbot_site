import { KleinScene } from "./klein-scene.js";

// One "journey" component. It expects a section with the following DOM:
//   .klein-journey
//     .klein-stage  (position: sticky, 100vh)
//       canvas.klein-canvas
//       .klein-overlay  (absolute; holds chapter panels & HUD)
//         .klein-chapter (one per step, data-step attr)
//     .klein-scroll-track (the tall spacer that generates scroll distance)
//
// Each chapter's opacity is a triangular falloff centered on its step
// fraction, so adjacent chapters cross-fade smoothly as the camera flies
// through the Klein bottle.

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initKleinJourney(root) {
  if (!root || root.dataset.kleinInitialized === "1") return;
  root.dataset.kleinInitialized = "1";

  const canvas = root.querySelector(".klein-canvas");
  const chapters = Array.from(root.querySelectorAll(".klein-chapter"));
  const progressBar = root.querySelector(".klein-progress-bar");
  const progressLabel = root.querySelector(".klein-progress-label");
  const stepDots = Array.from(root.querySelectorAll(".klein-step-dot"));

  if (!canvas || chapters.length === 0) return;

  // Sort chapters by their declared step fraction.
  chapters.forEach((el, i) => {
    el.dataset.index = String(i);
    if (!el.dataset.step) {
      el.dataset.step = String(i / Math.max(chapters.length - 1, 1));
    }
  });

  const scene = new KleinScene(canvas);
  scene.start();

  const onScroll = () => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    const raw = total > 0 ? scrolled / total : 0;
    const p = Math.max(0, Math.min(1, raw));
    scene.setProgress(p);
    updateOverlay(p);
  };

  const updateOverlay = (p) => {
    if (progressBar) {
      progressBar.style.transform = `scaleY(${p})`;
    }
    if (progressLabel) {
      progressLabel.textContent = formatProgress(p);
    }

    // Cross-fade chapters on a triangular kernel.
    const window0 = 1 / Math.max(chapters.length - 1, 1);
    let activeIdx = 0;
    let activeDist = Infinity;
    chapters.forEach((el, i) => {
      const step = parseFloat(el.dataset.step);
      const d = Math.abs(p - step);
      const opacity = Math.max(0, 1 - d / (window0 * 0.75));
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity > 0.55 ? "auto" : "none";
      // Subtle parallax: chapters drift slightly in depth as they fade.
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

  // Let clicking a dot jump to that chapter.
  stepDots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      const rect = root.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const step = i / Math.max(stepDots.length - 1, 1);
      const targetTop =
        root.offsetTop + step * total;
      window.scrollTo({
        top: targetTop,
        behavior: REDUCED_MOTION ? "auto" : "smooth",
      });
    });
  });

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // Keep the scene paused when completely off-screen (blog post nav, etc.)
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
      scene.dispose();
      root.dataset.kleinInitialized = "";
    },
  };
}

function formatProgress(p) {
  const pct = Math.round(p * 100);
  return `${String(pct).padStart(2, "0")}%`;
}
