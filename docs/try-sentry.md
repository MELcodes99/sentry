# Try Sentry in 2 minutes (and help it get listed)

Sentry stops AI agents from signing wallet drainers. Each check costs $0.01 in USDC, paid by your
PayBox wallet over x402. Running one paid check helps Sentry reach the 10 unique payers PayBox
needs before it shows a service in its catalog.

You need: Node.js 20+, and a PayBox account (app.paybox.sh) with at least $0.05 of USDC on Base
or Solana.

## 1. Connect PayBox (one time)

```bash
npx @paybox-sh/sdk login
npx @paybox-sh/sdk connect
npx @paybox-sh/sdk credentials
```

`connect` shows 8 emoji and a link. Open the link and pick the row with the same emoji.
From `credentials`, copy the `id` of your `evm-default` (Base) or `sol-default` (Solana) wallet.

## 2. Run one paid check

Base wallet:

```bash
curl -s https://sentry-9lxi.onrender.com/api/examples | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(d)[0].req)))' > sentry-check.json
npx @paybox-sh/sdk use-service --credential YOUR_WALLET_ID --url https://sentry-9lxi.onrender.com/check --method POST --body @sentry-check.json --wait
```

Solana wallet: same commands, use your `sol-default` id. PayBox picks the Solana payment option.

You should see `"verdict":"BLOCK"` and a `report_url` you can open. That check was a fake
"claim your airdrop" signature that would have handed a drainer all your USDC.

Thanks for helping. Sentry: https://sentry-9lxi.onrender.com
