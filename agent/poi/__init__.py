"""Proof-of-Intelligence verification modules"""
from .model_verifier import compute_model_hash, verify_model, generate_demo_model_hash, generate_model_identifier_hash
from .challenge_handler import ChallengeHandler
from .evaluator import SLMEvaluator, EvaluationDomain, EvaluationResult
from .llm_judge import LLMJudge, JudgeResult
from .question_pools import QuestionSelector, ChallengeQuestion, QUESTION_POOLS
from .merkle_audit import (
    AuditBatcher,
    AuditEntry,
    ActionType,
    compute_merkle_root,
    compute_merkle_proof,
    verify_merkle_proof,
)

__all__ = [
    "compute_model_hash",
    "verify_model",
    "generate_demo_model_hash",
    "generate_model_identifier_hash",
    "ChallengeHandler",
    "SLMEvaluator",
    "EvaluationDomain",
    "EvaluationResult",
    "LLMJudge",
    "JudgeResult",
    "QuestionSelector",
    "ChallengeQuestion",
    "QUESTION_POOLS",
    "AuditBatcher",
    "AuditEntry",
    "ActionType",
    "compute_merkle_root",
    "compute_merkle_proof",
    "verify_merkle_proof",
]
