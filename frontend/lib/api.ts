/**
 * API client for the FastAPI Sign Language Detection backend.
 *
 * Set NEXT_PUBLIC_API_URL in .env.local (or Vercel project settings) to point
 * to your deployed backend URL, e.g. https://your-app.up.railway.app
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export interface PredictResponse {
  prediction: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/**
 * Fetch the list of detectable signs from the backend.
 * Used server-side in page.tsx so it runs at request time.
 */
export async function getSigns(): Promise<string[]> {
  const res = await fetch(`${API_URL}/signs`, {
    // Don't cache this so the page always reflects the current model
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /signs failed: ${res.status}`);
  const data = (await res.json()) as { signs: string[] };
  return data.signs;
}

/**
 * Send a 30-frame landmark sequence to the backend and get a prediction.
 *
 * @param sequence - Array of 30 frames, each containing 1662 float values.
 * @param signs    - Ordered list of sign labels that matches the model output.
 */
export async function predictSign(
  sequence: number[][],
  signs: string[]
): Promise<PredictResponse> {
  const res = await fetch(`${API_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence, signs }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`POST /predict failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<PredictResponse>;
}
