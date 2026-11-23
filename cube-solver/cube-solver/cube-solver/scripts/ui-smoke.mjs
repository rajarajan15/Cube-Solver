// Headless-browser UI check (puppeteer-core + an installed Chrome/Edge).
//   npm run build && npx vite preview --port 4173      (in another terminal)
//   node scripts/ui-smoke.mjs [url] [screenshot dir]
import fs from 'fs';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:4173/';
const outDir = process.argv[3] || path.join(os.tmpdir(), 'cube-solver-shots');
fs.mkdirSync(outDir, { recursive: true });
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
if (!executablePath) { console.log('No Chrome/Edge found; set CHROME_PATH.'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (name, full = true) => page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: full });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (txt) => {
  const h = await page.evaluateHandle((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t)), txt);
  if (!h.asElement()) throw new Error('button not found: ' + txt);
  await h.asElement().click();
};
const waitText = (t, timeout = 60000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const check = (label, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + label); if (!ok) errors.push('check failed: ' + label); };

await page.goto(url, { waitUntil: 'networkidle0' });
await shot('01-editor');

for (const n of [2, 3, 4]) {
  await clickText(`${n}×${n}`);
  await clickText('Random');
  await sleep(150);
  check(`${n}x${n} random cube is valid`, await page.evaluate(() => document.body.innerText.includes('valid and solvable')));
  await clickText('Solve my cube');
  await waitText('Step-by-step');
  check(`${n}x${n} solution shown`, true);
  await shot(`02-solution-${n}`);
  await clickText('Fast');
  await page.evaluate(() => document.querySelector('button[aria-label="End"]').click());
  await sleep(300);
  check(`${n}x${n} fast list ends solved`, (await page.evaluate(() => document.querySelector('.now')?.innerText || '')).includes('solved'));
  await clickText('Solve it yourself');
  await waitText('Help me with the next step');
  await sleep(400);
  await shot(`03-arena-${n}`);
  await clickText('💡 Help me');
  await waitText('formula', 60000);
  await page.waitForSelector('.helpcard .tok', { timeout: 60000 });
  await shot(`04-hint-${n}`);
  await clickText('▶ Show me');
  await page.waitForFunction(() => document.body.innerText.includes('Formula done'), { timeout: 60000 });
  check(`${n}x${n} "Show me" completes the formula`, true);
  await clickText('Next formula');
  await page.waitForSelector('.helpcard .tok', { timeout: 60000 });
  // keyboard: pick face R and turn it, then undo
  const before = await page.evaluate(() => document.querySelector('.arena-stats b').innerText);
  await page.keyboard.press('r');
  await page.keyboard.press('ArrowRight');
  await sleep(400);
  const after = await page.evaluate(() => document.querySelector('.arena-stats b').innerText);
  check(`${n}x${n} arrow key turns the cube (${before} -> ${after} moves)`, Number(after) === Number(before) + 1);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await sleep(300);
  check(`${n}x${n} Ctrl+Z undoes`, (await page.evaluate(() => document.querySelector('.arena-stats b').innerText)) === before);
  await shot(`05-arena-after-${n}`);
  await clickText('← Edit cube');
  await sleep(300);
}

// themes
await page.evaluate(() => window.scrollTo(0, 0));
for (const t of ['Daylight', 'Neon', 'Paper']) {
  await page.evaluate(() => document.querySelector('.theme-btn').click());
  await sleep(150);
  await clickText(t);
  await sleep(250);
  await shot(`06-theme-${t.toLowerCase()}`, false);
}
console.log('screenshots in', outDir);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
