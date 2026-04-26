// Fallback journey: chapters + scroll snap, but no WebGL scene.
// Used when the device fails a WebGL / low-power check. The `main.js`
// bootstrapper swaps in a static SVG infinity + gradient before calling
// us, so we only need to drive the overlay.

const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;
const SCROLL_IDLE_MS = 140;
const STEP_COOLDOWN_MS = 650;
const WHEEL_DEADZONE = 6;
const TOUCH_DEADZONE = 28;
const SNAP_SUPPRESS_MS = 900;

export function initKleinJourney(root) {
  if (!root || root.dataset.kleinInitialized === "1") return;
  root.dataset.kleinInitialized = "1";

  const chapters = Array.from(root.querySelectorAll(".klein-chapter"));
  const progressBar = root.querySelector(".klein-progress-bar");
  const progressLabel = root.querySelector(".klein-progress-label");
  const stepDots = Array.from(root.querySelectorAll(".klein-step-dot"));
  if (chapters.length === 0) return;

  chapters.forEach((el, i) => {
    if (!el.dataset.step)
      el.dataset.step = String(i / Math.max(chapters.length - 1, 1));
  });
  const stepFracs = chapters.map((el) => parseFloat(el.dataset.step));
  const lastStepIdx = stepFracs.length - 1;

  let snapSuppressUntil = 0;
  let lastStepTime = 0;
  let scrollIdleTimer = 0;

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
      total > 0 && rect.top <= 0 && rect.bottom > window.innerHeight + 1
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

  const updateOverlay = (p) => {
    if (progressBar) progressBar.style.transform = `scaleY(${p})`;
    if (progressLabel)
      progressLabel.textContent =
        String(Math.round(p * 100)).padStart(2, "0") + "%";
    const activeIdx = nearestStepIdx(p);
    const window0 = 1 / Math.max(chapters.length - 1, 1);
    chapters.forEach((el, i) => {
      const step = stepFracs[i];
      const d = Math.abs(p - step);
      const opacity = Math.max(0, 1 - d / (window0 * 0.75));
      el.style.opacity = String(opacity);
      const isActive = i === activeIdx;
      el.classList.toggle("is-active", isActive);
      el.style.pointerEvents = isActive ? "auto" : "none";
    });
    stepDots.forEach((dot, i) =>
      dot.classList.toggle("is-active", i === activeIdx)
    );
  };

  const scrollToStep = (stepFrac) => {
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return;
    const targetTop = root.offsetTop + stepFrac * total;
    snapSuppressUntil = performance.now() + SNAP_SUPPRESS_MS;
    lastStepTime = performance.now();
    window.scrollTo({
      top: targetTop,
      behavior: REDUCED_MOTION ? "auto" : "smooth",
    });
  };

  stepDots.forEach((dot, i) =>
    dot.addEventListener("click", () => {
      const step = i / Math.max(stepDots.length - 1, 1);
      scrollToStep(step);
    })
  );

  const stepBy = (delta) => {
    const now = performance.now();
    if (now - lastStepTime < STEP_COOLDOWN_MS) return true;
    const { p } = journeyMetrics();
    const currentIdx = nearestStepIdx(p);
    const targetIdx = Math.max(
      0,
      Math.min(lastStepIdx, currentIdx + delta)
    );
    if (targetIdx === currentIdx) {
      const atEdge =
        (delta > 0 && currentIdx === lastStepIdx) ||
        (delta < 0 && currentIdx === 0);
      if (atEdge) return false;
      return true;
    }
    scrollToStep(stepFracs[targetIdx]);
    return true;
  };

  const onWheel = (e) => {
    if (!isPinned()) return;
    if (Math.abs(e.deltaY) < WHEEL_DEADZONE) {
      e.preventDefault();
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    if (stepBy(dir)) e.preventDefault();
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
    const dy = touchStartY - (e.touches[0]?.clientY ?? 0);
    if (Math.abs(dy) >= TOUCH_DEADZONE) {
      touchHandled = true;
      if (stepBy(dy > 0 ? 1 : -1)) e.preventDefault();
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
    if (["ArrowDown", "PageDown", " "].includes(e.key)) dir = 1;
    else if (["ArrowUp", "PageUp"].includes(e.key)) dir = -1;
    else if (e.key === "Home") {
      e.preventDefault();
      scrollToStep(stepFracs[0]);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      scrollToStep(stepFracs[lastStepIdx]);
      return;
    } else return;
    if (dir !== 0 && stepBy(dir)) e.preventDefault();
  };

  const onScroll = () => {
    updateOverlay(journeyMetrics().p);
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
    if (Math.abs(targetTop - window.scrollY) < 4) return;
    scrollToStep(stepFracs[idx]);
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  onScroll();
}
