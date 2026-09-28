/* Cross-browser check: runs the core page checks in every Chromium-family
   browser actually installed, over both http:// and file://. */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(u, m = "GET") { return (await fetch(u, { method: m })).json(); }

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map(); this.errs = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) {
        const h = this.p.get(m.id); this.p.delete(m.id);
        m.error ? h.reject(new Error(JSON.stringify(m.error))) : h.resolve(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        this.errs.push("JS: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]);
      } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        this.errs.push("LOG: " + m.params.entry.text);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.p.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error("timeout " + method)); } }, 25000);
    });
  }
  async eval(e) {
    const r = await this.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const PAGES = ["index", "about", "facilities", "programs", "tournaments", "gallery", "pricing", "booking", "contact"];

const CHECK = `(() => {
  const cs = getComputedStyle(document.body);
  const h1 = document.querySelector('h1');
  const sprite = document.querySelectorAll('#dm-icon-sprite symbol').length;
  const usedIcons = document.querySelectorAll('svg.ico use').length;
  // is there actually visible text on screen?
  const bodyText = document.body.innerText.replace(/\\s+/g,' ').trim();
  const h1r = h1 ? h1.getBoundingClientRect() : {width:0,height:0};
  const h1cs = h1 ? getComputedStyle(h1) : null;
  return {
    bg: cs.backgroundColor,
    fontFamily: cs.fontFamily,
    textLength: bodyText.length,
    h1: h1 ? h1.innerText.trim().slice(0,40) : null,
    h1w: Math.round(h1r.width), h1h: Math.round(h1r.height),
    h1visible: h1cs ? (h1cs.visibility==='visible' && +h1cs.opacity>0) : false,
    sprite, usedIcons,
    navLinks: document.querySelectorAll('.nav-links a').length,
    activeNav: document.querySelectorAll('.nav-links a.active').length,
    headerH: Math.round(document.querySelector('.site-header')?.getBoundingClientRect().height||0),
    footer: !!document.querySelector('.site-footer'),
    year: (document.querySelector('[data-year]')||{}).textContent,
    revealsIn: document.querySelectorAll('.reveal.in').length,
    revealsTotal: document.querySelectorAll('.reveal').length
  };
})()`;

(async () => {
  const BROWSERS = [
    { name: "Edge",   exe: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
    { name: "Chrome", exe: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" }
  ].filter((b) => require("fs").existsSync(b.exe));

  let fails = 0;
  for (const b of BROWSERS) {
    const port = 9400 + BROWSERS.indexOf(b);
    const profile = path.join(os.tmpdir(), "dm-x-" + b.name.toLowerCase());
    console.log("\n############ " + b.name + " ############");
    const proc = spawn(b.exe, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
      "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
    let up = false;
    for (let i = 0; i < 50; i++) { try { await getJSON("http://127.0.0.1:" + port + "/json/version"); up = true; break; } catch { await sleep(300); } }
    if (!up) { console.log("  could not start " + b.name); fails++; proc.kill(); continue; }
    const ver = await getJSON("http://127.0.0.1:" + port + "/json/version");
    console.log("  version: " + ver.Browser + "\n");

    for (const [mode, prefix] of [["http", "http://localhost:5173/"], ["file", "file:///C:/Users/Hp/OneDrive/Desktop/futsal/"]]) {
      console.log("  --- " + mode + ":// ---");
      for (const page of PAGES) {
        const t = await getJSON("http://127.0.0.1:" + port + "/json/new?about:blank", "PUT");
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener("open", r));
        const cdp = new CDP(ws);
        await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Page.enable");
        await cdp.send("Page.navigate", { url: prefix + page + ".html" });
        await sleep(2200);
        let r = null, err = null;
        try { r = await cdp.eval(CHECK); } catch (e) { err = e.message; }
        const realErrs = cdp.errs.filter((t2) => !/fonts\.g|favicon|ERR_FILE_NOT_FOUND|ERR_NAME_NOT_RESOLVED/i.test(t2));
        const probs = [];
        if (err) probs.push("EVAL FAILED: " + err.slice(0, 70));
        else {
          if (r.sprite !== 48) probs.push("sprite=" + r.sprite);
          if (r.usedIcons < 1) probs.push("no icons rendered");
          if (r.textLength < 300) probs.push("almost no text (" + r.textLength + " chars)");
          if (!r.h1visible) probs.push("h1 not visible");
          if (r.h1h < 12) probs.push("h1 collapsed h=" + r.h1h);
          if (r.headerH < 40) probs.push("header collapsed h=" + r.headerH);
          if (r.activeNav !== 1) probs.push("activeNav=" + r.activeNav);
          if (!r.footer) probs.push("no footer");
          if (!/^\d{4}$/.test(r.year || "")) probs.push("year=" + JSON.stringify(r.year));
        }
        if (realErrs.length) probs.push("errors: " + realErrs.slice(0, 2).join(" ; ").slice(0, 90));
        if (probs.length) { fails++; console.log("    " + page.padEnd(12) + " FAIL " + probs.join(" | ")); }
        else console.log("    " + page.padEnd(12) + " ok  (text " + r.textLength + " chars, h1 " + Math.round(r.h1h) + "px, " + r.usedIcons + " icons)");
        ws.close();
      }
    }
    proc.kill();
  }
  console.log("\n" + (fails === 0 ? "IDENTICAL BEHAVIOUR IN BOTH BROWSERS" : fails + " FAILURE(S)"));
  process.exit(fails === 0 ? 0 : 1);
})();
