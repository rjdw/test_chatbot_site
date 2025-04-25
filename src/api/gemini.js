export async function callGemini(prompt) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("Gemini API error");
  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    data.candidates?.[0]?.output ??
    "No reply"
  );
}
