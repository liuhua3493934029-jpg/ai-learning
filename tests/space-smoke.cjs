/* Run: CHROMIUM_PATH=/path/to/chromium node tests/space-smoke.cjs
   Omit CHROMIUM_PATH when using Playwright's installed Chromium. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

(async () => {
  const files = {'/':'index.html', '/index.html':'index.html', '/space.css':'space.css', '/space.js':'space.js', '/terrain.css':'terrain.css', '/terrain.js':'terrain.js'};
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
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, acceptDownloads: true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testGraphics = {draws: 0, textures: 0, framebuffer: null};
      const prototype = WebGLRenderingContext.prototype;
      const draw = prototype.drawArrays, texture = prototype.createTexture, bind = prototype.bindFramebuffer;
      prototype.drawArrays = function(...args) { if (!testGraphics.framebuffer) testGraphics.draws++; return draw.apply(this, args); };
      prototype.createTexture = function(...args) { testGraphics.textures++; return texture.apply(this, args); };
      prototype.bindFramebuffer = function(target, value) { testGraphics.framebuffer = value; return bind.call(this, target, value); };
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    assert.equal(await page.locator('#pct').textContent(), '30%');
    for (const [tab, count] of Object.entries({core:10, optional:6, archive:4, skipped:2, all:22})) {
      await page.locator(`[data-tab="${tab}"]`).click();
      assert.equal(await page.locator('#courses .card').count(), count);
    }
    assert.equal(await page.locator('#courses a[target="_blank"][rel="noopener noreferrer"]').count(), 22);
    await page.locator('[data-tab=core]').click();
    await page.locator('[data-course-id=old-5] [data-action=toggle]').click();
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.reload();
    assert.equal(await page.locator('#pct').textContent(), '40%');
    // Legacy indexes migrate independently of the visual preference.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('ai_learning_tracker_v1', '[0,1,2,3,5,13]');
    });
    await page.reload();
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('ai_learning_tracker_v2')).statuses);
    assert.equal(migrated['old-6'], 'done');
    assert.equal(migrated['old-4'], 'skip');
    assert.equal(migrated['old-14'], 'skip');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadEvent;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.version, 2);
    await page.locator('.backup-details summary').click();
    await page.locator('#reset').click();
    await page.locator('#confirm-reset').click();
    assert.equal(await page.locator('#pct').textContent(), '30%');
    async function importProgress(text) {
      await page.locator('#file').setInputFiles({name:'progress.json', mimeType:'application/json', buffer:Buffer.from(text)});
      await page.waitForFunction(() => document.getElementById('file').value === '');
    }
    await importProgress(JSON.stringify(backup));
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await importProgress('{invalid');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    // Entering from the top opens the cinematic prologue, not the end of the story.
    await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
    await page.locator('[data-theme-choice=space]').click();
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.waitForFunction(() => document.documentElement.dataset.spaceReady === 'true');
    assert.equal(await page.getAttribute('html', 'data-renderer'), 'webgl');
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'space');
    await page.waitForFunction(() => document.documentElement.dataset.spaceReady === 'true');
    const resources = await page.evaluate(() => testGraphics.textures);
    assert.ok(resources > 0);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(250);
    const staticDraws = await page.evaluate(() => testGraphics.draws);
    await page.evaluate(() => scrollTo({top:1400, behavior:'instant'}));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => testGraphics.draws), staticDraws, 'reduced motion must not repaint on scroll');
    await page.evaluate(() => {
      const course = document.querySelector('[data-course-id=old-5]');
      scrollTo({top:course.getBoundingClientRect().top + scrollY - 100, behavior:'instant'});
    });
    const course = page.locator('[data-course-id=old-5]');
    const top = (await course.boundingBox()).y;
    await page.locator('[data-theme-choice=classic]').click();
    assert.ok(Math.abs((await course.boundingBox()).y - top) < 3);
    await page.locator('[data-theme-choice=space]').click();
    assert.ok(Math.abs((await course.boundingBox()).y - top) < 3);
    assert.equal(await page.evaluate(() => testGraphics.textures), resources, 'theme changes reuse graphics resources');
    const scroll = await page.evaluate(() => scrollY);
    await page.locator('[data-theme-choice=space]').click();
    assert.equal(await page.evaluate(() => scrollY), scroll);
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width, height:844});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    // Losing the graphics context does not affect the learning UI or data.
    await page.evaluate(() => {
      window.contextExtension = document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context');
      contextExtension.loseContext();
    });
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'fallback');
    assert.equal(await page.locator('#pct').textContent(), '40%');
    await page.waitForTimeout(100);
    await page.evaluate(() => contextExtension.restoreContext());
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'webgl');
    const unavailable = await browser.newPage();
    await unavailable.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
      localStorage.setItem('ai_learning_visual_theme', 'space');
    });
    await unavailable.goto(url);
    assert.equal(await unavailable.getAttribute('html','data-renderer'), 'fallback');
    assert.equal(await unavailable.locator('#pct').textContent(), '30%');

    // Third theme: the contour survey must switch, persist, redraw and fit every width.
    await page.setViewportSize({width: 1280, height: 844});
    await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
    await page.locator('[data-theme-choice=terrain]').click();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'terrain');
    assert.ok(await page.locator('.terrain-map').isVisible());
    assert.equal(await page.locator('.theme-switch button').count(), 3);
    assert.equal(await page.getAttribute('meta[name=theme-color]', 'content'), '#e4e4da');
    assert.equal(await page.locator('.terrain-map').evaluate(node => node.getBoundingClientRect().height > 150), true);
    const canvasInk = await page.evaluate(() => {
      const canvas = document.getElementById('terrain-canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted++;
      return painted;
    });
    assert.ok(canvasInk > 10000, 'contour canvas must actually be drawn');
    const surveyBefore = await page.evaluate(() => document.getElementById('terrain-canvas').toDataURL().length);
    await page.locator('[data-course-id=new-spec] [data-action=toggle]').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#pct').textContent(), '50%');
    assert.equal(await page.locator('#terrain-legend').textContent(), '已学 50 / 100');
    assert.match(await page.locator('#terrain-pin-label').textContent(), /50%/);
    const surveyAfter = await page.evaluate(() => document.getElementById('terrain-canvas').toDataURL().length);
    assert.notEqual(surveyBefore, surveyAfter, 'progress must redraw the survey');
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'terrain');
    assert.ok(await page.locator('.terrain-map').isVisible());
    assert.equal(await page.locator('#pct').textContent(), '50%');
    // Reading position survives switching away and back.
    await page.evaluate(() => {
      const course = document.querySelector('[data-course-id=old-5]');
      scrollTo({top: course.getBoundingClientRect().top + scrollY - 100, behavior: 'instant'});
    });
    const terrainTop = (await page.locator('[data-course-id=old-5]').boundingBox()).y;
    await page.locator('[data-theme-choice=classic]').click();
    assert.equal(await page.locator('.terrain-map').isVisible(), false);
    assert.ok(Math.abs((await page.locator('[data-course-id=old-5]').boundingBox()).y - terrainTop) < 3);
    await page.locator('[data-theme-choice=terrain]').click();
    assert.ok(Math.abs((await page.locator('[data-course-id=old-5]').boundingBox()).y - terrainTop) < 3);
    for (const width of [320, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({width, height: 844});
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `terrain overflows at ${width}px`);
    }
    // At zero progress the pin still has a place to stand: the coast, labelled as the foot.
    await page.setViewportSize({width: 1280, height: 844});
    await page.evaluate(() => localStorage.setItem('ai_learning_tracker_v2', JSON.stringify({version: 2, statuses: {'old-1': 'todo', 'old-2': 'todo', 'old-3': 'todo'}})));
    await page.reload();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#pct').textContent(), '0%');
    assert.equal(await page.locator('#terrain-pin').isVisible(), true);
    assert.match(await page.locator('#terrain-pin-label').textContent(), /山脚/);
    assert.deepEqual(errors, []);
    console.log('PASS: courses, progress, v1 migration, backup round trip, invalid imports, persistent themes, reading position, graphics resource reuse, reduced motion, responsive layout, three-theme switching, contour redraw and WebGL fallback/recovery.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
