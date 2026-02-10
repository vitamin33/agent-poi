"""
SLM Intelligence Certification Engine for Proof-of-Intelligence

Implements domain-specific capability benchmarks to certify agent intelligence.
Questions test reasoning, not recall - proving an agent can think, not just memorize.

Domains:
- DeFi: AMM math, yield optimization, risk analysis
- Solana: PDA derivation, CPI constraints, program security
- Security: Attack pattern recognition, vulnerability analysis

Certification Levels:
- Expert (>= 85): Deep domain mastery with reasoning
- Proficient (>= 70): Solid applied knowledge
- Basic (>= 50): Foundational understanding
- Uncertified (< 50): Insufficient capability
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
    """A benchmark question with expected answer and difficulty weight"""
    id: str
    question: str
    expected_answer: str
    difficulty: int  # 1-5
    domain: EvaluationDomain
    category: str = "recall"  # recall, applied, reasoning
    reference_answer: str = ""  # Detailed expected answer for LLM judge

    @property
    def weight(self) -> int:
        """Score weight based on difficulty tier."""
        if self.difficulty <= 2:
            return 1  # Easy: recall
        elif self.difficulty == 3:
            return 2  # Medium: applied
        else:
            return 3  # Hard: reasoning & analysis


@dataclass
class EvaluationResult:
    """Result of an agent evaluation"""
    domain: str
    questions_total: int
    questions_correct: int
    score: float  # 0-100 (legacy, based on correct count)
    passed: bool
    time_taken_ms: int
    breakdown: Dict[str, bool]
    result_hash: str
    judge_scores: Dict[str, Any] = field(default_factory=dict)
    weighted_score: float = 0.0  # Difficulty-weighted score (0-100)
    max_possible: int = 0  # Sum of all question weights
    difficulty_breakdown: Dict[str, float] = field(default_factory=dict)  # tier -> score
    certification_level: str = "Uncertified"  # Expert/Proficient/Basic/Uncertified


# ---------------------------------------------------------------------------
# Capability-focused benchmark questions (10 per domain, 30 total)
# ---------------------------------------------------------------------------
BENCHMARKS: Dict[EvaluationDomain, List[BenchmarkQuestion]] = {
    EvaluationDomain.DEFI: [
        # Easy (difficulty 1-2): Knowledge recall
        BenchmarkQuestion(
            id="defi_1",
            question="What is TVL and why is it used as a key metric in DeFi?",
            expected_answer="total value locked - measures crypto assets deposited in protocols, indicates adoption and liquidity",
            difficulty=1,
            domain=EvaluationDomain.DEFI,
            category="recall",
            reference_answer="TVL (Total Value Locked) measures the total value of crypto assets deposited in DeFi protocols. It indicates protocol adoption, user trust, and available liquidity. Higher TVL generally means more liquid markets and lower slippage.",
        ),
        BenchmarkQuestion(
            id="defi_2",
            question="What is the constant product formula and which type of DEX uses it?",
            expected_answer="x * y = k, used by AMM-based DEXs like Uniswap",
            difficulty=2,
            domain=EvaluationDomain.DEFI,
            category="recall",
            reference_answer="The constant product formula x * y = k is used by Automated Market Maker (AMM) DEXs. x and y represent token reserves, and k is a constant. When one token is bought, its reserve decreases and price increases to maintain the invariant. Uniswap V2 popularized this model.",
        ),
        BenchmarkQuestion(
            id="defi_3",
            question="Explain the difference between a centralized exchange (CEX) and a decentralized exchange (DEX) in terms of custody and price discovery.",
            expected_answer="CEX holds user funds custodially using order books; DEX is non-custodial using smart contracts and AMMs",
            difficulty=2,
            domain=EvaluationDomain.DEFI,
            category="recall",
            reference_answer="CEXs hold user funds in custodial wallets and use order book matching for price discovery. DEXs are non-custodial (users retain their keys), using smart contracts and AMM algorithms for trading. DEXs offer self-custody and censorship resistance but may have higher slippage and gas costs.",
        ),
        # Medium (difficulty 3): Applied knowledge
        BenchmarkQuestion(
            id="defi_4",
            question="A liquidity pool has 100 SOL and 10,000 USDC. Using x*y=k, calculate the price impact of buying 10 SOL from this pool. What is the effective price per SOL?",
            expected_answer="k=1000000, new SOL=90, new USDC=1000000/90=11111.11, cost=1111.11 USDC for 10 SOL, effective price=111.11 USDC/SOL vs spot 100",
            difficulty=3,
            domain=EvaluationDomain.DEFI,
            category="applied",
            reference_answer="With x*y=k: k = 100 * 10000 = 1,000,000. After buying 10 SOL: new SOL reserves = 90, new USDC reserves = 1,000,000/90 = 11,111.11 USDC. Cost = 11,111.11 - 10,000 = 1,111.11 USDC for 10 SOL. Effective price = 111.11 USDC/SOL vs spot price of 100 USDC/SOL. That's ~11% price impact, demonstrating why large trades relative to pool size cause significant slippage.",
        ),
        BenchmarkQuestion(
            id="defi_5",
            question="Explain impermanent loss: if you deposit equal value of SOL ($100) and USDC ($100) at SOL=$100, and SOL doubles to $200, what is your IL compared to just holding?",
            expected_answer="Pool rebalances to ~0.707 SOL and ~141.42 USDC (=$282.84 total). Holding would be $300. IL = ~5.7%",
            difficulty=3,
            domain=EvaluationDomain.DEFI,
            category="applied",
            reference_answer="Initially: 1 SOL + 100 USDC = $200, k = 1*100 = 100. When SOL = $200: pool rebalances to sqrt(100/200) = 0.707 SOL and sqrt(100*200) = 141.42 USDC. Pool value = 0.707*200 + 141.42 = $282.84. Holding value = 1*200 + 100 = $300. IL = (300-282.84)/300 = 5.72%. IL only becomes permanent when you withdraw at this ratio.",
        ),
        BenchmarkQuestion(
            id="defi_6",
            question="How does yield farming work, and what are the three biggest risks a yield farmer faces?",
            expected_answer="Providing liquidity or staking tokens to earn rewards. Top risks: impermanent loss, smart contract exploits, rug pulls/token devaluation",
            difficulty=3,
            domain=EvaluationDomain.DEFI,
            category="applied",
            reference_answer="Yield farming involves providing liquidity or staking tokens across protocols to earn token rewards. The three biggest risks are: 1) Impermanent loss from price divergence in LP positions, 2) Smart contract exploits (hacks draining funds), 3) Token reward devaluation or rug pulls where the protocol team abandons the project. Leveraged yield farming adds liquidation risk.",
        ),
        # Hard (difficulty 4-5): Reasoning & analysis
        BenchmarkQuestion(
            id="defi_7",
            question="Explain how concentrated liquidity (Uniswap V3 style) improves capital efficiency. If an LP concentrates their $10K in a 90-110 USDC/SOL range instead of the full range, approximately how much more effective capital do they deploy?",
            expected_answer="Concentrated liquidity focuses capital in a price range instead of 0 to infinity. In a ±10% range, capital efficiency is roughly 10-20x compared to full range, so $10K acts like $100-200K in a V2 pool.",
            difficulty=4,
            domain=EvaluationDomain.DEFI,
            category="reasoning",
            reference_answer="Concentrated liquidity lets LPs allocate capital within custom price ranges. Instead of spreading $10K across the entire 0-to-infinity range (V2 style), concentrating in 90-110 provides liquidity only where trading actually happens. The capital efficiency multiplier is approximately full_range/concentrated_range. For ±10% range around a $100 price, the multiplier is roughly 10-20x, so $10K acts like $100K-200K in a V2 pool. The tradeoff: positions go out of range if price moves beyond bounds, requiring active management.",
        ),
        BenchmarkQuestion(
            id="defi_8",
            question="A DeFi protocol offers 500% APY on a new token pair. Walk through the analysis you would do to determine if this is sustainable or a potential rug pull.",
            expected_answer="Check: token emission schedule (inflation dilution), liquidity lock status, team doxxing/audit, TVL trend, smart contract verification, concentrated holder analysis, comparison to protocol revenue",
            difficulty=5,
            domain=EvaluationDomain.DEFI,
            category="reasoning",
            reference_answer="Red flag analysis: 1) Token emission math - 500% APY requires massive token printing, check if rewards come from fees or inflation; 2) Liquidity lock - is LP locked? For how long? Can team remove it? 3) Audit status - is contract verified and audited by reputable firm? 4) Team identity - anonymous teams are higher risk; 5) TVL trend - declining TVL + high APY = death spiral; 6) Token holder concentration - if top 5 wallets hold >50%, exit risk is high; 7) Revenue vs emissions - sustainable APY must be backed by protocol revenue, not just token printing. Most 500%+ APY pools are unsustainable within weeks.",
        ),
        BenchmarkQuestion(
            id="defi_9",
            question="Design a flash loan arbitrage strategy between two DEXs where Token A is $10 on DEX1 and $10.50 on DEX2. Walk through the transaction steps and profit calculation assuming a $100K flash loan and 0.3% swap fees on each DEX.",
            expected_answer="Borrow 100K USDC via flash loan -> buy Token A on DEX1 (get ~9970 tokens after fee) -> sell on DEX2 (get ~$104,535 after fee) -> repay 100K + flash fee (~0.09%) -> profit ~$4,445",
            difficulty=5,
            domain=EvaluationDomain.DEFI,
            category="reasoning",
            reference_answer="Steps: 1) Flash borrow 100,000 USDC (fee ~0.09% = $90). 2) Swap on DEX1: 100,000 USDC -> 100,000/10 = 10,000 Token A, minus 0.3% fee = 9,970 Token A. 3) Swap on DEX2: 9,970 * $10.50 = $104,685, minus 0.3% fee = $104,371. 4) Repay flash loan: $100,000 + $90 = $100,090. 5) Profit = $104,371 - $100,090 = $4,281. In practice, price impact reduces profit significantly - this only works if pool liquidity is much larger than trade size. MEV bots typically capture these within milliseconds.",
        ),
        BenchmarkQuestion(
            id="defi_10",
            question="What is a liquidity bootstrapping pool (LBP) and how does its dynamic weight mechanism prevent front-running bots during token launches?",
            expected_answer="LBP uses shifting token weights (e.g., 90/10 -> 50/50) creating natural downward price pressure, discouraging bots since buying early at inflated weights means losses as weights shift",
            difficulty=4,
            domain=EvaluationDomain.DEFI,
            category="reasoning",
            reference_answer="LBPs use dynamic weights that shift over time (e.g., starting at 90% token / 10% collateral and ending at 50/50). This creates natural downward price pressure on the launched token. Front-running bots are discouraged because: 1) Buying early means paying inflated prices due to high token weight; 2) As weights shift, price naturally decreases regardless of demand; 3) Patient buyers get better prices later. This enables fairer price discovery than fixed-weight pools where bots can front-run the first block.",
        ),
    ],
    EvaluationDomain.SOLANA: [
        # Easy (difficulty 1-2): Knowledge recall
        BenchmarkQuestion(
            id="sol_1",
            question="What is the SPL Token Program and how does it handle token creation and transfers?",
            expected_answer="SPL Token Program manages mints (token types) and token accounts (balances). Create mint account, then associated token accounts for transfers.",
            difficulty=1,
            domain=EvaluationDomain.SOLANA,
            category="recall",
            reference_answer="The SPL Token Program manages mints (defining token types with decimals and authority) and token accounts (holding balances). Creating a token involves initializing a mint account. Transfers move tokens between associated token accounts (ATAs) owned by different wallets. Each wallet has one ATA per mint, derived deterministically.",
        ),
        BenchmarkQuestion(
            id="sol_2",
            question="What is the Anchor framework and how does it simplify Solana program development?",
            expected_answer="Rust framework providing account validation macros, automatic serialization, IDL generation, and client code generation. Reduces boilerplate and common bugs.",
            difficulty=1,
            domain=EvaluationDomain.SOLANA,
            category="recall",
            reference_answer="Anchor is a Rust framework for Solana programs that provides: declarative account constraint macros (#[account(...)]), automatic (de)serialization via Borsh, IDL generation for TypeScript clients, and client code generation. It dramatically reduces boilerplate code and prevents common security mistakes like missing signer checks or owner validation.",
        ),
        BenchmarkQuestion(
            id="sol_3",
            question="What is a Program Derived Address (PDA) in Solana and why can't it have a private key?",
            expected_answer="Deterministic address from program_id + seeds that falls off the Ed25519 curve. No private key exists because it's not a valid curve point, so only the program can sign for it.",
            difficulty=2,
            domain=EvaluationDomain.SOLANA,
            category="recall",
            reference_answer="PDAs are deterministic addresses derived from a program ID and arbitrary seeds using findProgramAddress. The derivation finds a point that falls OFF the Ed25519 elliptic curve by adding a bump seed. Since no valid point on the curve maps to this address, no private key can exist for it. This means only the owning program can 'sign' for the PDA via invoke_signed, enabling programs to have authority over accounts without holding private keys.",
        ),
        # Medium (difficulty 3): Applied knowledge
        BenchmarkQuestion(
            id="sol_4",
            question="Explain how Cross-Program Invocation (CPI) works in Solana. What is the CPI depth limit and why does it exist? Can a callee program gain signer privileges that the caller didn't have?",
            expected_answer="CPI lets one program call another's instructions, passing required accounts. Depth limit is 4 to prevent stack overflow. Callee inherits caller's signer privileges but cannot gain new ones.",
            difficulty=3,
            domain=EvaluationDomain.SOLANA,
            category="applied",
            reference_answer="CPI allows programs to invoke instructions on other programs. The calling program passes accounts and instruction data. CPI depth is limited to 4 levels to prevent stack overflow (Solana runtime has a fixed stack). A callee inherits the caller's signer privileges through CPI but cannot gain signers that weren't provided - this is a critical security property. PDA-signed CPIs use invoke_signed with seeds to prove program authority.",
        ),
        BenchmarkQuestion(
            id="sol_5",
            question="How does Solana's rent system work? What happens to an account that falls below the rent-exempt threshold? What is the approximate minimum balance needed for a 100-byte account?",
            expected_answer="Solana charges rent for storage. Below rent-exempt threshold (2 years of rent), accounts are garbage collected. ~0.00157 SOL for 100 bytes.",
            difficulty=3,
            domain=EvaluationDomain.SOLANA,
            category="applied",
            reference_answer="Solana charges rent for on-chain storage proportional to account size. Accounts must maintain a minimum balance covering ~2 years of rent to be 'rent-exempt' and persist indefinitely. Accounts below this threshold are gradually debited and eventually garbage collected (deleted). For a 100-byte account, the rent-exempt minimum is approximately 0.00157 SOL (the exact amount depends on the rent rate, currently ~3.48 SOL per MB per year).",
        ),
        BenchmarkQuestion(
            id="sol_6",
            question="What is the difference between a Solana transaction and an instruction? If a transaction has 3 instructions and the 2nd one fails, what happens to the state changes from the 1st instruction?",
            expected_answer="A transaction is a signed atomic message containing one or more instructions. If any instruction fails, ALL changes are reverted - the 1st instruction's changes are rolled back.",
            difficulty=3,
            domain=EvaluationDomain.SOLANA,
            category="applied",
            reference_answer="A transaction is a signed message containing one or more instructions. Each instruction specifies a program, accounts, and data. Transactions are ATOMIC: all instructions succeed or all fail. If the 2nd instruction fails, the 1st instruction's state changes are completely reverted. This atomicity is essential for DeFi operations where partial execution could lead to loss of funds.",
        ),
        # Hard (difficulty 4-5): Reasoning & analysis
        BenchmarkQuestion(
            id="sol_7",
            question="Explain why a PDA with seeds [b'vault', user_pubkey] would fail if a user tries to create two vault accounts. How would you redesign the seeds to allow multiple vaults per user?",
            expected_answer="PDA derivation is deterministic: same seeds produce same address. Second creation fails because account already exists. Fix: add a counter or unique ID seed like [b'vault', user_pubkey, vault_index.to_le_bytes()]",
            difficulty=4,
            domain=EvaluationDomain.SOLANA,
            category="reasoning",
            reference_answer="PDA derivation is deterministic: the same seeds always produce the same address. With seeds [b'vault', user_pubkey], only ONE PDA exists per user. Creating a second vault account at the same PDA fails because the account is already initialized. Solution: add a discriminator seed like a counter [b'vault', user_pubkey, vault_index.to_le_bytes()] where vault_index is a u64. The user's first vault uses index 0, second uses index 1, etc. You need a separate counter account or use the total from a registry to track the next index.",
        ),
        BenchmarkQuestion(
            id="sol_8",
            question="A Solana program needs to store a variable-length list of up to 1000 items (each 32 bytes). What are the tradeoffs between using a single large account vs multiple smaller accounts? Consider rent costs, transaction limits, and resize operations.",
            expected_answer="Single account: simpler but expensive upfront rent (~32KB * rent rate), limited by max account size (10MB). Multiple accounts: pay rent only for used slots, but require PDAs per item and multiple transactions. Consider realloc for dynamic sizing.",
            difficulty=5,
            domain=EvaluationDomain.SOLANA,
            category="reasoning",
            reference_answer="Single large account: Pre-allocate ~32KB (1000*32). Pros: one account fetch, simpler logic. Cons: high upfront rent (~0.22 SOL), waste if mostly empty, 10KB transaction limit means can't read/write full account in one tx. Multiple accounts (PDA per item): Pros: pay rent only for created items, each fits in a tx easily. Cons: more PDAs to manage, discovery requires indexing, more CPIs. Hybrid: use realloc to grow account dynamically (Anchor supports this), but realloc is limited to 10KB per tx. For 1000 items, a paginated approach with multiple accounts of 100 items each balances rent efficiency and access patterns.",
        ),
        BenchmarkQuestion(
            id="sol_9",
            question="How does Solana achieve high throughput compared to Ethereum? Name at least 4 specific architectural innovations and explain how each contributes.",
            expected_answer="1) Proof of History for time ordering without consensus overhead, 2) Sealevel for parallel transaction execution, 3) Turbine for block propagation via shredding, 4) Gulf Stream for mempool-less transaction forwarding, 5) Pipeline for transaction processing stages",
            difficulty=4,
            domain=EvaluationDomain.SOLANA,
            category="reasoning",
            reference_answer="Key innovations: 1) Proof of History (PoH): SHA-256 hash chain creates a verifiable clock, reducing consensus communication overhead. 2) Sealevel: Parallel transaction execution engine - transactions that don't touch the same accounts run simultaneously on multiple cores. 3) Turbine: Block propagation protocol that shreds blocks into smaller pieces and distributes via a tree structure, reducing bandwidth requirements. 4) Gulf Stream: Transaction forwarding to validators before block finalization, eliminating the need for a mempool. 5) Pipelining: TPU processes transactions in stages (fetch, verify sigs, execute, record) on different hardware simultaneously. Together these enable ~65K TPS theoretical vs Ethereum's ~15 TPS.",
        ),
        BenchmarkQuestion(
            id="sol_10",
            question="You're building an on-chain orderbook. A user submits an order that requires matching against potentially 50 existing orders. How would you handle Solana's compute unit limits and account constraints?",
            expected_answer="Use cranking pattern: separate order placement from matching. Match in batches across multiple transactions. Use Anchor remaining_accounts for dynamic account lists. Consider off-chain matching with on-chain settlement.",
            difficulty=5,
            domain=EvaluationDomain.SOLANA,
            category="reasoning",
            reference_answer="Solana's compute limit (~200K CU per instruction, 1.4M per tx) makes matching 50 orders in one tx impossible. Solutions: 1) Cranking pattern: separate order submission from matching, run a crank bot that matches in batches of 5-10 orders per tx. 2) Use remaining_accounts in Anchor for dynamic account lists since you can't hardcode 50 accounts. 3) Off-chain matching with on-chain settlement: match orders off-chain, submit settled pairs on-chain (like Serum V3/Phoenix). 4) Use a FIFO queue account and process matches incrementally. The compute budget can be increased to 1.4M CU with requestComputeUnits instruction.",
        ),
    ],
    EvaluationDomain.SECURITY: [
        # Easy (difficulty 1-2): Knowledge recall
        BenchmarkQuestion(
            id="sec_1",
            question="What is a rug pull in DeFi and what are the top 3 red flags that indicate a potential rug pull?",
            expected_answer="Developers abandon project and drain funds. Red flags: anonymous team, unaudited contract, no liquidity lock / concentrated token ownership",
            difficulty=1,
            domain=EvaluationDomain.SECURITY,
            category="recall",
            reference_answer="A rug pull occurs when developers drain liquidity or mint unlimited tokens after attracting investment. Top 3 red flags: 1) Anonymous or unverifiable team identity; 2) Unaudited or unverified smart contracts; 3) No liquidity lock or concentrated token ownership (top wallets hold >30%). Additional flags include unrealistic APY promises, recently deployed contracts, and disabled sell functions.",
        ),
        BenchmarkQuestion(
            id="sec_2",
            question="Explain private key security best practices for managing blockchain wallets. What is the difference between hot and cold storage?",
            expected_answer="Hot wallets are internet-connected (convenient but risky). Cold wallets are offline (hardware wallets, paper). Best practices: never share seed phrases, use hardware wallets for large holdings, separate wallets for different risk levels.",
            difficulty=2,
            domain=EvaluationDomain.SECURITY,
            category="recall",
            reference_answer="Hot wallets (browser extensions, mobile apps) are always connected to the internet - convenient but vulnerable to malware and phishing. Cold wallets (hardware devices like Ledger, air-gapped computers) store keys offline - secure but less convenient. Best practices: use hardware wallets for significant holdings, never share or digitally store seed phrases, use separate wallets for DeFi (high risk) vs holding (low risk), verify transaction details on hardware device screen before signing, use multisig for high-value accounts.",
        ),
        BenchmarkQuestion(
            id="sec_3",
            question="What is a Sybil attack and how do proof-of-stake systems defend against it?",
            expected_answer="Creating multiple fake identities to gain disproportionate influence. PoS defends by requiring economic stake per validator, making Sybil attacks expensive.",
            difficulty=2,
            domain=EvaluationDomain.SECURITY,
            category="recall",
            reference_answer="A Sybil attack creates many fake identities to gain outsized influence in a decentralized system (e.g., controlling voting, flooding network). Proof-of-stake defends against this by requiring validators to lock up real economic value (stake) per identity. Creating 1000 fake validators requires 1000x the minimum stake, making the attack economically prohibitive. Additional defenses include slashing (losing stake for misbehavior) and delegation mechanics that concentrate stake with reputable validators.",
        ),
        # Medium (difficulty 3): Applied knowledge
        BenchmarkQuestion(
            id="sec_4",
            question="What is a reentrancy attack? Explain the checks-effects-interactions pattern and why it prevents reentrancy. Does reentrancy apply to Solana programs?",
            expected_answer="Reentrancy: external call re-enters function before state is updated. CEI pattern: check conditions, update state, then make external calls. On Solana, reentrancy is blocked by the runtime (no recursive CPI to same program).",
            difficulty=3,
            domain=EvaluationDomain.SECURITY,
            category="applied",
            reference_answer="Reentrancy occurs when a contract makes an external call, and the callee calls back into the original function before state updates complete, allowing repeated withdrawals. The Checks-Effects-Interactions (CEI) pattern prevents this by: 1) Checking conditions, 2) Updating state (effects), 3) Making external calls (interactions). Since state is already updated, re-entry sees the new state. On Solana, the runtime prevents recursive CPI to the same program, so classic reentrancy is not possible. However, cross-program reentrancy patterns (A calls B calls A) need careful consideration.",
        ),
        BenchmarkQuestion(
            id="sec_5",
            question="How does account validation prevent common Solana program vulnerabilities? Give 3 specific validation checks that Anchor's #[account] constraints enforce.",
            expected_answer="Account validation ensures passed accounts are correct type, owner, and state. Anchor checks: 1) has_one/constraint for owner verification, 2) mut for mutability requirement, 3) init for initialization with correct space/payer.",
            difficulty=3,
            domain=EvaluationDomain.SECURITY,
            category="applied",
            reference_answer="Without account validation, attackers can pass fake accounts to exploit programs. Anchor's #[account] constraints enforce: 1) `has_one = authority` / `constraint = account.owner == expected` - ensures the account belongs to the expected owner/authority; 2) `mut` - marks accounts that will be modified, preventing silent write failures; 3) `init, payer = user, space = N` - creates accounts with correct space allocation and verifies payer. Additional checks include `signer` (verifies transaction signature), `seeds/bump` (verifies PDA derivation), and account type discrimination (each struct has an 8-byte discriminator).",
        ),
        BenchmarkQuestion(
            id="sec_6",
            question="Explain how a sandwich attack works step by step. What determines the profitability of a sandwich attack, and how can users protect themselves?",
            expected_answer="1) Bot detects pending swap in mempool, 2) Front-runs with buy order (drives price up), 3) Victim's swap executes at higher price, 4) Bot back-runs with sell (profits from inflated price). Profitability depends on victim's slippage tolerance and trade size. Protection: use low slippage, private mempools, MEV-protected RPCs.",
            difficulty=3,
            domain=EvaluationDomain.SECURITY,
            category="applied",
            reference_answer="Sandwich attack steps: 1) MEV bot monitors mempool for pending large swaps; 2) Bot front-runs with a buy of the same token, increasing its price; 3) Victim's swap executes at the inflated price (paying more); 4) Bot immediately sells (back-runs) at the higher price. Profitability = victim's slippage tolerance * trade size - gas costs. Protection methods: set tight slippage tolerance (0.5-1%), use private transaction submission (Flashbots, Jito on Solana), split large trades into smaller ones, use MEV-protected RPC endpoints.",
        ),
        # Hard (difficulty 4-5): Reasoning & analysis
        BenchmarkQuestion(
            id="sec_7",
            question="Given a token contract where sell() reverts with 'insufficient balance' but buy() works fine, and the contract owner has a setTaxRate(uint256) function, what attack pattern is this? How would you detect it before buying?",
            expected_answer="Honeypot contract - traps buyers by blocking sells. The tax rate can be set to 100% or sell function has hidden revert logic. Detection: simulate sell tx on fork, check if sell is actually callable, analyze contract for owner-only modifiers on transfer logic.",
            difficulty=4,
            domain=EvaluationDomain.SECURITY,
            category="reasoning",
            reference_answer="This is a honeypot contract. The sell() revert is intentional - buyers can purchase tokens but can never sell them. The setTaxRate() function likely lets the owner set sell tax to 99-100%, making sells worthless even if they don't revert. Detection methods: 1) Simulate a sell transaction on a forked chain (Tenderly, Foundry fork); 2) Read the contract bytecode for hidden transfer restrictions; 3) Check if sell/transfer functions have owner-controlled modifiers or pausable logic; 4) Use honeypot detection tools (TokenSniffer, GoPlus); 5) Verify the contract is verified on the block explorer - unverified contracts are a major red flag.",
        ),
        BenchmarkQuestion(
            id="sec_8",
            question="Explain how oracle manipulation works in DeFi. A lending protocol uses a Uniswap V2 pool as its price oracle. Design an attack that exploits this in a single transaction using a flash loan.",
            expected_answer="1) Flash borrow large amount, 2) Dump into Uniswap pool to crash token price, 3) Use manipulated low price to liquidate or borrow cheaply on lending protocol, 4) Repay flash loan with profit. Prevention: use TWAP oracles instead of spot price.",
            difficulty=5,
            domain=EvaluationDomain.SECURITY,
            category="reasoning",
            reference_answer="Attack: 1) Flash borrow $10M of Token A. 2) Sell Token A into the Uniswap V2 pool, crashing its spot price by 80%. 3) The lending protocol reads the now-manipulated spot price and thinks Token A collateral is worth 80% less. 4) Liquidate other users' Token A collateral at the artificially low price, or deposit cheap Token A as collateral and borrow stablecoins at inflated collateral value. 5) Repay flash loan. Prevention: Use TWAP (Time-Weighted Average Price) oracles that average price over multiple blocks, making single-tx manipulation impossible. Chainlink oracles also aggregate multiple price sources off-chain.",
        ),
        BenchmarkQuestion(
            id="sec_9",
            question="A Solana program has an instruction that transfers SOL from a PDA vault to a user. The instruction checks `vault.lamports() >= amount` but doesn't validate the vault PDA seeds. What is the vulnerability and how would you exploit it?",
            expected_answer="Missing PDA validation: attacker can pass ANY account as vault PDA (including accounts they control or other program's vaults). They could pass a different PDA that has SOL and drain it. Fix: always validate PDA seeds with has_one or seeds constraint.",
            difficulty=4,
            domain=EvaluationDomain.SECURITY,
            category="reasoning",
            reference_answer="Vulnerability: Without PDA seed validation, the instruction accepts any account as 'vault'. An attacker could: 1) Find another PDA owned by this program that has SOL (any other account type); 2) Pass that account as the vault parameter; 3) The instruction only checks lamports >= amount, which passes; 4) SOL is transferred from the wrong account to the attacker. Fix: In Anchor, use `#[account(seeds = [b'vault', user.key().as_ref()], bump)]` to enforce that only the correctly-derived PDA is accepted. Without Anchor, manually verify `Pubkey::find_program_address` matches.",
        ),
        BenchmarkQuestion(
            id="sec_10",
            question="A DeFi protocol offers flash loans. An attacker uses one to manipulate a governance vote by temporarily holding 51% of voting tokens. Describe this attack and propose two different mitigation strategies.",
            expected_answer="Flash loan governance attack: borrow tokens, vote with majority, return tokens in same tx. Mitigations: 1) Use snapshot-based voting (vote power from past block, not current), 2) Require time-locked token holding period before voting power activates.",
            difficulty=5,
            domain=EvaluationDomain.SECURITY,
            category="reasoning",
            reference_answer="Attack: 1) Flash borrow enough governance tokens to gain 51%+ voting power. 2) Submit and pass a malicious governance proposal (e.g., drain treasury, change admin). 3) Return flash loan, keeping none of the tokens but having passed the vote. Mitigations: 1) Snapshot voting: voting power is determined by token balance at a past block height, making flash loans useless since they don't affect historical balances. 2) Time-lock requirement: tokens must be staked/held for N days before gaining voting power, preventing instant accumulation. 3) Vote escrow (veToken model): tokens must be locked for extended periods to gain voting power, like Curve's veCRV. Compound, Aave, and most modern DAOs use snapshot voting.",
        ),
    ],
}

# Passing threshold
PASSING_SCORE = 60.0

# Certification thresholds
CERTIFICATION_THRESHOLDS = {
    "Expert": 85.0,
    "Proficient": 70.0,
    "Basic": 50.0,
}


def _determine_certification_level(score: float) -> str:
    """Determine certification level from weighted score."""
    if score >= CERTIFICATION_THRESHOLDS["Expert"]:
        return "Expert"
    elif score >= CERTIFICATION_THRESHOLDS["Proficient"]:
        return "Proficient"
    elif score >= CERTIFICATION_THRESHOLDS["Basic"]:
        return "Basic"
    return "Uncertified"


class SLMEvaluator:
    """
    Evaluator for agent intelligence certification benchmarks.

    Uses LLM-as-Judge when available (Anthropic/OpenAI), otherwise falls back
    to enhanced fuzzy matching. Supports difficulty-weighted scoring for
    certification levels.
    """

    def __init__(
        self,
        agent_response_fn: Optional[callable] = None,
        llm_judge: Optional[LLMJudge] = None,
    ):
        self.agent_response_fn = agent_response_fn
        self.llm_judge = llm_judge

    def evaluate(
        self,
        domain: EvaluationDomain,
        agent_answers: Optional[Dict[str, str]] = None,
    ) -> EvaluationResult:
        """
        Run evaluation benchmark for a domain with difficulty-weighted scoring.

        Returns EvaluationResult with both legacy score and weighted certification score.
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

        # Score answers with difficulty weighting
        breakdown = {}
        judge_scores = {}
        correct = 0
        weighted_earned = 0.0
        max_possible = sum(q.weight for q in questions)

        # Track per-tier scores
        tier_earned = {"easy": 0.0, "medium": 0.0, "hard": 0.0}
        tier_max = {"easy": 0, "medium": 0, "hard": 0}

        for q in questions:
            agent_answer = agent_answers.get(q.id, "").lower().strip()
            expected = q.expected_answer.lower().strip()

            # Determine tier
            if q.difficulty <= 2:
                tier = "easy"
            elif q.difficulty == 3:
                tier = "medium"
            else:
                tier = "hard"
            tier_max[tier] += q.weight

            # Use LLM judge if available
            is_correct = self._check_answer(
                agent_answer, expected, q.question, q.id, judge_scores
            )
            breakdown[q.id] = is_correct

            if is_correct:
                correct += 1

            # Weighted scoring: use judge score if available, else binary
            if q.id in judge_scores and judge_scores[q.id].get("score") is not None:
                # Scale judge score (0-100) by question weight
                q_weighted = (judge_scores[q.id]["score"] / 100.0) * q.weight
            else:
                q_weighted = q.weight if is_correct else 0.0

            weighted_earned += q_weighted
            tier_earned[tier] += q_weighted

            if is_correct:
                logger.debug(f"[PASS] {q.id} (w={q.weight}): {agent_answer[:50]}...")
            else:
                logger.debug(f"[FAIL] {q.id} (w={q.weight}): got '{agent_answer[:30]}' expected '{expected[:30]}'")

        # Calculate scores
        total = len(questions)

        # Weighted score (0-100)
        weighted_score = (weighted_earned / max_possible * 100) if max_possible > 0 else 0

        # Legacy score (for backward compatibility)
        if judge_scores:
            avg_judge_score = sum(
                js["score"] for js in judge_scores.values()
            ) / len(judge_scores)
            score = avg_judge_score
        else:
            score = (correct / total * 100) if total > 0 else 0

        passed = weighted_score >= PASSING_SCORE
        certification_level = _determine_certification_level(weighted_score)

        # Difficulty breakdown (percentage per tier)
        difficulty_breakdown = {}
        for tier in ["easy", "medium", "hard"]:
            if tier_max[tier] > 0:
                difficulty_breakdown[tier] = round(
                    tier_earned[tier] / tier_max[tier] * 100, 1
                )
            else:
                difficulty_breakdown[tier] = 0.0

        # Create result hash for on-chain storage
        result_data = f"{domain.value}:{correct}/{total}:{weighted_score:.2f}:{int(time.time())}"
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
            weighted_score=round(weighted_score, 2),
            max_possible=max_possible,
            difficulty_breakdown=difficulty_breakdown,
            certification_level=certification_level,
        )

        judge_method = next(
            (js["method"] for js in judge_scores.values()), "keyword"
        ) if judge_scores else "keyword"

        logger.info(
            f"Evaluation complete: {domain.value} | "
            f"Score: {weighted_score:.1f}% (weighted) | "
            f"Level: {certification_level} | "
            f"{'PASSED' if passed else 'FAILED'} | "
            f"Judge: {judge_method} | "
            f"Tiers: easy={difficulty_breakdown.get('easy', 0)}% "
            f"med={difficulty_breakdown.get('medium', 0)}% "
            f"hard={difficulty_breakdown.get('hard', 0)}%"
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
        Falls back to keyword matching.
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

            return result.score >= 50

        # Legacy keyword matching fallback
        expected_terms = expected.split()
        matches = sum(1 for term in expected_terms if term in agent_answer)
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
                "category": q.category,
                "weight": q.weight,
            }
            for q in questions
        ]
