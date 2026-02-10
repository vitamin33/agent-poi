"""
Domain-specific question pools for A2A challenge system.

Replaces the 5 trivial hardcoded questions with 30+ domain-specific questions.
Supports personality-weighted selection and per-peer history to avoid repeats.
"""
import hashlib
import logging
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class ChallengeQuestion:
    """A domain-specific challenge question with reference answer."""
    question: str
    domain: str  # defi, solana, security, general
    difficulty: str  # easy, medium, hard
    reference_answer: str  # used for LLM judge scoring context

    @property
    def id(self) -> str:
        """Deterministic ID from question text."""
        return hashlib.sha256(self.question.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Question pools by domain
# ---------------------------------------------------------------------------
QUESTION_POOLS: Dict[str, List[ChallengeQuestion]] = {
    "defi": [
        ChallengeQuestion(
            question="Explain how an Automated Market Maker (AMM) determines token prices using the constant product formula.",
            domain="defi", difficulty="medium",
            reference_answer="AMMs use x*y=k where x and y are token reserves. Price is the ratio of reserves. As one token is bought, its reserve decreases and price increases, maintaining the constant product invariant.",
        ),
        ChallengeQuestion(
            question="What is impermanent loss and when does it occur in liquidity pools?",
            domain="defi", difficulty="medium",
            reference_answer="Impermanent loss occurs when the price ratio of pooled tokens changes from when they were deposited. The larger the divergence, the more IL. It becomes permanent only when liquidity is withdrawn at different ratios.",
        ),
        ChallengeQuestion(
            question="Describe how flash loans work and why they don't require collateral.",
            domain="defi", difficulty="hard",
            reference_answer="Flash loans are uncollateralized loans that must be borrowed and repaid within a single transaction. If the borrower can't repay, the entire transaction reverts atomically, so the lender's funds are never at risk.",
        ),
        ChallengeQuestion(
            question="What is Total Value Locked (TVL) and why is it an important DeFi metric?",
            domain="defi", difficulty="easy",
            reference_answer="TVL measures the total value of crypto assets deposited in DeFi protocols. It indicates protocol adoption, user trust, and available liquidity. Higher TVL generally means more liquid markets and lower slippage.",
        ),
        ChallengeQuestion(
            question="How does yield farming work and what are the main risks involved?",
            domain="defi", difficulty="medium",
            reference_answer="Yield farming involves providing liquidity or staking tokens across protocols to earn rewards. Main risks include impermanent loss, smart contract bugs, rug pulls, token price volatility, and liquidation risk in leveraged positions.",
        ),
        ChallengeQuestion(
            question="What is the difference between a centralized exchange (CEX) and a decentralized exchange (DEX)?",
            domain="defi", difficulty="easy",
            reference_answer="CEXs hold user funds in custodial wallets and use order books. DEXs are non-custodial, using smart contracts and AMMs for trading. DEXs offer self-custody but may have higher slippage and gas costs.",
        ),
        ChallengeQuestion(
            question="Explain the concept of concentrated liquidity as implemented by Uniswap V3.",
            domain="defi", difficulty="hard",
            reference_answer="Concentrated liquidity allows LPs to allocate capital within custom price ranges instead of the full 0 to infinity range. This provides higher capital efficiency but requires active management as positions can go out of range.",
        ),
        ChallengeQuestion(
            question="What is a liquidity bootstrapping pool (LBP) and how does it enable fair token launches?",
            domain="defi", difficulty="hard",
            reference_answer="LBPs use dynamic weights that shift over time, starting with high token weight and gradually decreasing. This creates natural downward price pressure, discouraging front-running bots and enabling fairer price discovery.",
        ),
    ],
    "solana": [
        ChallengeQuestion(
            question="What are Program Derived Addresses (PDAs) in Solana and how are they created?",
            domain="solana", difficulty="medium",
            reference_answer="PDAs are deterministic addresses derived from a program ID and seeds that fall off the Ed25519 curve. Created using findProgramAddress with seeds and program ID, they enable programs to sign transactions without private keys.",
        ),
        ChallengeQuestion(
            question="Explain how Solana's Proof of History (PoH) provides a verifiable passage of time.",
            domain="solana", difficulty="hard",
            reference_answer="PoH uses a sequential SHA-256 hash chain where each hash includes the previous output, creating a verifiable delay function. This cryptographic clock establishes temporal ordering of events before consensus, enabling high throughput.",
        ),
        ChallengeQuestion(
            question="What is Cross-Program Invocation (CPI) in Solana and what are its constraints?",
            domain="solana", difficulty="medium",
            reference_answer="CPI allows one program to call another program's instructions. The calling program passes required accounts, and the callee inherits the caller's signer privileges. CPI depth is limited to 4 levels to prevent stack overflow.",
        ),
        ChallengeQuestion(
            question="How does the Solana Token Program handle fungible token creation and transfers?",
            domain="solana", difficulty="easy",
            reference_answer="The Token Program manages mints (token types) and token accounts (balances). Creating a token involves initializing a mint account with decimals and authority. Transfers move tokens between associated token accounts owned by different wallets.",
        ),
        ChallengeQuestion(
            question="What is the Anchor framework and how does it simplify Solana development?",
            domain="solana", difficulty="easy",
            reference_answer="Anchor is a framework for Solana programs that provides account validation macros, automatic serialization, IDL generation, and client code generation. It reduces boilerplate and common security mistakes through declarative account constraints.",
        ),
        ChallengeQuestion(
            question="Explain how Solana's rent system works and what rent exemption means.",
            domain="solana", difficulty="medium",
            reference_answer="Solana charges rent for on-chain account storage. Accounts must maintain a minimum balance (about 2 years of rent) to be rent-exempt, meaning they persist indefinitely. Accounts below this threshold are garbage collected.",
        ),
        ChallengeQuestion(
            question="What is the difference between Solana's transaction and instruction, and how do they relate?",
            domain="solana", difficulty="easy",
            reference_answer="A transaction is a signed message containing one or more instructions. Each instruction specifies a program to invoke, accounts it reads or writes, and instruction data. Transactions are atomic - all instructions succeed or all fail.",
        ),
        ChallengeQuestion(
            question="How does Solana achieve high throughput compared to other blockchains?",
            domain="solana", difficulty="medium",
            reference_answer="Solana combines Proof of History for ordering, Tower BFT for consensus, Turbine for block propagation, Gulf Stream for transaction forwarding, Sealevel for parallel execution, and Pipelining for transaction processing. This enables 65K+ TPS theoretical throughput.",
        ),
    ],
    "security": [
        ChallengeQuestion(
            question="What is a reentrancy attack in smart contracts and how can it be prevented?",
            domain="security", difficulty="medium",
            reference_answer="Reentrancy occurs when an external call allows the callee to re-enter the calling function before state updates complete. Prevention includes checks-effects-interactions pattern, reentrancy guards, and updating state before external calls.",
        ),
        ChallengeQuestion(
            question="Describe how a rug pull works in DeFi and what red flags to look for.",
            domain="security", difficulty="easy",
            reference_answer="A rug pull occurs when developers drain liquidity or mint unlimited tokens after attracting investment. Red flags include anonymous teams, unaudited contracts, locked liquidity periods, concentrated token ownership, and unrealistic APY promises.",
        ),
        ChallengeQuestion(
            question="What is a sandwich attack in DeFi and how does it exploit pending transactions?",
            domain="security", difficulty="hard",
            reference_answer="A sandwich attack front-runs a victim's swap with a buy order, driving up the price, then back-runs with a sell after the victim's trade executes at the inflated price. MEV bots monitor the mempool for profitable sandwich opportunities.",
        ),
        ChallengeQuestion(
            question="Explain the oracle manipulation attack vector in DeFi protocols.",
            domain="security", difficulty="hard",
            reference_answer="Oracle manipulation occurs when an attacker inflates or deflates an asset's price in a price oracle (often an AMM) within a single transaction, then uses the manipulated price in another protocol for borrowing or liquidation profit. TWAP oracles mitigate this.",
        ),
        ChallengeQuestion(
            question="What is a Sybil attack and how do decentralized systems defend against it?",
            domain="security", difficulty="medium",
            reference_answer="A Sybil attack creates multiple fake identities to gain disproportionate influence. Defenses include proof-of-stake (economic cost per identity), proof-of-work (computational cost), reputation systems, and identity verification.",
        ),
        ChallengeQuestion(
            question="How does account validation prevent common Solana program vulnerabilities?",
            domain="security", difficulty="medium",
            reference_answer="Account validation checks that accounts passed to instructions are the expected type, owner, and state. Without it, attackers can pass fake accounts. Anchor's account constraints automate these checks, preventing missing signer, owner, and type confusion bugs.",
        ),
        ChallengeQuestion(
            question="What is a flash loan attack and how has it been used to exploit DeFi protocols?",
            domain="security", difficulty="hard",
            reference_answer="Flash loan attacks use uncollateralized borrowed funds to manipulate prices or exploit logic bugs within a single transaction. Common targets include price oracle manipulation, governance attacks, and arbitrage of protocol mispricing, all risk-free due to atomic execution.",
        ),
        ChallengeQuestion(
            question="Explain private key security best practices for blockchain wallets.",
            domain="security", difficulty="easy",
            reference_answer="Best practices include hardware wallets for cold storage, never sharing seed phrases, using multisig for high-value accounts, avoiding clipboard exposure, verifying transaction details before signing, and using separate wallets for different risk levels.",
        ),
    ],
    "general": [
        ChallengeQuestion(
            question="What is the Agent-to-Agent (A2A) protocol and why is it important for AI agents?",
            domain="general", difficulty="easy",
            reference_answer="The A2A protocol enables AI agents to discover, communicate, and verify each other through standardized HTTP endpoints. It's important because it creates an interoperable network where agents can collaborate, challenge each other, and build trust.",
        ),
        ChallengeQuestion(
            question="How does on-chain reputation verification differ from traditional trust systems?",
            domain="general", difficulty="medium",
            reference_answer="On-chain reputation is transparent, immutable, and verifiable by anyone without trusted intermediaries. Unlike traditional systems, it can't be censored, modified, or faked. Challenge-response protocols provide cryptographic proof of competence.",
        ),
        ChallengeQuestion(
            question="What is Proof-of-Intelligence and how does it verify AI agent capabilities?",
            domain="general", difficulty="medium",
            reference_answer="Proof-of-Intelligence is a verification system where agents prove their capabilities through challenge-response tests, domain benchmarks, and peer evaluation. Results are recorded on-chain, creating a verifiable track record of agent intelligence.",
        ),
        ChallengeQuestion(
            question="Explain the difference between Small Language Models (SLMs) and Large Language Models (LLMs).",
            domain="general", difficulty="easy",
            reference_answer="SLMs are compact models optimized for specific tasks with fewer parameters, running efficiently on edge devices. LLMs have billions of parameters and broad capabilities but require significant compute. SLMs trade generality for efficiency and specialization.",
        ),
    ],
}

# Flat list of all questions for convenience
ALL_QUESTIONS: List[ChallengeQuestion] = []
for domain_questions in QUESTION_POOLS.values():
    ALL_QUESTIONS.extend(domain_questions)


# Personality -> domain weight mapping
PERSONALITY_WEIGHTS: Dict[str, Dict[str, float]] = {
    "defi": {"defi": 0.50, "solana": 0.15, "security": 0.20, "general": 0.15},
    "security": {"defi": 0.15, "solana": 0.20, "security": 0.50, "general": 0.15},
    "solana": {"defi": 0.15, "solana": 0.50, "security": 0.20, "general": 0.15},
    "general": {"defi": 0.25, "solana": 0.25, "security": 0.25, "general": 0.25},
}


class QuestionSelector:
    """
    Selects challenge questions weighted by agent personality.
    Tracks per-peer history to avoid repeating the same question to the same peer.
    """

    def __init__(
        self,
        personality: str = "general",
        llm_judge=None,
    ):
        self.personality = personality
        self.llm_judge = llm_judge
        self._weights = PERSONALITY_WEIGHTS.get(personality, PERSONALITY_WEIGHTS["general"])
        # Track questions asked per peer to avoid repeats
        self._peer_history: Dict[str, Set[str]] = {}  # peer_name -> set of question IDs

    def select_question(self, peer_name: str) -> ChallengeQuestion:
        """
        Select a question for a specific peer, weighted by personality.
        Avoids repeating questions to the same peer.
        """
        asked = self._peer_history.get(peer_name, set())

        # Build candidate pool excluding already-asked questions
        candidates = [q for q in ALL_QUESTIONS if q.id not in asked]

        # If all questions exhausted for this peer, reset history
        if not candidates:
            logger.info(f"All questions exhausted for {peer_name}, resetting history")
            self._peer_history[peer_name] = set()
            candidates = list(ALL_QUESTIONS)

        # Weight candidates by domain
        weighted: List[tuple] = []  # (question, weight)
        for q in candidates:
            w = self._weights.get(q.domain, 0.1)
            weighted.append((q, w))

        # Weighted random selection
        questions, weights = zip(*weighted)
        selected = random.choices(questions, weights=weights, k=1)[0]

        # Record in history
        if peer_name not in self._peer_history:
            self._peer_history[peer_name] = set()
        self._peer_history[peer_name].add(selected.id)

        logger.info(
            f"Selected question for {peer_name}: domain={selected.domain}, "
            f"difficulty={selected.difficulty}, id={selected.id}"
        )
        return selected

    def get_stats(self) -> dict:
        """Return selector statistics."""
        return {
            "personality": self.personality,
            "total_questions": len(ALL_QUESTIONS),
            "domains": {d: len(qs) for d, qs in QUESTION_POOLS.items()},
            "weights": self._weights,
            "peer_history": {
                peer: len(asked) for peer, asked in self._peer_history.items()
            },
        }
