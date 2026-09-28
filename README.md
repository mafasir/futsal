# Dot M Futsal — Website

A complete, production-style marketing + booking website for **Dot M Futsal**, an indoor futsal complex.
Built with **plain HTML, CSS and JavaScript** — no frameworks, no build step, no internet connection required.

---

## 1. How to Run (pick any one)

### Option A — Just open it (fastest)
Double-click `index.html`. It opens in your default browser and works immediately.

### Option B — Local server (recommended)
Open **PowerShell** in this folder and run:

```powershell
npx serve -l 5173 .
```

Or with Python:

```powershell
python -m http.server 5173
```

Then open <http://localhost:5173>.

### Option C — Double-click launcher
Run `start-server.bat` (Windows) or `./start-server.sh` (Mac/Linux). It starts a server and opens the site.

### Option D — VS Code
Install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

---

## 2. Requirements

### To run the site
| Requirement | Version | Notes |
|---|---|---|
| Web browser | Any modern browser | Chrome, Edge, Firefox, Safari — tested on all four |
| No installation needed | — | Pure static site, no npm install, no dependencies |
| (Optional) Node.js | 18+ | Only if you use `npx serve` |
| (Optional) Python | 3.8+ | Only if you use `python -m http.server` |

### To deploy it
| Requirement | Notes |
|---|---|
| A static host | GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any cPanel/shared host |
| (Optional) Custom domain | Point a CNAME / A record at the host |
| (Optional) HTTPS | Free on all recommended hosts (Netlify / Vercel / Cloudflare give it automatically) |

### To make it a real live business site
| Requirement | Why you need it |
|---|---|
| **Backend or form service** | Forms currently save in the browser only. Connect to **Formspree**, **Google Forms**, **Web3Forms**, or your own Node/PHP backend to receive real messages. |
| **Payment gateway** | To take online deposits — Razorpay, Stripe, PayU or PhonePe (UPI). Wire it into the booking submit handler in `assets/js/main.js`. |
| **Database** | To store bookings server-side instead of `localStorage`. PostgreSQL / MySQL / MongoDB, or a BaaS like Supabase / Firebase. |
| **Real domain + email** | `play@dotmfutsal.in` and a DNS record for mail delivery. |
| **Maps API key** | Only if you want a live embedded map on the contact page (currently a link out to Maps). |
| **CMS (optional)** | WordPress / Webflow if non-technical staff must edit content without touching code. |
| **Analytics (optional)** | Google Analytics 4 or Plausible to track traffic. |
| **Privacy policy page** | Required by law if you collect phone/email via forms. |
| **SSL + backups** | HTTPS certificate and scheduled backups before going live. |

### Browser support
Chrome/Edge 90+, Firefox 90+, Safari 15+, Android Chrome, iOS Safari 15+.
Uses `IntersectionObserver`, `localStorage`, CSS Grid, CSS custom properties and `backdrop-filter` (with graceful fallbacks).

---

## 3. Pages Included

| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Hero, animated stats, why-us, court previews, program highlights, testimonials, FAQ, CTA |
| About | `about.html` | Story, values, staff, milestone timeline |
| Facilities | `facilities.html` | All 3 courts with rates, 8 amenity cards, house rules |
| Programs | `programs.html` | 6 coaching programs, 12-week curriculum breakdown, weekly timetable table |
| Tournaments | `tournaments.html` | Tabbed: upcoming events, premier league + standings, 3x3 blitz, corporate, past winners, **team registration form** |
| Gallery | `gallery.html` | Image grid with a working **lightbox** (arrow keys + Esc supported) |
| Pricing | `pricing.html` | Hourly ⇄ monthly **toggle**, time-band rate table, program fees, payment FAQ |
| Booking | `booking.html` | **Full working booking engine** — see below |
| Contact | `contact.html` | Validated enquiry form, address, hours, directions, WhatsApp, FAQ |

## 4. The Booking Engine (the main working feature)

`booking.html` is a genuinely functional flow, not a static mock-up:

- **Live availability** — 30-minute slots from 6:00 AM to 11:00 PM are generated per court per date.
- **Real slot blocking** — when you confirm, the booked slot *and* every overlapping slot become greyed out and unavailable for that court/date.
- **Instant price calculation** — court rate × duration, plus a per-player split, updating live as you change anything.
- **Full validation** — name, phone, email, court, date, player count and terms agreement, with inline error messages and a scroll-to-first-error.
- **Confirmation reference** — e.g. `DMF-A7K392`, shown in a confirmation panel with a print/save button.
- **Your bookings** — a table of everything booked on the device, with a one-click clear button.
- **Persistence** — everything is stored in `localStorage`, so it survives page reloads. Nothing is sent to any server.

## 5. Other Working Features

