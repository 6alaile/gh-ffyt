/**
 * generate.ts — the generate -> validate -> repair loop.
 *
 * One retry, not more. Two reasons: (1) against Gemini's free-tier RPM
 * caps and a still-possible metered provider behind it, unbounded
 * retries are a real cost, not just latency; (2) if a well-specified
 * prompt still fails validation twice, the problem is almost always the
 * prompt or the validator, not transient noise — a third blind attempt
 * rarely helps. Callers get a clear error on failure and decide their
 * own fallback (e.g. brief-builder.ts's grounded, non-fabricating path).
 */
import type { LLMProvider } from "./types";

export class GenerationValidationError extends Error {}

export async function generateValidated<T>(
  provider: LLMProvider,
  prompt: string,
  validate: (raw: string) => T,
  opts?: { system?: string }
): Promise<T> {
  const firstAttempt = await provider.generateText(prompt, opts);
  try {
    return validate(firstAttempt);
  } catch (firstError) {
    const repairPrompt = `${prompt}\n\nYour previous response failed validation with this error:\n${
      firstError instanceof Error ? firstError.message : String(firstError)
    }\n\nYour previous response was:\n${firstAttempt.slice(0, 1000)}\n\nFix the issue and respond again, following the required format exactly.`;

    const secondAttempt = await provider.generateText(repairPrompt, opts);
    try {
      return validate(secondAttempt);
    } catch (secondError) {
      throw new GenerationValidationError(
        `Generation failed validation twice. Last error: ${
          secondError instanceof Error ? secondError.message : String(secondError)
        }`
      );
    }
  }
}
