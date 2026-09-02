// Smoke test for shoot.cjs. Run: npm test (from the repo root). No dependencies beyond the
// Playwright that shoot.cjs itself resolves; PNG sizes come from the IHDR header and pixels
// are read through one shared Chromium.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
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

// One Chromium for every pixel read.
const sampler = {
  browser: null,
  async pixels(file, points) {
    this.browser = this.browser || await resolveChromium().launch({ chromiumSandbox: true });
    const page = await this.browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      return await page.evaluate(pts => pts.map(([x, y]) => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(document.querySelector('img'), x, y, 1, 1, 0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      }), points);
    } finally { await page.close(); }
  },
  async close() { if (this.browser) await this.browser.close(); },
};
const isGreen = ([r, g, b]) => r === 0 && g === 255 && b === 0;
const isRed = ([r, g, b]) => r === 255 && g === 0 && b === 0;

function serve(file) {
  return new Promise(resolve => {
    const server = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); fs.createReadStream(file).pipe(res); });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const usage = await run([]);
  check('no args exits 2 with usage', usage.status === 2 && /usage/.test(usage.stderr), usage.stderr);

  for (const bad of ['319', '4001', '1440.5', '1440,', '-390', '1440,mobile', '1440,390,768,1024,1280,1920,2560']) {
    const r = await run([fixture('reservations-settings.html'), out('bad'), bad]);
    check(`widths "${bad}" rejected before rendering`, r.status === 2 && /widths must be/.test(r.stderr) && !fs.existsSync(out('bad-1440.png')), r.stderr);
  }

  const missing = await run([out('nope.html'), out('missing')]);
  check('missing file exits 2 with no PNG', missing.status === 2 && /file not found/.test(missing.stderr) && !fs.existsSync(out('missing-1440.png')), missing.stderr);

  const both = await run([fixture('reservations-settings.html'), out('shot'), '1440,390']);
  check('fixture renders both widths with a clean stderr', both.status === 0 && both.stderr === '', both.stderr || String(both.status));
  check('prints one fonts line per width', (both.stdout.match(/^fonts: /gm) || []).length === 2, both.stdout);
  const desktopWidth = pngWidth(out('shot-1440.png'));
  check('desktop PNG is exactly 2880 px wide', desktopWidth === 2880, String(desktopWidth));
  const phoneWidth = pngWidth(out('shot-390.png'));
  check('overflowing phone page yields a PNG wider than 780 px', phoneWidth > 780, String(phoneWidth));

  const defaults = await run([fixture('local-font.html'), out('default')]);
  check('default widths render 1440 and 390', defaults.status === 0 && fs.existsSync(out('default-1440.png')) && fs.existsSync(out('default-390.png')), defaults.stderr);

  const font = await run([fixture('local-font.html'), out('font'), '1440,390']);
  check('reports a locally resolved web font', /^fonts: ShootProbe$/m.test(font.stdout), font.stdout);
  const fontPhoneWidth = pngWidth(out('font-390.png'));
  check('non-overflowing phone page yields a 780 px PNG', fontPhoneWidth === 780, String(fontPhoneWidth));
  check('exits within 1.5 s of the last screenshot', font.status === 0 && font.tailMs !== null && font.tailMs < 1500, `${font.tailMs} ms`);

  const sectionCentres = [[100, 900], [100, 2700], [100, 4500], [100, 6300]];
  const reveal = await run([fixture('reveal.html'), out('reveal'), '1440']);
  check('reveal fixture renders and reports no web fonts', reveal.status === 0 && /^fonts: none loaded/m.test(reveal.stdout), reveal.stdout + reveal.stderr);
  const oneWay = await sampler.pixels(out('reveal-1440.png'), sectionCentres);
  check('one-way scroll reveals are fully faded in on every section', oneWay.every(isGreen), JSON.stringify(oneWay));

  const toggle = await run([fixture('reveal-toggle.html'), out('toggle'), '1440']);
  const twoWay = await sampler.pixels(out('toggle-1440.png'), sectionCentres);
  check('two-way (toggle) reveals stay revealed on every section', toggle.status === 0 && twoWay.every(isGreen), JSON.stringify(twoWay) + toggle.stderr);

  const inner = await run([fixture('inner-scroll.html'), out('inner'), '1440']);
  const [innerTop] = await sampler.pixels(out('inner-1440.png'), [[100, 100]]);
  check('an inner scroll container is scrolled so its reveal fires, then put back to the top', inner.status === 0 && isGreen(innerTop), JSON.stringify(innerTop));

  const tall = await run([fixture('tall.html'), out('tall'), '1440']);
  check('a capture taller than 6000 CSS px warns on stderr', tall.status === 0 && /CSS px tall/.test(tall.stderr), tall.stderr);

  const capped = await run([fixture('many-scrollers.html'), out('capped'), '1440'], { env: { SHOOT_SCROLL_WAIT_MS: '3000' } });
  check('a scroll pass that hits its cap warns and still captures', capped.status === 0 && /scroll pass hit its 3 s cap/.test(capped.stderr) && fs.existsSync(out('capped-1440.png')), capped.stderr);
  const cappedTops = await sampler.pixels(out('capped-1440.png'), [0, 1, 2, 3, 4, 5].map(i => [200, 300 + 600 * i]));
  check('a tripped scroll pass puts every container back before the capture', cappedTops.every(isGreen), JSON.stringify(cappedTops));

  const insideDir = fs.mkdtempSync(path.join(outDir, 'iframe-'));
  const red = '<body style="margin:0;background:#ff0000"></body>';
  fs.writeFileSync(path.join(insideDir, 'red.html'), red);
  fs.writeFileSync(out('red.html'), red);
  const framing = src => `<body style="margin:0;background:#0000ff"><iframe src="${src}" style="border:0;width:400px;height:400px"></iframe></body>`;
  fs.writeFileSync(path.join(insideDir, 'inside.html'), framing('./red.html'));
  fs.writeFileSync(path.join(insideDir, 'outside.html'), framing(pathToFileURL(out('red.html')).href));
  fs.symlinkSync(out('red.html'), path.join(insideDir, 'link.html'));
  fs.writeFileSync(path.join(insideDir, '.secret.html'), red);
  fs.writeFileSync(path.join(insideDir, 'symlink.html'), framing('./link.html'));
  fs.writeFileSync(path.join(insideDir, 'dotfile.html'), framing('./.secret.html'));
  const inside = await run([path.join(insideDir, 'inside.html'), out('inside'), '1440']);
  const [insidePixel] = await sampler.pixels(out('inside-1440.png'), [[100, 100]]);
  check('a local page may embed files from its own directory', inside.status === 0 && inside.stderr === '' && isRed(insidePixel), JSON.stringify(insidePixel) + inside.stderr);
  for (const [name, why] of [['outside', 'from outside its directory'], ['symlink', 'through a symlink that leaves its directory'], ['dotfile', 'from a dot-prefixed name']]) {
    const r = await run([path.join(insideDir, `${name}.html`), out(name), '1440']);
    const [pixel] = await sampler.pixels(out(`${name}-1440.png`), [[100, 100]]);
    check(`a local page may not embed files ${why}, and the block is reported`, r.status === 0 && /blocked 1 local subresource/.test(r.stderr) && !isRed(pixel), JSON.stringify(pixel) + r.stderr);
  }

  const { server, port } = await serve(fixture('local-font.html'));
  const shorthand = await run([`127.0.0.1:${port}`, out('host'), '1440']);
  const withPath = await run([`localhost:${port}/`, out('hostpath'), '1440']);
  check('host:port shorthand reaches a dev server', shorthand.status === 0 && withPath.status === 0 && /^fonts: ShootProbe$/m.test(shorthand.stdout), shorthand.stderr + withPath.stderr);
  await new Promise(resolve => server.close(resolve));
  const started = Date.now();
  const refused = await run([`127.0.0.1:${port}`, out('refused'), '1440']);
  check('a refused connection exits 1 quickly with no PNG', refused.status === 1 && /ERR_CONNECTION_REFUSED/.test(refused.stderr) && !fs.existsSync(out('refused-1440.png')) && Date.now() - started < 10000, refused.stderr);

  const emptyPath = fs.mkdtempSync(path.join(outDir, 'nopath-'));
  const isolated = fs.mkdtempSync(path.join(outDir, 'noplaywright-'));
  fs.copyFileSync(script, path.join(isolated, 'shoot.cjs'));
  const none = await run([fixture('local-font.html'), out('none'), '1440'], { script: path.join(isolated, 'shoot.cjs'), cwd: isolated, env: { PATH: emptyPath } });
  check('missing Playwright exits 2 with the install hint', none.status === 2 && /no playwright package found/.test(none.stderr), none.stderr);
}

main()
  .catch(error => { console.error(error); failures++; })
  .finally(async () => {
    await sampler.close();
    fs.rmSync(outDir, { recursive: true, force: true });
    console.log(failures ? `${failures} failure(s)` : 'all checks passed');
    process.exit(failures ? 1 : 0);
  });
