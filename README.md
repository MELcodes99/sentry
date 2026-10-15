# Sentry

**Your agent signs. Sentry decides.**

Pre-sign security for AI agent wallets, built for the [PayBox](https://paybox.sh) marketplace
(MoonPay Hackathons, Chapter 1).

AI agents can now sign transactions for you, which means they can be tricked into signing a wallet
drainer. Before an agent signs anything, it pays Sentry **$0.01** (USDC on Base or Solana, over
x402). Sentry reads the exact transaction the way a security auditor would and answers
**ALLOW**, **WARN** or **BLOCK**, with the reason in plain English and **how many dollars are at
risk** in the signing wallet.

**Live:** https://sentry-9lxi.onrender.com

---

## How to use Sentry

There are four ways in, from easiest to most powerful.

### 1. In your browser (free, nothing to install)

1. Open https://sentry-9lxi.onrender.com and scroll to **Try to fool it**.
2. Optional: paste your wallet address into **Your EVM wallet** or **Your Solana wallet** to see what
   each attack would cost *you*.
3. Click an attack (or a legit action), then **Run Sentry**.
4. You get a verdict page with the reason, the findings and the dollars at risk. Share it with the
   **Share on X** button.

### 2. Let your PayBox agent pay for a real check (about 3 minutes)

You need [Node.js](https://nodejs.org) 20+ and a [PayBox](https://app.paybox.sh) account with a
little USDC on Base or Solana. In your terminal:

```bash
# one-time setup
npx @paybox-sh/sdk login          # approve in the browser page that opens
npx @paybox-sh/sdk connect        # open the link, pick the row with the same 8 emoji
npx @paybox-sh/sdk credentials    # copy the id of evm-default (Base) or sol-default (Solana)

# download a test: a fake "claim your airdrop" scam aimed at your own wallet
curl -o sentry-check.json "https://sentry-9lxi.onrender.com/examples/airdrop-permit.json?evm=YOUR_BASE_ADDRESS"
# (Solana: .../examples/sol-setauthority.json?sol=YOUR_SOLANA_ADDRESS)

# your agent pays Sentry $0.01 and gets the verdict
npx @paybox-sh/sdk use-service --credential YOUR_WALLET_ID \
  --url https://sentry-9lxi.onrender.com/check --method POST --body @sentry-check.json --wait
```

You'll see `"verdict":"BLOCK"`, the dollars that scam would have taken, and a `report_url`.

Any PayBox agent (Claude, ChatGPT, Grok…) can do the same with the `use_service` tool:

```
use_service({ credential_id, url: "https://sentry-9lxi.onrender.com/check", method: "POST", body })
```

### 3. Sentry Guard: check every signature automatically (CLI)

The Guard wraps PayBox signing: it pays Sentry first, then **ALLOW signs, WARN stops for you,
BLOCK refuses**. Your agent can't forget to check. Do the one-time setup from step 2 first, then:

```bash
git clone https://github.com/MELcodes99/sentry.git
cd sentry
npm install

# try it against your own wallet
npm run guard -- sign --credential YOUR_EVM_WALLET_ID --demo airdrop-permit     # BLOCKED, nothing signed
npm run guard -- sign --credential YOUR_SOL_WALLET_ID --demo sol-setauthority   # BLOCKED, nothing signed
npm run guard -- sign --credential YOUR_EVM_WALLET_ID --demo safe-login         # ALLOWED and SIGNED

# real use: pass the exact intent your agent wants to sign, plus what you asked it to do
npm run guard -- sign --credential YOUR_WALLET_ID --intent @intent.json \
  --task "Swap 250 USDC for ETH" --action swap
```

Each check costs $0.01. Run `npm run guard` with no arguments for every option.

### 4. Sentry Guard for AI agents (MCP server)

Give an agent in Claude Desktop, Cursor or Claude Code a `guarded_sign` tool instead of raw signing.
After steps 2 and 3, add this to your MCP config (Claude Desktop: **Settings → Developer → Edit
Config**), replacing the path with where you cloned Sentry:

```json
{
  "mcpServers": {
    "sentry-guard": {
      "command": "/bin/zsh",
      "args": ["-lc", "cd ~/sentry && npx tsx guard/mcp.ts"]
    }
  }
}
```

Restart the app. The agent gets three tools: `list_wallets`, `guarded_sign` and `sentry_check`.
For the strongest protection, give the agent Sentry Guard *instead of* direct PayBox signing.

---

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

The task-mismatch check is what makes Sentry agent-native: the agent tells Sentry what the user
actually asked for (`expect`), and Sentry flags intents that do something else. That is exactly what
a prompt-injected or phished agent looks like.

Legit activity passes: `scripts/legit.ts` runs 13 everyday actions (logins, transfers, bounded
approvals, Uniswap and Jupiter swaps, revokes) and none are blocked. Recognized protocols include
Uniswap, 1inch, 0x, LI.FI, CoW, Balancer, Aerodrome, Aave, Morpho, Across, OpenSea, Jupiter,
Raydium, Orca, Meteora, Phoenix, Kamino, Drift and Metaplex.

## Dollar value at risk

When Sentry blocks or warns, it reads the signing wallet's **live balance** of whatever is in play
(the token being approved, the account being reassigned, the SOL being sent) and prices it with
DefiLlama. The verdict leads with the number: **"$2,340.00 at risk"**.

## API reference

`POST /check` (x402, $0.01). The body mirrors PayBox's `request_wallet_sign` intent:

```json
{
  "chain": "eip155:8453",
  "from": "0x…",
  "intent": { "op": "typedData", "typedData": { … } },
  "expect": { "action": "swap", "description": "Swap 250 USDC for ETH" },
  "known_recipients": ["0x…"]
}
```

`intent.op` is one of `message`, `typedData`, `transaction`, `authorization`, `solanaMessage`,
`solanaTransaction`, `raw`. `expect.action` is one of `swap`, `transfer`, `approve`, `login`,
`mint`, `bridge`, `other`.

Response: `verdict`, `risk_score`, `headline`, `summary`, `action`, `at_risk`,
`value_at_risk_usd`, `value_items`, `findings[]`, `report_url`.

| Route | What it does |
|---|---|
| `GET /` | Landing page and playground |
| `POST /check` | Paid check for agents (x402) |
| `POST /api/try` | Free playground check (20 per minute per IP) |
| `GET /examples/<name>.json?evm=…&sol=…` | Ready-to-send test requests aimed at a wallet |
| `GET /demo/<name>?evm=…&sol=…` | Runs a test and opens its verdict page |
| `GET /r/:id`, `/r/:id.json` | Shareable verdict page, raw report |
| `GET /llms.txt` | Instructions for agents |
| `GET /health` | Status |

Test names: `airdrop-permit`, `7702-upgrade`, `sol-setauthority`, `sol-poison` (attacks);
`safe-login`, `sol-login`, `uniswap-approve`, `sol-friend` (legit).

## Run it yourself

```bash
npm install
npm test        # attacks blocked, 13 everyday actions allowed, valuation, guard decisions
npm run dev     # http://localhost:8787
```

Without `PAY_TO_EVM` / `PAY_TO_SOL`, `/check` runs free (dev mode). See `.env.example` for x402
settings. The live deployment uses the PayAI facilitator (`https://facilitator.payai.network`) on
Base (`eip155:8453`) and Solana mainnet.

### Deploy (Render)

1. New **Web Service** from this repo. Build `npm install`, start `npm start`.
2. Set `PUBLIC_URL`, `PAY_TO_EVM` and/or `PAY_TO_SOL`, `X402_EVM_NETWORK`, `X402_SVM_NETWORK`
   and `FACILITATOR_URL`.
3. On the free tier, ping `/health` every 10 minutes (e.g. cron-job.org) so it never sleeps.

## Roadmap

- Full balance-change simulation (EVM `eth_simulateV1`, Solana `simulateTransaction`)
- Token-reputation and contract-age signals
- Native PayBox plugin, so every PayBox signature is screened without a wrapper
- Policy packs: per-user allowlists and spend rules
