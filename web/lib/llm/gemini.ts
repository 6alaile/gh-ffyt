/**
 * Gemini adapter — the default text provider (free tier via Google AI
 * Studio: no credit card, no expiration, Flash-only since Pro moved
 * behind billing). Uses `gemini-flash-latest`, Google's maintained alias
 * for the current stable Flash release, rather than a pinned preview
 * version string — Gemini 3.x model IDs have been churning (aliases
 * have shown intermittent routing bugs to decommissioned backing
 * builds), so an alias that Google keeps pointed at a working release
 * is the safer bet than hardcoding one.
 */
import type { FetchImpl, LLMProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

export function createGeminiProvider(apiKey: string, fetchImpl: FetchImpl = fetch): LLMProvider {
  return {
    name: "gemini",
    async generateText(prompt: string, opts?: { system?: string }): Promise<string> {
      const contents = [{ role: "user", parts: [{ text: prompt }] }];
      const body: Record<string, unknown> = { contents };
      if (opts?.system) {
        body.systemInstruction = { parts: [{ text: opts.system }] };
      }

      const res = await fetchImpl(`${ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini request failed: ${res.status} ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("Gemini response had no text content");
      }
      return text;
    },
  };
}
