import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { check, checkSchema, ENGINE } from "./engine/index.js";
import { examples } from "./examples.js";
import { save, load, stats } from "./store.js";
import { landing, verdictPage, notFound } from "./ui.js";

const PORT = Number(process.env.PORT ?? 8787);
const BASE = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const PRICE = process.env.PRICE ?? "$0.01";
const EVM_NET = process.env.X402_EVM_NETWORK ?? "eip155:84532"; // Base Sepolia; eip155:8453 for mainnet
const SVM_NET = process.env.X402_SVM_NETWORK ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"; // devnet; solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp for mainnet
const PAY_TO_EVM = process.env.PAY_TO_EVM;
const PAY_TO_SOL = process.env.PAY_TO_SOL;
const FACILITATOR = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

const app = new Hono();
app.use("/check", cors());
app.use("/api/*", cors());

// ── x402 paywall on /check ─────────────────────────────────────────────────
const paid = Boolean(PAY_TO_EVM || PAY_TO_SOL);
if (paid) {
  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR }));
  const accepts: any[] = [];
  if (PAY_TO_EVM) { server.register(EVM_NET as any, new ExactEvmScheme()); accepts.push({ scheme: "exact", price: PRICE, network: EVM_NET, payTo: PAY_TO_EVM }); }
  if (PAY_TO_SOL) { server.register(SVM_NET as any, new ExactSvmScheme()); accepts.push({ scheme: "exact", price: PRICE, network: SVM_NET, payTo: PAY_TO_SOL }); }
  app.use(paymentMiddleware({
    "POST /check": {
      accepts,
      description: "Sentry: pre-sign security check. Send the intent your agent is about to sign (PayBox request_wallet_sign shape); get ALLOW / WARN / BLOCK with reasons.",
      mimeType: "application/json",
    },
  } as any, server, undefined, undefined, process.env.X402_SYNC !== "0"));
} else {
  console.warn("[sentry] PAY_TO_EVM / PAY_TO_SOL not set: /check is FREE (dev mode)");
}

async function runCheck(body: unknown) {
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) return { error: "Invalid request", issues: parsed.error.issues.slice(0, 5) } as const;
  const report = await check(parsed.data as any);
  save(report);
  return { ...report, report_url: `${BASE}/r/${report.id}` };
}

// Paid endpoint for agents.
app.post("/check", async (c) => {
  const body = await c.req.json().catch(() => null);
  const out = await runCheck(body);
  return "error" in out ? c.json(out, 400) : c.json(out);
});

// Free playground endpoint, rate-limited per IP.
const hits = new Map<string, number[]>();
function limited(c: any) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return true;
  hits.set(ip, [...recent, now]);
  return false;
}
const wallets = (c: any) => {
  const evm = c.req.query("evm"), sol = c.req.query("sol");
  return { evm: evm && /^0x[0-9a-fA-F]{40}$/.test(evm) ? evm : undefined, sol: sol && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sol) ? sol : undefined };
};
// Shareable demo links: /demo/airdrop-permit?evm=0x... runs that attack against a real wallet.
app.get("/demo/:key", async (c) => {
  if (limited(c)) return c.text("Slow down: 20 checks a minute.", 429);
  let ex; try { ex = examples(wallets(c)).find((e) => e.key === c.req.param("key")); } catch { ex = undefined; }
  if (!ex) return c.html(notFound(), 404);
  const out = await runCheck(ex.req);
  return "error" in out ? c.json(out, 400) : c.redirect(`/r/${out.id}`);
});
app.post("/api/try", async (c) => {
  if (limited(c)) return c.json({ error: "Slow down: 20 checks a minute on the playground. Agents use /check." }, 429);
  const out = await runCheck(await c.req.json().catch(() => null));
  return "error" in out ? c.json(out, 400) : c.json(out);
});

app.get("/", (c) => c.html(landing(examples(), BASE, PRICE, stats())));
app.get("/r/:id{[A-Za-z0-9_-]+\\.json}", (c) => {
  const r = load(c.req.param("id").replace(/\.json$/, ""));
  return r ? c.json(r) : c.json({ error: "not found" }, 404);
});
app.get("/r/:id", (c) => {
  const r = load(c.req.param("id"));
  return r ? c.html(verdictPage(r, BASE)) : c.html(notFound(), 404);
});
// Ready-to-send request bodies: curl -o check.json https://<host>/examples/airdrop-permit.json?evm=0x...
app.get("/examples/:file{[a-z0-9-]+\\.json}", (c) => {
  let ex; try { ex = examples(wallets(c)).find((e) => e.key === c.req.param("file").replace(/\.json$/, "")); } catch { ex = undefined; }
  return ex ? c.json(ex.req) : c.json({ error: "not found", try: examples().map((e) => `/examples/${e.key}.json`) }, 404);
});
app.get("/api/examples", (c) => { try { return c.json(examples(wallets(c))); } catch { return c.json({ error: "Invalid address" }, 400); } });
app.get("/health", (c) => c.json({ ok: true, engine: ENGINE, paid, ...stats() }));
app.get("/llms.txt", (c) => c.text(`# Sentry
> Pre-sign security for AI agent wallets. Call before every signature.

## When to call
Before PayBox request_wallet_sign, request_swap, request_transfer or any plugin money tool. Call it with the exact intent you are about to sign.

## How
PayBox: use_service({ credential_id, url: "${BASE}/check", method: "POST", body })
Price: ${PRICE} per check over x402.

Body:
{ "chain": "eip155:8453" | "solana:mainnet",
  "from": "<signer address>",
  "intent": <same object you pass to request_wallet_sign.intent>,
  "expect": { "action": "swap|transfer|approve|login|mint|bridge|other", "description": "<the user's request>", "recipient": "<optional>", "max_native": "<optional, base units>" },
  "known_recipients": ["<addresses the user has paid before>"] }

## Rules for agents
- verdict BLOCK: do not sign. Show the user "headline" and "report_url".
- verdict WARN: ask the user before signing; show "summary".
- verdict ALLOW: proceed.
- Never retry a BLOCKed intent with modified fields to get a different verdict.
`));

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[sentry] ${BASE} (x402 ${paid ? "ON" : "OFF"})`));
