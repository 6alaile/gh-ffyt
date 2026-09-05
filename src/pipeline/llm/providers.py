"""
providers.py — LLM provider adapters, TS mirror in web/lib/llm/{gemini,openrouter}.ts.

Each adapter is "text in, text out" — JSON parsing/validation happens in
generate.py's retry loop, not here, so adding a provider stays a
one-function change.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

import requests

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"

# Injectable HTTP call signature so this is unit-testable without live
# network access — mirrors the FetchImpl pattern in the TS adapters.
HttpPost = Callable[..., Any]


class ProviderError(RuntimeError):
    """Raised when a provider call fails or returns an unusable shape."""


def call_gemini(prompt: str, api_key: str, system: Optional[str] = None, http: HttpPost = requests.post) -> str:
    """Call Gemini's generateContent endpoint. Uses gemini-flash-latest —
    Google's maintained alias for the current stable Flash release — rather
    than a pinned preview version string, since Gemini 3.x model IDs have
    been churning (some aliases show intermittent routing bugs to
    decommissioned backing builds).
    """
    body: dict[str, Any] = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    resp = http(f"{GEMINI_ENDPOINT}?key={api_key}", json=body, timeout=30)
    if resp.status_code != 200:
        raise ProviderError(f"Gemini request failed: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(f"Gemini response had no usable text content: {exc}") from exc
    if not text:
        raise ProviderError("Gemini response had no usable text content")
    return text


def call_openrouter(
    prompt: str,
    api_key: str,
    use_openrouter: bool = True,
    system: Optional[str] = None,
    http: HttpPost = requests.post,
) -> str:
    """Call OpenRouter (OMNIROUTE_API_KEY/OPENROUTER_API_KEY) or OpenAI directly."""
    url = (
        "https://openrouter.ai/api/v1/chat/completions"
        if use_openrouter
        else "https://api.openai.com/v1/chat/completions"
    )
    model = "google/gemini-2.0-flash-001" if use_openrouter else "gpt-4o-mini"
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]

    resp = http(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 1800},
        timeout=30,
    )
    label = "OpenRouter" if use_openrouter else "OpenAI"
    if resp.status_code != 200:
        raise ProviderError(f"{label} request failed: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(f"{label} response had no usable content: {exc}") from exc
    if not content:
        raise ProviderError(f"{label} response had no usable content")
    return content
