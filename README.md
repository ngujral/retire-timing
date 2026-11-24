# Retire Timing — CPP and OAS calculator

Compare your own CPP and OAS start ages with starting both at 65 and both at 70 — after federal and Ontario tax and the
OAS clawback — with your retirement age, RRSP/RRIF, TFSA and other savings, a defined benefit pension, pension splitting,
and a plan length from FP Canada's life-expectancy guidelines. Ontario, 2026 figures. Installable as a web app (PWA), works offline.
No accounts, no server, no tracking: everything stays in the browser on the user's device.

Live at **https://retiretiming.ca**

## Project layout

```
index.html              the calculator (HTML, CSS and page script in one file)
js/engine.js            calculation engine — no DOM; the same code runs in the browser and in tests
js/params-2026.js       every rate, maximum, bracket, credit and RRIF factor (the only place figures live)
tests/engine.test.mjs   engine tests (tax table check, CPP/OAS, draw order, survivor, retirement age…)
privacy.html            privacy page (also needed for a Google Play listing)
manifest.webmanifest    app name, icons, colours for "Add to Home Screen"
sw.js                   service worker for offline use
_headers                Cloudflare Pages headers (incl. a content security policy)
icons/, og.png          app icons and the social-share image
```

No build step. Double-click `index.html` to use it straight from your computer, or run a local server
(needed to test offline mode and installing as an app):

```
python3 -m http.server 8080      # then open http://localhost:8080
node --test tests/*.test.mjs     # Node 22, nothing to install
```

## Test site

Every push to GitHub gets its own preview address on Cloudflare Pages. The `main` branch is at
`https://retire-timing.pages.dev` (the name depends on the Cloudflare project name) — use it as the test site before
adding the real domain. Pushes to any other branch (e.g. `test`) get `https://test.retire-timing.pages.dev`.

## Deploy on Cloudflare Pages

1. Create a new GitHub repo (e.g. `ngujral/retire-timing`) and push this folder to it.
2. Register `retiretiming.ca` in Cloudflare Registrar (or the domain you pick — see "Renaming" below).
3. Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, pick the repo.
   Framework **None**, build command **empty**, output directory **/**.
4. Under the project's **Custom domains**, add `retiretiming.ca` (and `www.retiretiming.ca`, redirected to the bare domain).
5. Optional: **Email → Email Routing** to forward `support@retiretiming.ca` (used on the privacy page) to your inbox.
6. Submit `https://retiretiming.ca/sitemap.xml` in Google Search Console.

## Updating figures

OAS amounts change every quarter; everything else once a year. Edit `js/params-2026.js` (or copy it to
`params-2027.js` and change the import in `index.html`), update `AS_OF`, run the tests, and bump `VERSION` in `sw.js`
so installed copies update.

To add a province: add its brackets and credits next to `ontario` in the parameter file, make `taxPerson()` in the
engine pick the province's table, enable it in the Province list in `index.html`, and add tests for it.

## Renaming

The name and domain appear in: `index.html` (title, meta/OG tags, JSON-LD, header, footer, the `BRAND` and `SITE`
constants), `privacy.html`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `og.png` and this README.
Search for `retiretiming` and `Retire Timing`.

## Disclaimer

General information only, not financial, tax or retirement advice. Estimates use the figures and assumptions shown.
