// Sentry Guard: sign through PayBox only after Sentry says it's safe.
//
//   1. Pay Sentry (x402, through PayBox) to check the exact intent.
//   2. ALLOW  -> sign it through PayBox.
//      WARN   -> stop and hand the reason back (unless allowWarn is set).
//      BLOCK  -> refuse. Nothing is signed.
//
// It uses the PayBox login and signing key on this machine (`paybox login` +
// `paybox connect`), so it needs no extra keys and never sees a private key.
import { PayboxClient } from "@paybox-sh/sdk";
import type { Expectation, Intent, Report } from "../src/types.js";
import { examples } from "../src/examples.js";

export const DEFAULT_SENTRY = process.env.SENTRY_URL ?? "https://sentry-9lxi.onrender.com";

export interface GuardArgs {
  credentialId: string; // wallet that signs
  intent?: Intent; // exactly what would be passed to request_wallet_sign
  demo?: string; // or: a built-in scenario (airdrop-permit, 7702-upgrade, ...) aimed at this wallet
  chain?: string; // CAIP-2, e.g. eip155:8453 or solana:mainnet
  expect?: Expectation; // what the user actually asked for
  knownRecipients?: string[];
  payWith?: string; // wallet that pays Sentry (defaults to the signing wallet)
  allowWarn?: boolean; // sign even on WARN
  checkOnly?: boolean; // just get the verdict
  sentryUrl?: string;
}

export interface GuardResult {
  decision: "signed" | "blocked" | "needs_user" | "checked" | "sign_failed";
  verdict: Report["verdict"];
  headline: string;
  summary: string;
  value_at_risk_usd: number | null;
  report_url?: string;
  paid_usd?: string;
  signature?: unknown; // PayBox's signed artifact, when signed
  sign_status?: string;
  sign_error?: string | null;
}

/** Minimal surface we use, so tests can pass a fake. */
export type PayboxLike = Pick<PayboxClient, "listCredentials" | "useService" | "requestWalletSign">;

async function walletAddress(paybox: PayboxLike, credentialId: string): Promise<{ address?: string; family?: string }> {
  const { credentials } = await paybox.listCredentials();
  const hit: any = (credentials as any[]).find((c) => (c.credential?.id ?? c.credential_id) === credentialId);
  const meta = hit?.credential?.metadata ?? hit?.metadata ?? {};
  return { address: meta.address, family: Array.isArray(meta.chains) ? meta.chains[0] : undefined };
}

function parseReport(paid: any): Report {
  const v = paid?.response?.output?.value;
  const body = v?.resource?.body ?? v?.response?.body;
  const status = paid?.response?.status;
  if (!body) {
    const why = paid?.response?.error ?? `PayBox returned status "${status ?? "unknown"}" without Sentry's reply`;
    throw new Error(`Sentry check did not complete: ${why}`);
  }
  const report = typeof body === "string" ? JSON.parse(body) : body;
  if (!report?.verdict) throw new Error(`Unexpected reply from Sentry: ${String(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 200)}`);
  return report as Report;
}

export async function guardedSign(args: GuardArgs, paybox: PayboxLike = PayboxClient.fromConfig()): Promise<GuardResult> {
  const sentry = (args.sentryUrl ?? DEFAULT_SENTRY).replace(/\/$/, "");
  const signer = await walletAddress(paybox, args.credentialId);
  if (args.demo) {
    const ex = examples(signer.family === "solana" ? { sol: signer.address } : { evm: signer.address }).find((e) => e.key === args.demo);
    if (!ex) throw new Error(`Unknown demo "${args.demo}". Try: ${examples().map((e) => e.key).join(", ")}`);
    args = { ...args, intent: ex.req.intent, chain: args.chain ?? ex.req.chain, expect: args.expect ?? ex.req.expect, knownRecipients: args.knownRecipients ?? ex.req.known_recipients };
  }
  if (!args.intent) throw new Error("Nothing to sign: pass an intent (or a demo).");
  const intent = args.intent;
  const isSolana = intent.op === "solanaMessage" || intent.op === "solanaTransaction";
  const chain = args.chain ?? (isSolana ? "solana:mainnet" : (intent as any).typedData?.domain?.chainId ? `eip155:${(intent as any).typedData.domain.chainId}` : (intent as any).transaction?.chainId ? `eip155:${(intent as any).transaction.chainId}` : undefined);

  // 1. Pay Sentry and read the verdict.
  const paid = await paybox.useService(
    {
      credentialId: args.payWith ?? args.credentialId,
      url: `${sentry}/check`,
      method: "POST",
      body: { chain, from: signer.address, intent, expect: args.expect, known_recipients: args.knownRecipients },
    },
    { waitForApproval: true },
  );
  const report = parseReport(paid);
  const base = {
    verdict: report.verdict, headline: report.headline, summary: report.summary,
    value_at_risk_usd: report.value_at_risk_usd ?? null, report_url: (report as any).report_url,
    paid_usd: (paid as any)?.plan?.x402?.amount_usd
      ?? ((paid as any)?.response?.output?.value?.payment?.status === "succeeded" ? "0.01" : undefined),
  };

  if (args.checkOnly) return { decision: "checked", ...base };
  if (report.verdict === "BLOCK") return { decision: "blocked", ...base };
  if (report.verdict === "WARN" && !args.allowWarn) return { decision: "needs_user", ...base };

  // 2. Safe: sign through PayBox. The server still enforces the wallet's grants and approvals.
  const signed: any = await paybox.requestWalletSign({ credentialId: args.credentialId, intent: intent as any }, { waitForApproval: true });
  const response = signed?.response ?? signed;
  const ok = response?.status === "success";
  return {
    decision: ok ? "signed" : "sign_failed", ...base,
    signature: ok ? response?.output?.value ?? response?.output : undefined,
    sign_status: response?.status, sign_error: response?.error ?? null,
  };
}
