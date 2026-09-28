/* ============================================================
   Dot M Futsal — main.js
   Vanilla JS: nav, reveal, lightbox, forms, booking engine
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /* ---------- Inline SVG icon sprite (works on file:// too) ---------- */
  function injectIcons() {
    if (!window.DM_ICONS || document.getElementById("dm-icon-sprite")) return;
    const host = document.createElement("div");
    host.id = "dm-icon-sprite";
    host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = window.DM_ICONS;
    document.body.insertBefore(host, document.body.firstChild);
  }
  injectIcons();

  /* Add a shine sweep to every primary button */
  function polishButtons() {
    $$(".btn:not(.btn-outline):not(.btn-ghost)").forEach((b) => {
      if (b.dataset.shine) return;
      b.dataset.shine = "1";
    });
  }
  polishButtons();

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* ---------- Toast notifications ---------- */
  const TOAST_ICON = {
    ok: "i-check-circle",
    err: "i-alert",
    info: "i-info"
  };
  function toast(title, msg, type) {
    let wrap = $(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    const iconId = TOAST_ICON[type] || TOAST_ICON.ok;
    el.innerHTML =
      '<svg class="ico toast-ico"><use href="#' + iconId + '"></use></svg>' +
      "<div><b></b><small></small></div>";
    el.querySelector("b").textContent = title;
    el.querySelector("small").textContent = msg || "";
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }
  window.dmToast = toast;

  /* ---------- Mobile navigation ---------- */
  const toggle = $(".nav-toggle");
  const nav = $(".nav-links");

  function closeNav() {
    document.body.classList.remove("nav-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
      if (open) {
        // the panel is still visibility:hidden on this tick, and focusing a
        // hidden element is silently ignored - wait for it to be painted
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const first = $("a", nav);
            if (first) first.focus();
          })
        );
      }
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeNav();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });
    window.addEventListener("resize", () => {
      // matches the 900px breakpoint where the panel layout takes over
      if (window.innerWidth > 900) closeNav();
    });
  }

  /* ---------- Active nav link (based on current filename) ---------- */
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  $$(".nav-links a").forEach((a) => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    if (href === here || (here === "" && href === "index.html")) a.classList.add("active");
  });

  /* ---------- Header state, scroll progress, back-to-top ---------- */
  const header = $(".site-header");
  const toTop = $(".to-top");
  const progress = $(".scroll-progress");

  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle("scrolled", y > 12);
    if (toTop) toTop.classList.toggle("show", y > 600);
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    ticking = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ---------- Reveal on scroll, with above-the-fold items shown immediately ---------- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    revealEls.forEach((el) => {
      // anything already on screen at load reveals with no delay
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) {
        el.classList.add("in");
      } else {
        io.observe(el);
      }
    });
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Set min date on date inputs to today ---------- */
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  $$('input[type="date"]').forEach((i) => {
    i.min = iso(today);
    if (!i.value) i.value = iso(today);
  });

  /* ---------- Star ratings from data-stars ---------- */
  $$("[data-stars]").forEach((el) => {
    const n = Math.max(0, Math.min(5, parseInt(el.dataset.stars, 10) || 0));
    el.setAttribute("aria-label", n + " out of 5 stars");
    el.innerHTML = Array.from({ length: 5 })
      .map(
        (_, i) =>
          '<svg class="ico" style="opacity:' +
          (i < n ? "1" : ".25") +
          '"><use href="#i-star"></use></svg>'
      )
      .join("");
  });

  /* ---------- Year in footer ---------- */
  $$("[data-year]").forEach((el) => (el.textContent = today.getFullYear()));

  /* ============================================================
     BOOKING ENGINE (booking.html)
     ============================================================ */
  const bookingForm = $("#bookingForm");
  if (bookingForm) {
    const courtSel = $("#bCourt");
    const dateInp = $("#bDate");
    const durSel = $("#bDuration");
    const slotWrap = $("#slotWrap");
    const nameInp = $("#bName");
    const phoneInp = $("#bPhone");
    const emailInp = $("#bEmail");
    const teamInp = $("#bTeam");
    const notesInp = $("#bNotes");
    const playersInp = $("#bPlayers");

    const RATES = { "Court 1 — Pro Indoor": 1200, "Court 2 — Training Pitch": 900, "Court 3 — 3x3 Mini Arena": 700 };
    const rate = () => RATES[courtSel.value] || 0;

    // Occupied slots per court+date (persisted)
    const busyKey = (court, date) => "dm_busy_" + court.split(" ")[1] + "_" + date;
    const busyList = (court, date) => store.get(busyKey(court, date), []);

    // All-day slot list
    const ALL_SLOTS = [];
    for (let h = 6; h <= 23; h++) {
      ALL_SLOTS.push((h < 10 ? "0" + h : h) + ":00");
      if (h < 23) ALL_SLOTS.push((h < 10 ? "0" + h : h) + ":30");
    }

    // Load saved bookings for display
    const saved = store.get("dm_bookings", []);
    const myBookings = $("#myBookings");
    function renderBookings() {
      if (!myBookings) return;
      const list = store.get("dm_bookings", []);
      if (!list.length) {
        myBookings.innerHTML = '<p class="form-note">No bookings yet. Fill the form and your slots will appear here (saved on this device).</p>';
        return;
      }
      const rows = list
        .slice()
        .reverse()
        .map((b) => {
          return (
            "<tr><td><b>" +
            b.id +
            "</b></td><td>" +
            b.date +
            "</td><td>" +
            b.time +
            "</td><td>" +
            b.court +
            "</td><td>" +
            b.duration +
            " hr</td><td>₹" +
            b.total +
            "</td><td><span class='pill " +
            (b.status === "Confirmed" ? "open" : "soon") +
            "'>" +
            b.status +
            "</span></td></tr>"
          );
        })
        .join("");
      myBookings.innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Date</th><th>Time</th><th>Court</th><th>Duration</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
        rows +
        "</tbody></table></div>";
    }

    function paintSlots() {
      if (!slotWrap) return;
      const court = courtSel.value;
      const date = dateInp.value;
      if (!date) {
        slotWrap.innerHTML = '<p class="hint">Pick a date to see availability.</p>';
        return;
      }
      const taken = busyList(court, date);
      const html = ALL_SLOTS.map((s) => {
        const isTaken = taken.indexOf(s) !== -1;
        return (
          '<label class="slot' +
          (isTaken ? " taken" : "") +
          '"><input type="radio" name="bSlot" value="' +
          s +
          '"' +
          (isTaken ? " disabled" : "") +
          "><span>" +
          s +
          "</span></label>"
        );
      }).join("");
      slotWrap.innerHTML =
        '<div class="slots">' + html + "</div><p class='hint'>Greyed-out slots are already booked. Need a time that is not listed? Call us on +91 90000 12345.</p>";
      const radios = $$('input[name="bSlot"]', slotWrap);
      radios.forEach((r) => r.addEventListener("change", updateSummary));
      // auto-select the first free slot so the summary is never blank
      if (radios.length && !radios.some((r) => r.checked)) {
        const first = radios.find((r) => !r.disabled);
        if (first) first.checked = true;
      } else {
        // the pre-selected slot became unavailable - move to the next free one
        const current = radios.find((r) => r.checked);
        if (current && current.disabled) {
          current.checked = false;
          const next = radios.find((r) => !r.disabled);
          if (next) next.checked = true;
        }
      }
    }

    function updateSummary() {
      const court = courtSel.value;
      const time = $('input[name="bSlot"]:checked');
      const hours = parseInt(durSel.value, 10) || 1;
      const players = parseInt(playersInp.value, 10) || 10;
      const perHead = Math.round((rate() * hours) / Math.max(1, players));
      const total = rate() * hours;

      const rows =
        "<dt>Court</dt><dd>" +
        court +
        "</dd>" +
        "<dt>Date</dt><dd>" +
        (dateInp.value || "-") +
        "</dd>" +
        "<dt>Time</dt><dd>" +
        (time ? time.value : "-") +
        "</dd>" +
        "<dt>Duration</dt><dd>" +
        hours +
        " hour" +
        (hours > 1 ? "s" : "") +
        "</dd>" +
        "<dt>Players</dt><dd>" +
        players +
        "</dd>" +
        "<dt>Per player</dt><dd>₹" +
        perHead +
        "</dd>" +
        "<dt class='total'>Total</dt><dd class='total'>₹" +
        total +
        "</dd>";
      const box = $("#bSummary");
      if (box) box.innerHTML = rows;
    }

    [courtSel, dateInp, durSel, playersInp].forEach((el) => el && el.addEventListener("change", () => { paintSlots(); updateSummary(); }));
    if (dateInp) dateInp.addEventListener("change", () => { paintSlots(); updateSummary(); });
    paintSlots();
    renderBookings();
    updateSummary();

    // validation
    const rules = {
      bName: (v) => v.trim().length >= 2 || "Please enter your full name.",
      bPhone: (v) => /^[0-9+\-\s()]{8,15}$/.test(v.trim()) || "Enter a valid phone number.",
      bEmail: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Enter a valid email address.",
      bCourt: (v) => !!v || "Select a court.",
      bDate: (v) => !!v || "Select a date.",
      bPlayers: (v) => parseInt(v, 10) >= 4 || "Minimum 4 players."
    };

    function validateField(el) {
      const rule = rules[el.id];
      const field = el.closest(".field");
      // fields without a rule (e.g. the terms checkbox) still need their error
      // state cleared once the user fixes them
      if (!rule) {
        if (field) field.classList.remove("invalid");
        return true;
      }
      const res = rule(el.value);
      const ok = res === true;
      field.classList.toggle("invalid", !ok);
      const err = $(".err", field);
      if (err) err.textContent = ok ? "" : res;
      return ok;
    }

    function validateBooking() {
      const ids = ["bName", "bPhone", "bEmail", "bCourt", "bDate", "bPlayers"];
      let ok = true;
      ids.forEach((id) => {
        const el = $("#" + id);
        if (el && !validateField(el)) ok = false;
      });
      const slot = $('input[name="bSlot"]:checked');
      const slotField = $("#slotField");
      if (!slot) {
        slotField.classList.add("invalid");
        $(".err", slotField).textContent = "Select an available time slot.";
        ok = false;
      } else {
        slotField.classList.remove("invalid");
      }
      const agree = $("#bAgree");
      const agreeField = agree.closest(".field");
      if (!agree.checked) {
        agreeField.classList.add("invalid");
        $(".err", agreeField).textContent = "Please accept the terms.";
        ok = false;
      } else {
        agreeField.classList.remove("invalid");
      }
      return ok;
    }

    bookingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validateBooking()) {
        toast("Please fix the highlighted fields", "Some details are missing or invalid.", "err");
        const bad = $(".field.invalid");
        if (bad) bad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const slot = $('input[name="bSlot"]:checked');
      const hours = parseInt(durSel.value, 10);
      const total = rate() * hours;
      const id = "DMF-" + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.floor(Math.random() * 90 + 10);

      const booking = {
        id: id,
        date: dateInp.value,
        time: slot.value,
        court: courtSel.value,
        duration: hours,
        players: parseInt(playersInp.value, 10),
        name: nameInp.value.trim(),
        phone: phoneInp.value.trim(),
        email: emailInp.value.trim(),
        team: teamInp.value.trim(),
        notes: notesInp.value.trim(),
        total: total,
        status: "Confirmed",
        created: new Date().toISOString()
      };

      const list = store.get("dm_bookings", []);
      list.push(booking);
      store.set("dm_bookings", list);

      const key = busyKey(courtSel.value, dateInp.value);
      const taken = store.get(key, []);
      // block the slot and any overlapping 30-min step
      const startIdx = ALL_SLOTS.indexOf(slot.value);
      for (let i = startIdx; i >= 0 && i < startIdx + hours * 2; i++) {
        if (i >= 0 && ALL_SLOTS[i] && taken.indexOf(ALL_SLOTS[i]) === -1) taken.push(ALL_SLOTS[i]);
      }
      store.set(key, taken);

      const conf = $("#bookingConfirm");
      if (conf) {
        const head = $(".confirm-box h3", conf);
        if (head && !$("svg", head)) {
          head.innerHTML = '<svg class="ico"><use href="#i-check-circle"></use></svg><span></span>';
          $("span", head).textContent = "Booking confirmed";
        }
        $("#confRef").textContent = booking.id;
        $("#confDetails").innerHTML =
          "<li><b>Court:</b> " + booking.court + "</li>" +
          "<li><b>Date:</b> " + booking.date + "</li>" +
          "<li><b>Time:</b> " + booking.time + " for " + hours + " hour" + (hours > 1 ? "s" : "") + "</li>" +
          "<li><b>Players:</b> " + booking.players + "</li>" +
          "<li><b>Amount:</b> ₹" + booking.total + "</li>" +
          "<li><b>Booked by:</b> " + booking.name + " (" + booking.phone + ")</li>";
        conf.hidden = false;
        conf.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      // keep court / date / duration / players so another slot can be booked instantly,
      // but clear the personal details
      [nameInp, phoneInp, emailInp, teamInp, notesInp].forEach((el) => {
        if (el) el.value = "";
      });
      const agreeBox = $("#bAgree");
      if (agreeBox) agreeBox.checked = false;
      $$("#bookingForm .field.invalid").forEach((f) => f.classList.remove("invalid"));
      paintSlots();
      updateSummary();
      renderBookings();
      toast("Booking confirmed — " + id, "We have saved your slot. See you on court!", "info");
    });

    $$("#bookingForm input, #bookingForm select, #bookingForm textarea").forEach((el) => {
      el.addEventListener("blur", () => { if (el.id) validateField(el); });
      // "change" covers checkboxes, radios and selects; "input" covers typing
      ["input", "change"].forEach((evt) => {
        el.addEventListener(evt, () => {
          const f = el.closest(".field");
          if (f && f.classList.contains("invalid") && el.id) validateField(el);
        });
      });
    });

    const printBtn = $("#printBooking");
    if (printBtn) printBtn.addEventListener("click", () => window.print());

    const resetBtn = $("#resetBookings");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Clear all saved bookings and slot availability on this device?")) {
          store.set("dm_bookings", []);
          Object.keys(localStorage)
            .filter((k) => k.indexOf("dm_busy_") === 0)
            .forEach((k) => localStorage.removeItem(k));
          paintSlots();
          renderBookings();
          updateSummary();
          toast("Cleared", "All local bookings and slot holds were removed.");
        }
      });
    }
    void saved;
  }

  /* ============================================================
     GENERIC FORMS (contact + newsletter)
     ============================================================ */
  $$("form[data-simple]").forEach((form) => {
    // clear a field's error as soon as the user starts fixing it, so a
    // message from a previous attempt never lingers
    $$("input, textarea, select", form).forEach((el) => {
      ["input", "change"].forEach((evt) =>
        el.addEventListener(evt, () => {
          const field = el.closest(".field");
          if (field && field.classList.contains("invalid")) {
            field.classList.remove("invalid");
            const err = $(".err", field);
            if (err) err.textContent = "";
          }
        })
      );
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      let firstBad = null;
      $$("input, textarea, select", form).forEach((el) => {
        if (!el.required) return;
        const field = el.closest(".field");
        const err = field ? $(".err", field) : null;
        const val = (el.value || "").trim();
        let message = "";
        if (!val) message = "This field is required.";
        else if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) message = "Enter a valid email address.";
        else if (el.type === "tel" && val.replace(/\D/g, "").length < 8) message = "Enter a valid phone number.";
        else if (el.tagName === "TEXTAREA" && val.length < 10) message = "Please write a little more (10+ characters).";
        if (field) field.classList.toggle("invalid", !!message);
        if (err) err.textContent = message;
        if (message) {
          ok = false;
          if (!firstBad) firstBad = el;
        }
      });
      if (!ok) {
        if (firstBad) {
          firstBad.focus();
          firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        toast("Check the form", "Some fields need your attention.", "err");
        return;
      }
      const key = "dm_messages";
      const list = store.get(key, []);
      list.push({ at: new Date().toISOString(), data: Object.fromEntries(new FormData(form)) });
      store.set(key, list);
      form.reset();
      const done = $("#" + (form.dataset.done || ""));
      if (done) done.hidden = false;
      toast("Message sent", "Thanks! Our team replies within 24 hours on working days.", "info");
    });
  });

  /* ============================================================
     GALLERY LIGHTBOX
     ============================================================ */
  const lb = $("#lightbox");
  if (lb) {
    const items = $$(".gallery-item");
    const img = $("#lbImg", lb);
    const cap = $("#lbCap", lb);
    let idx = 0;
    let opener = null;

    function show(i) {
      idx = (i + items.length) % items.length;
      const node = items[idx];
      const source = $("img", node);
      img.src = source.src;
      img.alt = source.alt || "";
      const c = $(".gallery-cap", node);
      cap.textContent = c ? c.textContent : "";
    }

    function open(i, from) {
      opener = from || null;
      show(i);
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
      const close = $(".lightbox-close", lb);
      if (close) close.focus();
    }

    function close() {
      if (!lb.classList.contains("open")) return;
      lb.classList.remove("open");
      document.body.style.overflow = "";
      // return the user to the tile they came from instead of dropping
      // focus back to the top of the document
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    }

    items.forEach((it, i) =>
      it.addEventListener("click", () => open(i, it))
    );
    $(".lightbox-close", lb).addEventListener("click", close);
    $(".lightbox-nav.prev", lb).addEventListener("click", () => show(idx - 1));
    $(".lightbox-nav.next", lb).addEventListener("click", () => show(idx + 1));
    lb.addEventListener("click", (e) => {
      if (e.target === lb) close();
    });
    document.addEventListener("keydown", (e) => {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
      // keep Tab inside the dialog while it is open
      if (e.key === "Tab") {
        const focusable = $$(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
          lb
        ).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ============================================================
     COUNTERS
     ============================================================ */
  const counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          co.unobserve(el);
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || "";
          const dur = 1300;
          const start = performance.now();
          function step(now) {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = target * eased;
            el.textContent = (target % 1 !== 0 ? val.toFixed(1) : Math.round(val).toLocaleString("en-IN")) + suffix;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => co.observe(c));
  }

  /* ============================================================
     TABS (tournaments.html)
     ============================================================ */
  $$("[data-tabs]").forEach((group) => {
    const tabs = $$(".tab", group);
    const panels = $$(".tab-panel", group);

    // wire up the ARIA relationships the markup does not carry
    tabs.forEach((tab, i) => {
      if (!tab.id) tab.id = "tab-" + tab.dataset.tab;
      const panel = $("#" + tab.dataset.tab);
      if (panel) {
        tab.setAttribute("aria-controls", panel.id);
        if (!panel.id) panel.id = tab.dataset.tab;
        if (!panel.hasAttribute("role")) panel.setAttribute("role", "tabpanel");
        if (!panel.hasAttribute("aria-labelledby")) panel.setAttribute("aria-labelledby", tab.id);
        if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "0");
      }
      tab.setAttribute("tabindex", tab.classList.contains("active") ? "0" : "-1");
    });

    function select(tab, focus) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", String(on));
        t.setAttribute("tabindex", on ? "0" : "-1");
      });
      panels.forEach((p) => p.classList.remove("active"));
      const target = $("#" + tab.dataset.tab);
      if (target) target.classList.add("active");
      if (focus) tab.focus();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => select(tab, false));
      // roving tabindex: arrows move between tabs, as expected of a tablist
      tab.addEventListener("keydown", (e) => {
        const i = tabs.indexOf(tab);
        let next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          select(next, true);
        }
      });
    });
  });

  /* ============================================================
     PRICING TOGGLE (per hour / per month)
     ============================================================ */
  const priceToggle = $("#priceToggle");
  if (priceToggle) {
    if (!priceToggle.hasAttribute("aria-pressed")) priceToggle.setAttribute("aria-pressed", "false");
    priceToggle.addEventListener("click", () => {
      // the toggle shows the mode you are NOT currently in
      const showMonthly = priceToggle.dataset.mode !== "monthly";
      $$("[data-hourly]").forEach((el) => {
        const next = showMonthly ? el.dataset.monthly : el.dataset.hourly;
        if (next) el.textContent = next;
      });
      $$("[data-period]").forEach((el) => (el.textContent = showMonthly ? "/ month" : "/ hour"));
      priceToggle.dataset.mode = showMonthly ? "monthly" : "hourly";
      priceToggle.setAttribute("aria-pressed", String(showMonthly));
      priceToggle.textContent = showMonthly ? "Show hourly rates" : "Show monthly plans";
    });
  }

  console.log("%cDot M Futsal", "color:#00e676;font-weight:800;font-size:16px", "- website loaded");
})();
