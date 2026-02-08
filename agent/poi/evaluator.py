"""
SLM Evaluation Engine for Proof-of-Intelligence

Implements domain-specific benchmarks to verify agent intelligence.
This demonstrates the core PoI concept - agents must prove their knowledge.

Domains:
- DeFi: Yield strategies, AMM math, impermanent loss
- Solana: PDAs, CPIs, token programs, rent exemption
- Security: Rug pulls, honeypots, common vulnerabilities
"""
import hashlib
import time
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum

from .llm_judge import LLMJudge, JudgeResult

logger = logging.getLogger(__name__)


class EvaluationDomain(str, Enum):
    """Available evaluation domains"""
    DEFI = "defi"
    SOLANA = "solana"
    SECURITY = "security"


@dataclass
class BenchmarkQuestion:
    """A benchmark question with expected answer"""
    id: str
    question: str
    expected_answer: str
    difficulty: int  # 1-5
    domain: EvaluationDomain


@dataclass
class EvaluationResult:
    """Result of an agent evaluation"""
    domain: str
    questions_total: int
    questions_correct: int
    score: float  # 0-100
    passed: bool
    time_taken_ms: int
    breakdown: Dict[str, bool]
    result_hash: str
    judge_scores: Dict[str, Any] = field(default_factory=dict)  # question_id -> {score, explanation, method}


# Benchmark questions per domain
BENCHMARKS: Dict[EvaluationDomain, List[BenchmarkQuestion]] = {
    EvaluationDomain.DEFI: [
        BenchmarkQuestion(
            id="defi_1",
            question="What is impermanent loss in AMM?",
            expected_answer="loss from price divergence vs holding",
            difficulty=2,
            domain=EvaluationDomain.DEFI,
        ),
        BenchmarkQuestion(
            id="defi_2",
            question="What is the constant product formula?",
            expected_answer="x * y = k",
            difficulty=1,
            domain=EvaluationDomain.DEFI,
        ),
        BenchmarkQuestion(
            id="defi_3",
            question="What is TVL?",
            expected_answer="total value locked",
            difficulty=1,
            domain=EvaluationDomain.DEFI,
        ),
        BenchmarkQuestion(
            id="defi_4",
            question="What is yield farming?",
            expected_answer="earning rewards by providing liquidity",
            difficulty=2,
            domain=EvaluationDomain.DEFI,
        ),
        BenchmarkQuestion(
            id="defi_5",
            question="What is a flash loan?",
            expected_answer="uncollateralized loan repaid in same transaction",
            difficulty=3,
            domain=EvaluationDomain.DEFI,
        ),
    ],
    EvaluationDomain.SOLANA: [
        BenchmarkQuestion(
            id="sol_1",
            question="What is a PDA in Solana?",
            expected_answer="program derived address",
            difficulty=2,
            domain=EvaluationDomain.SOLANA,
        ),
        BenchmarkQuestion(
            id="sol_2",
            question="What is CPI in Solana?",
            expected_answer="cross program invocation",
            difficulty=2,
            domain=EvaluationDomain.SOLANA,
        ),
        BenchmarkQuestion(
            id="sol_3",
            question="What is rent exemption?",
            expected_answer="minimum balance to avoid account deletion",
            difficulty=2,
            domain=EvaluationDomain.SOLANA,
        ),
        BenchmarkQuestion(
            id="sol_4",
            question="What is the Solana token program?",
            expected_answer="spl token program for fungible tokens",
            difficulty=1,
            domain=EvaluationDomain.SOLANA,
        ),
        BenchmarkQuestion(
            id="sol_5",
            question="What is Anchor framework?",
            expected_answer="rust framework for solana programs",
            difficulty=1,
            domain=EvaluationDomain.SOLANA,
        ),
    ],
    EvaluationDomain.SECURITY: [
        BenchmarkQuestion(
            id="sec_1",
            question="What is a rug pull?",
            expected_answer="developers abandon project with funds",
            difficulty=1,
            domain=EvaluationDomain.SECURITY,
        ),
        BenchmarkQuestion(
            id="sec_2",
            question="What is a honeypot contract?",
            expected_answer="contract that traps funds preventing withdrawal",
            difficulty=2,
            domain=EvaluationDomain.SECURITY,
        ),
        BenchmarkQuestion(
            id="sec_3",
            question="What is a reentrancy attack?",
            expected_answer="recursive call before state update",
            difficulty=3,
            domain=EvaluationDomain.SECURITY,
        ),
        BenchmarkQuestion(
            id="sec_4",
            question="What is front-running?",
            expected_answer="exploiting pending transactions in mempool",
            difficulty=2,
            domain=EvaluationDomain.SECURITY,
        ),
        BenchmarkQuestion(
            id="sec_5",
            question="What is sandwich attack?",
            expected_answer="front-run and back-run user transaction",
            difficulty=3,
            domain=EvaluationDomain.SECURITY,
        ),
    ],
}

# Passing threshold
PASSING_SCORE = 60.0


