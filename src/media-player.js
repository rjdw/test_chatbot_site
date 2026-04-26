// Reusable media-post player.
//
// Responsibilities:
//   1. Lazy-load the YouTube iframe on user interaction. No YouTube
//      script or cookie is fetched until the visitor clicks play.
//   2. Wire the chapter list so clicking a chapter seeks the iframe,
//      using the YouTube IFrame Player API loaded on first play.
//
// The module is safe to re-init after PJAX navigation: we look up any
// .media-embed in the DOM that hasn't been wired yet.

export function init() {
  document.querySelectorAll(".media-embed").forEach(setupEmbed);
}
init();
document.addEventListener("pjax:navigated", init);

function setupEmbed(embed) {
  if (embed.dataset.mediaInit === "1") return;
  embed.dataset.mediaInit = "1";

  const poster = embed.querySelector(".media-embed-poster");
  if (!poster) return;

  const provider = embed.dataset.provider || "youtube";
  const videoId = embed.dataset.videoId || "";
  const initialStart = Number(embed.dataset.start || 0);
  const title = embed.dataset.title || "Embedded video";
  const primaryThumb = embed.dataset.thumb;
  const fallbackThumb = embed.dataset.thumbFallback;

  // YouTube's /maxresdefault.jpg returns a 120x90 placeholder when
  // missing. Probe once; if missing, swap in the hqdefault fallback.
  if (primaryThumb && fallbackThumb && primaryThumb !== fallbackThumb) {
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth <= 120) {
        poster.style.backgroundImage = `url('${fallbackThumb}')`;
      }
    };
    probe.onerror = () => {
      poster.style.backgroundImage = `url('${fallbackThumb}')`;
    };
    probe.src = primaryThumb;
  }

  let iframe = null;
  let player = null;
  let playerReadyPromise = null;

  const buildSrc = (start, autoplay) => {
    if (provider !== "youtube" || !videoId) return null;
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      enablejsapi: "1",
      playsinline: "1",
      hd: "1",
      vq: "hd1080",
      // origin must match the page at runtime, otherwise the IFrame API
      // refuses to post messages (silent failure).
      origin: location.origin,
    });
    if (autoplay) params.set("autoplay", "1");
    if (start && start > 0) params.set("start", String(start));
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
      videoId
    )}?${params.toString()}`;
  };

  const activate = (startOverride) => {
    const start = startOverride != null ? startOverride : initialStart;
    if (iframe) {
      if (startOverride != null) {
        if (player && player.seekTo) {
          player.seekTo(startOverride, true);
          player.playVideo && player.playVideo();
        } else if (playerReadyPromise) {
          playerReadyPromise.then((p) => {
            p.seekTo(startOverride, true);
            p.playVideo && p.playVideo();
          });
        }
      }
      return;
    }

    const src = buildSrc(start, true);
    if (!src) return;

    iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = title;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
    iframe.allowFullscreen = true;
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.className = "media-embed-iframe";
    iframe.id = `media-${videoId}-${Math.random().toString(36).slice(2, 8)}`;

    // Defensive: if the play-button inside the poster retained keyboard
    // focus when we're about to hide it, move focus off first so that
    // aria-hidden removal + replacement doesn't leave an assistive-tech
    // warning.
    if (document.activeElement && poster.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    poster.replaceWith(iframe);

    if (provider === "youtube") {
      playerReadyPromise = ensureYouTubeAPI().then(
        () =>
          new Promise((resolve) => {
            player = new window.YT.Player(iframe.id, {
              events: {
                onReady: () => {
                  try {
                    player.setPlaybackQuality &&
                      player.setPlaybackQuality("hd1080");
                  } catch {}
                  resolve(player);
                },
                onError: (e) =>
                  console.warn("[media] YT player error", e && e.data),
              },
            });
          })
      );
    }
  };

  const onActivate = (ev) => {
    ev && ev.preventDefault && ev.preventDefault();
    activate();
  };

  poster.addEventListener("click", onActivate);
  poster.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onActivate(e);
  });

  const article = embed.closest(".media-page") || document;
  article.querySelectorAll(".media-chapter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const start = Number(btn.dataset.start || 0);
      activate(start);
    });
  });
}

let _ytApiPromise = null;
function ensureYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise((resolve) => {
    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev && prev();
      } catch {}
      resolve();
    };
    if (window.YT && window.YT.Player) resolve();
  });
  return _ytApiPromise;
}
