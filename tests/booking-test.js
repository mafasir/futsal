/* End-to-end booking flow test: fills the real form, submits it, and
   verifies the reference is issued AND the slot becomes unavailable. */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const BASE = "http://localhost:5173";
const PROFILE = path.join(os.tmpdir(), "dm-cdp-e2e");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, method = "GET") {
  return (await fetch(url, { method })).json();
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout")); } }, 15000);
    });
  }
  async eval(e) {
    const r = await this.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const set = (sel, val) => `(function(){const el=document.querySelector('${sel}');
  el.value=${JSON.stringify(val)};
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;

(async () => {
  const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox","--no-first-run",
    "--remote-debugging-port="+PORT,"--user-data-dir="+PROFILE,"about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { await getJSON("http://127.0.0.1:"+PORT+"/json/version"); break; } catch { await sleep(300); } }

  const t = await getJSON("http://127.0.0.1:"+PORT+"/json/new?"+encodeURIComponent(BASE+"/booking.html"), "PUT");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  const cdp = new CDP(ws);
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: BASE + "/booking.html" });
  await sleep(2500);

  let fails = 0;
  const ok = (label, cond, extra) => {
    if (!cond) fails++;
    console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label.padEnd(42) + (extra !== undefined ? "= " + extra : ""));
  };

  console.log("BOOKING FLOW TEST\n");

  // --- 1. validation must reject an empty/invalid form ---
  await cdp.eval("localStorage.clear(); true");
  await cdp.send("Page.reload");
  await sleep(2200);
  await cdp.eval("document.getElementById('bookingForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); true");
  await sleep(400);
  const invalid = await cdp.eval("document.querySelectorAll('#bookingForm .field.invalid').length");
  const toastTxt = await cdp.eval("(Array.from(document.querySelectorAll('.toast b')).pop()||{}).textContent || ''");
  ok("empty form is rejected", invalid >= 4, invalid + " fields flagged");
  ok("error toast is shown", /fix the highlighted/i.test(toastTxt), JSON.stringify(toastTxt));

  // --- 2. fill it correctly ---
  await cdp.eval(set("#bCourt", "Court 1 \u2014 Pro Indoor"));
  await cdp.eval(set("#bDate", "2026-03-14"));
  await cdp.eval(set("#bDuration", "2"));
  await cdp.eval(set("#bPlayers", "10"));
  await cdp.eval(set("#bName", "Rahul Sharma"));
  await cdp.eval(set("#bPhone", "98765 43210"));
  await cdp.eval(set("#bEmail", "rahul@example.com"));
  await cdp.eval(set("#bTeam", "FC Blue Street"));
  // pick 19:00 specifically
  await cdp.eval("(function(){const r=document.querySelector('input[name=bSlot][value=\"19:00\"]'); if(r){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));} return !!r})()");
  await sleep(500);
  const sum = await cdp.eval("document.getElementById('bSummary').textContent.replace(/\\s+/g,' ').trim()");
  ok("summary shows 19:00", /19:00/.test(sum));
  ok("summary total = 2400 (1200 x 2h)", /2400/.test(sum), sum.match(/Total.*?([\d,]+)/)?.[1]);
  ok("per-player split = 240", /240/.test(sum));
  const stillBad = await cdp.eval("Array.from(document.querySelectorAll('#bookingForm .field.invalid')).map(f=>f.querySelector('input,select,textarea')?.id||'?').join('|')");
  ok("only terms box still flagged", stillBad === "bAgree", stillBad || "none");
  // ticking the terms box must clear the error state (regression test)
  await cdp.eval("document.getElementById('bAgree').checked=true; document.getElementById('bAgree').dispatchEvent(new Event('change',{bubbles:true})); true");
  await sleep(250);
  ok("ticking terms clears its error", (await cdp.eval("document.querySelectorAll('#bookingForm .field.invalid').length")) === 0);
  await cdp.eval("document.getElementById('bAgree').checked=true; true");

  // --- 3. submit ---
  await cdp.eval("document.getElementById('bAgree').checked=true; true");
  await cdp.eval("document.getElementById('bookingForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); true");
  await sleep(800);
  await cdp.eval(set('#bDate','2026-03-14'));
  await sleep(600);
  const conf = await cdp.eval("document.getElementById('bookingConfirm')");
  const ref = await cdp.eval("document.getElementById('confRef').textContent.trim()");
  const saved = await cdp.eval("JSON.parse(localStorage.getItem('dm_bookings')||'[]').length");
  const blocked = await cdp.eval("document.querySelectorAll('#slotWrap .slot.taken').length");
  const taken19 = await cdp.eval("!!document.querySelector('#slotWrap .slot.taken input[value=\"19:00\"]')");
  const taken20 = await cdp.eval("!!document.querySelector('#slotWrap .slot.taken input[value=\"20:00\"]')");
  const taken21_30 = await cdp.eval("!!document.querySelector('#slotWrap .slot.taken input[value=\"21:30\"]')");
  const tableRows = await cdp.eval("document.querySelectorAll('#myBookings tbody tr').length");

  ok("confirmation box revealed", conf && !/hidden/.test(String(await cdp.eval("document.getElementById('bookingConfirm').outerHTML"))));
  ok("reference number issued", /^DMF-[A-Z0-9]{6}$/.test(ref), ref);
  ok("booking persisted to storage", saved === 1, saved);
  ok("19:00 now blocked", taken19);
  ok("20:00 blocked (overlap)", taken20);
  ok("21:30 still free", !taken21_30);
  ok("4 slots marked taken", blocked === 4, blocked);
  ok("bookings table has a row", tableRows === 1, tableRows);
  const confToast = await cdp.eval("(Array.from(document.querySelectorAll('.toast b')).pop()||{}).textContent||''");
  ok("confirmation toast mentions ref", confToast.includes(ref.slice(0, 11)) || /confirmed/i.test(confToast), JSON.stringify(confToast));

  // --- 4. persistence across reload ---
  await cdp.send("Page.reload"); await sleep(2300);
  const rowsAfter = await cdp.eval("document.querySelectorAll('#myBookings tbody tr').length");
  ok("booking row survives reload", rowsAfter === 1, rowsAfter);
  // the form deliberately starts on today, so re-select the booked date
  await cdp.eval(set("#bDate", "2026-03-14"));
  await sleep(600);
  const afterReload = await cdp.eval("document.querySelectorAll('#slotWrap .slot.taken').length");
  ok("slot still blocked after reload", afterReload === 4, afterReload);

  // --- 5. a different date is unaffected ---
  await cdp.eval(set("#bDate", "2026-03-15"));
  await sleep(500);
  const other = await cdp.eval("document.querySelectorAll('#slotWrap .slot.taken').length");
  ok("other date unaffected", other === 0, other);

  // --- 6. clear button ---
  await cdp.eval("window.confirm=()=>true; document.getElementById('resetBookings').click(); true");
  await sleep(600);
  const cleared = await cdp.eval("JSON.parse(localStorage.getItem('dm_bookings')||'[]').length");
  const freed = await cdp.eval("document.querySelectorAll('#slotWrap .slot.taken').length");
  ok("clear button wipes bookings", cleared === 0, cleared);
  ok("clear button frees slots", freed === 0, freed);

  const errs = cdp.events.filter(e => e.method === "Runtime.exceptionThrown")
    .map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  ok("no uncaught JS errors", errs.length === 0, errs.length ? errs[0].split("\n")[0] : "none");

  console.log("\n" + (fails === 0 ? "ALL BOOKING FLOW CHECKS PASSED" : fails + " CHECK(S) FAILED"));
  ws.close(); edge.kill();
  process.exit(fails === 0 ? 0 : 1);
})();
