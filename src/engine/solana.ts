import { VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Ctx, checkExpectation, checkRecipient } from "./common.js";
import { KNOWN_SOLANA, short } from "../known.js";

const SYSTEM = "11111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const U64_HALF = 2n ** 63n;

const u32 = (b: Uint8Array, o = 0) => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const u64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getBigUint64(o, true);
const name = (p: string) => KNOWN_SOLANA[p] ?? short(p);

export async function analyzeSolana(ctx: Ctx) {
  const intent: any = ctx.req.intent;
  const signer: string = intent.address ?? ctx.req.from ?? "";

  if (intent.op === "solanaMessage") {
    const msg = String(intent.message ?? "");
    ctx.act(`Sign the message: "${msg.slice(0, 120)}${msg.length > 120 ? "…" : ""}"`);
    // A "message" that is actually a serialized transaction is a known blind-sign trick.
    try {
      const b = Buffer.from(msg, "base64");
      if (b.length > 64) { VersionedTransaction.deserialize(b); ctx.add({ id: "tx_as_message", severity: "critical", title: "Message is a hidden transaction", detail: "This 'message' decodes as a full Solana transaction. Signing it can authorize a transfer you never see." }); }
    } catch { /* plain message */ }
    checkExpectation(ctx, "login");
    return;
  }

  let tx: VersionedTransaction;
  try { tx = VersionedTransaction.deserialize(Buffer.from(intent.transactionBase64 ?? "", "base64")); }
  catch {
    ctx.add({ id: "undecodable", severity: "high", title: "Transaction can't be decoded", detail: "Sentry couldn't parse this transaction. Never sign what can't be read." });
    return;
  }
  const msg = tx.message;
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  const key = (i: number) => keys[i] ?? `lookup-table account #${i}`;
  if (msg.addressTableLookups?.length) {
    ctx.add({ id: "lookup_tables", severity: "info", title: "Uses address lookup tables", detail: "Some accounts are resolved on-chain. Sentry checked the instructions it could see; accounts behind the lookup tables are shown by index." });
  }
  const feePayer = keys[0];
  if (signer && feePayer && feePayer !== signer) {
    ctx.add({ id: "foreign_fee_payer", severity: "info", title: "Someone else pays the fee", detail: `Fee payer is ${short(feePayer)}, not you. Common for sponsored transactions, but it means a third party built this transaction.` });
  }

  let kinds = new Set<"approve" | "transfer" | "swap" | "delegate" | "sign">();
  let lamportsOut = 0n;

  for (const ix of msg.compiledInstructions) {
    const pid = key(ix.programIdIndex);
    const acc = (n: number) => key(ix.accountKeyIndexes[n]);
    const data = ix.data;

    if (pid === SYSTEM) {
      const op = data.length >= 4 ? u32(data) : -1;
      if (op === 2) {
        const lamports = u64(data, 4);
        if (acc(0) === signer) lamportsOut += lamports;
        ctx.act(`Send ${Number(lamports) / 1e9} SOL from ${short(acc(0))} to ${short(acc(1))}`);
        ctx.risk(`${Number(lamports) / 1e9} SOL`);
        checkRecipient(ctx, acc(1)); kinds.add("transfer");
      } else if (op === 1) {
        const owner = new PublicKey(data.slice(4, 36)).toBase58();
        ctx.act(`Reassign account ${short(acc(0))} to program ${name(owner)}`);
        if (acc(0) === signer) {
          ctx.risk("Your entire wallet, permanently");
          ctx.add({ id: "wallet_reassign", severity: "critical", title: "Hands your wallet to another program", detail: `System Assign makes ${name(owner)} the owner of your wallet account. After this, that program controls every lamport and you can't sign it back. This is the owner-reassign drainer.` });
        }
        kinds.add("delegate");
      } else if (op === 4) {
        ctx.act(`Advance durable nonce ${short(acc(0))}`);
        ctx.add({ id: "durable_nonce", severity: "medium", title: "Durable nonce: doesn't expire", detail: "Normal Solana transactions expire in about a minute. This one can be held and submitted days later, when you're no longer watching. Drainers use it to collect signatures now and strike later." });
      } else if (op === 7) {
        ctx.add({ id: "nonce_authority", severity: "high", title: "Changes a nonce account's authority", detail: "Gives someone else control over a durable nonce account." });
      } else if (op === 0) {
        ctx.act(`Create account ${short(acc(1))}`);
      } else {
        ctx.act(`System Program instruction #${op}`);
      }
      continue;
    }

    if (pid === TOKEN || pid === TOKEN22) {
      const op = data[0];
      if (op === 3 || op === 12) {
        const amt = u64(data, 1);
        const dest = op === 3 ? acc(1) : acc(2);
        ctx.act(`Transfer ${amt} base units of a token from ${short(acc(0))} to ${short(dest)}`);
        ctx.risk(`${amt} base units of token account ${short(acc(0))}`);
        checkRecipient(ctx, dest); kinds.add("transfer");
      } else if (op === 4 || op === 13) {
        const amt = u64(data, 1);
        const delegate = op === 4 ? acc(1) : acc(2);
        const unlimited = amt >= U64_HALF;
        ctx.act(`Approve ${short(delegate)} as delegate for ${unlimited ? "UNLIMITED" : amt} of token account ${short(acc(0))}`);
        ctx.risk(unlimited ? `Entire balance of token account ${short(acc(0))}` : `${amt} base units of ${short(acc(0))}`);
        ctx.add({ id: "spl_delegate", severity: unlimited ? "critical" : "high", title: unlimited ? "Unlimited token delegate" : "Adds a token delegate", detail: `${short(delegate)} can move ${unlimited ? "everything in" : "tokens from"} this account without asking you again. Swaps on Solana don't need delegates; drainers do.` });
        kinds.add("approve");
      } else if (op === 6) {
        const type = data[1];
        const hasNew = data[2] === 1;
        const newAuth = hasNew ? new PublicKey(data.slice(3, 35)).toBase58() : "nobody";
        const label = ["mint authority", "freeze authority", "account owner", "close authority"][type] ?? `authority #${type}`;
        ctx.act(`Change ${label} of ${short(acc(0))} to ${short(newAuth)}`);
        if (newAuth !== signer && (type === 2 || type === 3)) {
          ctx.risk(`Token account ${short(acc(0))} and everything in it`);
          ctx.add({ id: "set_authority", severity: "critical", title: type === 2 ? "Transfers ownership of your token account" : "Gives away close authority", detail: `SetAuthority makes ${short(newAuth)} the ${label}. No transfer appears in your history, yet the account is no longer yours. A favourite of Solana drainers precisely because it looks like nothing happened.` });
          kinds.add("delegate");
        }
      } else if (op === 9) {
        const dest = acc(1);
        ctx.act(`Close token account ${short(acc(0))}, rent goes to ${short(dest)}`);
        if (signer && dest !== signer) ctx.add({ id: "close_to_other", severity: "medium", title: "Closes an account and sends the rent elsewhere", detail: `Rent from ${short(acc(0))} goes to ${short(dest)}, not to you.` });
      } else {
        ctx.act(`${name(pid)} instruction #${op}`);
      }
      continue;
    }

    const known = KNOWN_SOLANA[pid];
    ctx.act(`Call ${known ?? `unrecognized program ${short(pid)}`}`);
    if (known && !/Associated Token|Compute Budget|Memo|Lookup Table|Lighthouse|Stake Program/.test(known)) kinds.add("swap"); // a protocol call
    if (!known) {
      kinds.add("swap");
      ctx.add({ id: "unknown_program", severity: "medium", title: "Calls an unrecognized program", detail: `${short(pid)} isn't on Sentry's list of known Solana programs. Whatever it does runs with your signature attached.` });
    }
  }

  if (kinds.has("swap")) kinds.delete("transfer"); // wrapping SOL etc. is part of a swap
  if (kinds.size === 0) kinds.add("sign");
  // Judge the most dangerous kind against the task.
  const order = ["delegate", "approve", "transfer", "swap", "sign"] as const;
  const worst = order.find((k) => kinds.has(k))!;
  checkExpectation(ctx, worst, lamportsOut);
}
