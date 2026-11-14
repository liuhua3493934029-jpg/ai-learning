/* Run: CHROMIUM_PATH=/path/to/chromium node tests/weft-smoke.cjs */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const screenshots = path.join(__dirname, 'screenshots');

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

(async () => {
  fs.mkdirSync(screenshots, {recursive: true});
  const names = ['index.html', 'space.css', 'space.js', 'weft.css', 'weft.js'];
  const files = Object.fromEntries(names.map(name => ['/' + name, name]));
  files['/'] = 'index.html';
  const server = http.createServer((request, response) => {
    const file = files[new URL(request.url, 'http://localhost').pathname];
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    response.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
    const page = await context.newPage();
    const pageErrors = [], consoleErrors = [], missing = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) missing.push(response.status() + ' ' + response.url()); });
    await page.addInitScript(() => {
      window.rafRequests = 0;
      const original = window.requestAnimationFrame;
      window.requestAnimationFrame = function(callback) {
        window.rafRequests++;
        return original.call(window, callback);
      };
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    assert.equal(await page.locator('[data-theme-choice]').count(), 3);
    assert.equal(await page.locator('#pct').textContent(), '30%');

    // Theme activation is persistent and isolates the cinematic theme completely.
    await page.locator('[data-theme-choice=weft]').click();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'weft');
    assert.equal(await page.evaluate(() => localStorage.getItem('ai_learning_visual_theme')), 'weft');
    assert.equal(await page.locator('[data-theme-choice=weft]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.space-story').evaluate(element => element.inert), true);
    assert.equal(await page.locator('.space-canvas').evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.getAttribute('meta[name=theme-color]', 'content'), '#e7e8e1');
    await page.waitForTimeout(800);
    assert.equal(await page.getAttribute('html', 'data-weft-enter'), null);

    // WEFT has no perpetual animation or rendering loop when idle.
    const idleStart = await page.evaluate(() => window.rafRequests);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.rafRequests), idleStart, 'WEFT must not request animation frames while idle');

    // All original groups and links remain available in the new theme.
    for (const [tab, count] of Object.entries({core:10, optional:6, archive:4, skipped:2, all:22})) {
      await page.locator(`[data-tab="${tab}"]`).click();
      assert.equal(await page.locator('#courses .card').count(), count);
    }
    assert.equal(await page.locator('#courses a[target="_blank"][rel="noopener noreferrer"]').count(), 22);
    await page.locator('[data-tab=core]').click();
    await page.locator('[data-course-id=old-5] [data-action=toggle]').click();
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'weft');
    assert.equal(await page.locator('#pct').textContent(), '40%');

    // Export, reset cancellation/confirmation and backup import still work in WEFT.
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadEvent;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.version, 2);
    await page.locator('.backup-details summary').click();
    await page.locator('#reset').click();
    await page.locator('#cancel-reset').click();
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.locator('#reset').click();
    await page.locator('#confirm-reset').click();
    assert.equal(await page.locator('#pct').textContent(), '30%');
    await page.locator('#file').setInputFiles({name:'progress.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(() => document.getElementById('file').value === '');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.locator('#file').setInputFiles({name:'bad.json', mimeType:'application/json', buffer:Buffer.from('{invalid')});
    await page.waitForFunction(() => document.getElementById('file').value === '');
    assert.equal(await page.locator('#pct').textContent(), '40%');

    // Reading position survives every theme pair, including Classic <-> WEFT.
    await page.locator('[data-tab=core]').click();
    await page.evaluate(() => {
      const course = document.querySelector('[data-course-id=old-6]');
      scrollTo({top:course.getBoundingClientRect().top + scrollY - 100, behavior:'instant'});
    });
    const anchored = page.locator('[data-course-id=old-6]');
    const anchorTop = (await anchored.boundingBox()).y;
    for (const theme of ['classic', 'weft', 'space', 'weft']) {
      await page.locator(`[data-theme-choice=${theme}]`).click();
      await page.waitForTimeout(120);
      assert.ok(Math.abs((await anchored.boundingBox()).y - anchorTop) < 4, `${theme} changed the reading anchor`);
      assert.equal(await page.locator('#pct').textContent(), '40%');
    }
    const unchangedScroll = await page.evaluate(() => scrollY);
    await page.locator('[data-theme-choice=weft]').click();
    assert.equal(await page.evaluate(() => scrollY), unchangedScroll, 'reselecting WEFT must not move the page');

    // Responsive checks include narrow phones, tablets and wide desktops.
    await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
    for (const width of [320,360,390,412,580,768,1024,1280,1440,1920]) {
      await page.setViewportSize({width, height:900});
      await page.waitForTimeout(80);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}px`);
      assert.ok(await page.locator('#courses .card').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1)), `card overflow at ${width}px`);
    }
    await page.setViewportSize({width:390, height:844});
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('visible'), null, {timeout:6000});
    const menuTarget = await page.locator('.weft-theme-menu').boundingBox();
    assert.ok(menuTarget.width >= 44 && menuTarget.height >= 44, 'mobile menu target must be at least 44px');
    await page.locator('.weft-theme-menu').click();
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'true');
    for (const button of await page.locator('[data-theme-choice]').all()) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, 'mobile theme targets must be at least 44px');
    }
    await page.screenshot({path:path.join(screenshots, 'weft-390-theme-menu.png'), animations:'disabled'});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('weft-theme-menu')), true);

    // The compact mobile menu must not cover dashboard readouts or course filters.
    for (const [width, height] of [[320,568], [320,760], [390,844], [412,915], [568,320]]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
      await page.waitForTimeout(80);
      const overlaps = await page.evaluate(() => {
        const control = document.querySelector('.weft-theme-menu').getBoundingClientRect();
        return ['#pct', '#progress', '#continue-link', '.chips'].filter(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.left < control.right && rect.right > control.left && rect.top < control.bottom && rect.bottom > control.top;
        });
      });
      assert.deepEqual(overlaps, [], `theme switch obscures dashboard content at ${width}x${height}`);
      await page.evaluate(() => document.activeElement.blur());
      if (width === 320 && height === 568) await page.screenshot({path:path.join(screenshots, 'weft-320-short-top.png'), animations:'disabled'});
      if (width === 568 && height === 320) await page.screenshot({path:path.join(screenshots, 'weft-568-landscape-top.png'), animations:'disabled'});
    }

    // Mobile menu interactions preserve the same course anchor and never jump on reselect.
    await page.setViewportSize({width:390, height:844});
    await page.evaluate(() => {
      const course = document.querySelector('[data-course-id=old-6]');
      scrollTo({top:course.getBoundingClientRect().top + scrollY - 100, behavior:'instant'});
    });
    const mobileAnchorTop = (await anchored.boundingBox()).y;
    for (const theme of ['classic', 'weft', 'space', 'weft']) {
      if (await page.locator('.weft-theme-menu').isVisible()) await page.locator('.weft-theme-menu').click();
      await page.locator(`[data-theme-choice=${theme}]`).click();
      await page.waitForTimeout(120);
      assert.ok(Math.abs((await anchored.boundingBox()).y - mobileAnchorTop) < 4, `mobile ${theme} changed the reading anchor`);
    }
    const mobileScroll = await page.evaluate(() => scrollY);
    await page.locator('.weft-theme-menu').click();
    await page.locator('[data-theme-choice=weft]').click();
    assert.equal(await page.evaluate(() => scrollY), mobileScroll, 'mobile reselect must not move the page');

    // Reduced motion suppresses the entry shuttle and all non-essential movement.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('.weft-theme-menu').click();
    await page.locator('[data-theme-choice=classic]').click();
    await page.locator('[data-theme-choice=weft]').click();
    assert.equal(await page.getAttribute('html', 'data-weft-enter'), null);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await page.emulateMedia({reducedMotion:'no-preference'});

    // Screenshots for human visual review, not pixel-only acceptance.
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('visible'), null, {timeout:6000});
    await page.evaluate(() => {
      document.activeElement.blur();
      scrollTo({top:0, behavior:'instant'});
    });
    for (const [width, height] of [[1440,1000], [768,900], [390,844], [320,760]]) {
      await page.setViewportSize({width, height});
      await page.waitForTimeout(100);
      await page.screenshot({path:path.join(screenshots, `weft-${width}-top.png`), animations:'disabled'});
      if (width === 1440 || width === 390) await page.screenshot({path:path.join(screenshots, `weft-${width}-full.png`), fullPage:true, animations:'disabled'});
    }

    // Measure real requestAnimationFrame intervals during continuous WEFT scrolling.
    await page.setViewportSize({width:1280, height:900});
    await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
    const samples = await page.evaluate(async () => {
      const values = [];
      let previous = await new Promise(requestAnimationFrame);
      for (let index = 0; index < 120; index++) {
        scrollBy({top:20, behavior:'instant'});
        const now = await new Promise(requestAnimationFrame);
        values.push(now - previous);
        previous = now;
      }
      return values.slice(5);
    });
    const performanceReport = {
      browser: browser.version(),
      viewport: '1280x900',
      samples: samples.length,
      medianMs: Number(percentile(samples, .5).toFixed(2)),
      p95Ms: Number(percentile(samples, .95).toFixed(2)),
      maxMs: Number(Math.max(...samples).toFixed(2)),
      note: 'Cloud Chromium timing; useful for regression comparison, not a hardware-independent 60 FPS guarantee.'
    };
    fs.writeFileSync(path.join(__dirname, 'weft-performance.json'), JSON.stringify(performanceReport, null, 2) + '\n');
    assert.ok(performanceReport.p95Ms < 55, `scroll p95 is too high: ${performanceReport.p95Ms}ms`);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(missing, []);
    console.log('PASS: WEFT persistence/isolation, all course groups, progress, backup/reset/import, three-theme reading anchors, responsive layout, 44px targets, reduced motion, idle rendering and screenshots.');
    console.log('SCROLL:', JSON.stringify(performanceReport));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
