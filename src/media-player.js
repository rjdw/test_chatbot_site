// Reusable media-post helpers.
//
// Two responsibilities:
//   1. Lazy-load the YouTube iframe on user interaction (privacy +
//      performance: no cookies set, no script downloaded until the
//      user chooses to play).
//   2. Wire the chapter list so clicking a chapter seeks the iframe,
//      using the YouTube IFrame Player API loaded on first play.

(function initMediaPosts() {
  const embeds = document.querySelectorAll(".media-embed");
  if (embeds.length === 0) return;

  embeds.forEach((embed) => setupEmbed(embed));
})();

function setupEmbed(embed) {
  const poster = embed.querySelector(".media-embed-poster");
  const srcTpl = embed.querySelector(".media-embed-src");
  if (!poster || !srcTpl) return;

  const provider = embed.dataset.provider || "youtube";
  const srcText = srcTpl.textContent.trim();

  let iframe = null;
  let player = null;
  let playerReadyPromise = null;

  const activate = (extraStart) => {
    if (iframe) {
      if (extraStart != null && player && player.seekTo) {
        player.seekTo(extraStart, true);
        player.playVideo && player.playVideo();
      }
      return;
    }
    // Build the iframe. Bump autoplay when user clicks to play.
    let src = srcText;
    if (provider === "youtube") {
      const u = new URL(src);
      u.searchParams.set("autoplay", "1");
      if (extraStart != null) u.searchParams.set("start", String(extraStart));
      src = u.toString();
    }
    iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Embedded video";
    iframe.loading = "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
    iframe.allowFullscreen = true;
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.className = "media-embed-iframe";
    poster.replaceWith(iframe);

    if (provider === "youtube") {
      playerReadyPromise = ensureYouTubeAPI().then(() => {
        return new Promise((resolve) => {
          player = new window.YT.Player(iframe, {
            events: {
              onReady: () => resolve(player),
            },
          });
        });
      });
    }
  };

  poster.addEventListener("click", () => activate());
  poster.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });

  // Chapter buttons (only inside the same media article, so multiple
  // embeds on one page stay independent — future-proofing).
  const article = embed.closest(".media-page") || document;
  const chapterButtons = article.querySelectorAll(".media-chapter-btn");
  chapterButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const start = Number(btn.dataset.start || 0);
      activate(start);
      // If the player was already live, seek directly.
      if (player && player.seekTo) {
        player.seekTo(start, true);
        player.playVideo && player.playVideo();
      } else if (playerReadyPromise) {
        const p = await playerReadyPromise;
        p.seekTo(start, true);
        p.playVideo && p.playVideo();
      }
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
      document.head.appendChild(tag);
    }
    // onYouTubeIframeAPIReady is a global the YT script calls exactly
    // once; avoid clobbering any existing one.
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev && prev();
      } catch {}
      resolve();
    };
    // Also resolve if the API object is already live.
    if (window.YT && window.YT.Player) resolve();
  });
  return _ytApiPromise;
}
