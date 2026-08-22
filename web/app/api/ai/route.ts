/**
 * Gemini proxy.
 *
 * The API key is read SERVER-SIDE ONLY and never reaches the browser — that is
 * the entire reason this route exists rather than calling Google from the
 * client. Do not rename the env var to NEXT_PUBLIC_*; that would ship the key
 * to every visitor.
 */

export const runtime = "nodejs";

// Verified working against this key. gemini-1.5-flash and 2.0-flash both 404.
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(request: Request) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    // A missing key is a configuration state, not a crash.
    return Response.json(
      {
        error:
          "AI is not configured. Set GOOGLE_API_KEY in your environment (Vercel → Settings → Environment Variables) and redeploy.",
      },
      { status: 200 },
    );
  }

  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: string };
    prompt = (body.prompt ?? "").trim();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!res.ok) {
      // Google echoes the key back in some error payloads, so the upstream body
      // is deliberately NOT forwarded — only the status.
      return Response.json(
        { error: `Gemini request failed (HTTP ${res.status}).` },
        { status: 200 },
      );
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      return Response.json(
        { error: "Gemini returned no text for that prompt." },
        { status: 200 },
      );
    }
    return Response.json({ text });
  } catch {
    return Response.json(
      { error: "Could not reach Gemini. Check your connection." },
      { status: 200 },
    );
  }
}
