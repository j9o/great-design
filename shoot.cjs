#!/usr/bin/env node
// Full-page screenshots for the great-design critic loop.
//   node shoot.cjs <http(s) URL | host:port | HTML file path> <out-prefix> [widths]
// Default widths 1440,390. Writes <out-prefix>-<width>.png at 2x device scale and prints
// each path; stdout also carries one "fonts: ..." line per width. The PNG is as wide as the
// document's scroll width, so a phone PNG wider than 780 px means horizontal overflow.
// Per width: waits for `load` (not `networkidle`, which Google Fonts and analytics stall
// until the navigation timeout), then for web fonts with an 8 s cap; emulates
// prefers-reduced-motion (pages that honour it skip transitions); steps every scroll
// container to the bottom so scroll-triggered reveals fire, finishes any running
// animations, returns to the top and settles 500 ms before capture; warns on stderr when a
// PNG is taller than 8000 px. Playwright resolves from the cwd, then this directory,
// then `npm root -g`; within each location `playwright`, `@playwright/test`, `playwright-core`.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_WIDTHS = '1440,390';
const PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];
const FONT_WAIT_MS = 8000;
const SCROLL_WAIT_MS = 20000;
const TALL_PX = 8000;

function chromiumFrom(paths) {
  for (const pkg of PACKAGES) {
    try { return require(require.resolve(pkg, { paths })).chromium; } catch {}
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

function fail(message) { console.error('shoot.cjs: ' + message); process.exit(2); }

function toUrl(target) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
  if (/^[\w.-]+:\d+(\/|$)/.test(target)) return 'http://' + target;
  if (!fs.existsSync(target)) fail(`file not found: ${target}`);
  return pathToFileURL(path.resolve(target)).href;
}

function parseWidths(arg) {
  const widths = (arg || DEFAULT_WIDTHS).split(',').map(Number);
  if (widths.some(w => !Number.isInteger(w) || w < 320 || w > 4000)) fail('widths must be comma-separated integers between 320 and 4000');
  return widths;
}

// Resolves with a timer that never keeps the process alive after the work is done.
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms).unref()); }

async function waitForFonts(page) {
  const families = await Promise.race([
    page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
      return [...new Set(loaded)];
    }).catch(() => null),
    sleep(FONT_WAIT_MS).then(() => 'timeout'),
  ]);
  if (families === 'timeout') return console.log(`fonts: WARNING wait timed out at ${FONT_WAIT_MS / 1000} s; capture may show fallback fonts`);
  if (!families || families.length === 0) return console.log('fonts: none loaded (system fonts, or web fonts failed)');
  const printable = families.map(f => String(f).replace(/[^\x20-\x7e]/g, '').slice(0, 64));
  console.log('fonts: ' + printable.join(', '));
}

// Scrolls the document and every inner scroll container (app shells often scroll a <div>,
// not the body), with the height snapshotted once and a step cap so lazy-loading pages end.
async function fireScrollReveals(page) {
  await Promise.race([
    page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const scrollers = [document.scrollingElement, ...document.querySelectorAll('*')]
        .filter(el => el && el.scrollHeight > el.clientHeight + 50);
      for (const el of scrollers) {
        const max = el.scrollHeight;
        const step = Math.max(200, el.clientHeight / 2);
        for (let y = 0, n = 0; y < max && n < 60; y += step, n++) { el.scrollTop = y; await wait(60); }
        el.scrollTop = 0;
      }
      // Reveal transitions that ignore prefers-reduced-motion are otherwise caught mid-fade.
      document.getAnimations().forEach(a => { try { a.finish(); } catch {} });
    }).catch(() => {}),
    sleep(SCROLL_WAIT_MS),
  ]);
}

async function main() {
  const [,, target, outPrefix, widthsArg] = process.argv;
  if (!target || !outPrefix) fail(`usage: node shoot.cjs <url|host:port|file> <out-prefix> [${DEFAULT_WIDTHS}]`);
  const url = toUrl(target);
  const widths = parseWidths(widthsArg);
  const browser = await resolveChromium().launch({ chromiumSandbox: true });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      try {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(url, { waitUntil: 'load' });
        await waitForFonts(page);
        await fireScrollReveals(page);
        await page.waitForTimeout(500); // let the scroll back to the top settle before capture
        const outPath = `${outPrefix}-${width}.png`;
        await page.screenshot({ path: outPath, fullPage: true });
        const height = fs.readFileSync(outPath).readUInt32BE(20);
        if (height > TALL_PX) console.error(`shoot.cjs: ${outPath} is ${height} px tall; image readers downscale it, so shoot sections separately for detail work`);
        console.log(outPath);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
