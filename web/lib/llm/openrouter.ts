/**
 * OpenRouter/OpenAI adapter — optional, used when OMNIROUTE_API_KEY /
 * OPENROUTER_API_KEY / OPENAI_API_KEY is set. Not the default (see
 * provider.ts) — Gemini's free tier is the priority per project
 * decision, this is available as an upgrade path.
 */
import type { FetchImpl, LLMProvider } from "./types";

export function createOpenRouterProvider(
  apiKey: string,
  useOpenRouter: boolean,
  fetchImpl: FetchImpl = fetch
): LLMProvider {
  const url = useOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = useOpenRouter ? "google/gemini-2.0-flash-001" : "gpt-4o-mini";

  return {
    name: "openrouter",
    async generateText(prompt: string, opts?: { system?: string }): Promise<string> {
      const messages = [
        ...(opts?.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: prompt },
      ];

      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1800 }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${useOpenRouter ? "OpenRouter" : "OpenAI"} request failed: ${res.status} ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new Error(`${useOpenRouter ? "OpenRouter" : "OpenAI"} response had no content`);
      }
      return content;
    },
  };
}
