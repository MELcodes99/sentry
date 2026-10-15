// Turns exposures into dollars: reads the signer's real balances on-chain and prices
// them with DefiLlama's free price API. Everything here is best effort with short
// timeouts; if a lookup fails, that exposure is simply left unpriced.
import type { Exposure } from "./common.js";
import { RPC } from "./evm.js";

const SOL_RPC = () => process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
const LLAMA_CHAIN: Record<number, string> = { 1: "ethereum", 8453: "base", 10: "optimism", 42161: "arbitrum", 137: "polygon" };
const NATIVE_PRICE_KEY: Record<number, string> = { 1: "coingecko:ethereum", 8453: "coingecko:ethereum", 10: "coingecko:ethereum", 42161: "coingecko:ethereum", 137: "coingecko:polygon-ecosystem-token" };
const NATIVE_SYMBOL: Record<number, string> = { 1: "ETH", 8453: "ETH", 10: "ETH", 42161: "ETH", 137: "POL" };

export interface PricedExposure { label: string; amount: string; usd: number }

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(3000),
  });
  const j: any = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function prices(keys: string[]): Promise<Record<string, { price: number; decimals?: number; symbol?: string }>> {
  if (!keys.length) return {};
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${keys.map(encodeURIComponent).join(",")}`, { signal: AbortSignal.timeout(3000) });
    return ((await res.json()) as any).coins ?? {};
  } catch { return {}; }
}

const evmUrl = (chainId: number) => process.env[`RPC_${chainId}`] ?? RPC[chainId];

async function evmBalance(chainId: number, token: string | null, owner: string): Promise<bigint | undefined> {
  const url = evmUrl(chainId);
  if (!url) return undefined;
  try {
    if (!token) return BigInt(await rpc(url, "eth_getBalance", [owner, "latest"]));
    const data = "0x70a08231" + owner.toLowerCase().replace(/^0x/, "").padStart(64, "0"); // balanceOf(owner)
    return BigInt(await rpc(url, "eth_call", [{ to: token, data }, "latest"]));
  } catch { return undefined; }
}

const fmt = (raw: bigint, decimals: number) => {
  const n = Number(raw) / 10 ** decimals;
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

/** Prices every exposure it can. Returns per-item values plus the total. */
export async function priceExposures(list: Exposure[]): Promise<{ total: number | null; items: PricedExposure[] }> {
  if (!list.length) return { total: null, items: [] };

  // 1. Resolve raw amounts ("all" means the signer's whole balance).
  type Resolved = { key: string; raw: bigint; decimals?: number; fallbackSymbol: string };
  const resolved = await Promise.all(list.map(async (e): Promise<Resolved | undefined> => {
    try {
      if (e.kind === "evm-token") {
        const chain = LLAMA_CHAIN[e.chainId]; if (!chain) return;
        let raw = e.amount;
        if (raw === "all" || raw > 2n ** 100n) { if (!e.owner) return; raw = (await evmBalance(e.chainId, e.token, e.owner)) ?? -1n; }
        else if (e.owner) { const bal = await evmBalance(e.chainId, e.token, e.owner); if (bal !== undefined && bal < raw) raw = bal; }
        if (raw < 0n) return;
        return { key: `${chain}:${e.token.toLowerCase()}`, raw, fallbackSymbol: "tokens" };
      }
      if (e.kind === "evm-native") {
        let raw = e.amount;
        if (raw === "all") { if (!e.owner) return; raw = (await evmBalance(e.chainId, null, e.owner)) ?? -1n; }
        if (raw < 0n || !NATIVE_PRICE_KEY[e.chainId]) return;
        return { key: NATIVE_PRICE_KEY[e.chainId], raw, decimals: 18, fallbackSymbol: NATIVE_SYMBOL[e.chainId] };
      }
      if (e.kind === "sol") {
        let raw = e.lamports;
        if (raw === "all") raw = BigInt((await rpc(SOL_RPC(), "getBalance", [e.owner])).value);
        return { key: "coingecko:solana", raw, decimals: 9, fallbackSymbol: "SOL" };
      }
      if (e.kind === "spl-account") {
        const r = (await rpc(SOL_RPC(), "getAccountInfo", [e.account, { encoding: "jsonParsed" }]))?.value;
        const info = r?.data?.parsed?.info;
        if (!info?.mint) return;
        const bal = BigInt(info.tokenAmount.amount);
        const raw = e.amount === "all" || e.amount > bal ? bal : e.amount;
        return { key: `solana:${info.mint}`, raw, decimals: info.tokenAmount.decimals, fallbackSymbol: "tokens" };
      }
    } catch { return; }
  }));

  // 2. Price them in one call.
  const ok = resolved.filter((r): r is Resolved => !!r);
  const p = await prices([...new Set(ok.map((r) => r.key))]);
  const items: PricedExposure[] = [];
  for (const r of ok) {
    const q = p[r.key]; if (!q?.price) continue;
    const decimals = r.decimals ?? q.decimals; if (decimals === undefined) continue;
    const usd = (Number(r.raw) / 10 ** decimals) * q.price;
    items.push({ label: q.symbol ?? r.fallbackSymbol, amount: fmt(r.raw, decimals), usd: Math.round(usd * 100) / 100 });
  }
  if (!items.length) return { total: null, items: [] };
  return { total: Math.round(items.reduce((s, i) => s + i.usd, 0) * 100) / 100, items };
}
