// Tiny persistent store for verdict pages. Swap for Postgres/KV in production.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Report } from "./types.js";

const FILE = process.env.DATA_FILE ?? "data/reports.json";
const MAX = 5000;
const reports = new Map<string, Report>();

try {
  if (existsSync(FILE)) for (const r of JSON.parse(readFileSync(FILE, "utf8")) as Report[]) reports.set(r.id, r);
} catch { /* start fresh */ }

let timer: NodeJS.Timeout | undefined;
function flush() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      mkdirSync(FILE.split("/").slice(0, -1).join("/") || ".", { recursive: true });
      writeFileSync(FILE, JSON.stringify([...reports.values()].slice(-MAX)));
    } catch (e) { console.error("store flush failed", e); }
  }, 250);
}

export const save = (r: Report) => { reports.set(r.id, r); if (reports.size > MAX) reports.delete(reports.keys().next().value!); flush(); };
export const load = (id: string) => reports.get(id);
export const stats = () => {
  const all = [...reports.values()];
  return { checks: all.length, blocked: all.filter((r) => r.verdict === "BLOCK").length };
};
