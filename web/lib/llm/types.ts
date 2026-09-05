/**
 * Shared LLM provider contract — mirrored conceptually in
 * src/pipeline/llm/__init__.py so both runtimes pick providers the same
 * way and can be swapped without touching call sites.
 *
 * A provider's job is just "text in, text out." JSON parsing and schema
 * validation happen in generate.ts's retry loop, not here — that keeps
 * adding a new provider to a one-function adapter.
 */
export type LLMProvider = {
  name: "gemini" | "openrouter";
  generateText(prompt: string, opts?: { system?: string }): Promise<string>;
};

export type FetchImpl = typeof fetch;
