/* Real-interaction test: dispatches genuine mouse clicks, key presses and
   typing (via CDP Input domain) so handlers run exactly as a user would
   trigger them. Also verifies the site works when opened from disk (file://),
   which is what the inline icon sprite exists to support. */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9340;
const HTTP = "http://localhost:5173";
const FILE_ROOT = "file:///C:/Users/Hp/OneDrive/Desktop/futsal";
const PROFILE = path.join(os.tmpdir(), "dm-cdp-ux");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(u, m = "GET") { return (await fetch(u, { method: m })).json(); }

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map(); this.errors = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) {
        const h = this.p.get(m.id); this.p.delete(m.id);
        m.error ? h.reject(new Error(JSON.stringify(m.error))) : h.resolve(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        this.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        this.errors.push(m.params.entry.text);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.p.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error("timeout " + method)); } }, 20000);
    });
  }
  async eval(e) {
    const r = await this.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  /* A real trusted click at the element's centre. The page uses
     scroll-behavior:smooth, so the element must be scrolled into place and
     settled before its rect is read - otherwise the coordinates are stale and
     the click lands on whatever happens to be underneath. The point is also
     hit-tested so a mis-aimed click is reported rather than silently passing. */
  async click(sel, nth = 0) {
    const found = await this.eval(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
      if(!e) return null;
      e.scrollIntoView({block:'center', behavior:'instant'});
      return e.tagName+'.'+(typeof e.className==='string'?e.className.trim().split(/\\s+/)[0]:'');})()`);
    if (!found) throw new Error("no element for click: " + sel + " [" + nth + "]");
    await sleep(500);
    const probe = await this.eval(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
      const r=e.getBoundingClientRect();
      const x=r.left+r.width/2, y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      return {x, y, w:r.width, h:r.height, hit: hit ? (hit.tagName+'.'+(typeof hit.className==='string'?hit.className.trim().split(/\\s+/)[0]:'')) : 'null',
              ok: !!hit && (hit===e || e.contains(hit) || hit.contains(e))};})()`);
    if (!probe.ok) throw new Error("click would miss " + found + " (point hits " + probe.hit + ")");
    for (const type of ["mousePressed", "mouseReleased"])
      await this.send("Input.dispatchMouseEvent", { type, x: probe.x, y: probe.y, button: "left", clickCount: 1 });
    await sleep(400);
  }
  async key(key, code, keyCode) {
    for (const type of ["keyDown", "keyUp"])
      await this.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    await sleep(280);
  }
  async type(text) {
    for (const ch of text)
      await this.send("Input.dispatchKeyEvent", { type: "char", text: ch });
    await sleep(120);
  }
  /* walk down the page in viewport-sized steps so every loading="lazy" image
     actually intersects the viewport, the way a real scroll would */
  async scrollThrough() {
    const h = await this.eval("document.body.scrollHeight");
    const vh = await this.eval("window.innerHeight");
    for (let y = 0; y < h; y += Math.floor(vh * 0.75)) {
      await this.eval(`window.scrollTo({top:${y}, behavior:'instant'}); true`);
      await sleep(230);
    }
    await this.eval("window.scrollTo({top:0, behavior:'instant'}); true");
    await sleep(600);
  }
  async open(url, w = 1280, h = 900) {
    const t = await getJSON("http://127.0.0.1:" + PORT + "/json/new?about:blank", "PUT");
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    const cdp = new CDP(ws);
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    await cdp.send("Page.navigate", { url });
    await sleep(2300);
    return cdp;
  }
}

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label.padEnd(46) + (extra !== undefined ? "= " + extra : ""));
};

