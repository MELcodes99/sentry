// Everyday, legitimate actions. Sentry should NOT block these.
import { encodeFunctionData, parseAbi } from "viem";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { check } from "../src/engine/index.js";

const ME = "0x70a0c3f9be27d8a5b1c3e5f0a9d7b6c4e3f22b1f";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const FRIEND = "0x1234567890abcdef1234567890abcdef12345678";
const erc20 = parseAbi(["function approve(address,uint256)", "function transfer(address,uint256)", "function setApprovalForAll(address,bool)"]);
const SOL_ME = new PublicKey("5EUaHnSPRo7cdD8vbW1nJ4bFq5FjNcbdkSq4yP3HSViS");
const sol = (ixs: TransactionInstruction[]) => Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: SOL_ME, recentBlockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi", instructions: ixs }).compileToV0Message()).serialize()).toString("base64");

const cases: [string, any][] = [
  ["Sign in with Ethereum", { chain: "eip155:8453", expect: { action: "login" }, intent: { op: "message", message: "app.uniswap.org wants you to sign in with your Ethereum account:\n" + ME + "\n\nURI: https://app.uniswap.org\nVersion: 1\nChain ID: 8453\nNonce: 8a7f2c" } }],
  ["Plain text message", { intent: { op: "message", message: "Hello from my agent" } }],
  ["Send 0.01 ETH to a friend", { chain: "eip155:8453", expect: { action: "transfer", recipient: FRIEND }, intent: { op: "transaction", transaction: { to: FRIEND, value: "10000000000000000", data: "0x" } } }],
  ["Send 25 USDC to a friend", { chain: "eip155:8453", expect: { action: "transfer" }, intent: { op: "transaction", transaction: { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [FRIEND, 25_000_000n] }) } } }],
  ["Exact 250 USDC approval to Permit2", { chain: "eip155:8453", expect: { action: "swap" }, intent: { op: "transaction", transaction: { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: ["0x000000000022D473030F116dDEE9F6B43aC78BA3", 250_000_000n] }) } } }],
  ["Revoke an approval (set to 0)", { chain: "eip155:8453", expect: { action: "approve" }, intent: { op: "transaction", transaction: { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: ["0x000000000022D473030F116dDEE9F6B43aC78BA3", 0n] }) } } }],
  ["Revoke NFT operator", { chain: "eip155:1", intent: { op: "transaction", transaction: { to: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", data: encodeFunctionData({ abi: erc20, functionName: "setApprovalForAll", args: [FRIEND, false] }) } } }],
  ["Swap via Uniswap router", { chain: "eip155:8453", expect: { action: "swap" }, intent: { op: "transaction", transaction: { to: "0x2626664c2603336E57B271c5C0b26F421741e481", value: "100000000000000000", data: "0x04e45aaf" + "00".repeat(224) } } }],
  ["Permit2 signature, bounded, to Universal Router", { chain: "eip155:8453", expect: { action: "swap" }, intent: { op: "typedData", typedData: { primaryType: "PermitSingle", domain: { name: "Permit2", chainId: 8453 }, message: { spender: "0x6fF5693b99212Da76ad316178A184AB56D299b43", sigDeadline: String(Math.floor(Date.now()/1000) + 1800), details: { token: USDC, amount: "250000000", expiration: String(Math.floor(Date.now()/1000) + 86400), nonce: "0" } } } } }],
  ["Remove EIP-7702 delegation", { chain: "eip155:1", intent: { op: "authorization", authorization: { chainId: 1, address: "0x0000000000000000000000000000000000000000", nonce: 4 } } }],
  ["Solana: send 0.5 SOL", { chain: "solana:mainnet", expect: { action: "transfer" }, intent: { op: "solanaTransaction", address: SOL_ME.toBase58(), transactionBase64: sol([SystemProgram.transfer({ fromPubkey: SOL_ME, toPubkey: new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), lamports: 500_000_000 })]) } }],
  ["Solana: Jupiter swap", { chain: "solana:mainnet", expect: { action: "swap" }, intent: { op: "solanaTransaction", address: SOL_ME.toBase58(), transactionBase64: sol([
      new TransactionInstruction({ programId: new PublicKey("ComputeBudget111111111111111111111111111111"), keys: [], data: Buffer.from([2, 0, 0x35, 0x0c, 0]) }),
      new TransactionInstruction({ programId: new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"), keys: [{ pubkey: SOL_ME, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) })]) } }],
  ["Solana: sign-in message", { chain: "solana:mainnet", expect: { action: "login" }, intent: { op: "solanaMessage", address: SOL_ME.toBase58(), message: "Sign in to Jupiter. Nonce: 92hd8" } }],
];

let blocked = 0;
for (const [name, req] of cases) {
  const r = await check(req);
  if (r.verdict === "BLOCK") blocked++;
  console.log(`${r.verdict.padEnd(5)} ${String(r.risk_score).padStart(3)}  ${name}${r.findings.length ? "   [" + r.findings.map((f) => f.id).join(", ") + "]" : ""}`);
}
console.log(`\n${cases.length} legit actions, ${blocked} blocked`);
