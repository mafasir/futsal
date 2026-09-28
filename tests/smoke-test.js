/* Runtime smoke test: launches Edge headless, loads each page over CDP,
   collects console errors / page errors, and asserts the dynamic UI built correctly. */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const BASE = "http://localhost:5173";
const PROFILE = path.join(os.tmpdir(), "dm-cdp-profile");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, method = "GET") {
  const res = await fetch(url, { method });
  return res.json();
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("timeout " + method));
        }
      }, 15000);
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
    return r.result.value;
  }
}

const CHECKS = {
  "index.html": [
    ["icon sprite injected", "!!document.getElementById('dm-icon-sprite') && !!document.querySelector('#dm-icon-sprite symbol')"],
    ["nav active link set", "!!document.querySelector('.nav-links a.active')"],
    ["star SVGs rendered", "document.querySelectorAll('.stars svg').length"],
    ["stat counters ran", "document.querySelector('.stat b').textContent.trim() !== '0'"],
    ["hero cards revealed", "document.querySelectorAll('.hero-media, .hero-frame').length > 0"],
    ["marquee items", "document.querySelectorAll('.marquee-item').length"],
    ["check icons in lists", "document.querySelectorAll('.card-list li .ico').length"]
  ],
  "booking.html": [
    ["icon sprite injected", "!!document.getElementById('dm-icon-sprite')"],
    ["slot buttons built", "document.querySelectorAll('.slot').length"],
    ["summary rows filled", "document.querySelectorAll('#bSummary dd').length"],
    ["summary has total", "/Total/.test(document.getElementById('bSummary').textContent)"],
    ["date min = today", "!!document.getElementById('bDate').getAttribute('min')"],
    ["date value set", "!!document.getElementById('bDate').value"],
    ["bookings panel", "!!document.getElementById('myBookings')"],
    ["footer year filled", "document.querySelector('[data-year]').textContent.trim().length === 4"]
  ],
  "gallery.html": [
    ["lightbox present", "!!document.getElementById('lightbox')"],
    ["gallery items", "document.querySelectorAll('.gallery-item').length"],
    ["lightbox buttons have icons", "document.querySelectorAll('.lightbox button .ico').length >= 3"],
    ["zoom hints", "document.querySelectorAll('.zoom-hint, .gallery-item').length >= 8"]
  ],
  "pricing.html": [
    ["hourly spans", "document.querySelectorAll('[data-hourly]').length"],
    ["period spans", "document.querySelectorAll('[data-period]').length"],
    ["toggle button", "!!document.getElementById('priceToggle')"],
    ["price display", "document.querySelectorAll('.price').length"]
  ],
  "tournaments.html": [
    ["tabs", "document.querySelectorAll('.tab').length"],
    ["active panel visible", "!!document.querySelector('.tab-panel.active')"],
    ["hidden panels", "document.querySelectorAll('.tab-panel:not(.active)').length"],
    ["standings rows", "document.querySelectorAll('#p-league tbody tr').length"]
  ],
  "contact.html": [
    ["info icons", "document.querySelectorAll('.info-ico .ico').length"],
    ["form fields", "document.querySelectorAll('#cName, #cPhone, #cEmail, #cSubject, #cMsg').length"],
    ["success box hidden", "document.getElementById('contactDone').hidden === true"]
  ],
  "facilities.html": [
    ["amenity icon cards", "document.querySelectorAll('.card-ico .ico').length"],
    ["house-rule checks", "document.querySelectorAll('.card-list li .ico').length"]
  ],
  "programs.html": [
    ["program cards", "document.querySelectorAll('.card').length"],
    ["timetable rows", "document.querySelectorAll('tbody tr').length"],
    ["status pills", "document.querySelectorAll('.pill').length"]
  ],
  "about.html": [
    ["timeline items", "document.querySelectorAll('.timeline-item').length"],
    ["stat counters", "document.querySelectorAll('.stat b').length"],
    ["value cards", "document.querySelectorAll('.card-ico .ico').length"]
  ]
};

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + PROFILE,
    "--window-size=1440,900",
    "about:blank"
  ], { stdio: "ignore" });

  // wait for the debugger endpoint
  let ver = null;
  for (let i = 0; i < 40; i++) {
    try { ver = await getJSON("http://127.0.0.1:" + PORT + "/json/version"); break; }
    catch { await sleep(300); }
  }
  if (!ver) { console.log("Could not start Edge with CDP"); edge.kill(); process.exit(1); }
  console.log("Browser: " + ver["Browser"] + "\n");

  let failures = 0;
  for (const [file, checks] of Object.entries(CHECKS)) {
    const target = await getJSON("http://127.0.0.1:" + PORT + "/json/new?" + encodeURIComponent(BASE + "/" + file), "PUT");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    const cdp = new CDP(ws);

    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: BASE + "/" + file });
    await sleep(2600);

    // scroll to bottom to trigger reveals
    await cdp.eval("window.scrollTo(0, document.body.scrollHeight); true").catch(() => {});
    await sleep(900);
    await cdp.eval("window.scrollTo(0, 0); true").catch(() => {});
    await sleep(400);

    const errs = cdp.events.filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error")
      .map((e) => e.params.entry.text)
      .filter((t) => !/fonts\.googleapis|fonts\.gstatic|favicon|ERR_/i.test(t));
    const exc = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown")
      .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);

    console.log("== " + file + " ==");
    for (const [label, expr] of checks) {
      let val = null;
      try { val = await cdp.eval("String(" + expr + ")"); }
      catch (e) { val = "ERROR: " + e.message; }
      const ok = val !== "0" && val !== "false" && val !== "ERROR" && !val.startsWith("ERROR");
      if (!ok) failures++;
      console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label.padEnd(30) + " = " + val);
    }
    const allErrs = errs.concat(exc).filter((t) => !/favicon/i.test(t));
    if (allErrs.length) { failures++; console.log("  JS ERRORS:"); allErrs.forEach((t) => console.log("    ! " + t.split("\n")[0])); }
    else console.log("  no JS errors");
    console.log("");

    ws.close();
  }

  edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  console.log(failures === 0 ? "ALL RUNTIME CHECKS PASSED" : failures + " CHECK(S) FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
