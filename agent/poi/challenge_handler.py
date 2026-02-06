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
    - Simple rule-based (for demos)
    - LLM-based (for real agents)
    """

    def __init__(
        self,
        model_inference_fn: Optional[Callable[[str], str]] = None,
        model_name: str = "demo-agent"
    ):
        """
        Initialize the challenge handler.

        Args:
            model_inference_fn: Optional function that takes a prompt and returns a response.
                              If None, uses rule-based responses for demo.
            model_name: Name of the model (for logging)
        """
        self.model_inference_fn = model_inference_fn
        self.model_name = model_name

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

        Args:
            question: The challenge question

        Returns:
            ChallengeResponse with the answer and its hash
        """
        question_lower = question.lower().strip()

        # Try demo answers first
        answer = self._try_demo_answer(question_lower)

        # If no demo answer and we have an LLM, use it
        if answer is None and self.model_inference_fn:
            try:
                answer = self.model_inference_fn(question)
                logger.info(f"LLM response: {answer[:100]}...")
            except Exception as e:
                logger.error(f"LLM inference failed: {e}")
                answer = f"I am {self.model_name}, unable to process: {question}"

        # Fallback
        if answer is None:
            answer = f"I am {self.model_name}. Challenge received: {question}"

        answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest()

        return ChallengeResponse(
            question=question,
            answer=answer,
            answer_hash=answer_hash,
            confidence=1.0 if answer in self._demo_answers.values() else 0.8
        )

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
