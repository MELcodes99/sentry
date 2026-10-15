import { nanoid } from "nanoid";
import { z } from "zod";
import type { CheckRequest, Report, Severity, Verdict } from "../types.js";
import { Ctx } from "./common.js";
import { analyzeEvm } from "./evm.js";
import { analyzeSolana } from "./solana.js";

export const ENGINE = "sentry-1.0";

const intentSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("message"), message: z.string() }),
  z.object({ op: z.literal("typedData"), typedData: z.any() }),
  z.object({ op: z.literal("transaction"), transaction: z.any() }),
  z.object({ op: z.literal("authorization"), authorization: z.any() }),
  z.object({ op: z.literal("solanaMessage"), address: z.string(), message: z.string() }),
  z.object({ op: z.literal("solanaTransaction"), address: z.string(), transactionBase64: z.string() }),
  z.object({ op: z.literal("raw"), rawSigningPayloadHex: z.string() }),
]);

export const checkSchema = z.object({
  chain: z.string().optional(),
  from: z.string().optional(),
  intent: intentSchema,
  expect: z.object({
    action: z.enum(["swap", "transfer", "approve", "login", "mint", "bridge", "other"]).optional(),
    recipient: z.string().optional(),
    max_native: z.string().regex(/^\d+$/).optional(),
    description: z.string().max(500).optional(),
  }).optional(),
  known_recipients: z.array(z.string()).max(200).optional(),
});

const WEIGHT: Record<Severity, number> = { critical: 95, high: 75, medium: 45, low: 15, info: 0 };

export async function check(req: CheckRequest): Promise<Report> {
  const ctx = new Ctx(req);
  const op = req.intent.op;
  if (op === "solanaMessage" || op === "solanaTransaction") await analyzeSolana(ctx);
  else await analyzeEvm(ctx);

  const rank: Severity[] = ["critical", "high", "medium", "low", "info"];
  ctx.findings.sort((a, b) => rank.indexOf(a.severity) - rank.indexOf(b.severity));
  const top = ctx.findings[0];
  const base = top ? WEIGHT[top.severity] : 0;
  const extra = ctx.findings.slice(1).reduce((s, f) => s + WEIGHT[f.severity] / 20, 0);
  const risk_score = Math.min(100, Math.round(base + extra));

  const verdict: Verdict =
    top && (top.severity === "critical" || top.severity === "high") ? "BLOCK" :
    top && top.severity === "medium" ? "WARN" : "ALLOW";

  const action = ctx.actions.join("; ") || "Unknown action";
  const headline =
    verdict === "BLOCK" ? top!.title :
    verdict === "WARN" ? `Proceed with care: ${top!.title.toLowerCase()}` :
    "Looks safe to sign";
  const summary =
    verdict === "BLOCK" ? `Do not sign. ${top!.detail}` :
    verdict === "WARN" ? `${top!.detail} Ask the user before signing.` :
    `Sentry found nothing dangerous. Signing will: ${action}.`;

  return {
    id: nanoid(10), verdict, risk_score, headline, summary, action,
    at_risk: verdict === "ALLOW" ? [] : ctx.atRisk,
    findings: ctx.findings,
    chain: req.chain, from: req.from, op,
    created_at: new Date().toISOString(), engine: ENGINE,
  };
}
