#!/usr/bin/env node
// Full-page screenshots for the great-design critic loop.
//   node shoot.cjs <http(s) URL | host:port | HTML file path> <out-prefix> [widths]
// Default widths 1440,390. Writes <out-prefix>-<width>.png at 2x device scale and prints
// each path; stdout also carries one "fonts: ..." line per width (the families that loaded,
// or a WARNING when the wait timed out or the list could not be read). The PNG is as wide
// as the document's scroll width, so a phone PNG wider than 780 px means horizontal overflow.
// Per width: emulates prefers-reduced-motion before navigation (pages that honour it skip
// transitions); waits for `load` (not `networkidle`, which dev servers and analytics keep
// from ever settling), then for web fonts with an 8 s cap; steps the document and every
// real scroll container to the bottom so scroll-triggered reveals fire, restores every
// scroll position, finishes any running animations, settles 500 ms, then captures. The scroll
// pass is capped at 20 s (SHOOT_SCROLL_WAIT_MS overrides) and warns on stderr if the cap
// trips; a capture taller than 6000 CSS px also warns, since image readers downscale it.
// A file target may load subresources only from its own directory and below.
// Playwright resolves location by location (the cwd, this directory, then `npm root -g`),
// trying `playwright`, `@playwright/test`, `playwright-core` at each.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_WIDTHS = '1440,390';
const PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];
const FONT_WAIT_MS = 8000;
const SCROLL_WAIT_MS = Number(process.env.SHOOT_SCROLL_WAIT_MS) || 20000;
const SETTLE_MS = 500;
const TALL_CSS_PX = 6000;
const MAX_WIDTHS = 6;
const MAX_FONT_FAMILIES = 20;

function fail(message) { console.error('shoot.cjs: ' + message); process.exit(2); }

function chromiumFrom(paths) {
  for (const location of paths) {
    for (const pkg of PACKAGES) {
      try { return require(require.resolve(pkg, { paths: [location] })).chromium; } catch {}
    }
  }
  return null;
}

function resolveChromium() {
  const tried = [process.cwd(), __dirname];
  const local = chromiumFrom(tried);
  if (local) return local;
  try {
    const globalRoot = require('node:child_process')
      .execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
    tried.push(globalRoot);
    const global = chromiumFrom([globalRoot]);
    if (global) return global;
  } catch {}
  fail(`no playwright package found from ${tried.join(', ')} (npm i -g playwright && npx playwright install chromium)`);
}

function toUrl(target) {
  if (/^(https?|file):\/\//i.test(target)) return target;
  if (/^[\w.-]+:\d+(\/|$)/.test(target)) return 'http://' + target;
  if (!fs.existsSync(target)) fail(`file not found: ${target}`);
  return pathToFileURL(path.resolve(target)).href;
}

function parseWidths(arg) {
  const widths = (arg || DEFAULT_WIDTHS).split(',').map(Number);
  if (widths.length > MAX_WIDTHS) fail(`widths must be at most ${MAX_WIDTHS} values`);
  if (widths.some(w => !Number.isInteger(w) || w < 320 || w > 4000)) fail('widths must be comma-separated integers between 320 and 4000');
  return widths;
}

// A timer that never keeps the process alive after the work is done.
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms).unref()); }

const TIMED_OUT = Symbol('timed out');

async function reportFonts(page) {
  const families = await Promise.race([
    page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
      return [...new Set(loaded)];
    }).catch(() => null),
    sleep(FONT_WAIT_MS).then(() => TIMED_OUT),
  ]);
  if (families === TIMED_OUT) { console.log(`fonts: WARNING wait timed out at ${FONT_WAIT_MS / 1000} s; capture may show fallback fonts`); return; }
  if (families === null) { console.log('fonts: WARNING could not read the font list'); return; }
  if (families.length === 0) { console.log('fonts: none loaded (system fonts, or web fonts failed)'); return; }
  const printable = families.slice(0, MAX_FONT_FAMILIES).map(f => String(f).replace(/[^\x20-\x7e]/g, '').slice(0, 64));
  const more = families.length > MAX_FONT_FAMILIES ? ` +${families.length - MAX_FONT_FAMILIES} more` : '';
  console.log('fonts: ' + printable.join(', ') + more);
}

// Scrolls the document and every element that really scrolls (app shells scroll a <div>, not
// the body). The deadline lives inside the page so that when it trips the loop stops, every
// scroll position is restored and animations are finished before the capture.
async function fireScrollReveals(page) {
  const result = await Promise.race([
    page.evaluate(async (budgetMs) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const deadline = Date.now() + budgetMs;
      const scrolls = el => el === document.scrollingElement || /^(auto|scroll)$/.test(getComputedStyle(el).overflowY);
      const scrollers = [...new Set([document.scrollingElement, ...document.querySelectorAll('*')])]
        .filter(el => el && el.scrollHeight > el.clientHeight + 50 && scrolls(el));
      let tripped = false;
      try {
        for (const el of scrollers) {
          const max = el.scrollHeight;
          const step = Math.max(200, el.clientHeight / 2);
          for (let y = 0, n = 0; y < max && n < 60; y += step, n++) {
            if (Date.now() > deadline) { tripped = true; return { tripped }; }
            el.scrollTop = y;
            await wait(60);
          }
        }
      } finally {
        scrollers.forEach(el => { el.scrollTop = 0; });
        // Reveal transitions that ignore prefers-reduced-motion are otherwise caught mid-fade.
        document.getAnimations().forEach(a => { try { a.finish(); } catch {} });
      }
      return { tripped };
    }, Math.max(1000, SCROLL_WAIT_MS - 2000)).catch(() => ({ tripped: false })),
    sleep(SCROLL_WAIT_MS).then(() => ({ tripped: true })),
  ]);
  if (result.tripped) console.error(`shoot.cjs: scroll pass hit its ${SCROLL_WAIT_MS / 1000} s cap; some reveals may not have fired`);
}

async function main() {
  const [,, target, outPrefix, widthsArg] = process.argv;
  if (!target || !outPrefix) fail(`usage: node shoot.cjs <url|host:port|file> <out-prefix> [${DEFAULT_WIDTHS}]`);
  const url = toUrl(target);
  const widths = parseWidths(widthsArg);
  const allowedFileRoot = url.startsWith('file:') ? url.slice(0, url.lastIndexOf('/') + 1) : null;
  const browser = await resolveChromium().launch({ chromiumSandbox: true });
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      try {
        // A local page may embed local files only from its own directory and below.
        await context.route(u => u.protocol === 'file:' && !(allowedFileRoot && u.href.startsWith(allowedFileRoot)), route => route.abort());
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await reportFonts(page);
        await fireScrollReveals(page);
        await page.waitForTimeout(SETTLE_MS);
        const outPath = `${outPrefix}-${width}.png`;
        const png = await page.screenshot({ path: outPath, fullPage: true });
        const cssHeight = png.readUInt32BE(20) / 2; // PNG IHDR: width at byte 16, height at byte 20; 2x scale
        if (cssHeight > TALL_CSS_PX) console.error(`shoot.cjs: ${outPath} is ${cssHeight} CSS px tall; image readers downscale it, so fine detail will not reach a critic`);
        console.log(outPath);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { resolveChromium };
