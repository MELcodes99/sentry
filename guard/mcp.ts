#!/usr/bin/env node
// Sentry Guard as an MCP server (stdio). Give an agent this instead of raw signing:
// every signature it asks for is checked by Sentry first, and BLOCKed intents are
// never signed. Uses the PayBox login + signing key on this machine.
//
// Claude Desktop / Cursor config:
//   "sentry-guard": { "command": "npx", "args": ["tsx", "/path/to/sentry/guard/mcp.ts"] }
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PayboxClient } from "@paybox-sh/sdk";
import { guardedSign } from "./core.js";

const server = new McpServer({ name: "sentry-guard", version: "1.1.0" });

const intent = z.object({ op: z.enum(["message", "typedData", "transaction", "authorization", "solanaMessage", "solanaTransaction", "raw"]) })
  .passthrough()
  .describe("Exactly what to sign, in PayBox request_wallet_sign `intent` shape, e.g. {op:'typedData', typedData:{...}}");

const shape = {
  credential_id: z.string().describe("PayBox wallet credential that signs (from list_wallets)"),
  intent,
  task: z.string().describe("What the user actually asked you to do, in their words. Sentry flags signatures that don't match it."),
  action: z.enum(["swap", "transfer", "approve", "login", "mint", "bridge", "other"]).describe("The kind of action the user asked for"),
  recipient: z.string().optional().describe("Who the user said should receive funds, if any"),
  known_recipients: z.array(z.string()).optional().describe("Addresses the user has paid before"),
  chain: z.string().optional().describe("CAIP-2 chain, e.g. eip155:8453 or solana:mainnet"),
};

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });
const run = async (a: any, checkOnly: boolean) => {
  try {
    return text(await guardedSign({
      credentialId: a.credential_id, intent: a.intent, chain: a.chain,
      expect: { description: a.task, action: a.action, recipient: a.recipient },
      knownRecipients: a.known_recipients, checkOnly,
    }));
  } catch (e: any) {
    return { ...text({ error: e?.message ?? String(e) }), isError: true };
  }
};

server.registerTool("list_wallets", {
  description: "List the PayBox wallets this machine can sign with (credential id, chain family, address).",
}, async () => {
  const { credentials } = await PayboxClient.fromConfig().listCredentials();
  return text((credentials as any[]).map((c) => ({ credential_id: c.credential?.id, name: c.credential?.name, chains: c.credential?.metadata?.chains, address: c.credential?.metadata?.address })));
});

server.registerTool("guarded_sign", {
  description: "Sign with a PayBox wallet, protected by Sentry. Sentry (paid $0.01 via x402) checks the exact intent against the user's task first. ALLOW: it is signed. WARN: nothing is signed; show the user the summary and only retry with their explicit OK. BLOCK: nothing is signed; tell the user the headline and report_url, and never try to get around it.",
  inputSchema: shape,
}, (a) => run(a, false));

server.registerTool("sentry_check", {
  description: "Get Sentry's verdict on an intent without signing (paid $0.01 via x402).",
  inputSchema: shape,
}, (a) => run(a, true));

await server.connect(new StdioServerTransport());
