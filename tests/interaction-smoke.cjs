/* Run: CHROMIUM_PATH=/path/to/chromium node tests/interaction-smoke.cjs */
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
  const names = ['index.html', 'space.css', 'space.js', 'terrain.css', 'terrain.js', 'weft.css', 'weft.js'];
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
    const context = await browser.newContext({viewport: {width:390, height:844}, hasTouch: true});
    let page = await context.newPage();
    const errors = [];
    const observe = target => {
      target.on('pageerror', error => errors.push(error.message));
      target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    };
    observe(page);
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.locator('[data-theme-choice=weft]').tap();
    await page.close();
    page = await context.newPage();
    observe(page);
    await page.goto(url);

    // A real keyboard path: skip link, all four themes and the backup link.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), true);
    const focusOutline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return {style:style.outlineStyle, width:parseFloat(style.outlineWidth)};
    });
    assert.equal(focusOutline.style, 'solid');
    assert.ok(focusOutline.width >= 2);
    await page.screenshot({path:path.join(screenshots, 'weft-390-focus.png'), animations:'disabled'});
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('weft-theme-menu')), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.themeChoice), 'classic');
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'classic');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.themeChoice), 'space');
    await page.keyboard.press('Space');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'space');
    await page.waitForFunction(() => document.documentElement.dataset.spaceReady === 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.themeChoice), 'terrain');
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'terrain');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.themeChoice), 'weft');
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'weft');
    assert.equal(await page.locator('[data-theme-choice][aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('[data-theme-choice=weft]').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('text-link')), true);
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#learning-library');
    await page.waitForTimeout(750);
    await page.locator('.weft-theme-menu').click();
    await page.locator('.intro-copy').click();
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'false');
    await page.locator('.weft-theme-menu').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('weft-theme-menu')), true);
    await page.locator('.weft-theme-menu').click();
    await page.setViewportSize({width:768, height:844});
    assert.equal(await page.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.theme-switch').isVisible(), true);
    await page.setViewportSize({width:390, height:844});
    assert.equal(await page.locator('.theme-switch').isVisible(), false);

    // Every visible operation, including skip link, summary and reset, has a touch-sized target.
    await page.locator('.backup-details summary').tap();
    const smallTargets = await page.evaluate(() => {
      const selectors = 'a[href], button, summary';
      return [...document.querySelectorAll(selectors)].flatMap(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
        if (rect.width >= 43.5 && rect.height >= 43.5) return [];
        return [{label:element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40), width:rect.width, height:rect.height}];
      });
    });
    assert.deepEqual(smallTargets, [], 'all visible targets must be at least 44x44px');

    // Re-rendering a course preserves keyboard focus and completion state.
    const toggle = page.locator('[data-course-id=old-5] [data-action=toggle]');
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-course-id]')?.dataset.courseId), 'old-5');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#pct').textContent(), '30%');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-course-id]')?.dataset.courseId), 'old-5');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#pct').textContent(), '40%');

    // Synchronous handler timings expose accidental layout/render regressions.
    await page.setViewportSize({width:1440, height:900});
    const timings = await page.evaluate(() => {
      const result = {courseToggleMs:[], classicWeftRoundTripMs:[]};
      for (let index = 0; index < 6; index++) {
        const button = document.querySelector('[data-course-id=old-5] [data-action=toggle]');
        const start = performance.now();
        button.click();
        result.courseToggleMs.push(performance.now() - start);
      }
      for (let index = 0; index < 6; index++) {
        const start = performance.now();
        document.querySelector('[data-theme-choice=classic]').click();
        document.querySelector('[data-theme-choice=weft]').click();
        result.classicWeftRoundTripMs.push(performance.now() - start);
      }
      return result;
    });
    const report = {
      browser:browser.version(),
      viewport:'1440x900',
      courseToggleP95Ms:Number(percentile(timings.courseToggleMs, .95).toFixed(2)),
      classicWeftRoundTripP95Ms:Number(percentile(timings.classicWeftRoundTripMs, .95).toFixed(2)),
      samples:timings,
      note:'In-page synchronous handler timings; excludes protocol overhead and is not a substitute for device-level input latency measurement.'
    };
    assert.ok(report.courseToggleP95Ms < 32, `course update exceeds two frames: ${report.courseToggleP95Ms}ms`);
    assert.ok(report.classicWeftRoundTripP95Ms < 50, `theme round trip exceeds three frames: ${report.classicWeftRoundTripP95Ms}ms`);
    fs.writeFileSync(path.join(__dirname, 'interaction-performance.json'), JSON.stringify(report, null, 2) + '\n');
    await page.setViewportSize({width:390, height:844});

    if (await page.locator('#pct').textContent() !== '40%') {
      await page.locator('[data-course-id=old-5] [data-action=toggle]').tap();
    }
    assert.equal(await page.locator('#pct').textContent(), '40%');

    // Native dialog semantics must remain intact under the new visual system.
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('visible'), null, {timeout:6000});
    await page.locator('#reset').tap();
    assert.equal(await page.locator('#reset-dialog').evaluate(dialog => dialog.open), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cancel-reset');
    const dialogTargets = await page.locator('#reset-dialog button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return {id:button.id, width:rect.width, height:rect.height};
    }));
    for (const target of dialogTargets) assert.ok(target.width >= 44 && target.height >= 44);
    await page.screenshot({path:path.join(screenshots, 'weft-390-dialog.png'), animations:'disabled'});
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-reset');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cancel-reset');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#reset-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reset');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.locator('#reset').tap();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#reset-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.locator('#reset').tap();
    await page.locator('#confirm-reset').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#reset-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('#pct').textContent(), '30%');

    // Actual touch events, not only a narrow desktop viewport.
    const touchContext = await browser.newContext({viewport:{width:320, height:760}, hasTouch:true, isMobile:true});
    const touchPage = await touchContext.newPage();
    observe(touchPage);
    await touchPage.goto(url);
    await touchPage.locator('[data-theme-choice=weft]').tap();
    await touchPage.locator('.weft-theme-menu').tap();
    assert.equal(await touchPage.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'true');
    await touchPage.locator('[data-theme-choice=classic]').tap();
    assert.equal(await touchPage.getAttribute('html', 'data-theme'), 'classic');
    await touchPage.locator('[data-theme-choice=weft]').tap();
    assert.equal(await touchPage.getAttribute('html', 'data-theme'), 'weft');
    assert.equal(await touchPage.locator('.weft-theme-menu').getAttribute('aria-expanded'), 'false');
    await touchPage.locator('[data-course-id=old-5] [data-action=toggle]').tap();
    assert.equal(await touchPage.locator('#pct').textContent(), '40%');
    await touchPage.locator('[data-course-id=old-5] [data-action=toggle]').tap();
    assert.equal(await touchPage.locator('#pct').textContent(), '30%');
    await touchContext.close();

    // Denied storage degrades to an interactive session with an honest warning.
    const denied = await browser.newPage();
    observe(denied);
    await denied.addInitScript(() => {
      Storage.prototype.setItem = function() { throw new DOMException('Denied for test', 'SecurityError'); };
    });
    await denied.goto(url);
    await denied.locator('[data-theme-choice=weft]').click();
    assert.equal(await denied.getAttribute('html', 'data-theme'), 'weft');
    await denied.locator('[data-course-id=old-5] [data-action=toggle]').click();
    assert.equal(await denied.locator('#pct').textContent(), '40%');
    assert.match(await denied.locator('#toast').textContent(), /本地保存失败/);
    await denied.close();

    // Final human-review set: both original themes and every WEFT course group.
    const visual = await context.newPage();
    observe(visual);
    await visual.goto(url);
    for (const [width, height] of [[1440,1000], [390,844]]) {
      await visual.setViewportSize({width, height});
      if (await visual.locator('.weft-theme-menu').isVisible()) await visual.locator('.weft-theme-menu').click();
      await visual.locator('[data-theme-choice=classic]').click();
      await visual.evaluate(() => scrollTo({top:0, behavior:'instant'}));
      await visual.waitForTimeout(100);
      await visual.screenshot({path:path.join(screenshots, `classic-${width}-top.png`), animations:'disabled'});
      await visual.locator('[data-theme-choice=space]').click();
      await visual.waitForFunction(() => document.documentElement.dataset.spaceReady === 'true');
      await visual.evaluate(() => scrollTo({top:0, behavior:'instant'}));
      await visual.waitForTimeout(200);
      await visual.screenshot({path:path.join(screenshots, `space-${width}-top.png`), animations:'disabled'});
      await visual.evaluate(() => document.getElementById('space-end').scrollIntoView({behavior:'instant'}));
      await visual.waitForTimeout(100);
      await visual.screenshot({path:path.join(screenshots, `space-${width}-learning.png`), animations:'disabled'});
      await visual.locator('[data-theme-choice=weft]').click();
      await visual.locator('[data-tab=all]').click();
      await visual.evaluate(() => scrollTo({top:0, behavior:'instant'}));
      await visual.waitForTimeout(750);
      await visual.screenshot({path:path.join(screenshots, `weft-${width}-all-full.png`), fullPage:true, animations:'disabled'});
      if (width === 390) {
        for (const tab of ['optional', 'archive', 'skipped']) {
          await visual.locator(`[data-tab=${tab}]`).click();
          await visual.evaluate(() => scrollTo({top:0, behavior:'instant'}));
          await visual.waitForTimeout(80);
          await visual.screenshot({path:path.join(screenshots, `weft-390-${tab}-full.png`), fullPage:true, animations:'disabled'});
        }
      }
    }
    await visual.close();

    assert.deepEqual(errors, []);
    console.log('PASS: 44px targets, visible keyboard focus, keyboard theme switching, course focus restoration, dialog keyboard/focus handling, real touch input, denied-storage fallback and interaction timings.');
    console.log('INTERACTION:', JSON.stringify({courseToggleP95Ms:report.courseToggleP95Ms, classicWeftRoundTripP95Ms:report.classicWeftRoundTripP95Ms}));
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
