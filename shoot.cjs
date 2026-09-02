#!/usr/bin/env node
// Full-page screenshots for the great-design critic loop.
//   node shoot.cjs <http(s) or file URL | host:port | HTML file path> <out-prefix> [widths]
// Default widths 1440,390. Writes <out-prefix>-<width>.png at 2x device scale and prints
// each path. stdout also carries one "fonts: ..." line per width: the families that loaded
// (at most 20, then "+N more"), "none loaded", or a WARNING when the wait timed out or the
// list could not be read. The PNG is as wide as the document's scroll width, so a phone PNG
// wider than 780 px means horizontal overflow.
// Per width: emulates prefers-reduced-motion before navigation (pages that honour it skip
// transitions) and makes IntersectionObserver reveals sticky (an element seen in view is
// never reported as leaving, so two-way reveal libraries stay revealed); waits for `load`
// (not `networkidle`, which dev servers and analytics keep from ever settling), then for
// web fonts with an 8 s cap; steps the document and every real scroll container towards
// the bottom (at most 60 steps each) so scroll-triggered reveals fire; scrolls every one
// back to the top; finishes finite running animations; settles 500 ms; captures. Warnings
// go to stderr: a scroll pass that hit its time cap (20 s, SHOOT_SCROLL_WAIT_MS overrides,
// floor 3 s) or its step cap, animations still running at capture, a capture taller than
// 6000 CSS px, and any blocked local subresource.
// A file target may load local files only from its own directory and below (real paths, so
// symlinks cannot reach outside, and no dot-prefixed names such as .env or .git); a served
// target may load none; network subresources are not restricted.
// Playwright resolves location by location (the cwd, this directory, then `npm root -g`),
// trying `playwright`, `@playwright/test`, `playwright-core` at each.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const DEFAULT_WIDTHS = '1440,390';
const PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];
const FONT_WAIT_MS = 8000;
const capOverride = Number(process.env.SHOOT_SCROLL_WAIT_MS);
const SCROLL_WAIT_MS = Number.isInteger(capOverride) && capOverride >= 3000 && capOverride <= 300000 ? capOverride : 20000;
const IN_PAGE_SCROLL_MS = SCROLL_WAIT_MS - 2000; // the page stops itself before the outer backstop fires
const MAX_STEPS_PER_SCROLLER = 60;
const SETTLE_MS = 500;
const TALL_CSS_PX = 6000;
const MAX_WIDTHS = 6;
const MAX_FONT_FAMILIES = 20;

class UsageError extends Error {}
function fail(message) { throw new UsageError(message); }

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
  return fail(`no playwright package found from ${tried.join(', ')} (npm i -g playwright && npx playwright install chromium)`);
}

function toUrl(target) {
  if (/^(https?|file):\/\//i.test(target)) return new URL(target).href;
  if (/^[\w.-]+:\d+(\/|$)/.test(target)) return 'http://' + target;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`file not found: ${target}`);
  return pathToFileURL(path.resolve(target)).href;
}

// Directories a local target may embed files from: where the page sits and, if the page is a
// symlink, where it really is. Compared on real paths so a symlink cannot reach outside.
function allowedDirsFor(url) {
  if (!url.startsWith('file:')) return [];
  const linkPath = fileURLToPath(url);
  const dirs = new Set([fs.realpathSync(path.dirname(linkPath)), path.dirname(fs.realpathSync(linkPath))]);
  return [...dirs].map(dir => dir.endsWith(path.sep) ? dir : dir + path.sep);
}

function fileAllowed(u, allowedDirs) {
  try {
    const real = fs.realpathSync(fileURLToPath(u));
    return allowedDirs.some(dir => real.startsWith(dir) && !path.relative(dir, real).split(path.sep).some(seg => seg.startsWith('.')));
  } catch { return false; }
}

function parseWidths(arg) {
  const widths = [...new Set((arg || DEFAULT_WIDTHS).split(',').map(Number))];
  if (widths.length > MAX_WIDTHS) fail(`widths must be at most ${MAX_WIDTHS} values`);
  if (widths.some(w => !Number.isInteger(w) || w < 320 || w > 4000)) fail('widths must be comma-separated integers between 320 and 4000');
  return widths;
}

// A timer that never keeps the process alive after the work is done.
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms).unref()); }
// The promise's value, or `fallback` if it takes longer than ms.
function withTimeout(promise, ms, fallback) { return Promise.race([promise, sleep(ms).then(() => fallback)]); }

// Installed before any page script runs: an element that has been seen intersecting is never
// reported as leaving, so reveal libraries that toggle both ways keep their revealed state.
const STICKY_REVEALS = `(() => {
  const Original = window.IntersectionObserver;
  if (!Original) return;
  window.IntersectionObserver = class extends Original {
    constructor(callback, options) {
      const seen = new WeakSet();
      super((entries, observer) => {
        const kept = entries.filter(e => { if (e.isIntersecting) { seen.add(e.target); return true; } return !seen.has(e.target); });
        if (kept.length) callback(kept, observer);
      }, options);
    }
  };
})();`;

const TIMED_OUT = Symbol('timed out');

