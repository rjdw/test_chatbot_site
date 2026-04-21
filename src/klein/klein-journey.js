import { KleinScene } from "./klein-scene.js";

// One "journey" component. It expects a section with the following DOM:
//   .klein-journey
//     .klein-stage   (position: sticky, 100vh)
//       canvas.klein-canvas
//       .klein-overlay  (absolute; holds chapter panels & HUD)
//         .klein-chapter (one per step, data-step attr)
//
// Chapter cross-fade is a triangular opacity falloff. The scroll input
// itself is *discretized*: while the journey section is pinned, one wheel
// tick / one touch swipe / one keypress advances to the next chapter
// anchor, so the scroll can never come to rest between chapters.

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

// Idle-snap fallback (safety net). If the scroll ever does come to rest
// between chapters (e.g. browser native wheel we can't intercept on a
// different OS), bounce it to the nearest chapter after this many ms
// of scroll quiet.
const SCROLL_IDLE_MS = 140;

// How long after firing a discrete step we ignore further wheel/touch
// input — gives `scroll-behavior: smooth` time to complete so we don't
// queue a dozen steps on a single trackpad gesture.
const STEP_COOLDOWN_MS = 650;

// Minimum wheel deltaY (in px) required to register a step. Filters out
// trackpad micro-jitter in between real gestures.
const WHEEL_DEADZONE = 6;

// Minimum vertical touch travel (in px) required to register a step.
const TOUCH_DEADZONE = 28;

// Suppression window used for explicit programmatic scrolls (step-dot
// clicks, hash nav). Prevents an in-flight smooth scroll from being
// immediately overridden by an idle-snap.
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
  const lastStepIdx = stepFracs.length - 1;

  const scene = new KleinScene(canvas);
  scene.start();

  let snapSuppressUntil = 0;
  let lastStepTime = 0;
  let scrollIdleTimer = 0;

  // ────────────────────────────────────────────────────────────────
  // Metrics
  // ────────────────────────────────────────────────────────────────

  const journeyMetrics = () => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    const raw = total > 0 ? scrolled / total : 0;
    const p = Math.max(0, Math.min(1, raw));
    return { rect, total, scrolled, raw, p };
  };

  const isPinned = () => {
    const { rect, total } = journeyMetrics();
    return (
      total > 0 &&
      rect.top <= 0 &&
      rect.bottom > window.innerHeight + 1
    );
  };

  const nearestStepIdx = (p) => {
    let best = 0;
    let bestD = Math.abs(p - stepFracs[0]);
    for (let i = 1; i < stepFracs.length; i++) {
      const d = Math.abs(p - stepFracs[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // ────────────────────────────────────────────────────────────────
  // Rendering overlay updates
  // ────────────────────────────────────────────────────────────────

  const onScroll = () => {
    const { p } = journeyMetrics();
    scene.setProgress(p);
    updateOverlay(p);
    scheduleIdleSnap();
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

  // ────────────────────────────────────────────────────────────────
  // Scroll-to actions
  // ────────────────────────────────────────────────────────────────

  const scrollToStep = (stepFrac, { suppress = true } = {}) => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return;
    const targetTop = root.offsetTop + stepFrac * total;
    if (suppress) snapSuppressUntil = performance.now() + SNAP_SUPPRESS_MS;
    lastStepTime = performance.now();
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
   * Advance by delta chapters. Returns true if a step was actually fired.
   * Returns false when we are already at the edge in the requested
   * direction (so the caller can let the browser handle the scroll to
   * move the user past the journey).
   */
  const stepBy = (delta) => {
    const now = performance.now();
    if (now - lastStepTime < STEP_COOLDOWN_MS) return true; // swallow
    const { p } = journeyMetrics();
    const currentIdx = nearestStepIdx(p);
    // Snap current-p onto its chapter: if we're off-step, we always want
    // *at least* to land exactly on a chapter; delta=+1 going through an
    // already-off-center state still moves to the next chapter because
    // nearestStepIdx rounds to the nearest.
    const targetIdx = Math.max(
      0,
      Math.min(lastStepIdx, currentIdx + delta)
    );
    if (targetIdx === currentIdx) {
      // Edge case: we're already exactly on the target. If the user is
      // pressing further in this direction and we're at the edge, let the
      // browser take over so they can scroll past the journey.
      const atEdge =
        (delta > 0 && currentIdx === lastStepIdx) ||
        (delta < 0 && currentIdx === 0);
      if (atEdge) return false;
      // Otherwise (off-step in the same direction already rounded) do
      // nothing — a follow-up wheel will resolve it.
      return true;
    }
    scrollToStep(stepFracs[targetIdx]);
    return true;
  };

  // ────────────────────────────────────────────────────────────────
  // Input interception (wheel / touch / keys)
  // ────────────────────────────────────────────────────────────────

  const onWheel = (e) => {
    if (!isPinned()) return;
    if (Math.abs(e.deltaY) < WHEEL_DEADZONE) {
      e.preventDefault();
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    const handled = stepBy(dir);
    if (handled) e.preventDefault();
  };

  let touchStartY = null;
  let touchHandled = false;
  const onTouchStart = (e) => {
    if (!isPinned()) return;
    touchStartY = e.touches[0]?.clientY ?? null;
    touchHandled = false;
  };
  const onTouchMove = (e) => {
    if (!isPinned() || touchStartY == null) return;
    if (touchHandled) {
      e.preventDefault();
      return;
    }
    const y = e.touches[0]?.clientY ?? 0;
    const dy = touchStartY - y;
    if (Math.abs(dy) >= TOUCH_DEADZONE) {
      const dir = dy > 0 ? 1 : -1;
      const handled = stepBy(dir);
      touchHandled = true;
      if (handled) e.preventDefault();
    } else {
      e.preventDefault();
    }
  };
  const onTouchEnd = () => {
    touchStartY = null;
    touchHandled = false;
  };

  const onKey = (e) => {
    if (!isPinned()) return;
    let dir = 0;
    switch (e.key) {
      case "PageDown":
      case "ArrowDown":
      case " ":
        dir = 1;
        break;
      case "PageUp":
      case "ArrowUp":
        dir = -1;
        break;
      case "Home":
        e.preventDefault();
        scrollToStep(stepFracs[0]);
        return;
      case "End":
        e.preventDefault();
        scrollToStep(stepFracs[lastStepIdx]);
        return;
      default:
        return;
    }
    if (dir !== 0) {
      const handled = stepBy(dir);
      if (handled) e.preventDefault();
    }
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKey);

  // ────────────────────────────────────────────────────────────────
  // Idle-snap fallback
  // ────────────────────────────────────────────────────────────────

  const scheduleIdleSnap = () => {
    if (REDUCED_MOTION) return;
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(maybeSnap, SCROLL_IDLE_MS);
  };

  const maybeSnap = () => {
    if (performance.now() < snapSuppressUntil) return;
    if (!isPinned()) return;
    const { p, total } = journeyMetrics();
    const idx = nearestStepIdx(p);
    const targetTop = root.offsetTop + stepFracs[idx] * total;
    const currentTop = window.scrollY;
    if (Math.abs(targetTop - currentTop) < 4) return;
    scrollToStep(stepFracs[idx]);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

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
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
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
