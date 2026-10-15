#!/usr/bin/env node
// Sentry Guard CLI.
//
//   npm run guard -- sign  --credential <id> --intent @intent.json --task "Swap 250 USDC for ETH" --action swap
//   npm run guard -- sign  --credential <id> --demo airdrop-permit
//   npm run guard -- check --credential <id> --intent @intent.json --task "Claim the airdrop" --action login
//
// Needs `npx @paybox-sh/sdk login` and `npx @paybox-sh/sdk connect` once on this machine.
import { readFileSync } from "node:fs";
import { guardedSign, type GuardResult } from "./core.js";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const has = (name: string) => argv.includes(`--${name}`);
const load = (v?: string) => (v?.startsWith("@") ? readFileSync(v.slice(1), "utf8") : v);

function usage(): never {
  console.error(`Sentry Guard: sign through PayBox only after Sentry approves.

  sign   Check with Sentry, then sign only if it's safe
  check  Just get Sentry's verdict (still a paid check)

  --credential <id>   PayBox wallet that signs (see: npx @paybox-sh/sdk credentials)
  --intent <json|@file>  what to sign, in PayBox request_wallet_sign shape
  --demo <name>       or run a built-in scenario against this wallet:
                      airdrop-permit, 7702-upgrade, uniswap-approve (EVM wallet)
                      sol-setauthority, sol-poison, sol-friend (Solana wallet)
  --task "<text>"     what the user actually asked for
  --action <a>        swap | transfer | approve | login | mint | bridge | other
  --recipient <addr>  expected recipient, if any
  --known <a,b,...>   addresses the user has paid before (poisoning check)
  --chain <caip2>     e.g. eip155:8453 or solana:mainnet (usually inferred)
  --pay-with <id>     wallet that pays Sentry (default: the signing wallet)
  --allow-warn        sign even when Sentry says WARN
  --sentry <url>      Sentry base URL`);
  process.exit(2);
}

if (cmd !== "sign" && cmd !== "check") usage();
const credentialId = flag("credential");
const intentRaw = load(flag("intent"));
const demo = flag("demo");
if (!credentialId || (!intentRaw && !demo)) usage();

const C = process.stdout.isTTY ? { red: "\x1b[31;1m", amber: "\x1b[33;1m", green: "\x1b[32;1m", dim: "\x1b[2m", off: "\x1b[0m" } : { red: "", amber: "", green: "", dim: "", off: "" };

function print(r: GuardResult) {
  const color = r.verdict === "BLOCK" ? C.red : r.verdict === "WARN" ? C.amber : C.green;
  const word = { signed: "SIGNED", blocked: "BLOCKED. NOTHING WAS SIGNED", needs_user: "STOPPED. NEEDS THE USER", checked: r.verdict, sign_failed: "CHECK PASSED, SIGNING FAILED" }[r.decision];
  console.log(`\n${color}  SENTRY ${r.verdict}  ${C.off}${color}${word}${C.off}`);
  if (r.value_at_risk_usd) console.log(`${color}  $${r.value_at_risk_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} at risk${C.off}`);
  console.log(`\n  ${r.headline}\n  ${C.dim}${r.summary}${C.off}`);
  if (r.report_url) console.log(`\n  Report: ${r.report_url}`);
  if (r.paid_usd) console.log(`  ${C.dim}Paid Sentry $${r.paid_usd} via PayBox (x402)${C.off}`);
  if (r.decision === "signed") console.log(`\n  Signature: ${JSON.stringify(r.signature)}`);
  if (r.decision === "sign_failed") console.log(`\n  PayBox status: ${r.sign_status} ${r.sign_error ?? ""}`);
  console.log();
}

try {
  const result = await guardedSign({
    credentialId: credentialId!,
    intent: intentRaw ? JSON.parse(intentRaw) : undefined,
    demo,
    chain: flag("chain"),
    expect: flag("task") || flag("action") || flag("recipient")
      ? { description: flag("task"), action: flag("action") as any, recipient: flag("recipient") }
      : undefined,
    knownRecipients: flag("known")?.split(",").map((s) => s.trim()).filter(Boolean),
    payWith: flag("pay-with"),
    allowWarn: has("allow-warn"),
    checkOnly: cmd === "check",
    sentryUrl: flag("sentry"),
  });
  if (has("json")) console.log(JSON.stringify(result, null, 2)); else print(result);
  process.exit(result.decision === "signed" || result.decision === "checked" ? 0 : 1);
} catch (e: any) {
  console.error(`\n  Sentry Guard error: ${e?.message ?? e}\n`);
  process.exit(3);
}
