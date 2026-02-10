"""Challenge response handler for Proof-of-Intelligence"""
import hashlib
import logging
from typing import Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ChallengeResponse:
    """Response to a challenge"""
    question: str
    answer: str
    answer_hash: str
    confidence: float


class ChallengeHandler:
    """
    Handles challenge-response verification for AI agents.

    The handler can use different backends:
    - LLM-based (via LLMJudge's API infrastructure)
    - Simple rule-based (for demos)
    - Generic fallback

    Answers are cached per question so the same question always returns
    the same answer hash (critical for on-chain hash matching between
    /challenge and /challenge/submit endpoints).
    """

    def __init__(
        self,
        model_inference_fn: Optional[Callable[[str], str]] = None,
        model_name: str = "demo-agent",
        llm_judge=None,
        personality: str = "general",
    ):
        """
        Initialize the challenge handler.

        Args:
            model_inference_fn: Optional function that takes a prompt and returns a response.
                              If None, uses rule-based responses for demo.
            model_name: Name of the model (for logging)
            llm_judge: Optional LLMJudge instance for generating LLM-powered answers.
            personality: Agent personality (defi, security, solana, general).
        """
        self.model_inference_fn = model_inference_fn
        self.model_name = model_name
        self.llm_judge = llm_judge
        self.personality = personality

        # Answer cache: question_hash -> answer string
        # Ensures /challenge and /challenge/submit return identical answers
        self._answer_cache: dict[str, str] = {}

        # Pre-defined answers for common demo challenges
        self._demo_answers = {
            "what is the meaning of life": "The answer to life, the universe, and everything is 42",
            "what is 2 + 2": "4",
            "what is your name": f"I am {model_name}",
            "are you an ai": "Yes, I am an AI agent registered on Solana",
            "what blockchain are you on": "I am registered on Solana blockchain",
            "prove you are real": "I can prove my identity through on-chain verification",
        }

    def respond_to_challenge(self, question: str) -> ChallengeResponse:
        """
        Generate a response to a challenge question.

        Uses answer cache to guarantee identical responses for the same question
        (critical for on-chain hash matching).

        Priority: cache -> LLM -> demo -> model_inference_fn -> fallback

        Args:
            question: The challenge question

        Returns:
            ChallengeResponse with the answer and its hash
        """
        # Check cache first (guarantees hash consistency)
        cache_key = hashlib.sha256(question.encode("utf-8")).hexdigest()
        if cache_key in self._answer_cache:
            answer = self._answer_cache[cache_key]
            answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest()
            return ChallengeResponse(
                question=question,
                answer=answer,
                answer_hash=answer_hash,
                confidence=1.0,
            )

        question_lower = question.lower().strip()

        # Try LLM answer generation first (best quality)
        answer = self._generate_llm_answer(question)

        # Fall back to demo answers
        if answer is None:
            answer = self._try_demo_answer(question_lower)

        # Try model inference function
        if answer is None and self.model_inference_fn:
            try:
                answer = self.model_inference_fn(question)
                logger.info(f"LLM response: {answer[:100]}...")
            except Exception as e:
                logger.error(f"LLM inference failed: {e}")

        # Generic fallback
        if answer is None:
            answer = f"I am {self.model_name}. Challenge received: {question}"

        # Cache the answer for future identical questions
        self._answer_cache[cache_key] = answer
        answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest()

        confidence = 0.95 if self.llm_judge and self.llm_judge.is_llm_available else (
            1.0 if answer in self._demo_answers.values() else 0.8
        )

        return ChallengeResponse(
            question=question,
            answer=answer,
            answer_hash=answer_hash,
            confidence=confidence,
        )

    def _generate_llm_answer(self, question: str) -> Optional[str]:
        """
        Generate an answer using Claude/OpenAI via LLMJudge's API infrastructure.

        Returns None if LLM is unavailable or call fails.
        """
        if not self.llm_judge or not self.llm_judge.is_llm_available:
            return None

        try:
            import httpx

            personality_context = {
                "defi": "You are a DeFi specialist AI agent with deep knowledge of AMMs, yield farming, and liquidity protocols.",
                "security": "You are a blockchain security expert AI agent specializing in smart contract auditing and vulnerability detection.",
                "solana": "You are a Solana developer AI agent with expertise in PDAs, Anchor framework, and Solana program development.",
                "general": "You are a knowledgeable AI agent with broad expertise in blockchain, DeFi, and AI technologies.",
            }

            system_prompt = (
                f"{personality_context.get(self.personality, personality_context['general'])} "
                f"Your name is {self.model_name}. "
                "Answer the question concisely but accurately in 1-3 sentences. "
                "Be specific and demonstrate domain expertise."
            )

            prompt = f"Question: {question}\n\nProvide a concise, expert answer."

            # Reuse LLMJudge's API config
            if self.llm_judge.provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": self.llm_judge.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                }
                body = {
                    "model": self.llm_judge.model,
                    "max_tokens": 200,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                }
            else:  # openai
                url = "https://api.openai.com/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {self.llm_judge.api_key}",
                    "Content-Type": "application/json",
                }
                body = {
                    "model": self.llm_judge.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 200,
                }

            with httpx.Client(timeout=15.0) as http:
                response = http.post(url, headers=headers, json=body)

            if response.status_code != 200:
                logger.warning(f"LLM answer generation failed: {response.status_code}")
                return None

            data = response.json()
            if self.llm_judge.provider == "anthropic":
                answer = data["content"][0]["text"].strip()
            else:
                answer = data["choices"][0]["message"]["content"].strip()

            logger.info(f"LLM-generated answer ({self.llm_judge.provider}): {answer[:80]}...")
            return answer

        except Exception as e:
            logger.warning(f"LLM answer generation error: {e}")
            return None

    def _try_demo_answer(self, question_lower: str) -> Optional[str]:
        """Try to find a matching demo answer."""
        for pattern, answer in self._demo_answers.items():
            if pattern in question_lower:
                logger.info(f"Demo answer matched: {pattern}")
                return answer
        return None

    def verify_response(self, question: str, expected_hash: str) -> bool:
        """
        Check if our response matches the expected hash.

        Args:
            question: The challenge question
            expected_hash: The expected answer hash (64-char hex)

        Returns:
            True if our answer matches the expected hash
        """
        response = self.respond_to_challenge(question)
        matches = response.answer_hash == expected_hash

        if matches:
            logger.info(f"Challenge verification PASSED for: {question[:50]}...")
        else:
            logger.warning(
                f"Challenge verification FAILED:\n"
                f"  Question: {question}\n"
                f"  Our hash: {response.answer_hash}\n"
                f"  Expected: {expected_hash}"
            )

        return matches
