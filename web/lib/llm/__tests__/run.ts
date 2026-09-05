/**
 * Smoke tests for the LLM adapter layer, run via `npx tsx`.
 * Run: npx tsx lib/llm/__tests__/run.ts
 */
import assert from "node:assert/strict";
import { createGeminiProvider } from "../gemini";
import { createOpenRouterProvider } from "../openrouter";
import { getLLMProvider } from "../provider";
import { generateValidated, GenerationValidationError } from "../generate";

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => {
      passed++;
      console.log(`  ok  ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL  ${name}\n      ${err.message}`);
      process.exitCode = 1;
    });
}

function mockFetch(response: { ok: boolean; status?: number; json?: () => any; text?: () => any }): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

async function main() {
  await check("createGeminiProvider parses real generateContent response shape", async () => {
    const fakeFetch = mockFetch({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "## Hook\n**Voiceover:** hi" }] } }],
      }),
    });
    const provider = createGeminiProvider("fake-key", fakeFetch);
    const text = await provider.generateText("write a brief");
    assert.match(text, /## Hook/);
  });

  await check("createGeminiProvider throws with status on a non-ok response", async () => {
    const fakeFetch = mockFetch({ ok: false, status: 429, text: async () => "rate limited" });
    const provider = createGeminiProvider("fake-key", fakeFetch);
    await assert.rejects(() => provider.generateText("x"), /429/);
  });

  await check("createOpenRouterProvider parses real chat completions response shape", async () => {
    const fakeFetch = mockFetch({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "## Hook\n**Voiceover:** hi" } }] }),
    });
    const provider = createOpenRouterProvider("fake-key", true, fakeFetch);
    const text = await provider.generateText("write a brief");
    assert.match(text, /## Hook/);
  });

  await check("getLLMProvider prioritizes Gemini over OpenRouter/OpenAI", () => {
    const provider = getLLMProvider(fetch, {
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
      OPENAI_API_KEY: "a",
    } as any);
    assert.equal(provider?.name, "gemini");
  });

  await check("getLLMProvider falls back to OpenRouter when Gemini key is absent", () => {
    const provider = getLLMProvider(fetch, { OPENROUTER_API_KEY: "o" } as any);
    assert.equal(provider?.name, "openrouter");
  });

  await check("getLLMProvider returns null when nothing is configured", () => {
    const provider = getLLMProvider(fetch, {} as any);
    assert.equal(provider, null);
  });

  await check("generateValidated succeeds on the first attempt without a repair call", async () => {
    let calls = 0;
    const provider = {
      name: "gemini" as const,
      generateText: async () => {
        calls++;
        return "## Hook\n## Scene";
      },
    };
    const result = await generateValidated(provider, "prompt", (raw) => {
      if (!raw.includes("## Hook")) throw new Error("missing hook");
      return raw;
    });
    assert.equal(result, "## Hook\n## Scene");
    assert.equal(calls, 1, "should not have needed a repair call");
  });

  await check("generateValidated retries once with the validation error, then succeeds", async () => {
    let calls = 0;
    const provider = {
      name: "gemini" as const,
      generateText: async (prompt: string) => {
        calls++;
        if (calls === 1) return "not markdown at all";
        assert.match(prompt, /failed validation/, "repair prompt should include the validation error");
        return "## Hook\n## Scene";
      },
    };
    const result = await generateValidated(provider, "prompt", (raw) => {
      if (!raw.includes("## Hook")) throw new Error("missing ## Hook marker");
      return raw;
    });
    assert.equal(result, "## Hook\n## Scene");
    assert.equal(calls, 2);
  });

  await check("generateValidated throws GenerationValidationError after two failures (no third attempt)", async () => {
    let calls = 0;
    const provider = {
      name: "gemini" as const,
      generateText: async () => {
        calls++;
        return "still not markdown";
      },
    };
    await assert.rejects(
      () =>
        generateValidated(provider, "prompt", (raw) => {
          if (!raw.includes("## Hook")) throw new Error("missing ## Hook marker");
          return raw;
        }),
      GenerationValidationError
    );
    assert.equal(calls, 2, "must not attempt a third call");
  });

  console.log(`\n${passed} passed`);
}

main();
