// Cloudflare Pages Function: POST /functions/gemini
export async function onRequestPost({ request, env }) {
  // Body should be JSON: { "prompt": "hello" }
  const { prompt } = await request.json();

  const url =
    `https://generativelanguage.googleapis.com/v1/models/` +
    `gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return new Response(await resp.text(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
