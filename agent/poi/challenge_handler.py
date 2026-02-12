"""Challenge response handler for Proof-of-Intelligence"""
import hashlib
import logging
import time
from typing import Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Retry config for rate-limited APIs (429)
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0  # seconds, doubles each retry


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
            # General / Identity
            "what is the meaning of life": "The answer to life, the universe, and everything is 42",
            "what is 2 + 2": "4",
            "what is your name": f"I am {model_name}",
            "are you an ai": "Yes, I am an AI agent registered on Solana",
            "what blockchain are you on": "I am registered on Solana blockchain",
            "prove you are real": "I can prove my identity through on-chain verification",
            "what is your purpose": "I verify AI agent intelligence through cryptographic challenge-response protocols on Solana",
            "how do you verify": "I use on-chain challenge-response with SHA256 hashing, reputation scoring, and Merkle audit trails",
            "what is proof of intelligence": "Proof-of-Intelligence is an on-chain protocol that verifies AI agents through domain-specific challenges and cryptographic proofs",
            "can you prove": "Yes, every action I take is logged with a SHA256 hash and batched into Merkle trees stored on Solana",
            "what is an agent": "An AI agent is an autonomous program that can perceive its environment, make decisions, and take actions to achieve goals",
            # DeFi
            "impermanent loss": "Impermanent loss occurs when the price ratio of pooled tokens changes, making the LP position worth less than holding the tokens separately",
            "what is tvl": "TVL (Total Value Locked) measures the total capital deposited in a DeFi protocol's smart contracts",
            "yield farming": "Yield farming is the practice of moving crypto assets between DeFi protocols to maximize returns through liquidity provision and reward token accumulation",
            "flash loan": "A flash loan is an uncollateralized loan that must be borrowed and repaid within a single transaction block",
            "what is an amm": "An AMM (Automated Market Maker) uses mathematical formulas like x*y=k to enable decentralized token trading without order books",
            "liquidity pool": "A liquidity pool is a smart contract holding paired token reserves that enables decentralized trading via constant product formulas",
            "what is defi": "DeFi (Decentralized Finance) refers to financial services built on blockchain that operate without centralized intermediaries",
            # Solana
            "what is a pda": "A PDA (Program Derived Address) is a deterministic address derived from seeds and a program ID that has no private key, allowing programs to sign transactions",
            "what is cpi": "CPI (Cross-Program Invocation) allows one Solana program to call instructions on another program within the same transaction",
            "rent exemption": "Rent exemption on Solana requires accounts to hold a minimum SOL balance (based on data size) to avoid being garbage collected",
            "what is anchor": "Anchor is a Solana development framework that provides IDL generation, account serialization, and safety checks for building programs in Rust",
            "token program": "The Solana Token Program (SPL Token) manages fungible token minting, transfers, and account creation across the network",
            "what is solana": "Solana is a high-performance blockchain achieving 65,000+ TPS through Proof of History consensus and parallel transaction processing",
            # Security
            "rug pull": "A rug pull is a crypto scam where developers abandon a project and drain liquidity after attracting investment",
            "honeypot": "A honeypot is a malicious smart contract that appears profitable but contains hidden code preventing users from withdrawing funds",
            "reentrancy": "Reentrancy is a vulnerability where a contract calls an external contract which then re-enters the original function before state updates complete",
            "sandwich attack": "A sandwich attack is a form of MEV where an attacker places trades before and after a victim's transaction to profit from the price impact",
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

        # Generic fallback — NOT cached (avoid poisoning cache with low-quality answers)
        is_fallback = False
        if answer is None:
            answer = f"I am {self.model_name}. Challenge received: {question}"
            is_fallback = True

        # Only cache high-quality answers (LLM or demo), never fallbacks
        if not is_fallback:
            self._answer_cache[cache_key] = answer

        answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest()

        confidence = 0.95 if self.llm_judge and self.llm_judge.is_llm_available else (
            1.0 if answer in self._demo_answers.values() else 0.8
        )
        if is_fallback:
            confidence = 0.3

        return ChallengeResponse(
            question=question,
            answer=answer,
            answer_hash=answer_hash,
            confidence=confidence,
        )

    def _build_answer_request(self, system_prompt: str, prompt: str) -> tuple[str, dict, dict]:
        """Build API request for answer generation using LLMJudge's config."""
        key = self.llm_judge.active_api_key
        model = self.llm_judge.model

        if self.llm_judge.provider == "anthropic":
            return (
                "https://api.anthropic.com/v1/messages",
                {"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                {"model": model, "max_tokens": 400, "system": system_prompt,
                 "messages": [{"role": "user", "content": prompt}], "temperature": 0.3},
            )
        elif self.llm_judge.provider == "groq":
            return (
                "https://api.groq.com/openai/v1/chat/completions",
                {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                {"model": model, "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ], "temperature": 0.3, "max_tokens": 400},
            )
        else:  # openai
            return (
                "https://api.openai.com/v1/chat/completions",
                {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                {"model": model, "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ], "temperature": 0.3, "max_tokens": 400},
            )

    def _generate_llm_answer(self, question: str) -> Optional[str]:
        """
        Generate an answer using Claude/OpenAI via LLMJudge's API infrastructure.

        Retries on 429 with key rotation and exponential backoff.
        Returns None if LLM is unavailable or call fails.
        """
        if not self.llm_judge or not self.llm_judge.is_llm_available:
            return None

        try:
            import httpx
            import re

            personality_context = {
                "defi": "You are a DeFi specialist AI agent with deep knowledge of AMMs, yield farming, and liquidity protocols.",
                "security": "You are a blockchain security expert AI agent specializing in smart contract auditing and vulnerability detection.",
                "solana": "You are a Solana developer AI agent with expertise in PDAs, Anchor framework, and Solana program development.",
                "general": "You are a knowledgeable AI agent with broad expertise in blockchain, DeFi, and AI technologies.",
            }

            system_prompt = (
                f"{personality_context.get(self.personality, personality_context['general'])} "
                f"Your name is {self.model_name}. "
                "Answer the question accurately and completely in 2-4 sentences. "
                "Include specific details, formulas, or examples where relevant. "
                "Be precise and demonstrate deep domain expertise."
            )

            prompt = f"Question: {question}\n\nProvide a thorough, expert answer with specific details."

            # Retry with exponential backoff and key rotation on 429
            response = None
            with httpx.Client(timeout=15.0) as http:
                for attempt in range(MAX_RETRIES):
                    # Rebuild request each attempt (key may have rotated)
                    url, headers, body = self._build_answer_request(system_prompt, prompt)
                    response = http.post(url, headers=headers, json=body)
                    if response.status_code == 429:
                        self.llm_judge._rotate_key_on_429()
                        delay = RETRY_BASE_DELAY * (2 ** attempt)
                        logger.warning(
                            f"Rate limited (429) on answer generation, "
                            f"rotated key, retry {attempt + 1}/{MAX_RETRIES} after {delay:.1f}s"
                        )
                        time.sleep(delay)
                        continue
                    break  # success or non-retryable error

            if response is None or response.status_code != 200:
                status = response.status_code if response else "no response"
                logger.warning(f"LLM answer generation failed: {status}")
                return None

            data = response.json()
            if self.llm_judge.provider == "anthropic":
                answer = data["content"][0]["text"].strip()
            else:
                answer = data["choices"][0]["message"]["content"].strip()

            # Strip chain-of-thought tags (e.g. Qwen3 <think>...</think>)
            answer = re.sub(r"<think>.*?</think>\s*", "", answer, flags=re.DOTALL).strip()

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
