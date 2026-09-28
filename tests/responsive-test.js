/* Responsive audit: loads every page at 5 viewports and reports any
   horizontal overflow, tap-target size problems, and text clipping. */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9335;
const BASE = "http://localhost:5173";
const PROFILE = path.join(os.tmpdir(), "dm-cdp-resp");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = ["index", "about", "facilities", "programs", "tournaments", "gallery", "pricing", "booking", "contact"];
const SIZES = [
  { w: 360, h: 740, name: "mobile-sm" },
  { w: 390, h: 844, name: "mobile" },
  { w: 768, h: 1024, name: "tablet" },
  { w: 1280, h: 800, name: "laptop" },
  { w: 1920, h: 1080, name: "desktop" }
];

async function getJSON(u, m = "GET") { return (await fetch(u, { method: m })).json(); }
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) {
        const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.p.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error("timeout")); } }, 20000);
    });
  }
  async eval(e) {
    const r = await this.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

/* Report elements wider than the viewport, plus overflowing text. */
const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  const seen = new Set();
  // an element that sticks out is only a defect if nothing clips it
  const clipped = (el) => {
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (/hidden|auto|scroll|clip/.test(cs.overflowX)) return true;
      p = p.parentElement;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > vw + 1.5 && !clipped(el)) {
      const key = el.tagName + '.' + (el.className || '').toString().split(' ')[0];
      if (!seen.has(key)) {
        seen.add(key);
        bad.push({ kind: 'overflow', el: key, right: Math.round(r.right), vw });
      }
    }
    if (el.children.length === 0 && el.textContent.trim() &&
        el.scrollHeight > el.clientHeight + 4 && cs.overflow === 'hidden') {
      bad.push({ kind: 'clipped', el: el.tagName + '.' + (el.className||'').toString().split(' ')[0],
                 sh: el.scrollHeight, ch: el.clientHeight });
    }
    // collapsed content: a visible element with no width
    if (r.width === 0 && r.height > 20 && cs.display !== 'inline') {
      const key = el.tagName + '.' + (el.className || '').toString().split(' ')[0];
      if (!seen.has(key)) { seen.add(key); bad.push({ kind: 'zero-width', el: key, sh: Math.round(r.height) }); }
    }
  });
  // does the page actually scroll sideways?
  const de = document.documentElement;
  const prev = de.scrollLeft; de.scrollLeft = 9999;
  const hScroll = de.scrollLeft > 0; de.scrollLeft = prev;
  return { docW: de.scrollWidth, vw, hScroll, bad: bad.slice(0, 12) };
})()`;

/* Small tap targets on touch widths. */
const TAPS = `(() => {
  const out = [];
  document.querySelectorAll('a, button, input[type=checkbox], select, .tab').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 24 || r.width < 24) {
      const label = (el.textContent || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 26);
      out.push(label + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  });
  return out.slice(0, 10);
})()`;

(async () => {
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { await getJSON("http://127.0.0.1:" + PORT + "/json/version"); break; } catch { await sleep(300); } }

  let issues = 0;
  for (const s of SIZES) {
    console.log("\n########## " + s.name + "  (" + s.w + "x" + s.h + ")  ##########");
    for (const page of PAGES) {
      const t = await getJSON("http://127.0.0.1:" + PORT + "/json/new?about:blank", "PUT");
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise(r => ws.addEventListener("open", r));
      const cdp = new CDP(ws);
      await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.w < 768
      });
      await cdp.send("Page.navigate", { url: BASE + "/" + page + ".html" });
      await sleep(1900);
      await cdp.eval("window.scrollTo(0, document.body.scrollHeight); true").catch(() => {});
      await sleep(700);

      let a = null, taps = [];
      try { a = await cdp.eval(AUDIT); taps = await cdp.eval(TAPS); } catch (e) { a = { bad: [{ kind: 'error', el: e.message.slice(0, 60) }], hScroll: false }; }

      const probs = [];
      if (a.hScroll) probs.push("H-SCROLL doc=" + a.docW + " vp=" + a.vw);
      a.bad.forEach(b => probs.push(b.kind + " " + b.el + (b.right ? " right=" + b.right : " " + b.sh + ">" + b.ch)));
      if (s.w < 768 && taps.length) probs.push("small-tap: " + taps.join(", "));

      if (probs.length) { issues++; console.log("  " + page.padEnd(11) + " -> " + probs.join(" | ")); }
      else console.log("  " + page.padEnd(11) + " ok");
      ws.close();
    }
  }

  console.log("\n" + (issues === 0 ? "NO RESPONSIVE ISSUES FOUND" : issues + " page/viewport combination(s) with issues"));
  edge.kill();
  process.exit(issues === 0 ? 0 : 1);
})();
