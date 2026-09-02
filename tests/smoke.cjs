// Smoke test for shoot.cjs. Run: npm test (from the repo root). No dependencies beyond the
// Playwright that shoot.cjs itself resolves; PNG sizes come from the IHDR header and pixels
// are read through Chromium.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveChromium } = require('../shoot.cjs');

const root = path.join(__dirname, '..');
const script = path.join(root, 'shoot.cjs');
const fixture = name => path.join(__dirname, 'fixtures', name);
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'great-design-smoke-'));
const out = name => path.join(outDir, name);
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + detail}`);
  if (!ok) failures++;
}
// PNG IHDR: width at byte 16, height at byte 20.
function pngWidth(file) { return fs.existsSync(file) ? fs.readFileSync(file).readUInt32BE(16) : 0; }

// Runs shoot.cjs and timestamps the last printed .png line, so the exit tail can be asserted.
function run(args, options = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', lastPngAt = null;
    const child = spawn(process.execPath, [options.script || script, ...args], { cwd: options.cwd || root, env: { ...process.env, ...options.env } });
    child.stdout.on('data', d => { stdout += d; if (/\.png\s*$/m.test(String(d))) lastPngAt = Date.now(); });
    child.stderr.on('data', d => { stderr += d; });
    const killer = setTimeout(() => child.kill(), 120000);
    child.on('close', status => { clearTimeout(killer); resolve({ status, stdout, stderr, tailMs: lastPngAt === null ? null : Date.now() - lastPngAt }); });
  });
}

async function samplePixels(file, points) {
  const browser = await resolveChromium().launch({ chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(file).href);
    return await page.evaluate(pts => pts.map(([x, y]) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(document.querySelector('img'), x, y, 1, 1, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }), points);
  } finally { await browser.close(); }
}
const isGreen = ([r, g, b]) => r === 0 && g === 255 && b === 0;
const isRed = ([r, g, b]) => r === 255 && g === 0 && b === 0;

function serve(file) {
  return new Promise(resolve => {
    const server = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); fs.createReadStream(file).pipe(res); });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
function freePort() {
  return new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

async function main() {
  const usage = await run([]);
  check('no args exits 2 with usage', usage.status === 2 && /usage/.test(usage.stderr), usage.stderr);

  for (const bad of ['319', '4001', '1440.5', '1440,', '-390', '1440,mobile', '1440,1440,1440,1440,1440,1440,1440']) {
    const r = await run([fixture('reservations-settings.html'), out('bad'), bad]);
    check(`widths "${bad}" rejected before rendering`, r.status === 2 && /widths must be/.test(r.stderr) && !fs.existsSync(out('bad-1440.png')), r.stderr);
  }

  const missing = await run([out('nope.html'), out('missing')]);
  check('missing file exits 2 with no PNG', missing.status === 2 && /file not found/.test(missing.stderr) && !fs.existsSync(out('missing-1440.png')), missing.stderr);

  const main = await run([fixture('reservations-settings.html'), out('shot'), '1440,390']);
  check('fixture renders both widths with a clean stderr', main.status === 0 && main.stderr === '', main.stderr || String(main.status));
  check('prints one fonts line per width', (main.stdout.match(/^fonts: /gm) || []).length === 2, main.stdout);
  check('desktop PNG is exactly 2880 px wide', pngWidth(out('shot-1440.png')) === 2880, String(pngWidth(out('shot-1440.png'))));
  check('overflowing phone page yields a PNG wider than 780 px', pngWidth(out('shot-390.png')) > 780, String(pngWidth(out('shot-390.png'))));

  const font = await run([fixture('local-font.html'), out('font'), '1440,390']);
  check('reports a locally resolved web font', /^fonts: ShootProbe$/m.test(font.stdout), font.stdout);
  check('non-overflowing phone page yields a 780 px PNG', pngWidth(out('font-390.png')) === 780, String(pngWidth(out('font-390.png'))));
  check('exits within 1.5 s of the last screenshot', font.status === 0 && font.tailMs !== null && font.tailMs < 1500, `${font.tailMs} ms`);

  const reveal = await run([fixture('reveal.html'), out('reveal'), '1440']);
  check('reveal fixture renders and reports no web fonts', reveal.status === 0 && /^fonts: none loaded/m.test(reveal.stdout), reveal.stdout + reveal.stderr);
  const sections = await samplePixels(out('reveal-1440.png'), [[100, 900], [100, 2700], [100, 4500], [100, 6300]]);
  check('scroll-triggered reveals are fully faded in on every section', sections.every(isGreen), JSON.stringify(sections));

  const inner = await run([fixture('inner-scroll.html'), out('inner'), '1440']);
  const [innerPixel] = await samplePixels(out('inner-1440.png'), [[100, 100]]);
  check('an inner scroll container is scrolled so its reveal fires', inner.status === 0 && isGreen(innerPixel), JSON.stringify(innerPixel));

  const tall = await run([fixture('tall.html'), out('tall'), '1440']);
  check('a capture taller than 6000 CSS px warns on stderr', tall.status === 0 && /CSS px tall/.test(tall.stderr), tall.stderr);

  const capped = await run([fixture('many-scrollers.html'), out('capped'), '1440'], { env: { SHOOT_SCROLL_WAIT_MS: '3000' } });
  check('a scroll pass that hits its cap warns and still captures', capped.status === 0 && /scroll pass hit its 3 s cap/.test(capped.stderr) && fs.existsSync(out('capped-1440.png')), capped.stderr);

  const sandboxDir = fs.mkdtempSync(path.join(outDir, 'iframe-'));
  fs.writeFileSync(path.join(sandboxDir, 'red.html'), '<body style="margin:0;background:#ff0000"></body>');
  fs.writeFileSync(path.join(outDir, 'red.html'), '<body style="margin:0;background:#ff0000"></body>');
  const iframe = (src) => `<body style="margin:0"><iframe src="${src}" style="border:0;width:400px;height:400px"></iframe></body>`;
  fs.writeFileSync(path.join(sandboxDir, 'inside.html'), iframe('./red.html'));
  fs.writeFileSync(path.join(sandboxDir, 'outside.html'), iframe(pathToFileURL(path.join(outDir, 'red.html')).href));
  await run([path.join(sandboxDir, 'inside.html'), out('inside'), '1440']);
  await run([path.join(sandboxDir, 'outside.html'), out('outside'), '1440']);
  const [insidePixel] = await samplePixels(out('inside-1440.png'), [[100, 100]]);
  const [outsidePixel] = await samplePixels(out('outside-1440.png'), [[100, 100]]);
  check('a local page may embed files from its own directory', isRed(insidePixel), JSON.stringify(insidePixel));
  check('a local page may not embed files from outside its directory', !isRed(outsidePixel), JSON.stringify(outsidePixel));

  const { server, port } = await serve(fixture('local-font.html'));
  try {
    const shorthand = await run([`127.0.0.1:${port}`, out('host'), '1440']);
    const withPath = await run([`localhost:${port}/`, out('hostpath'), '1440']);
    check('host:port shorthand reaches a dev server', shorthand.status === 0 && withPath.status === 0 && /^fonts: ShootProbe$/m.test(shorthand.stdout), shorthand.stderr + withPath.stderr);
  } finally { server.close(); }
  const closedPort = await freePort();
  const started = Date.now();
  const refused = await run([`127.0.0.1:${closedPort}`, out('refused'), '1440']);
  check('a refused connection exits 1 quickly with no PNG', refused.status === 1 && /ERR_CONNECTION_REFUSED/.test(refused.stderr) && !fs.existsSync(out('refused-1440.png')) && Date.now() - started < 10000, refused.stderr);

  const emptyPath = fs.mkdtempSync(path.join(outDir, 'nopath-'));
  const isolated = fs.mkdtempSync(path.join(outDir, 'noplaywright-'));
  fs.copyFileSync(script, path.join(isolated, 'shoot.cjs'));
  const none = await run([fixture('local-font.html'), out('none'), '1440'], { script: path.join(isolated, 'shoot.cjs'), cwd: isolated, env: { PATH: emptyPath } });
  check('missing Playwright exits 2 with the install hint', none.status === 2 && /no playwright package found/.test(none.stderr), none.stderr);
}

main()
  .catch(error => { console.error(error); failures++; })
  .finally(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
    console.log(failures ? `${failures} failure(s)` : 'all checks passed');
    process.exit(failures ? 1 : 0);
  });
