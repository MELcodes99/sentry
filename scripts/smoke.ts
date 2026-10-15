import { examples } from "../src/examples.js";
import { check } from "../src/engine/index.js";
for (const e of examples()) {
  const r = await check(e.req);
  console.log(`${e.key.padEnd(18)} ${r.verdict.padEnd(5)} ${String(r.risk_score).padStart(3)} | ${r.headline}\n   action: ${r.action}\n   ${r.findings.map(f=>f.id+":"+f.severity).join(", ")}`);
}
