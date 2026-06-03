// Cloudflare Pages Function: GET /api/support-chat-token
//
// Mints a short-lived (15 min) HS256 JWT that the Clad Support Chat widget uses
// to verify a logged-in user. The signing secret is read from the environment
// (SUPPORT_CHAT_WIDGET_SECRET) and never leaves the server.
//
// This site currently has no authentication, so resolveUser() returns null and
// the endpoint responds 401 (it will not mint a token for an anonymous visitor).
// When you add login, implement resolveUser() to return the current user and
// the widget's tokenProvider (see src/chat/support-chat.js) will start working.

const TOKEN_TTL_SECONDS = 15 * 60; // keep tokens short-lived (<= 15 min)
const AUDIENCE = "clad_support_chat";

export async function onRequestGet({ request, env }) {
  const secret = env.SUPPORT_CHAT_WIDGET_SECRET;
  if (!secret) {
    // Misconfiguration — never fall back to an unsigned/empty secret.
    return json({ error: "support_chat_secret_not_configured" }, 500);
  }

  const user = await resolveUser(request, env);
  if (!user) {
    return json({ error: "not_authenticated" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "richardjdwang.com",
    aud: AUDIENCE,
    sub: String(user.id),
    email: user.email,
    name: user.name,
    company_id: user.companyId,
    workspace_id: env.SUPPORT_CHAT_WORKSPACE_ID || "ws_a31577c9-7a44-4a88-a0ac-e0b120b271d5",
    widget_id: env.SUPPORT_CHAT_WIDGET_ID || "wgt_BDnW9jrlIt6x",
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };

  const token = await signJwtHS256(claims, secret);
  return new Response(token, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Tokens are per-user and short-lived — never cache them.
      "Cache-Control": "no-store",
    },
  });
}

// Resolve the currently logged-in user for this request.
//
// There is no auth system on this site yet, so we return null (anonymous).
// To enable identity verification, validate the session here (cookie, header,
// KV/D1 lookup, your identity provider, etc.) and return:
//   { id, email, name, companyId }
async function resolveUser(_request, _env) {
  return null;
}

// --- Minimal HS256 JWT signer using the Web Crypto API (Workers runtime) ---

async function signJwtHS256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(signature)}`;
}

function base64url(input) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