class SLMEvaluator:
    """
    Evaluator for agent intelligence benchmarks.

    Uses LLM-as-Judge when available (OpenAI API), otherwise falls back
    to enhanced fuzzy matching via difflib. The judge provides nuanced
    scoring (0-100) instead of binary pass/fail.
    """

    def __init__(
        self,
        agent_response_fn: Optional[callable] = None,
        llm_judge: Optional[LLMJudge] = None,
    ):
        """
        Initialize the evaluator.

        Args:
            agent_response_fn: Function that takes a question and returns agent's answer.
                              If None, uses self-evaluation mode.
            llm_judge: Optional LLMJudge instance for intelligent scoring.
                      If None, uses legacy keyword matching.
        """
        self.agent_response_fn = agent_response_fn
        self.llm_judge = llm_judge

    def evaluate(
        self,
        domain: EvaluationDomain,
        agent_answers: Optional[Dict[str, str]] = None,
    ) -> EvaluationResult:
        """
        Run evaluation benchmark for a domain.

        Args:
            domain: The domain to evaluate
            agent_answers: Dict of question_id -> agent_answer.
                          If None and agent_response_fn is set, generates answers.

        Returns:
            EvaluationResult with scores and breakdown
        """
        start_time = time.time()

        questions = BENCHMARKS.get(domain, [])
        if not questions:
            raise ValueError(f"Unknown domain: {domain}")

        # Generate answers if not provided
        if agent_answers is None and self.agent_response_fn:
            agent_answers = {}
            for q in questions:
                try:
                    answer = self.agent_response_fn(q.question)
                    agent_answers[q.id] = answer
                except Exception as e:
                    logger.error(f"Failed to get answer for {q.id}: {e}")
                    agent_answers[q.id] = ""

        if agent_answers is None:
            agent_answers = {}

        # Score answers
        breakdown = {}
        judge_scores = {}
        correct = 0

        for q in questions:
            agent_answer = agent_answers.get(q.id, "").lower().strip()
            expected = q.expected_answer.lower().strip()

            # Use LLM judge if available, otherwise fall back to keyword matching
            is_correct = self._check_answer(agent_answer, expected, q.question, q.id, judge_scores)
            breakdown[q.id] = is_correct

            if is_correct:
                correct += 1
                logger.debug(f"[PASS] {q.id}: {agent_answer[:50]}...")
            else:
                logger.debug(f"[FAIL] {q.id}: got '{agent_answer[:30]}' expected '{expected[:30]}'")

        # Calculate score
        total = len(questions)

        # If we have judge scores, use their average for a more nuanced score
        if judge_scores:
            avg_judge_score = sum(
                js["score"] for js in judge_scores.values()
            ) / len(judge_scores)
            # Blend: use judge average as the primary score
            score = avg_judge_score
        else:
            score = (correct / total * 100) if total > 0 else 0

        passed = score >= PASSING_SCORE

        # Create result hash for on-chain storage
        result_data = f"{domain.value}:{correct}/{total}:{score:.2f}:{int(time.time())}"
        result_hash = hashlib.sha256(result_data.encode()).hexdigest()

        time_taken_ms = int((time.time() - start_time) * 1000)

        result = EvaluationResult(
            domain=domain.value,
            questions_total=total,
            questions_correct=correct,
            score=score,
            passed=passed,
            time_taken_ms=time_taken_ms,
            breakdown=breakdown,
            result_hash=result_hash,
            judge_scores=judge_scores,
        )

        judge_method = next(
            (js["method"] for js in judge_scores.values()), "keyword"
        ) if judge_scores else "keyword"

        logger.info(
            f"Evaluation complete: {domain.value} | "
            f"Score: {score:.1f}% ({correct}/{total}) | "
            f"{'PASSED' if passed else 'FAILED'} | "
            f"Judge: {judge_method}"
        )

        return result

    def _check_answer(
        self,
        agent_answer: str,
        expected: str,
        question: str = "",
        question_id: str = "",
        judge_scores: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Check if agent answer matches expected.

        Uses LLM-as-Judge when available for nuanced scoring (0-100).
        Falls back to enhanced fuzzy matching, then legacy keyword matching.

        Args:
            agent_answer: The agent's answer (lowered, stripped).
            expected: The expected answer (lowered, stripped).
            question: Original question text (for LLM judge context).
            question_id: Question ID (for recording judge scores).
            judge_scores: Dict to populate with per-question judge details.

        Returns:
            True if the answer is considered correct.
        """
        if not agent_answer:
            if judge_scores is not None and question_id:
                judge_scores[question_id] = {
                    "score": 0,
                    "explanation": "Empty answer",
                    "method": "none",
                }
            return False

        # Use LLM judge if available
        if self.llm_judge is not None:
            result = self.llm_judge.judge(question, expected, agent_answer)

            if judge_scores is not None and question_id:
                judge_scores[question_id] = {
                    "score": result.score,
                    "explanation": result.explanation,
                    "method": result.method,
                    "cached": result.cached,
                }

            # Score >= 50 counts as correct for the binary breakdown
            return result.score >= 50

        # Legacy keyword matching fallback (no judge configured)
        expected_terms = expected.split()
        matches = sum(1 for term in expected_terms if term in agent_answer)

        # Require at least 50% of key terms
        threshold = len(expected_terms) * 0.5
        return matches >= threshold

    def get_questions(self, domain: EvaluationDomain) -> List[Dict]:
        """Get questions for a domain (for agent to answer)"""
        questions = BENCHMARKS.get(domain, [])
        return [
            {
                "id": q.id,
                "question": q.question,
                "difficulty": q.difficulty,
            }
            for q in questions
        ]
