import { decodeFunctionData, parseAbi, isAddress, hexToString, isHex, type Hex } from "viem";
import { Ctx, UNLIMITED, checkExpectation, checkRecipient } from "./common.js";
import { KNOWN_7702, evmName, short, tokenLabel } from "../known.js";

const RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io",
  42161: "https://arb1.arbitrum.io/rpc",
  137: "https://polygon-rpc.com",
  84532: "https://sepolia.base.org",
};

const ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 addedValue)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)", // Permit2
]);

/** Is this address a plain wallet (no code)? Best effort; undefined if we can't tell. */
async function isEOA(chainId: number | undefined, addr: string): Promise<boolean | undefined> {
  const url = chainId ? (process.env[`RPC_${chainId}`] ?? RPC[chainId]) : undefined;
  if (!url) return undefined;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [addr, "latest"] }),
      signal: AbortSignal.timeout(2500),
    });
    const j: any = await res.json();
    if (typeof j.result !== "string") return undefined;
    return j.result === "0x" || j.result === "0x0";
  } catch { return undefined; }
}

function chainIdOf(ctx: Ctx, fallback?: unknown): number | undefined {
  const c = ctx.req.chain;
  if (c?.startsWith("eip155:")) return Number(c.split(":")[1]);
  const n = Number(fallback);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const fmtAmt = (v: bigint) => (v >= UNLIMITED ? "UNLIMITED" : v.toString());

async function judgeSpender(ctx: Ctx, chainId: number | undefined, spender: string, amount: bigint | "all", what: string, gasless: boolean) {
  if (amount === 0n) { ctx.act("(this sets the allowance to zero, which revokes access)"); return; }
  const name = evmName(spender);
  const unlimited = amount === "all" || amount >= UNLIMITED;
  const who = name ? `${name} (${short(spender)})` : `unrecognized address ${short(spender)}`;
  ctx.risk(unlimited ? `All of your ${what}` : `${fmtAmt(amount as bigint)} units of ${what}`);
  const eoa = name ? false : await isEOA(chainId, spender);
  if (eoa === true) {
    ctx.add({
      id: "approval_to_wallet", severity: "critical",
      title: "Grants spending power to a personal wallet",
      detail: `${who} is a plain wallet, not a protocol contract. No legitimate dApp needs a wallet to pull your tokens. This is how drainers collect.`,
    });
  }
  if (unlimited) {
    ctx.add({
      id: "unlimited_approval", severity: name ? "medium" : "critical",
      title: name ? "Unlimited approval to a known protocol" : "Unlimited approval to an unknown spender",
      detail: `Lets ${who} move ${amount === "all" ? "every one" : "all"} of your ${what}, now and in the future, without asking again.${gasless ? " It's an off-chain signature: no gas, no transaction, so it feels harmless, but it can be submitted by anyone who holds it." : ""}`,
    });
  } else if (!name) {
    ctx.add({
      id: "unknown_spender", severity: "high",
      title: "Approval to an unrecognized spender",
      detail: `${who} is not a protocol Sentry recognizes. Confirm the dApp before granting it any allowance.`,
    });
  }
}

export async function analyzeEvm(ctx: Ctx) {
  const intent: any = ctx.req.intent;
  switch (intent.op) {
    case "transaction": return tx(ctx, intent.transaction ?? {});
    case "typedData": return typed(ctx, intent.typedData ?? {});
    case "authorization": return delegation(ctx, intent.authorization ?? {});
    case "message": return message(ctx, String(intent.message ?? ""));
    case "raw":
      ctx.act("Sign a raw 32-byte digest");
      ctx.add({
        id: "blind_signature", severity: "high",
        title: "Blind signature",
        detail: "This signs a pre-computed hash. Nobody, including Sentry, can see what it authorizes. A hash can be a transaction, a permit, or an order. Refuse unless you produced the hash yourself.",
      });
      checkExpectation(ctx, "sign");
      return;
  }
}

async function tx(ctx: Ctx, t: any) {
  const chainId = chainIdOf(ctx, t.chainId);
  const to: string | undefined = t.to;
  const value = BigInt(t.value ?? 0);
  const data: string = t.data ?? t.input ?? "0x";

  if (Array.isArray(t.authorizationList) && t.authorizationList.length) {
    for (const a of t.authorizationList) await delegation(ctx, a);
  }
  if (!to) {
    ctx.act("Deploy a new contract");
    ctx.add({ id: "contract_deploy", severity: "medium", title: "Deploys a contract", detail: "Agents rarely need to deploy code. Confirm this was intended." });
    return;
  }
  if (!data || data === "0x") {
    ctx.act(`Send ${value} wei of the native token to ${evmName(to) ?? short(to)}`);
    if (value > 0n) ctx.risk(`${value} wei of native token`);
    checkRecipient(ctx, to);
    checkExpectation(ctx, "transfer", value);
    return;
  }

  let decoded: { functionName: string; args: readonly any[] } | undefined;
  try { decoded = decodeFunctionData({ abi: ABI, data: data as Hex }) as any; } catch { /* unknown call */ }
  const token = evmName(to) ?? tokenLabel(to);

  if (!decoded) {
    const name = evmName(to);
    ctx.act(`Call ${name ?? `unrecognized contract ${short(to)}`} (selector ${data.slice(0, 10)})${value ? ` sending ${value} wei` : ""}`);
    if (!name) ctx.add({ id: "unknown_contract", severity: "low", title: "Unrecognized contract", detail: `Sentry can't identify ${short(to)}. Not dangerous by itself, but there is no reputation to lean on.` });
    if (value > 0n) { ctx.risk(`${value} wei of native token`); checkExpectation(ctx, "swap", value); }
    else checkExpectation(ctx, "swap");
    return;
  }

  const [a0, a1, a2] = decoded.args as any[];
  switch (decoded.functionName) {
    case "approve":
      if (decoded.args.length === 4) { // Permit2 allowance
        ctx.act(`Permit2: let ${evmName(a1) ?? short(a1)} spend ${fmtAmt(BigInt(a2))} of ${tokenLabel(a0)}`);
        await judgeSpender(ctx, chainId, a1, BigInt(a2), tokenLabel(a0), false);
      } else {
        ctx.act(`Approve ${evmName(a0) ?? short(a0)} to spend ${fmtAmt(BigInt(a1))} of ${token}`);
        await judgeSpender(ctx, chainId, a0, BigInt(a1), token, false);
      }
      checkExpectation(ctx, "approve");
      return;
    case "increaseAllowance":
      ctx.act(`Increase ${evmName(a0) ?? short(a0)}'s allowance on ${token} by ${fmtAmt(BigInt(a1))}`);
      await judgeSpender(ctx, chainId, a0, BigInt(a1), token, false);
      checkExpectation(ctx, "approve");
      return;
    case "setApprovalForAll":
      if (a1 === false) { ctx.act(`Revoke ${short(a0)}'s access to your NFTs in ${token}`); return; }
      ctx.act(`Give ${evmName(a0) ?? short(a0)} control of EVERY NFT you hold in ${token}`);
      await judgeSpender(ctx, chainId, a0, "all", `NFTs in ${token}`, false);
      ctx.add({ id: "nft_operator", severity: evmName(a0) ? "medium" : "critical", title: "Hands over an entire NFT collection", detail: `setApprovalForAll makes ${short(a0)} an operator over every NFT in this collection you own or will own.` });
      checkExpectation(ctx, "approve");
      return;
    case "transfer":
      ctx.act(`Transfer ${a1} units of ${token} to ${short(a0)}`);
      ctx.risk(`${a1} units of ${token}`);
      checkRecipient(ctx, a0);
      checkExpectation(ctx, "transfer");
      return;
    case "transferFrom":
    case "safeTransferFrom":
      ctx.act(`Move ${a2} of ${token} from ${short(a0)} to ${short(a1)}`);
      checkRecipient(ctx, a1);
      checkExpectation(ctx, "transfer");
      return;
  }
}

async function typed(ctx: Ctx, td: any) {
  const pt: string = td.primaryType ?? "";
  const m = td.message ?? {};
  const d = td.domain ?? {};
  const chainId = chainIdOf(ctx, d.chainId);
  const tokenName = d.name ? `${d.name} (${short(String(d.verifyingContract ?? ""))})` : short(String(d.verifyingContract ?? "token"));
  const deadline = Number(m.deadline ?? m.expiry ?? m.sigDeadline ?? m.details?.expiration ?? 0);

  const longLived = () => {
    if (deadline && deadline - Date.now() / 1000 > 60 * 60 * 24 * 365) {
      ctx.add({ id: "long_deadline", severity: "medium", title: "Signature valid for over a year", detail: "A permit that stays valid this long can be used long after you've forgotten signing it." });
    }
  };

  if (pt === "Permit") {
    const spender = m.spender;
    const amount = m.allowed === true ? UNLIMITED : BigInt(m.value ?? 0);
    ctx.act(`Gasless permit: let ${evmName(spender) ?? short(spender)} spend ${fmtAmt(amount)} of ${tokenName}`);
    await judgeSpender(ctx, chainId, spender, amount, tokenName, true);
    longLived();
    checkExpectation(ctx, "approve");
    return;
  }
  if (pt === "PermitSingle" || pt === "PermitBatch") {
    const items = pt === "PermitSingle" ? [m.details] : (m.details ?? []);
    for (const it of items) {
      ctx.act(`Permit2 signature: let ${evmName(m.spender) ?? short(m.spender)} spend ${fmtAmt(BigInt(it?.amount ?? 0))} of ${short(String(it?.token))}`);
      await judgeSpender(ctx, chainId, m.spender, BigInt(it?.amount ?? 0), tokenLabel(String(it?.token)), true);
    }
    longLived();
    checkExpectation(ctx, "approve");
    return;
  }
  if (pt === "PermitTransferFrom" || pt === "PermitBatchTransferFrom" || pt === "PermitWitnessTransferFrom") {
    const perms = Array.isArray(m.permitted) ? m.permitted : [m.permitted];
    for (const p of perms) {
      ctx.act(`Permit2 signature transfer: ${evmName(m.spender) ?? short(m.spender)} can pull ${fmtAmt(BigInt(p?.amount ?? 0))} of ${short(String(p?.token))} directly`);
      await judgeSpender(ctx, chainId, m.spender, BigInt(p?.amount ?? 0), tokenLabel(String(p?.token)), true);
    }
    ctx.add({ id: "signature_transfer", severity: evmName(m.spender) ? "low" : "high", title: "Signature moves tokens directly", detail: "This isn't an allowance. Whoever holds this signature can pull the tokens in one step." });
    checkExpectation(ctx, "transfer");
    return;
  }
  if (pt === "OrderComponents") { // Seaport listing
    const offerer = String(m.offerer ?? ctx.req.from ?? "").toLowerCase();
    const offer = m.offer ?? [];
    const toMe = (m.consideration ?? []).filter((c: any) => String(c.recipient).toLowerCase() === offerer);
    const paid = toMe.reduce((s: bigint, c: any) => s + BigInt(c.startAmount ?? 0), 0n);
    ctx.act(`Seaport listing: offer ${offer.length} item(s), receive ${paid} base units in return`);
    ctx.risk(`${offer.length} NFT/token item(s) listed`);
    if (offer.length && paid === 0n) {
      ctx.add({ id: "zero_listing", severity: "critical", title: "Lists your assets for nothing", detail: "This order gives your items away and pays you zero. The 'free listing' drainer: the attacker fills it instantly." });
    }
    checkExpectation(ctx, "sign");
    return;
  }
  ctx.act(`Sign typed data "${pt || "unknown"}" for ${d.name ?? "an unnamed app"}`);
  const spender = m.spender ?? m.operator ?? m.delegate;
  if (spender && isAddress(spender)) {
    await judgeSpender(ctx, chainId, spender, BigInt(m.value ?? m.amount ?? 0) || UNLIMITED, tokenName, true);
  } else {
    ctx.add({ id: "unknown_typed_data", severity: "low", title: "Unfamiliar signature type", detail: `Sentry doesn't have a decoder for "${pt}". Review the fields before signing.` });
  }
  checkExpectation(ctx, "sign");
}

async function delegation(ctx: Ctx, a: any) {
  const target = String(a.address ?? a.contractAddress ?? "").toLowerCase();
  const chainId = Number(a.chainId ?? 1);
  if (/^0x0{40}$/.test(target)) { ctx.act("Remove the EIP-7702 delegation from your account"); return; }
  const known = KNOWN_7702[target];
  ctx.act(`EIP-7702: turn your account into ${known ?? `the unverified contract ${short(target)}`}${chainId === 0 ? " on EVERY chain" : ""}`);
  ctx.risk("Every asset in this account, on every chain this applies to");
  if (!known) {
    ctx.add({
      id: "unknown_7702", severity: "critical",
      title: "Delegates your entire account to unknown code",
      detail: `An EIP-7702 authorization makes ${short(target)} the code that runs your wallet. It doesn't ask for one token. It controls all of them, forever, until revoked. Only delegate to audited wallet implementations.`,
    });
  }
  if (chainId === 0) {
    ctx.add({ id: "7702_all_chains", severity: known ? "high" : "critical", title: "Valid on every chain", detail: "chainId 0 means this one signature can be replayed on every EVM chain where your address exists." });
  }
  checkExpectation(ctx, "delegate");
}

function message(ctx: Ctx, msg: string) {
  let text = msg;
  if (isHex(msg) && msg.length !== 66) { try { text = hexToString(msg as Hex); } catch { /* keep */ } }
  if (/^0x[0-9a-fA-F]{64}$/.test(msg)) {
    ctx.act("Sign a 32-byte hex value");
    ctx.add({ id: "hash_as_message", severity: "high", title: "Message is a bare hash", detail: "A login message is readable text. A raw 32-byte hash disguised as a message is a common trick to get a blind signature." });
    checkExpectation(ctx, "sign");
    return;
  }
  const siwe = text.match(/^(\S+) wants you to sign in with your Ethereum account/m);
  if (siwe) {
    ctx.act(`Sign in to ${siwe[1]}`);
    const uri = text.match(/^URI: (.+)$/m)?.[1];
    if (uri) { try { if (new URL(uri).host !== siwe[1]) ctx.add({ id: "siwe_domain_mismatch", severity: "high", title: "Login domain doesn't match", detail: `The message claims ${siwe[1]} but points to ${uri}.` }); } catch {} }
    checkExpectation(ctx, "login");
    return;
  }
  ctx.act(`Sign the text message: "${text.slice(0, 120)}${text.length > 120 ? "…" : ""}"`);
  if (/\b(permit|approve|transfer|withdraw)\b/i.test(text) && /\b(0x[0-9a-f]{40})\b/i.test(text)) {
    ctx.add({ id: "suspicious_message", severity: "medium", title: "Message talks about moving funds", detail: "Plain messages shouldn't authorize transfers. Check which app asked for this and why." });
  }
  checkExpectation(ctx, "login");
}
