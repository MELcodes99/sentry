// Shared types. The `intent` shape mirrors PayBox's `request_wallet_sign` intent,
// so an agent can pass the exact object it is about to sign.

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Verdict = "ALLOW" | "WARN" | "BLOCK";

export type Intent =
  | { op: "message"; message: string }
  | { op: "typedData"; typedData: any }
  | { op: "transaction"; transaction: any }
  | { op: "authorization"; authorization: any }
  | { op: "solanaMessage"; address: string; message: string }
  | { op: "solanaTransaction"; address: string; transactionBase64: string }
  | { op: "raw"; rawSigningPayloadHex: string };

/** What the user actually asked the agent to do. Optional, but it powers the
 *  "does this transaction match the task?" check. */
export interface Expectation {
  action?: "swap" | "transfer" | "approve" | "login" | "mint" | "bridge" | "other";
  recipient?: string;
  max_native?: string; // max native value in wei / lamports, decimal string
  description?: string; // free text, echoed back in the report
}

export interface CheckRequest {
  chain?: string; // CAIP-2, e.g. eip155:8453 or solana:mainnet
  from?: string; // signer address
  intent: Intent;
  expect?: Expectation;
  known_recipients?: string[]; // user's address book, for poisoning detection
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface Report {
  id: string;
  verdict: Verdict;
  risk_score: number; // 0-100
  headline: string;
  summary: string;
  action: string; // plain-English decode of what signing does
  at_risk: string[];
  value_at_risk_usd: number | null; // signer's real balance in play, priced in USD (null if unknown)
  value_items: { label: string; amount: string; usd: number }[];
  findings: Finding[];
  chain?: string;
  from?: string;
  op: Intent["op"];
  created_at: string;
  engine: string;
}
