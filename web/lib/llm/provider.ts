/**
 * Provider priority — mirrors src/pipeline/llm/__init__.py's
 * _detect_provider() so both runtimes pick the same provider from the
 * same env vars.
 *
 * Order: GEMINI_API_KEY (default — free tier, no expiration, no credit
 * system) -> OMNIROUTE_API_KEY/OPENROUTER_API_KEY (OpenRouter) ->
 * OPENAI_API_KEY -> null (caller's honest fallback, e.g. the grounded
 * brief-builder fallback already in place).
 *
 * Pollinations text generation is deliberately not in this list: it now
 * runs on a metered "Pollen" credit system (~1.5 Pollen/week free),
 * unlike Gemini's flat free-tier quota, so it isn't a safe default for
 * an automated pipeline that shouldn't need per-run budget babysitting.
 * Its image generation (Flux) is unaffected and stays wired separately.
 */
import { createGeminiProvider } from "./gemini";
import { createOpenRouterProvider } from "./openrouter";
import type { FetchImpl, LLMProvider } from "./types";

export function getLLMProvider(fetchImpl: FetchImpl = fetch, env: NodeJS.ProcessEnv = process.env): LLMProvider | null {
  if (env.GEMINI_API_KEY) {
    return createGeminiProvider(env.GEMINI_API_KEY, fetchImpl);
  }
  if (env.OMNIROUTE_API_KEY || env.OPENROUTER_API_KEY) {
    return createOpenRouterProvider(env.OMNIROUTE_API_KEY || env.OPENROUTER_API_KEY!, true, fetchImpl);
  }
  if (env.OPENAI_API_KEY) {
    return createOpenRouterProvider(env.OPENAI_API_KEY, false, fetchImpl);
  }
  return null;
}
