import type { Report } from "./types.js";
import type { Example } from "./examples.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#07080a;--panel:#0e1013;--line:#1d2026;--ink:#eceae4;--dim:#8a8d94;--block:#ff4433;--warn:#ffb020;--allow:#2fd67a;--accent:#d9ff3d}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Inter Tight",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:980px;margin:0 auto;padding:0 20px}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
nav{display:flex;justify-content:space-between;align-items:center;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;gap:10px;align-items:center;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:14px;text-decoration:none}
.eye{width:22px;height:22px;border:2px solid var(--accent);border-radius:50% 0;transform:rotate(45deg);display:grid;place-items:center}.eye i{width:6px;height:6px;background:var(--accent);border-radius:50%}
nav .links a{color:var(--dim);text-decoration:none;margin-left:22px;font-size:14px}nav .links a:hover{color:var(--ink)}
h1,h2,.serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-.01em}
.hero{padding:88px 0 56px}.hero h1{font-size:clamp(46px,8vw,96px);line-height:.95;margin:0 0 22px}.hero h1 em{color:var(--accent);font-style:italic}
.hero p{font-size:20px;color:var(--dim);max-width:620px;margin:0}
.kicker{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-bottom:18px}
.flow{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:40px 0 80px}
.flow div{background:var(--panel);padding:22px}.flow b{display:block;font-size:13px;color:var(--accent);margin-bottom:6px}.flow span{color:var(--dim);font-size:15px}
section h2{font-size:44px;margin:0 0 8px}section .sub{color:var(--dim);margin:0 0 26px}
.ex{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:16px}
.ex button{all:unset;cursor:pointer;background:var(--panel);border:1px solid var(--line);padding:16px;border-radius:4px;transition:border-color .15s}
.ex button:hover,.ex button.on{border-color:var(--ink)}.ex b{display:block;margin-bottom:4px}.ex small{color:var(--dim);font-size:13px;display:block}
.tag{display:inline-block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:2px 6px;border-radius:2px;margin-bottom:8px}
.tag.bad{background:rgba(255,68,51,.14);color:var(--block)}.tag.good{background:rgba(47,214,122,.14);color:var(--allow)}
textarea{width:100%;min-height:260px;background:#050607;color:#cfd3d8;border:1px solid var(--line);border-radius:4px;padding:16px;font:13px/1.5 "JetBrains Mono",monospace;resize:vertical}
.go{margin-top:14px;display:flex;gap:14px;align-items:center}
.btn{all:unset;cursor:pointer;background:var(--accent);color:#000;font-weight:700;padding:13px 22px;border-radius:3px;letter-spacing:.02em}.btn:hover{filter:brightness(1.1)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
#err{color:var(--block);font-size:14px}
pre.code{background:var(--panel);border:1px solid var(--line);padding:18px;overflow:auto;font:13px/1.6 "JetBrains Mono",monospace;color:#cfd3d8;border-radius:4px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0 90px}
footer{border-top:1px solid var(--line);padding:28px 0 50px;color:var(--dim);font-size:13px;display:flex;justify-content:space-between}
/* verdict */
.v{padding:64px 0 24px}.v .word{font:700 clamp(64px,13vw,150px)/.85 "Inter Tight",sans-serif;letter-spacing:-.04em;margin:0}
.v.BLOCK .word{color:var(--block)}.v.WARN .word{color:var(--warn)}.v.ALLOW .word{color:var(--allow)}
.v h1{font-size:clamp(30px,4.5vw,46px);line-height:1.08;margin:22px 0 14px;max-width:820px}.v .sum{color:var(--dim);font-size:18px;max-width:760px;overflow-wrap:anywhere}
.meter{display:flex;align-items:center;gap:12px;margin:26px 0 0;font-size:13px;color:var(--dim)}.meter .bar{flex:0 0 220px;height:6px;background:var(--line);border-radius:3px;overflow:hidden}.meter .bar i{display:block;height:100%}
.card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:22px;margin-bottom:14px}
.card h3{margin:0 0 10px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);font-weight:600}
.action{font:15px/1.6 "JetBrains Mono",monospace;word-break:break-word}
.risk{display:flex;flex-wrap:wrap;gap:8px}.risk span{border:1px solid rgba(255,68,51,.4);color:#ffb3aa;padding:6px 10px;border-radius:3px;font-size:14px}
.f{border-top:1px solid var(--line);padding:16px 0}.f:first-of-type{border-top:0;padding-top:4px}.f b{display:block;margin-bottom:4px}.f p{margin:0;color:var(--dim);overflow-wrap:anywhere}
.sev{font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:2px 6px;border-radius:2px;margin-right:8px;vertical-align:2px}
.sev.critical{background:var(--block);color:#000}.sev.high{background:rgba(255,68,51,.2);color:var(--block)}.sev.medium{background:rgba(255,176,32,.18);color:var(--warn)}.sev.low,.sev.info{background:var(--line);color:var(--dim)}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:13px;color:var(--dim)}.meta div span{display:block;color:var(--ink);word-break:break-all}
.share{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0 80px}
@media(max-width:720px){.flow,.cols{grid-template-columns:1fr}nav .links a:not(:last-child){display:none}footer{flex-direction:column;gap:8px}}
`;

function layout(title: string, body: string, og: { title: string; desc: string; url?: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(og.desc)}">
<meta property="og:title" content="${esc(og.title)}"><meta property="og:description" content="${esc(og.desc)}">${og.url ? `<meta property="og:url" content="${esc(og.url)}">` : ""}
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(og.title)}"><meta name="twitter:description" content="${esc(og.desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="/"><span class="eye"><i></i></span>Sentry</a><div class="links"><a href="/#try">Playground</a><a href="/#agents">For agents</a><a href="/llms.txt">llms.txt</a></div></nav>
${body}
<footer><span>Sentry · pre-sign security for agent wallets · built for PayBox</span><span class="mono">x402 · EVM · Solana</span></footer>
</div></body></html>`;
}

export function landing(examples: Example[], base: string, price: string, stats: { checks: number; blocked: number }) {
  const exJson = JSON.stringify(Object.fromEntries(examples.map((e) => [e.key, e.req]))).replace(/</g, "\\u003c");
  const body = `
<header class="hero">
  <div class="kicker">Pre-sign security · for AI agents on PayBox</div>
  <h1>Your agent signs.<br><em>Sentry</em> decides.</h1>
  <p>Before an agent signs anything, it pays Sentry ${esc(price)} to read the transaction like an auditor would. Drainer permits, rogue delegations, lookalike addresses and hidden authority changes get stopped before the passkey ever lights up.</p>
  <div class="flow">
    <div><b>01 · Intent</b><span>The agent builds the exact intent it's about to pass to <span class="mono">request_wallet_sign</span>.</span></div>
    <div><b>02 · Check</b><span>It calls <span class="mono">use_service</span> on Sentry. PayBox settles the x402 payment.</span></div>
    <div><b>03 · Verdict</b><span>ALLOW signs. WARN asks the user. BLOCK stops, with a reason the human can read.</span></div>
  </div>
</header>

<section id="try">
  <h2>Try to fool it.</h2>
  <p class="sub">Pick a real attack pattern, or paste any intent your agent would sign. ${stats.checks ? `${stats.checks} checks run, ${stats.blocked} blocked.` : ""}</p>
  <div class="ex">${examples.map((e) => `<button data-k="${e.key}"><span class="tag ${e.tone}">${e.tone === "bad" ? "attack" : "legit"}</span><b>${esc(e.label)}</b><small>${esc(e.story)}</small></button>`).join("")}</div>
  <textarea id="in" spellcheck="false" placeholder='{"chain":"eip155:8453","intent":{"op":"typedData","typedData":{...}},"expect":{"action":"swap"}}'></textarea>
  <div class="go"><button class="btn" id="run">Run Sentry</button><span id="err"></span></div>
</section>

<section id="agents" style="margin-top:90px">
  <h2>Plug it into any PayBox agent.</h2>
  <p class="sub">No SDK, no API key. Sentry is an x402 endpoint, so PayBox pays for it per call.</p>
  <div class="cols">
    <div><div class="kicker">MCP · PayBox use_service</div><pre class="code">use_service({
  credential_id: "&lt;wallet&gt;",
  url: "${esc(base)}/check",
  method: "POST",
  body: {
    chain: "eip155:8453",
    intent: { op: "typedData", typedData },
    expect: { action: "swap",
      description: "Swap 250 USDC for ETH" }
  }
})</pre></div>
    <div><div class="kicker">Response</div><pre class="code">{
  "verdict": "BLOCK",
  "risk_score": 100,
  "headline": "Unlimited approval to an
               unknown spender",
  "action": "Gasless permit: let 0x9f2d…3d21
             spend UNLIMITED of USDC",
  "findings": [ ... ],
  "report_url": "${esc(base)}/r/Xk2..."
}</pre></div>
  </div>
</section>
<script>
const EX=${exJson};const ta=document.getElementById('in'),err=document.getElementById('err');
document.querySelectorAll('.ex button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.ex button').forEach(x=>x.classList.remove('on'));b.classList.add('on');ta.value=JSON.stringify(EX[b.dataset.k],null,2);});
document.getElementById('run').onclick=async()=>{err.textContent='';let body;try{body=JSON.parse(ta.value)}catch{err.textContent='That isn\\'t valid JSON.';return}
const btn=document.getElementById('run');btn.textContent='Reading…';
try{const r=await fetch('/api/try',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Check failed');location.href='/r/'+j.id}catch(e){err.textContent=e.message;btn.textContent='Run Sentry'}};
</script>`;
  return layout("Sentry · Your agent signs. Sentry decides.", body, { title: "Sentry", desc: "Pre-sign security for AI agent wallets. One x402 call before every signature.", url: base });
}

export function verdictPage(r: Report, base: string) {
  const color = r.verdict === "BLOCK" ? "var(--block)" : r.verdict === "WARN" ? "var(--warn)" : "var(--allow)";
  const word = r.verdict === "BLOCK" ? "BLOCKED" : r.verdict === "WARN" ? "CAUTION" : "CLEAR";
  const url = `${base}/r/${r.id}`;
  const tweet = r.verdict === "BLOCK"
    ? `My AI agent was about to sign this: "${r.headline}". Sentry stopped it before the passkey ever lit up. Your agent signs. Sentry decides.`
    : `Ran a transaction through Sentry before my agent signed it. Verdict: ${r.verdict}. Your agent signs. Sentry decides.`;
  const body = `
<div class="v ${r.verdict}">
  <div class="kicker">Sentry verdict · ${esc(new Date(r.created_at).toUTCString())}</div>
  <p class="word">${word}</p>
  <h1>${esc(r.headline)}</h1>
  <p class="sum">${esc(r.summary)}</p>
  <div class="meter"><span>Risk</span><div class="bar"><i style="width:${r.risk_score}%;background:${color}"></i></div><span class="mono">${r.risk_score}/100</span></div>
</div>
<div class="card"><h3>What signing does</h3><div class="action">${esc(r.action)}</div></div>
${r.at_risk.length ? `<div class="card"><h3>What's at risk</h3><div class="risk">${r.at_risk.map((a) => `<span>${esc(a)}</span>`).join("")}</div></div>` : ""}
${r.findings.length ? `<div class="card"><h3>Findings</h3>${r.findings.map((f) => `<div class="f"><b><span class="sev ${f.severity}">${f.severity}</span>${esc(f.title)}</b><p>${esc(f.detail)}</p></div>`).join("")}</div>` : ""}
<div class="card"><h3>Request</h3><div class="meta">
  <div>Chain<span class="mono">${esc(r.chain ?? "unspecified")}</span></div>
  <div>Signer<span class="mono">${esc(r.from ?? "unspecified")}</span></div>
  <div>Intent<span class="mono">${esc(r.op)}</span></div>
  <div>Report<span class="mono">${esc(r.id)} · ${esc(r.engine)}</span></div>
</div></div>
<div class="share">
  <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(url)}">Share on X</a>
  <a class="btn ghost" href="/#try">Check another</a>
  <a class="btn ghost" href="/r/${esc(r.id)}.json">Raw JSON</a>
</div>`;
  return layout(`${word}: ${r.headline} · Sentry`, body, { title: `${word}: ${r.headline}`, desc: r.summary, url });
}

export function notFound() {
  return layout("Not found · Sentry", `<div class="v"><p class="word" style="color:var(--dim)">404</p><h1>No verdict with that id.</h1><p class="sum"><a href="/">Run a new check</a></p></div>`, { title: "Sentry", desc: "Not found" });
}
