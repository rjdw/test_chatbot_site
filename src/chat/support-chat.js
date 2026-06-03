// Clad Support Chat — loaded once from the shared app shell (src/main.js),
// so the launcher appears on every page (home + every blog post) and survives
// the PJAX router (it lives on window/<body>, outside #page-content).
//
// workspaceId/widgetId are PUBLIC identifiers and are safe to ship to the
// browser. The signing secret never lives here — it stays on the backend
// (see functions/api/support-chat-token.js).

const WORKSPACE_ID = "ws_a31577c9-7a44-4a88-a0ac-e0b120b271d5";
const WIDGET_ID = "wgt_BDnW9jrlIt6x";

// Same-origin endpoint that mints a short-lived JWT for the logged-in user.
const TOKEN_ENDPOINT = "/api/support-chat-token";

// --- Quickstart loader (sets settings + injects the hosted widget script) ---
window.SupportChatSettings = {
  workspaceId: WORKSPACE_ID,
  widgetId: WIDGET_ID,
  region: "us",
};

(function (w, d) {
  w.SupportChat =
    w.SupportChat ||
    function () {
      (w.SupportChat.q = w.SupportChat.q || []).push(arguments);
    };
  // Guard against double-injection across HMR / repeated module evaluation.
  if (d.getElementById("clad-support-chat")) return;
  const s = d.createElement("script");
  s.id = "clad-support-chat";
  s.async = true;
  s.src = "https://clad-server-staging.up.railway.app/widget/v1/widget.js";
  d.head.appendChild(s);
})(window, document);

// ---------------------------------------------------------------------------
// Identity verification helpers.
//
// This site currently has no logged-in users, so the widget runs in anonymous
// mode (booted automatically from SupportChatSettings above) and the helpers
// below are never invoked. They are wired and ready: when you add real auth,
// call identifySupportChatUser(user) right after login and shutdownSupportChat()
// on logout. The token is fetched from the backend so the secret never reaches
// the browser.
// ---------------------------------------------------------------------------

const tokenProvider = () =>
  fetch(TOKEN_ENDPOINT, { headers: { Accept: "text/plain" } }).then((res) => {
    if (!res.ok) {
      throw new Error(`Support Chat token request failed: ${res.status}`);
    }
    return res.text();
  });

// The hosted script creates window.supportChat asynchronously; resolve once it
// exists so identify()/shutdown() are safe to call from any login/logout flow.
function getChat(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.supportChat) return resolve(window.supportChat);
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.supportChat) {
        clearInterval(timer);
        resolve(window.supportChat);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Support Chat SDK did not finish loading"));
      }
    }, 100);
  });
}

export async function identifySupportChatUser(user) {
  const chat = await getChat();
  return chat.identify({ user, tokenProvider });
}

export async function shutdownSupportChat() {
  const chat = await getChat();
  return chat.shutdown({ clearStorage: true });
}

// Expose for non-module callers (e.g. inline handlers in a future auth flow).
window.cladSupport = {
  identify: identifySupportChatUser,
  shutdown: shutdownSupportChat,
};
