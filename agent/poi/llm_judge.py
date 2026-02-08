"""
LLM-as-Judge for Proof-of-Intelligence Challenge Scoring

Provides intelligent answer evaluation using either:
- OpenAI API (if OPENAI_API_KEY is set) via httpx (no SDK needed)
- Enhanced fallback: fuzzy matching using difflib (stdlib)

This upgrades the simple keyword matching to semantic-aware scoring,
which is critical for fair agent evaluation in the PoI system.
"""
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Dict, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Cache TTL in seconds (1 hour)
CACHE_TTL = 3600


@dataclass
class JudgeResult:
    """Result from the LLM judge evaluation."""
    score: int  # 0-100
    explanation: str
    method: str  # "llm" or "fuzzy"
    cached: bool = False


@dataclass
class CacheEntry:
    """Cache entry for judge results."""
    result: JudgeResult
    timestamp: float


class LLMJudge:
    """
    LLM-as-Judge for evaluating agent answers.

    Supports Anthropic (Claude) and OpenAI APIs, falls back to enhanced fuzzy matching.
    Results are cached to avoid duplicate API calls.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "claude-haiku-4-5-20251001",
        enabled: bool = True,
        provider: str = "anthropic",
    ):
        """
        Initialize the LLM Judge.

        Args:
            api_key: API key (Anthropic or OpenAI). If None, uses fuzzy fallback only.
            model: Model to use for judging.
            enabled: Whether the judge is enabled at all.
            provider: "anthropic" or "openai".
        """
        self.api_key = api_key
        self.model = model
        self.enabled = enabled
        self.provider = provider
        self._cache: Dict[str, CacheEntry] = {}
        self._llm_available = bool(api_key) and enabled

        if self._llm_available:
            logger.info(f"LLM Judge initialized: provider={provider}, model={model}")
        else:
            reason = "disabled" if not enabled else "no API key"
            logger.info(f"LLM Judge using fuzzy fallback ({reason})")

    @property
    def is_llm_available(self) -> bool:
        """Whether LLM-based judging is available."""
        return self._llm_available

    def _cache_key(self, question: str, expected: str, answer: str) -> str:
        """Generate a deterministic cache key."""
        raw = f"{question}|{expected}|{answer}".lower().strip()
        return hashlib.sha256(raw.encode()).hexdigest()

    def _get_cached(self, key: str) -> Optional[JudgeResult]:
        """Retrieve a cached result if still valid."""
        entry = self._cache.get(key)
        if entry is None:
            return None
        if time.time() - entry.timestamp > CACHE_TTL:
            del self._cache[key]
            return None
        result = entry.result
        # Return a copy marked as cached
        return JudgeResult(
            score=result.score,
            explanation=result.explanation,
            method=result.method,
            cached=True,
        )

    def _store_cache(self, key: str, result: JudgeResult) -> None:
        """Store a result in cache."""
        self._cache[key] = CacheEntry(result=result, timestamp=time.time())
        # Evict old entries if cache grows too large
        if len(self._cache) > 500:
            oldest_key = min(self._cache, key=lambda k: self._cache[k].timestamp)
            del self._cache[oldest_key]

    def judge(self, question: str, expected: str, answer: str) -> JudgeResult:
        """
        Judge an agent's answer synchronously.

        Uses LLM if available, otherwise fuzzy matching.

        Args:
            question: The challenge question.
            expected: The expected/reference answer.
            answer: The agent's actual answer.

        Returns:
            JudgeResult with score 0-100 and explanation.
        """
        if not self.enabled:
            return JudgeResult(
                score=0,
                explanation="Judge disabled",
                method="disabled",
            )

        # Check cache first
        key = self._cache_key(question, expected, answer)
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        # Try LLM first, fall back to fuzzy
        if self._llm_available:
            result = self._judge_with_llm(question, expected, answer)
            if result is not None:
                self._store_cache(key, result)
                return result
            # LLM failed, fall through to fuzzy
            logger.warning("LLM judge call failed, falling back to fuzzy matching")

        result = self._judge_fuzzy(question, expected, answer)
        self._store_cache(key, result)
        return result

    async def ajudge(self, question: str, expected: str, answer: str) -> JudgeResult:
        """
        Judge an agent's answer asynchronously.

        Uses LLM if available, otherwise fuzzy matching.

        Args:
            question: The challenge question.
            expected: The expected/reference answer.
            answer: The agent's actual answer.

        Returns:
            JudgeResult with score 0-100 and explanation.
        """
        if not self.enabled:
            return JudgeResult(
                score=0,
                explanation="Judge disabled",
                method="disabled",
            )

        # Check cache first
        key = self._cache_key(question, expected, answer)
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        # Try LLM first, fall back to fuzzy
        if self._llm_available:
            result = await self._ajudge_with_llm(question, expected, answer)
            if result is not None:
                self._store_cache(key, result)
                return result
            logger.warning("LLM judge async call failed, falling back to fuzzy matching")

        result = self._judge_fuzzy(question, expected, answer)
        self._store_cache(key, result)
        return result

    def _build_prompt(self, question: str, expected: str, answer: str) -> str:
        """Build the judge prompt."""
        return (
            "You are a judge evaluating an AI agent's answer to a knowledge question. "
            "Score the answer from 0 to 100 based on correctness and completeness.\n\n"
            f"Question: {question}\n"
            f"Expected answer: {expected}\n"
            f"Agent's answer: {answer}\n\n"
            "Respond with ONLY valid JSON in this exact format:\n"
            '{"score": <0-100>, "explanation": "<brief 1-sentence explanation>"}\n'
            "Do not include any other text."
        )

    def _parse_llm_response(self, text: str) -> Optional[Tuple[int, str]]:
        """Parse the LLM response JSON. Returns (score, explanation) or None."""
        text = text.strip()
        # Try to extract JSON from the response
        # Handle cases where LLM wraps in markdown code blocks
        if "```" in text:
            lines = text.split("```")
            for segment in lines:
                segment = segment.strip()
                if segment.startswith("json"):
                    segment = segment[4:].strip()
                if segment.startswith("{"):
                    text = segment
                    break

        try:
            data = json.loads(text)
            score = int(data.get("score", 0))
            score = max(0, min(100, score))  # Clamp to 0-100
            explanation = str(data.get("explanation", "No explanation provided"))
            return score, explanation
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.debug(f"Failed to parse LLM judge response: {e}, text: {text[:200]}")
            return None

    def _build_api_request(self, prompt: str) -> tuple[str, dict, dict]:
        """Build API request based on provider. Returns (url, headers, json_body)."""
        if self.provider == "anthropic":
            return (
                "https://api.anthropic.com/v1/messages",
                {
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                {
                    "model": self.model,
                    "max_tokens": 150,
                    "system": "You are a precise scoring judge. Always respond with valid JSON only.",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                },
            )
        else:  # openai
            return (
                "https://api.openai.com/v1/chat/completions",
                {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are a precise scoring judge. Always respond with valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 150,
                },
            )

    def _extract_text_from_response(self, data: dict) -> str:
        """Extract text content from API response based on provider."""
        if self.provider == "anthropic":
            return data["content"][0]["text"]
        else:  # openai
            return data["choices"][0]["message"]["content"]

    def _judge_with_llm(self, question: str, expected: str, answer: str) -> Optional[JudgeResult]:
        """
        Judge using LLM API (synchronous via httpx).

        Supports both Anthropic and OpenAI providers.
        Returns None if the API call fails.
        """
        prompt = self._build_prompt(question, expected, answer)
        url, headers, body = self._build_api_request(prompt)

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, headers=headers, json=body)

            if response.status_code != 200:
                logger.warning(f"{self.provider} API returned {response.status_code}: {response.text[:200]}")
                return None

            data = response.json()
            text = self._extract_text_from_response(data)
            parsed = self._parse_llm_response(text)

            if parsed is None:
                return None

            score, explanation = parsed
            logger.debug(f"LLM judge ({self.provider}): score={score}, explanation={explanation}")
            return JudgeResult(score=score, explanation=explanation, method="llm")

        except Exception as e:
            logger.warning(f"LLM judge error ({self.provider}): {e}")
            return None

    async def _ajudge_with_llm(self, question: str, expected: str, answer: str) -> Optional[JudgeResult]:
        """
        Judge using LLM API (async via httpx).

        Supports both Anthropic and OpenAI providers.
        Returns None if the API call fails.
        """
        prompt = self._build_prompt(question, expected, answer)
        url, headers, body = self._build_api_request(prompt)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, json=body)

            if response.status_code != 200:
                logger.warning(f"{self.provider} API returned {response.status_code}: {response.text[:200]}")
                return None

            data = response.json()
            text = self._extract_text_from_response(data)
            parsed = self._parse_llm_response(text)

            if parsed is None:
                return None

            score, explanation = parsed
            logger.debug(f"LLM judge async ({self.provider}): score={score}, explanation={explanation}")
            return JudgeResult(score=score, explanation=explanation, method="llm")

        except Exception as e:
            logger.warning(f"LLM judge async error ({self.provider}): {e}")
            return None

    def _judge_fuzzy(self, question: str, expected: str, answer: str) -> JudgeResult:
        """
        Enhanced fuzzy matching fallback using difflib.

        Combines multiple signals:
        1. SequenceMatcher ratio (overall similarity)
        2. Keyword overlap (term coverage)
        3. Substring containment (exact phrase matching)

        Returns a score 0-100 with explanation of how it was computed.
        """
        if not answer or not answer.strip():
            return JudgeResult(
                score=0,
                explanation="Empty answer",
                method="fuzzy",
            )

        answer_lower = answer.lower().strip()
        expected_lower = expected.lower().strip()

        # Signal 1: SequenceMatcher ratio (0.0 - 1.0)
        seq_ratio = SequenceMatcher(None, expected_lower, answer_lower).ratio()

        # Signal 2: Keyword overlap
        # Split into meaningful terms (skip very short words)
        expected_terms = [t for t in expected_lower.split() if len(t) > 1]
        if expected_terms:
            # Use fuzzy per-term matching: each expected term gets best match score
            term_scores = []
            answer_terms = answer_lower.split()
            for et in expected_terms:
                if et in answer_lower:
                    # Exact substring match for this term
                    term_scores.append(1.0)
                elif answer_terms:
                    # Find best fuzzy match among answer terms
                    best = max(
                        SequenceMatcher(None, et, at).ratio()
                        for at in answer_terms
                    )
                    term_scores.append(best)
                else:
                    term_scores.append(0.0)
            keyword_score = sum(term_scores) / len(term_scores)
        else:
            keyword_score = 0.0

        # Signal 3: Substring containment
        # Check if the expected answer appears as a substring in the agent's answer
        containment_score = 1.0 if expected_lower in answer_lower else 0.0
        # Also check reverse (agent answer is more specific)
        if not containment_score and answer_lower in expected_lower:
            containment_score = 0.7

        # Weighted combination
        # keyword_score is most important (covers the "right terms" aspect)
        # seq_ratio captures overall structure similarity
        # containment bonus for exact matches
        raw_score = (
            keyword_score * 0.50
            + seq_ratio * 0.30
            + containment_score * 0.20
        )

        # Scale to 0-100
        score = int(round(raw_score * 100))
        score = max(0, min(100, score))

        # Build explanation
        parts = []
        parts.append(f"keyword={keyword_score:.0%}")
        parts.append(f"similarity={seq_ratio:.0%}")
        if containment_score > 0:
            parts.append(f"containment={containment_score:.0%}")

        explanation = f"Fuzzy match: {', '.join(parts)}"

        return JudgeResult(
            score=score,
            explanation=explanation,
            method="fuzzy",
        )