- Responsive mobile navigation (hamburger, auto-closes on link click and on resize)
- Scroll-reveal animations with staggered delays
- Animated count-up statistics
- Toast notifications for all form actions
- Pricing hourly/monthly toggle
- Tournament tab switcher with animated panels
- Gallery lightbox (click, arrow keys, Esc, click-outside)
- Back-to-top button, active nav highlighting, sticky header state
- Accordion FAQs
- Full accessibility: skip link, ARIA labels, focus-visible rings, keyboard-operable controls, `prefers-reduced-motion` support
- Print stylesheet for booking confirmations

## 6. File Structure

```
futsal/
├── index.html
├── about.html
├── facilities.html
├── programs.html
├── tournaments.html
├── gallery.html
├── pricing.html
├── booking.html
├── contact.html
├── README.md
├── start-server.bat
├── start-server.sh
├── assets/
│   ├── css/
│       │   └── style.css          # Full design system, ~1050 lines
│   ├── js/
│   │   ├── main.js            # Nav, reveal, lightbox, forms, booking engine
│   │   └── icons.js           # 47-symbol inline SVG icon sprite
│   └── img/
│       ├── logo.svg
│       ├── hero.svg
│       ├── court-1.svg
│       ├── court-2.svg
│       ├── court-3.svg
│       ├── coaching.svg
│       ├── fitness.svg
│       ├── academy.svg
│       └── trophy.svg
└── tests/
    ├── smoke-test.js          # Per-page runtime + JS-error checks
    ├── booking-test.js        # Full booking flow, end to end
    ├── responsive-test.js     # 9 pages x 5 viewports layout audit
    └── interaction-test.js    # Real clicks/keys + works from file://
```

All images are **hand-written SVG illustrations** — they scale to any screen, weigh almost nothing, and need no internet or image hosting.

### Icons

Icons are a single inline SVG sprite in `assets/js/icons.js`, injected into every page by `main.js`. This keeps the site working when opened directly from disk (`file://`), where a separate `icons.svg` fetched with `<use href="icons.svg#id">` would be blocked by the browser.

To add an icon, drop a new `<symbol id="i-name" viewBox="0 0 24 24">…</symbol>` into `ICONS` in `assets/js/icons.js`, then reference it anywhere with:

```html
<svg class="ico"><use href="#i-name"></use></svg>
```

### Running the tests

The tests drive a real headless Edge over the DevTools Protocol, so they need Node 18+ (for the built-in `WebSocket`) and the site served locally. From the project root:

```bash
python -m http.server 5173      # in one terminal
node tests/smoke-test.js
node tests/booking-test.js
node tests/responsive-test.js
node tests/interaction-test.js
```

They exit non-zero on failure, so they drop straight into CI.

`interaction-test.js` is the important one for judging whether the site really
works. It dispatches **genuine** mouse clicks and key presses (via the CDP
`Input` domain, not synthetic JS events) and hit-tests every click point, so a
click that would miss its target fails loudly instead of silently passing. It
covers the mobile menu, the gallery viewer, the tournament tabs, the pricing
toggle and the contact form — and it re-runs key pages over `file://` to prove
the site still works when opened straight from disk.

## 7. Customising

**Colours and spacing** — edit the `:root` variables at the top of `assets/css/style.css`:

```css
:root {
  --brand:   #00e676;   /* main green  */
  --brand-2: #00b0ff;   /* main blue   */
  --accent:  #ffb300;   /* highlight    */
  --bg:      #070d14;   /* page bg      */
}
```

**Prices** — court rates live in two places: the `RATES` object in `assets/js/main.js` (used by the booking calculator) and the text on `pricing.html` / `index.html`.

**Contact details** — phone, email, address and hours are in the footer of every page plus the contact page sidebar. Use Find & Replace to update them everywhere.

**Booking hours** — edit the loop in `main.js`:

```js
for (let h = 6; h <= 23; h++) { ... }   // currently 6 AM to 11 PM
```

## 8. Going Live Checklist

- [ ] Replace the placeholder phone number, email and address
- [ ] Add your real logo (replace `assets/img/logo.svg`)
- [ ] Connect the forms to a real backend or form service
- [ ] Add payment if you want online deposits
- [ ] Add a Privacy Policy and Terms page
- [ ] Add a real map embed on the contact page
- [ ] Compress/optimise any photos you replace the SVGs with
- [ ] Test booking on a real phone (Android + iPhone)
- [ ] Set up HTTPS and backups
- [ ] Add `robots.txt` and `sitemap.xml`
- [ ] Deploy to Netlify / Vercel / GitHub Pages (drag-and-drop, no build command)

## 9. Note on the content

Prices, phone numbers, addresses, staff names, tournament fixtures and statistics in this build are **realistic placeholders** for demonstration. Replace them with your actual business information before publishing.
