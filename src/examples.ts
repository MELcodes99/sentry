// Ready-made scenarios for the playground and the demo video.
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { encodeFunctionData, parseAbi, maxUint256 } from "viem";
import type { CheckRequest } from "./types.js";

const AGENT_EVM = "0x70a0c3f9be27d8a5b1c3e5f0a9d7b6c4e3f22b1f";
const DRAINER_EVM = "0x9f2d7c1a4b8e6f3d2c5a1b0e9d8c7b6a5f4e3d21";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SOL_ME = new PublicKey("5EUaHnSPRo7cdD8vbW1nJ4bFq5FjNcbdkSq4yP3HSViS");
const SOL_FRIEND = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
// Lookalike: same first 4 and last 4 base58 characters as SOL_FRIEND, different key.
const SOL_POISON = lookalike(SOL_FRIEND);
const SOL_DRAINER = new PublicKey(Buffer.alloc(32, 0x5a));

function lookalike(addr: string): string {
  const n = BigInt("0x" + new PublicKey(addr).toBuffer().toString("hex"));
  const m = n + 58n ** 4n * 987654321n; // only middle base58 digits change
  return new PublicKey(Buffer.from(m.toString(16).padStart(64, "0"), "hex")).toBase58();
}
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MY_USDC_ATA = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

function solTx(ixs: TransactionInstruction[]) {
  const msg = new TransactionMessage({ payerKey: SOL_ME, recentBlockhash: BLOCKHASH, instructions: ixs }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

function setAuthorityIx() {
  // SPL Token SetAuthority(AccountOwner -> drainer)
  const data = Buffer.concat([Buffer.from([6, 2, 1]), SOL_DRAINER.toBuffer()]);
  return new TransactionInstruction({ programId: TOKEN, keys: [
    { pubkey: MY_USDC_ATA, isSigner: false, isWritable: true },
    { pubkey: SOL_ME, isSigner: true, isWritable: false },
  ], data });
}

export interface Example { key: string; label: string; tone: "bad" | "good"; story: string; req: CheckRequest }

export function examples(): Example[] {
  return [
    {
      key: "airdrop-permit", tone: "bad", label: "“Claim your airdrop” permit",
      story: "The agent was told to claim an airdrop. The site asks for a gasless USDC permit instead.",
      req: {
        chain: "eip155:8453", from: AGENT_EVM,
        expect: { action: "login", description: "Claim the $NOVA airdrop" },
        intent: { op: "typedData", typedData: {
          domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE },
          primaryType: "Permit",
          types: { Permit: [
            { name: "owner", type: "address" }, { name: "spender", type: "address" },
            { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
          message: { owner: AGENT_EVM, spender: DRAINER_EVM, value: maxUint256.toString(), nonce: "0", deadline: "99999999999" },
        } },
      },
    },
    {
      key: "7702-upgrade", tone: "bad", label: "“Upgrade your wallet” (EIP-7702)",
      story: "A page offers a free smart-wallet upgrade. It's a delegation of the whole account to unverified code, on every chain.",
      req: {
        chain: "eip155:1", from: AGENT_EVM,
        expect: { action: "swap", description: "Swap 0.1 ETH for USDC" },
        intent: { op: "authorization", authorization: { chainId: 0, address: DRAINER_EVM, nonce: 3 } },
      },
    },
    {
      key: "sol-setauthority", tone: "bad", label: "Solana “mint” that steals your USDC account",
      story: "The agent was asked to mint an NFT. Hidden in the transaction: SetAuthority hands your USDC token account to someone else.",
      req: {
        chain: "solana:mainnet", from: SOL_ME.toBase58(),
        expect: { action: "mint", description: "Mint a free Genesis pass" },
        intent: { op: "solanaTransaction", address: SOL_ME.toBase58(), transactionBase64: solTx([
          new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), keys: [], data: Buffer.from("Genesis pass mint") }),
          setAuthorityIx(),
        ]) },
      },
    },
    {
      key: "sol-poison", tone: "bad", label: "Pay a friend… from a poisoned history",
      story: "The agent copies the last address it paid. An attacker planted a lookalike with the same first and last characters.",
      req: {
        chain: "solana:mainnet", from: SOL_ME.toBase58(),
        expect: { action: "transfer", description: "Send 2 SOL to Tunde" },
        known_recipients: [SOL_FRIEND],
        intent: { op: "solanaTransaction", address: SOL_ME.toBase58(), transactionBase64: solTx([
          SystemProgram.transfer({ fromPubkey: SOL_ME, toPubkey: new PublicKey(SOL_POISON), lamports: 2_000_000_000 }),
        ]) },
      },
    },
    {
      key: "uniswap-approve", tone: "good", label: "Exact approval to Uniswap",
      story: "The agent approves exactly 250 USDC to Permit2 before a swap. Bounded amount, known protocol.",
      req: {
        chain: "eip155:8453", from: AGENT_EVM,
        expect: { action: "swap", description: "Swap 250 USDC for ETH" },
        intent: { op: "transaction", transaction: {
          chainId: 8453, to: USDC_BASE, value: "0",
          data: encodeFunctionData({ abi: parseAbi(["function approve(address,uint256)"]), functionName: "approve", args: ["0x000000000022D473030F116dDEE9F6B43aC78BA3", 250_000_000n] }),
        } },
      },
    },
    {
      key: "sol-friend", tone: "good", label: "Send 2 SOL to a saved friend",
      story: "Same task, real address from the address book.",
      req: {
        chain: "solana:mainnet", from: SOL_ME.toBase58(),
        expect: { action: "transfer", description: "Send 2 SOL to Tunde", recipient: SOL_FRIEND },
        known_recipients: [SOL_FRIEND],
        intent: { op: "solanaTransaction", address: SOL_ME.toBase58(), transactionBase64: solTx([
          SystemProgram.transfer({ fromPubkey: SOL_ME, toPubkey: new PublicKey(SOL_FRIEND), lamports: 2_000_000_000 }),
        ]) },
      },
    },
  ];
}
