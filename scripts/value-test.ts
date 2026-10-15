// Tests dollar valuation offline with a fake network (2,340 USDC + 0.5 ETH, 3 SOL + 120 USDC).
import { examples } from "../src/examples.js";
import { check } from "../src/engine/index.js";
// Fake network: owner holds 2,340 USDC + 0.5 ETH on Base; 3 SOL + 120 USDC on Solana.
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const json = (x: any) => ({ json: async () => x }) as any;
  if (u.startsWith("https://coins.llama.fi")) return json({ coins: {
    "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { price: 1, decimals: 6, symbol: "USDC" },
    "coingecko:ethereum": { price: 3000, symbol: "ETH" },
    "coingecko:solana": { price: 150, symbol: "SOL" },
    "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { price: 1, decimals: 6, symbol: "USDC" } } });
  const b = JSON.parse(init.body);
  if (b.method === "eth_getCode") return json({ result: "0x" });
  if (b.method === "eth_call") return json({ result: "0x" + (2340n * 10n ** 6n).toString(16) });
  if (b.method === "eth_getBalance") return json({ result: "0x" + (5n * 10n ** 17n).toString(16) });
  if (b.method === "getBalance") return json({ result: { value: 3_000_000_000 } });
  if (b.method === "getAccountInfo") return json({ result: { value: { data: { parsed: { info: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenAmount: { amount: "120000000", decimals: 6 } } } } } } });
  throw new Error("unexpected " + u);
}) as any;
for (const e of examples()) {
  const r = await check(e.req);
  console.log(e.key.padEnd(18), r.verdict.padEnd(5), "value:", r.value_at_risk_usd, JSON.stringify(r.value_items));
}
const r = await check(examples()[0].req); console.log("\nsummary:", r.summary.slice(0, 120));
