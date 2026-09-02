// Smoke test for shoot.cjs: renders the fixture, checks both PNGs exist with the expected
// widths, and checks the argument validation paths. Run: node tests/smoke.cjs
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = path.join(root, 'shoot.cjs');
const fixture = path.join(__dirname, 'fixtures', 'reservations-settings.html');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'great-design-smoke-'));
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + detail}`);
  if (!ok) failures++;
}
function pngWidth(file) { return fs.readFileSync(file).readUInt32BE(16); }
function run(args) { return spawnSync('node', [script, ...args], { encoding: 'utf8', cwd: root, timeout: 120000 }); }

const usage = run([]);
check('no args exits 2 with usage', usage.status === 2 && /usage/.test(usage.stderr), usage.stderr);

const badWidth = run([fixture, path.join(outDir, 'bad'), '1440,mobile']);
check('bad widths exit 2 before rendering', badWidth.status === 2 && !fs.existsSync(path.join(outDir, 'bad-1440.png')), badWidth.stderr);

const missing = run([path.join(outDir, 'nope.html'), path.join(outDir, 'missing')]);
check('missing file exits 2', missing.status === 2 && /file not found/.test(missing.stderr), missing.stderr);

const started = Date.now();
const render = run([fixture, path.join(outDir, 'shot'), '1440,390']);
const seconds = (Date.now() - started) / 1000;
check('render exits 0', render.status === 0, render.stderr);
check('prints a fonts line per width', (render.stdout.match(/^fonts: /gm) || []).length === 2, render.stdout);
const desktop = path.join(outDir, 'shot-1440.png');
const phone = path.join(outDir, 'shot-390.png');
check('desktop PNG is 2880 px wide', fs.existsSync(desktop) && pngWidth(desktop) === 2880, fs.existsSync(desktop) ? String(pngWidth(desktop)) : 'missing');
check('phone PNG is at least 780 px wide', fs.existsSync(phone) && pngWidth(phone) >= 780, fs.existsSync(phone) ? String(pngWidth(phone)) : 'missing');
check('two widths render in under 30 s', seconds < 30, `${seconds.toFixed(1)} s`);

const font = run([path.join(__dirname, 'fixtures', 'local-font.html'), path.join(outDir, 'font'), '1440']);
check('reports a locally resolved web font', /^fonts: ShootProbe$/m.test(font.stdout), font.stdout);

const tailStart = Date.now();
const tail = run([path.join(__dirname, 'fixtures', 'local-font.html'), path.join(outDir, 'tail'), '1440']);
check('exits promptly after the last screenshot', tail.status === 0 && (Date.now() - tailStart) / 1000 < 12, `${((Date.now() - tailStart) / 1000).toFixed(1)} s`);

(async () => {
  const reveal = run([path.join(__dirname, 'fixtures', 'reveal.html'), path.join(outDir, 'reveal'), '1440']);
  check('reveal fixture renders', reveal.status === 0, reveal.stderr);
  const pixel = await samplePixel(path.join(outDir, 'reveal-1440.png'), 100, 7100);
  check('scroll-triggered reveals are fully faded in at the bottom', pixel && pixel[1] === 255 && pixel[0] === 0, JSON.stringify(pixel));
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(failures ? `${failures} failure(s)` : 'all checks passed');
  process.exit(failures ? 1 : 0);
})();

// Reads one pixel of a PNG through Chromium, so the test needs no image library.
async function samplePixel(file, x, y) {
  const chromium = ['playwright', '@playwright/test', 'playwright-core'].map(pkg => {
    try { return require(require.resolve(pkg, { paths: [process.cwd(), root, require('node:child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()] })).chromium; } catch { return null; }
  }).find(Boolean);
  if (!chromium) return null;
  const browser = await chromium.launch({ chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + file);
    return await page.evaluate(([px, py]) => new Promise(resolve => {
      const img = document.querySelector('img');
      const read = () => { const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(img, px, py, 1, 1, 0, 0, 1, 1); resolve([...c.getContext('2d').getImageData(0, 0, 1, 1).data].slice(0, 3)); };
      img.complete ? read() : (img.onload = read);
    }), [x, y]);
  } finally { await browser.close(); }
}

