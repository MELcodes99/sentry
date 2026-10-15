import type { CheckRequest, Finding } from "../types.js";
import { short } from "../known.js";

export const UNLIMITED = 2n ** 100n; // anything this large is effectively "everything you own"

/** Something of value this signature puts in play. Priced later in value.ts. */
export type Exposure =
  | { kind: "evm-token"; chainId: number; token: string; owner?: string; amount: bigint | "all" }
  | { kind: "evm-native"; chainId: number; owner?: string; amount: bigint | "all" }
  | { kind: "sol"; owner: string; lamports: bigint | "all" }
  | { kind: "spl-account"; account: string; amount: bigint | "all" };

/** Collects findings plus the plain-English description of the action. */
export class Ctx {
  findings: Finding[] = [];
  actions: string[] = [];
  atRisk: string[] = [];
  exposures: Exposure[] = [];
  constructor(public req: CheckRequest) {}
  expose(e: Exposure) { this.exposures.push(e); }
  add(f: Finding) {
    f.detail = f.detail.charAt(0).toUpperCase() + f.detail.slice(1);
    if (!this.findings.some((x) => x.id === f.id && x.detail === f.detail)) this.findings.push(f);
  }
  act(s: string) { this.actions.push(s); }
  risk(s: string) { if (!this.atRisk.includes(s)) this.atRisk.push(s); }
}

const norm = (a: string) => (a.startsWith("0x") ? a.toLowerCase() : a);

/** Address poisoning: same first and last characters as a saved address, but not it. */
export function checkRecipient(ctx: Ctx, recipient: string | undefined) {
  if (!recipient) return;
  const r = norm(recipient);
  const book = (ctx.req.known_recipients ?? []).map(norm);
  const strip = (a: string) => (a.startsWith("0x") ? a.slice(2) : a);
  if (!book.includes(r)) {
    for (const k of book) {
      const a = strip(r), b = strip(k);
      if (a.slice(0, 4) === b.slice(0, 4) && a.slice(-4) === b.slice(-4)) {
        ctx.add({
          id: "address_poisoning", severity: "critical",
          title: "Lookalike address (address poisoning)",
          detail: `Recipient ${recipient} copies the start and end of your saved address ${ctx.req.known_recipients!.find(x => norm(x) === k) ?? k}, but it is a different address. This is the classic poisoning scam: the attacker plants a lookalike in your history and waits for you to copy it.`,
        });
      }
    }
  }
  const exp = ctx.req.expect?.recipient;
  if (exp && norm(exp) !== r) {
    ctx.add({
      id: "recipient_mismatch", severity: "high",
      title: "Funds go somewhere other than you asked",
      detail: `The task named ${short(exp)} as the recipient, but this sends to ${short(recipient)}.`,
    });
  }
}

/** Does the operation match what the user asked the agent to do? */
export function checkExpectation(ctx: Ctx, kind: "approve" | "transfer" | "swap" | "login" | "delegate" | "sign", native?: bigint) {
  const e = ctx.req.expect;
  if (!e) return;
  if (e.action && e.action !== "other") {
    const compatible: Record<string, string[]> = {
      swap: ["swap", "approve"],
      transfer: ["transfer"],
      approve: ["approve"],
      login: ["login"],
      mint: ["transfer", "swap", "sign"],
      bridge: ["swap", "approve", "transfer"],
    };
    if (!(compatible[e.action] ?? []).includes(kind)) {
      ctx.add({
        id: "task_mismatch", severity: kind === "delegate" || kind === "approve" ? "critical" : "high",
        title: "This is not what the agent was asked to do",
        detail: `The task was "${e.description ?? e.action}", but signing this ${({ delegate: "hands over control of the whole account", approve: "grants a token approval", transfer: "sends funds", swap: "executes a swap or contract call", login: "signs a login message", sign: "signs an opaque payload" } as Record<string, string>)[kind]}. An agent being steered into a different action is the signature of a prompt-injection or phishing attack.`,
      });
    }
  }
  if (e.max_native && native !== undefined && native > BigInt(e.max_native)) {
    ctx.add({
      id: "over_budget", severity: "high",
      title: "Spends more than the task allows",
      detail: `Sends ${native} base units of the native token; the task capped it at ${e.max_native}.`,
    });
  }
}
