// Tests Sentry Guard's decisions offline: a fake PayBox that runs the real Sentry
// engine instead of paying over the network, and records whether anything got signed.
import { guardedSign, type PayboxLike } from "../guard/core.js";
import { check } from "../src/engine/index.js";
import { examples } from "../src/examples.js";

function fakePaybox() {
  const signed: unknown[] = [];
  const pb: PayboxLike = {
    listCredentials: async () => ({ credentials: [{ credential: { id: "w1", metadata: { address: "0x1be1dae0d8d3820e621d83cc9390c5b98f573ec1", chains: ["evm"] } } }] }) as any,
    useService: async ({ body }: any) => {
      const report = await check(body, { price: false });
      return { response: { status: "success", output: { value: { resource: { body: JSON.stringify(report) } } } }, plan: { x402: { amount_usd: "0.01" } } } as any;
    },
    requestWalletSign: async ({ intent }: any) => { signed.push(intent); return { request_id: "r1", status: "success", output: { value: { signature: "0xsig" } } } as any; },
  };
  return { pb, signed };
}

const ex = Object.fromEntries(examples().map((e) => [e.key, e.req]));
let fails = 0;
const expectRun = async (name: string, req: any, want: string, wantSigned: number) => {
  const { pb, signed } = fakePaybox();
  const r = await guardedSign({ credentialId: "w1", intent: req.intent, chain: req.chain, expect: req.expect, knownRecipients: req.known_recipients }, pb);
  const ok = r.decision === want && signed.length === wantSigned;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} -> ${r.decision} (${r.verdict}), signatures made: ${signed.length}`);
};
await expectRun("drainer permit", ex["airdrop-permit"], "blocked", 0);
await expectRun("7702 'upgrade'", ex["7702-upgrade"], "blocked", 0);
await expectRun("Solana SetAuthority", ex["sol-setauthority"], "blocked", 0);
await expectRun("poisoned address", ex["sol-poison"], "blocked", 0);
await expectRun("exact Uniswap approval", ex["uniswap-approve"], "signed", 1);
await expectRun("pay a saved friend", ex["sol-friend"], "signed", 1);
await expectRun("plain login message", { intent: { op: "message", message: "Sign in to my app" }, expect: { action: "login" } }, "signed", 1);
{ // demo mode aims the scenario at the signing wallet
  const { pb, signed } = fakePaybox();
  const r = await guardedSign({ credentialId: "w1", demo: "airdrop-permit" }, pb);
  const ok = r.decision === "blocked" && signed.length === 0; if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${"demo: airdrop-permit".padEnd(34)} -> ${r.decision} (${r.verdict}), signatures made: ${signed.length}`);
}
console.log(fails ? `\n${fails} FAILED` : "\nall guard decisions correct");
process.exit(fails ? 1 : 0);
