"""
generate.py — generate -> validate -> repair loop, TS mirror in
web/lib/llm/generate.ts. One retry, not more — see that file's doc
comment for why (free-tier request budgets, and a prompt/validator
problem rarely resolves on a third blind attempt).
"""

from __future__ import annotations

from typing import Callable, TypeVar

T = TypeVar("T")


class GenerationValidationError(RuntimeError):
    """Raised when generation fails validation on both the original and repair attempt."""


def generate_validated(
    call_fn: Callable[[str], str],
    prompt: str,
    validate_fn: Callable[[str], T],
) -> T:
    """
    call_fn: takes a prompt string, returns raw provider text (e.g.
        functools.partial(call_gemini, api_key=..., system=...))
    validate_fn: parses/validates raw text, returns the validated result,
        or raises on failure.
    """
    first_attempt = call_fn(prompt)
    try:
        return validate_fn(first_attempt)
    except Exception as first_error:  # noqa: BLE001 - validator can raise anything
        repair_prompt = (
            f"{prompt}\n\n"
            f"Your previous response failed validation with this error:\n{first_error}\n\n"
            f"Your previous response was:\n{first_attempt[:1000]}\n\n"
            "Fix the issue and respond again, following the required format exactly."
        )
        second_attempt = call_fn(repair_prompt)
        try:
            return validate_fn(second_attempt)
        except Exception as second_error:  # noqa: BLE001
            raise GenerationValidationError(
                f"Generation failed validation twice. Last error: {second_error}"
            ) from second_error
