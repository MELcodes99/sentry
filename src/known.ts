// Recognized contracts and programs. Being on this list lowers suspicion; it never
// makes an otherwise dangerous action safe (an unlimited approval to a real router
// is still flagged, just less severely).

export const KNOWN_EVM: Record<string, string> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
  "0x6ff5693b99212da76ad316178a184ab56d299b43": "Uniswap Universal Router (v4)",
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap SwapRouter02",
  "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap SwapRouter02 (Base)",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch Router v6",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": "LI.FI Diamond",
  "0x0000000000000068f116a894984e2db1123eb395": "Seaport 1.6",
};

// EIP-7702 delegation targets we recognize. Anything else is treated as
// "hand your whole account to unknown code".
export const KNOWN_7702: Record<string, string> = {
  "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b": "MetaMask Delegation Toolkit",
};

export const KNOWN_SOLANA: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "SPL Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  Stake11111111111111111111111111111111111111: "Stake Program",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter Aggregator v6",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca Whirlpools",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun",
};

export const TOKENS: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC (Base)",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC (Ethereum)",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT (Ethereum)",
  "0x4200000000000000000000000000000000000006": "WETH (Base)",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH (Ethereum)",
};
export const tokenLabel = (a: string) => TOKENS[a.toLowerCase()] ?? `token ${short(a)}`;

export const evmName = (a?: string) => (a ? KNOWN_EVM[a.toLowerCase()] : undefined);
export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