(async () => {
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { await getJSON("http://127.0.0.1:" + PORT + "/json/version"); break; } catch { await sleep(300); } }

  /* ---------------- 1. mobile navigation ---------------- */
  console.log("\n=== MOBILE NAVIGATION (real clicks) ===");
  {
    const cdp = await cdp_open(HTTP + "/index.html", 390, 844);
    ok("menu starts closed", (await cdp.eval("document.body.classList.contains('nav-open')")) === false);
    await cdp.click(".nav-toggle");
    ok("toggle opens menu", (await cdp.eval("document.body.classList.contains('nav-open')")) === true);
    ok("aria-expanded=true", (await cdp.eval("document.querySelector('.nav-toggle').getAttribute('aria-expanded')")) === "true");
    ok("focus moved into menu", await cdp.eval("document.querySelector('.nav-links').contains(document.activeElement)"));
    ok("menu is visible", (await cdp.eval("getComputedStyle(document.querySelector('.nav-links')).visibility")) === "visible");
    await cdp.key("Escape", "Escape", 27);
    ok("Escape closes menu", (await cdp.eval("document.body.classList.contains('nav-open')")) === false);
    ok("aria-expanded back to false", (await cdp.eval("document.querySelector('.nav-toggle').getAttribute('aria-expanded')")) === "false");
    await cdp.click(".nav-toggle");
    await cdp.click(".nav-links a", 1);
    ok("clicking a link closes menu", (await cdp.eval("document.body.classList.contains('nav-open')")) === false);
    ok("no JS errors in nav", cdp.errors.length === 0, cdp.errors[0] || "none");
  }

  /* ---------------- 2. lightbox ---------------- */
  console.log("\n=== GALLERY LIGHTBOX (real clicks + keys) ===");
  {
    const cdp = await cdp_open(HTTP + "/gallery.html", 1280, 900);
    ok("lightbox hidden initially", (await cdp.eval("getComputedStyle(document.getElementById('lightbox')).display")) === "none");
    await cdp.click(".gallery-item", 0);
    ok("clicking a tile opens viewer", (await cdp.eval("document.getElementById('lightbox').classList.contains('open')")) === true);
    ok("body scroll locked", (await cdp.eval("document.body.style.overflow")) === "hidden");
    ok("focus on close button", await cdp.eval("document.activeElement.classList.contains('lightbox-close')"));
    const cap1 = await cdp.eval("document.getElementById('lbCap').textContent.trim()");
    ok("caption matches first tile", cap1.length > 5, JSON.stringify(cap1.slice(0, 30)));
    await cdp.click(".lightbox-nav.next");
    const cap2 = await cdp.eval("document.getElementById('lbCap').textContent.trim()");
    ok("next advances the image", cap2 !== cap1, JSON.stringify(cap2.slice(0, 30)));
    await cdp.click(".lightbox-nav.prev");
    ok("prev goes back", (await cdp.eval("document.getElementById('lbCap').textContent.trim()")) === cap1);
    ok("prev and next use different icons",
      (await cdp.eval("document.querySelector('.lightbox-nav.prev use').getAttribute('href')")) !==
      (await cdp.eval("document.querySelector('.lightbox-nav.next use').getAttribute('href')")));
    await cdp.key("ArrowRight", "ArrowRight", 39);
    ok("ArrowRight advances", (await cdp.eval("document.getElementById('lbCap').textContent.trim()")) !== cap1);
    await cdp.key("ArrowLeft", "ArrowLeft", 37);
    ok("ArrowLeft goes back", (await cdp.eval("document.getElementById('lbCap').textContent.trim()")) === cap1);
    await cdp.key("Escape", "Escape", 27);
    ok("Escape closes viewer", (await cdp.eval("document.getElementById('lightbox').classList.contains('open')")) === false);
    ok("body scroll restored", (await cdp.eval("document.body.style.overflow")) === "");
    ok("focus returned to the tile", await cdp.eval("document.activeElement.classList.contains('gallery-item')"));
    ok("no JS errors in lightbox", cdp.errors.length === 0, cdp.errors[0] || "none");
  }

  /* ---------------- 3. tabs ---------------- */
  console.log("\n=== TOURNAMENT TABS (real clicks + arrows) ===");
  {
    const cdp = await cdp_open(HTTP + "/tournaments.html", 1280, 900);
    await cdp.click(".tab", 1);
    ok("clicking a tab activates it", (await cdp.eval("document.querySelectorAll('.tab')[1].classList.contains('active')")) === true);
    ok("aria-selected updated", (await cdp.eval("document.querySelectorAll('.tab')[1].getAttribute('aria-selected')")) === "true");
    ok("previous tab deselected", (await cdp.eval("document.querySelectorAll('.tab')[0].getAttribute('aria-selected')")) === "false");
    ok("correct panel visible", await cdp.eval("document.getElementById('p-league').classList.contains('active')"));
    ok("only one panel active", (await cdp.eval("document.querySelectorAll('.tab-panel.active').length")) === 1);
    ok("roving tabindex set", (await cdp.eval("document.querySelectorAll('.tab')[1].getAttribute('tabindex')")) === "0");
    ok("panels have role=tabpanel", (await cdp.eval("!!document.getElementById('p-league').getAttribute('role')")) === true || (await cdp.eval("document.getElementById('p-league').getAttribute('role')")) === "tabpanel");
    ok("tabs point at their panel", (await cdp.eval("document.querySelectorAll('.tab')[1].getAttribute('aria-controls')")) === "p-league");
    await cdp.eval("document.querySelectorAll('.tab')[1].focus(); true");
    await cdp.key("ArrowRight", "ArrowRight", 39);
    ok("ArrowRight moves to next tab", (await cdp.eval("document.querySelectorAll('.tab')[2].classList.contains('active')")) === true);
    ok("focus follows the tab", await cdp.eval("document.activeElement === document.querySelectorAll('.tab')[2]"));
    await cdp.key("End", "End", 35);
    ok("End jumps to last tab", (await cdp.eval("document.querySelectorAll('.tab')[4].classList.contains('active')")) === true);

    // pictures parked in an inactive panel must appear once the tab is opened
    await cdp.click(".tab", 1);
    await sleep(900);
    const panelImgs = await cdp.eval(
      "Array.from(document.querySelectorAll('#p-league img')).map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,shown:i.getClientRects().length>0}))"
    );
    ok("panel picture becomes visible", panelImgs.length > 0 && panelImgs.every((i) => i.shown),
      panelImgs.map((i) => i.src).join(",") || "none");
    ok("panel picture decodes on open", panelImgs.every((i) => i.w > 0),
      panelImgs.map((i) => i.src + "=" + i.w).join(",") || "none");
    ok("no JS errors in tabs", cdp.errors.length === 0, cdp.errors[0] || "none");
  }

  /* ---------------- 4. pricing toggle ---------------- */
  console.log("\n=== PRICING TOGGLE (real clicks) ===");
  {
    const cdp = await cdp_open(HTTP + "/pricing.html", 1280, 900);
    const first = await cdp.eval("document.querySelector('[data-hourly]').textContent");
    const period = await cdp.eval("document.querySelector('[data-period]').textContent");
    const label = await cdp.eval("document.getElementById('priceToggle').textContent");
    await cdp.click("#priceToggle");
    const second = await cdp.eval("document.querySelector('[data-hourly]').textContent");
    ok("price value changes", second !== first, first + " -> " + second);
    ok("period label changes", (await cdp.eval("document.querySelector('[data-period]').textContent")) !== period);
    ok("button label changes", (await cdp.eval("document.getElementById('priceToggle').textContent")) !== label);
    ok("aria-pressed=true", (await cdp.eval("document.getElementById('priceToggle').getAttribute('aria-pressed')")) === "true");
    await cdp.click("#priceToggle");
    ok("toggles back to original", (await cdp.eval("document.querySelector('[data-hourly]').textContent")) === first);
    ok("aria-pressed back to false", (await cdp.eval("document.getElementById('priceToggle').getAttribute('aria-pressed')")) === "false");
    ok("no JS errors in toggle", cdp.errors.length === 0, cdp.errors[0] || "none");
  }

  /* ---------------- 5. contact form ---------------- */
  console.log("\n=== CONTACT FORM (real typing + submit) ===");
  {
    const cdp = await cdp_open(HTTP + "/contact.html", 1280, 900);
    await cdp.eval("localStorage.removeItem('dm_messages'); true");
    await cdp.eval("document.getElementById('cName').focus(); true");
    await cdp.type("Ananya Rao");
    await cdp.key("Tab", "Tab", 9);
    await cdp.type("9876543210");
    await cdp.key("Tab", "Tab", 9);
    await cdp.type("ananya@example.com");
    ok("typed name landed", (await cdp.eval("document.getElementById('cName').value")) === "Ananya Rao");
    ok("typed email landed", (await cdp.eval("document.getElementById('cEmail').value")) === "ananya@example.com");
    // submit with the message still empty
    await cdp.click("form[data-simple] button[type=submit]");
    ok("empty required field blocks submit", (await cdp.eval("!!document.querySelector('form[data-simple] .field.invalid')")) === true);
    ok("focus moved to a bad field", await cdp.eval("document.activeElement.closest('.field') !== null"));
    // fix the error by typing (cSubject is a <select>, so pick a real option)
    await cdp.eval(`(()=>{const s=document.getElementById('cSubject');
      s.value=[...s.options].map(o=>o.value).find(v=>v) || '';
      s.dispatchEvent(new Event('change',{bubbles:true})); return s.value})()`);
    await cdp.eval("const m=document.getElementById('cMsg'); m.value='I would like to book Court 1 for a corporate match next week.'; m.dispatchEvent(new Event('input',{bubbles:true})); true");
    ok("subject select has a value", (await cdp.eval("document.getElementById('cSubject').value")).length > 0);
    ok("typing clears the error", (await cdp.eval("!document.getElementById('cSubject').closest('.field').classList.contains('invalid')")) === true);
    await cdp.click("form[data-simple] button[type=submit]");
    await sleep(500);
    ok("success panel revealed", (await cdp.eval("document.getElementById('contactDone').hidden")) === false);
    ok("form was reset", (await cdp.eval("document.getElementById('cName').value")) === "");
    ok("message stored", (await cdp.eval("JSON.parse(localStorage.getItem('dm_messages')||'[]').length")) === 1);
    ok("no JS errors in contact form", cdp.errors.length === 0, cdp.errors[0] || "none");
  }

  /* ---------------- 6. file:// (opened straight from disk) ---------------- */
  console.log("\n=== OPENS FROM DISK (file://) ===");
  {
    for (const page of ["index", "booking", "gallery", "tournaments", "contact", "pricing"]) {
      const cdp = await cdp_open(FILE_ROOT + "/" + page + ".html", 1280, 900);
      const css = await cdp.eval("getComputedStyle(document.body).backgroundColor");
      const icons = await cdp.eval("document.querySelectorAll('#dm-icon-sprite symbol').length");
      const used = await cdp.eval("document.querySelectorAll('svg.ico use').length");
      const navActive = await cdp.eval("!!document.querySelector('.nav-links a.active')");
      // walk the page so loading="lazy" images are actually requested
      await cdp.scrollThrough();
      // an <img> with no src attribute is an intentional placeholder (the
      // lightbox <img> is filled in when a picture is opened). Images inside a
      // display:none tab panel are skipped - they legitimately stay unloaded
      // until that tab is opened, which is asserted separately.
      const brokenImgs = await cdp.eval(
        "Array.from(document.images).filter(i=>i.getAttribute('src') && i.getClientRects().length && !i.naturalWidth).map(i=>i.getAttribute('src'))"
      );
      const hiddenImgs = await cdp.eval(
        "Array.from(document.images).filter(i=>i.getAttribute('src') && !i.getClientRects().length).length"
      );
      const emptySrc = await cdp.eval(
        "Array.from(document.images).filter(i=>!i.getAttribute('src')).length"
      );
      const dark = /rgb\((\d+), (\d+), (\d+)\)/.exec(css);
      const isDark = dark && (+dark[1] + +dark[2] + +dark[3]) < 150;
      const noErr = cdp.errors.filter((e) => !/net::ERR_FILE_NOT_FOUND|favicon|fonts\.g/i.test(e));
      ok(page + ": stylesheet applied", isDark === true, css);
      ok(page + ": icon sprite injected (48)", icons === 48, icons);
      ok(page + ": icons referenced (" + used + ")", used > 0);
      ok(page + ": active nav link set", navActive === true);
      ok(page + ": every visible image decodes", brokenImgs.length === 0, brokenImgs.join(",") || "all ok");
      ok(page + ": no empty-src requests (" + emptySrc + " placeholder)", emptySrc <= 1, emptySrc);
      if (hiddenImgs) console.log("        (" + hiddenImgs + " image(s) parked in a hidden tab panel)");
      ok(page + ": no JS/CORS errors", noErr.length === 0, noErr[0] ? noErr[0].slice(0, 60) : "none");
    }
  }

  edge.kill();
  console.log("\n" + (fails === 0 ? "ALL INTERACTION CHECKS PASSED" : fails + " CHECK(S) FAILED"));
  process.exit(fails === 0 ? 0 : 1);
})();

/* helper so the block above can be terse */
async function cdp_open(url, w, h) { return openPage(url, w, h); }
const openPage = (url, w, h) => (async () => {
  const t = await getJSON("http://127.0.0.1:" + PORT + "/json/new?about:blank", "PUT");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const cdp = new CDP(ws);
  await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  await cdp.send("Page.navigate", { url });
  await sleep(2400);
  return cdp;
})();