async function reportFonts(page) {
  const families = await withTimeout(
    page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
      return [...new Set(loaded)];
    }).catch(() => null),
    FONT_WAIT_MS, TIMED_OUT);
  if (families === TIMED_OUT) { console.log(`fonts: WARNING wait timed out at ${FONT_WAIT_MS / 1000} s; capture may show fallback fonts`); return; }
  if (families === null) { console.log('fonts: WARNING could not read the font list'); return; }
  if (families.length === 0) { console.log('fonts: none loaded (system fonts, or web fonts failed)'); return; }
  const printable = families.slice(0, MAX_FONT_FAMILIES).map(f => String(f).replace(/[^\x20-\x7e]/g, '').slice(0, 64));
  const more = families.length > MAX_FONT_FAMILIES ? ` +${families.length - MAX_FONT_FAMILIES} more` : '';
  console.log('fonts: ' + printable.join(', ') + more);
}

// Scrolls the document and every element that really scrolls (app shells scroll a <div>, not
// the body). The deadline lives inside the page so that when it trips the loop stops and every
// scroller is put back to the top before the capture; the outer timeout is only a backstop for
// a page whose scripts cannot run at all, and then nothing is put back.
async function fireScrollReveals(page) {
  const stopped = await withTimeout(
    page.evaluate(async ([budgetMs, maxSteps]) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const deadline = Date.now() + budgetMs;
      const scrolls = el => el === document.scrollingElement || /^(auto|scroll)$/.test(getComputedStyle(el).overflowY);
      const scrollers = [...new Set([document.scrollingElement, ...document.querySelectorAll('*')])]
        .filter(el => el && el.scrollHeight > el.clientHeight + 50 && scrolls(el));
      let reason = null;
      try {
        for (const el of scrollers) {
          const max = el.scrollHeight;
          const step = Math.max(200, el.clientHeight / 2);
          let y = 0, n = 0;
          for (; y < max && n < maxSteps; y += step, n++) {
            if (Date.now() > deadline) return (reason = 'time');
            el.scrollTop = y;
            await wait(60);
          }
          if (y < max) reason = reason || 'steps';
        }
      } finally {
        scrollers.forEach(el => { el.scrollTop = 0; });
        document.getAnimations().forEach(a => { try { a.finish(); } catch {} });
      }
      return reason;
    }, [IN_PAGE_SCROLL_MS, MAX_STEPS_PER_SCROLLER]).catch(() => null),
    SCROLL_WAIT_MS, 'time');
  if (stopped === 'time') console.error(`shoot.cjs: scroll pass hit its ${SCROLL_WAIT_MS / 1000} s cap; some reveals may not have fired`);
  if (stopped === 'steps') console.error(`shoot.cjs: a scroll container was longer than ${MAX_STEPS_PER_SCROLLER} steps; reveals near its end may not have fired`);
}

async function settleAnimations(page) {
  await page.waitForTimeout(SETTLE_MS);
  const running = await page.evaluate(() => {
    const active = document.getAnimations().filter(a => a.playState === 'running');
    active.forEach(a => { try { a.finish(); } catch {} });
    return active.length;
  }).catch(() => 0);
  if (running) console.error(`shoot.cjs: ${running} animation(s) were still running at capture and were finished; reveal state may be inconsistent`);
}

async function capture(browser, url, width, outPrefix) {
  const allowedDirs = allowedDirsFor(url);
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  try {
    const blocked = new Set();
    // Local files may be embedded only from the target's own directory and below; network is untouched.
    await context.route(u => u.protocol === 'file:' && !fileAllowed(u, allowedDirs),
      route => { blocked.add(route.request().url()); route.abort(); });
    await context.addInitScript(STICKY_REVEALS);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await reportFonts(page);
    await fireScrollReveals(page);
    await settleAnimations(page);
    const outPath = `${outPrefix}-${width}.png`;
    const png = await page.screenshot({ path: outPath, fullPage: true });
    const cssHeight = png.readUInt32BE(20) / 2; // PNG IHDR: width at byte 16, height at byte 20; 2x scale
    if (cssHeight > TALL_CSS_PX) console.error(`shoot.cjs: ${outPath} is ${Math.round(cssHeight)} CSS px tall; image readers downscale it, so shoot sections separately for detail work`);
    if (blocked.size) console.error(`shoot.cjs: blocked ${blocked.size} local subresource(s) outside ${allowedDirs[0] || 'the page'} (e.g. ${[...blocked][0]}); the capture may be missing styles or images`);
    console.log(outPath);
  } finally {
    await context.close();
  }
}

async function main() {
  const [,, target, outPrefix, widthsArg] = process.argv;
  if (!target || !outPrefix) fail(`usage: node shoot.cjs <url|host:port|file> <out-prefix> [${DEFAULT_WIDTHS}]`);
  const url = toUrl(target);
  const widths = parseWidths(widthsArg);
  const browser = await resolveChromium().launch({ chromiumSandbox: true });
  try {
    for (const width of widths) await capture(browser, url, width, outPrefix);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    if (error instanceof UsageError) { console.error('shoot.cjs: ' + error.message); process.exit(2); }
    console.error(error);
    process.exit(1);
  });
}
module.exports = { resolveChromium };
