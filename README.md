# Sentry

**Your agent signs. Sentry decides.**

Pre-sign security for AI agent wallets, built for the PayBox marketplace (MoonPay Hackathons, Chapter 1).
Before an agent signs anything through PayBox, it pays Sentry one cent over x402 to read the exact intent the
way an auditor would, and gets back **ALLOW / WARN / BLOCK** with a reason a human can read.

## What it catches

| Chain | Attack | Finding id |
|---|---|---|
| EVM | Unlimited `approve` / `increaseAllowance` to unknown spenders | `unlimited_approval` |
| EVM | Approvals to a plain wallet (EOA) instead of a contract | `approval_to_wallet` |
| EVM | Gasless EIP-2612 `Permit` and Permit2 (`PermitSingle`, `PermitBatch`, signature transfers) phishing | `unlimited_approval`, `signature_transfer` |
| EVM | `setApprovalForAll` NFT operator grabs | `nft_operator` |
| EVM | **EIP-7702 delegation to unverified code**, incl. `chainId: 0` (every chain) | `unknown_7702`, `7702_all_chains` |
| EVM | Seaport "list for zero" orders | `zero_listing` |
| EVM | Blind signatures: raw digests and hashes disguised as messages | `blind_signature`, `hash_as_message` |
| EVM | SIWE domain mismatch | `siwe_domain_mismatch` |
| Solana | `SetAuthority` on token accounts (owner / close authority) | `set_authority` |
| Solana | System `Assign` of your wallet to a program | `wallet_reassign` |
| Solana | Unlimited SPL `Approve` delegates | `spl_delegate` |
| Solana | Durable nonce (signature that never expires) | `durable_nonce` |
| Solana | Transactions disguised as messages | `tx_as_message` |
| Both | Address poisoning (lookalike of a saved address) | `address_poisoning` |
| Both | **Task mismatch**: agent asked to "claim an airdrop" but is signing an approval | `task_mismatch` |

The task-mismatch check is what makes Sentry agent-native: the agent tells Sentry what the user actually asked
for (`expect`), and Sentry flags intents that do something else. That is exactly what a prompt-injected or
phished agent looks like.

## Dollar value at risk

When Sentry blocks or warns, it reads the signing wallet's **live balance** of whatever is in play
(the token being approved, the account being reassigned, the SOL being sent) and prices it with
DefiLlama. The verdict leads with the number: **"$2,340.00 at risk"**.

Try any attack against a real wallet: `GET /demo/airdrop-permit?evm=0x…` or
`/demo/sol-setauthority?sol=…`, or fill in "your wallet" in the playground.

## Sentry Guard: agents can't forget to check

`guard/` wraps PayBox signing so every signature is checked first. ALLOW signs, WARN stops for the
user, BLOCK refuses. It uses the PayBox login and signing key on your machine.

```bash
npx @paybox-sh/sdk login && npx @paybox-sh/sdk connect     # once
npm run guard -- sign --credential <wallet-id> --demo airdrop-permit
npm run guard -- sign --credential <wallet-id> --intent @intent.json --task "Swap 250 USDC for ETH" --action swap
```

As an MCP server, so an agent in Claude Desktop, Cursor or Claude Code gets `guarded_sign` instead
of raw signing:

```json
"sentry-guard": { "command": "npx", "args": ["tsx", "/path/to/sentry/guard/mcp.ts"] }
```

Tools: `list_wallets`, `guarded_sign`, `sentry_check`.

## API

`POST /check` (x402, $0.01) · body mirrors PayBox's `request_wallet_sign` intent:

```json
{
  "chain": "eip155:8453",
  "from": "0x…",
  "intent": { "op": "typedData", "typedData": { … } },
  "expect": { "action": "swap", "description": "Swap 250 USDC for ETH" },
  "known_recipients": ["0x…"]
}
```

Response: `verdict`, `risk_score`, `headline`, `summary`, `action`, `at_risk`, `findings[]`, `report_url`.

From a PayBox agent:

```
use_service({ credential_id, url: "https://<host>/check", method: "POST", body })
```

Other routes: `GET /` landing + playground · `POST /api/try` free playground check (20/min/IP) ·
`GET /r/:id` shareable verdict page · `GET /r/:id.json` · `GET /llms.txt` agent instructions · `GET /health`.

## Run

```bash
npm install
npm test        # attacks blocked, 13 everyday actions allowed, valuation, guard decisions
npm run dev     # http://localhost:8787
```

Without `PAY_TO_EVM` / `PAY_TO_SOL`, `/check` runs free (dev mode). See `.env.example` for x402 settings.
For mainnet USDC on Base, point `FACILITATOR_URL` at a mainnet facilitator (e.g. Coinbase CDP) and set
`X402_EVM_NETWORK=eip155:8453`.

## Deploy (Railway)

1. Push to GitHub, "New Project → Deploy from repo".
2. Set `PUBLIC_URL`, `PAY_TO_EVM` (and/or `PAY_TO_SOL`), network and facilitator vars.
3. Start command: `npm start`.

## Roadmap

- Full balance-change simulation (EVM `eth_simulateV1`, Solana `simulateTransaction`)
- Token-reputation and contract-age signals
- Native PayBox plugin, so every PayBox signature is screened without a wrapper
- Policy packs: per-user allowlists and spend rules
