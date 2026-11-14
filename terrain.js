/* 山海 — a deterministic contour survey of the learning route.
   Rendered once per change on a 2D canvas: no animation loop, no network assets. */
(() => {
  'use strict';
  const root = document.documentElement;
  const figure = document.querySelector('.terrain-map');
  const canvas = document.getElementById('terrain-canvas');
  const pin = document.getElementById('terrain-pin');
  const pinLabel = document.getElementById('terrain-pin-label');
  const legend = document.getElementById('terrain-legend');
  const pct = document.getElementById('pct');
  if (!figure || !canvas || !pin || !legend) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const GW = 232, GH = 150;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let field = null;          // Float32Array of elevations, 0..1
  let contours = [];         // cached marching-squares segments per level
  let levelValues = [];
  let hereGeometry = [], hereValue = -1;
  let summit = null;
  const wash = document.createElement('canvas');
  wash.width = GW; wash.height = GH;
  const wctx = wash.getContext('2d');
  let washImage = null;
  let lastProgress = -1;

  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const fbm = (x, y, octaves) => {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq + i * 31.7, y * freq - i * 17.3);
      norm += amp; freq *= 2.03; amp *= 0.5;
    }
    return sum / norm;
  };

  function buildField() {
    const data = new Float32Array(GW * GH);
    const cx = .53, cy = .47, R = .38;
    const spurs = [[-0.6, .072, .085], [1.75, .104, .095]];
    const gullies = [[0.9, .078, .052], [2.35, .056, .046]];
    for (let j = 0; j < GH; j++) {
      const v = j / (GH - 1);
      for (let i = 0; i < GW; i++) {
        const u = i / (GW - 1);
        const wx = u + 0.085 * (fbm(u * 3.1 + 11.2, v * 3.1 + 4.4, 4) - .5);
        const wy = v + 0.085 * (fbm(u * 3.1 - 7.7, v * 3.1 + 9.1, 4) - .5);
        const dx = wx - cx, dy = (wy - cy) * 1.08;
        let r = Math.hypot(dx, dy);
        const th = Math.atan2(dy, dx);
        r += 0.078 * (fbm(u * 4.6 + 3.1, v * 4.6 - 2.6, 4) - .5);
        r += 0.024 * (fbm(u * 9.2 - 5.4, v * 9.2 + 7.8, 3) - .5);
        // Asymmetric flanks and a soft western shoulder keep the massif from reading as a cone.
        const rr = r * (1 + 0.085 * Math.cos(th - 0.45) + 0.032 * Math.cos(3 * th + 0.8));
        const edge = Math.max(0, Math.min(1, (R + .06 - rr) / .09));
        let h = Math.pow(Math.max(0, 1 - rr / (R + .06)), 1.35) * edge;
        h += 0.060 * (fbm(wx * 6.2, wy * 6.2, 4) - .5) * Math.min(1, h * 3) * edge;
        // Spurs and two gullies bend the contours; a foothill and a valley break the symmetry.
        for (const [a, amp, w] of spurs) {
          const lat = Math.abs(rr * Math.sin(th - a));
          h += amp * Math.exp(-((lat / w) ** 2)) * Math.exp(-(((rr - .20) / .24) ** 2)) * edge;
        }
        for (const [a, dep, w] of gullies) {
          const lat = Math.abs(rr * Math.sin(th - a));
          h -= dep * Math.exp(-((lat / w) ** 2)) * Math.exp(-(((rr - .18) / .20) ** 2));
        }
        h += 0.080 * Math.exp(-(((u - .27) ** 2) / .011 + ((v - .66) ** 2) / .018));
        h -= 0.055 * Math.exp(-(((u - .72) ** 2) / .014 + ((v - .28) ** 2) / .018));
        if (h < 0) h = 0;
        data[j * GW + i] = h;
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < data.length; k++) { if (data[k] < lo) lo = data[k]; if (data[k] > hi) hi = data[k]; }
    const span = hi - lo || 1;
    for (let k = 0; k < data.length; k++) data[k] = (data[k] - lo) / span;
    // Two gentle passes keep the contour lines calm instead of noisy.
    return smooth(smooth(data));
  }

  function smooth(source) {
    const out = new Float32Array(source.length);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const y = j + dy, x = i + dx;
            if (y < 0 || y >= GH || x < 0 || x >= GW) continue;
            sum += source[y * GW + x]; count++;
          }
        }
        out[j * GW + i] = sum / count;
      }
    }
    return out;
  }

  function contour(level) {
    const segments = [];
    const at = (i, j) => field[j * GW + i];
    for (let j = 0; j < GH - 1; j++) {
      for (let i = 0; i < GW - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        let index = 0;
        if (a > level) index |= 1;
        if (b > level) index |= 2;
        if (c > level) index |= 4;
        if (d > level) index |= 8;
        if (index === 0 || index === 15) continue;
        const tx = (x) => (i + x) / (GW - 1);
        const ty = (y) => (j + y) / (GH - 1);
        const top = [tx((level - a) / (b - a)), ty(0)];
        const right = [tx(1), ty((level - b) / (c - b))];
        const bottom = [tx((level - d) / (c - d)), ty(1)];
        const left = [tx(0), ty((level - a) / (d - a))];
        const push = (p, q) => segments.push([p[0], p[1], q[0], q[1]]);
        switch (index) {
          case 1: case 14: push(left, top); break;
          case 2: case 13: push(top, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(right, bottom); break;
          case 6: case 9: push(top, bottom); break;
          case 7: case 8: push(left, bottom); break;
          case 5: case 10: {
            const center = (a + b + c + d) / 4 > level;
            if (index === 5 ? center : !center) { push(left, top); push(right, bottom); }
            else { push(top, right); push(left, bottom); }
            break;
          }
        }
      }
    }
    return segments;
  }

  function ensureGeometry() {
    if (field) return;
    field = buildField();
    let best = -1, bestIndex = 0;
    for (let k = 0; k < field.length; k++) if (field[k] > best) { best = field[k]; bestIndex = k; }
    summit = [(bestIndex % GW) / (GW - 1), Math.floor(bestIndex / GW) / (GH - 1)];
    levelValues = [.035, .14, .24, .34, .44, .54, .64, .74, .86];
    contours = levelValues.map(contour);
  }

  function progress() {
    const value = parseFloat((pct && pct.textContent) || '0');
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value / 100)) : 0;
  }

  function washFor(value, width, height) {
    if (!washImage) {
      washImage = wctx.createImageData(GW, GH);
      const data = washImage.data;
      for (let k = 0; k < GW * GH; k++) {
        data[k * 4] = 47; data[k * 4 + 1] = 77; data[k * 4 + 2] = 60; data[k * 4 + 3] = 0;
      }
    }
    const data = washImage.data;
    // Water: the sheet reads as an island, not a gradient.
    for (let k = 0; k < GW * GH; k++) {
      const sea = field[k] <= .012;
      data[k * 4] = sea ? 64 : 47; data[k * 4 + 1] = sea ? 86 : 77; data[k * 4 + 2] = sea ? 76 : 60;
      data[k * 4 + 3] = sea ? 30 : 0;
    }
    wctx.putImageData(washImage, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Soften the low-resolution mask so the shoreline reads as ink wash, not stair steps.
    ctx.filter = 'blur(2.5px)';
    ctx.drawImage(wash, 0, 0, width, height);
    // Surveyed ground.
    for (let k = 0; k < GW * GH; k++) {
      data[k * 4] = 47; data[k * 4 + 1] = 77; data[k * 4 + 2] = 60;
      data[k * 4 + 3] = field[k] <= value && field[k] > .012 ? 40 : 0;
    }
    wctx.putImageData(washImage, 0, 0);
    ctx.drawImage(wash, 0, 0, width, height);
    ctx.restore();
  }

  function markerPoint(levelSegments) {
    let best = null, bestScore = Infinity, fallbackBest = null, fallbackScore = Infinity;
    for (let i = 0; i < levelSegments.length; i += 1) {
      const s = levelSegments[i];
      const x = (s[0] + s[2]) / 2, y = (s[1] + s[3]) / 2;
      const fallback = Math.hypot((x - .66) * 1.2, (y - .48));
      if (fallback < fallbackScore) { fallbackScore = fallback; fallbackBest = [x, y]; }
      if (x < .26 || x > .86 || y < .18 || y > .72) continue;
      const score = Math.hypot((x - .66) * 1.2, (y - .48));
      if (score < bestScore) { bestScore = score; best = [x, y]; }
    }
    return best || fallbackBest;
  }

  function render(animatePin) {
    ensureGeometry();
    const width = figure.clientWidth, height = figure.clientHeight;
    if (!width || !height) return;
    const value = progress();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Graticule
    ctx.strokeStyle = 'rgba(47,77,60,.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((i / 8) * width) + .5;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let j = 1; j < 6; j++) {
      const y = Math.round((j / 6) * height) + .5;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    washFor(value, width, height);

    if (value !== hereValue) {
      // The red line is the exact elevation of the current progress, not a rounded neighbour.
      hereGeometry = value > .04 && value < .985 ? contour(value) : [];
      hereValue = value;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let idx = 0; idx < levelValues.length; idx++) {
      const level = levelValues[idx];
      const learned = level <= value;
      const coast = idx === 0;
      const heavy = idx === 1 || idx === 4 || idx === 7;
      const segments = contours[idx];
      ctx.beginPath();
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        ctx.moveTo(seg[0] * width, seg[1] * height);
        ctx.lineTo(seg[2] * width, seg[3] * height);
      }
      if (coast) {
        ctx.strokeStyle = 'rgba(35,60,46,.52)';
        ctx.lineWidth = 1.7;
        ctx.setLineDash([]);
      } else if (learned) {
        ctx.strokeStyle = heavy ? 'rgba(32,55,42,.82)' : 'rgba(40,64,49,.62)';
        ctx.lineWidth = heavy ? 1.5 : .9;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = heavy ? 'rgba(47,77,60,.37)' : 'rgba(47,77,60,.26)';
        ctx.lineWidth = heavy ? 1 : .72;
        ctx.setLineDash([3, 4]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.beginPath();
    for (let s = 0; s < hereGeometry.length; s++) {
      const seg = hereGeometry[s];
      ctx.moveTo(seg[0] * width, seg[1] * height);
      ctx.lineTo(seg[2] * width, seg[3] * height);
    }
    ctx.strokeStyle = 'rgba(165,70,44,.78)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    let point = markerPoint(hereGeometry);
    if (!point && value >= .985 && summit) point = summit;
    if (!point && value < .04) point = markerPoint(contours[0]);
    if (point) {
      pin.style.left = (point[0] * 100).toFixed(2) + '%';
      pin.style.top = (Math.max(point[1], .12) * 100).toFixed(2) + '%';
      pin.classList.toggle('below', point[1] < .2);
      pin.style.display = 'flex';
    } else {
      pin.style.display = 'none';
    }
    if (pinLabel) pinLabel.textContent = Math.round(value * 100) + (value >= .985 ? '% · 山巅' : value <= .035 ? '% · 山脚' : '% · 当前位置');
    legend.textContent = '已学 ' + Math.round(value * 100) + ' / 100';
    lastProgress = value;
  }

  const isActive = () => root.dataset.theme === 'terrain';

  function refresh(animatePin) {
    if (!isActive()) return;
    requestAnimationFrame(() => render(animatePin));
  }

  new MutationObserver(() => {
    const value = progress();
    if (isActive() && value !== lastProgress) refresh(true);
  }).observe(pct, { childList: true, characterData: true, subtree: true });

  new MutationObserver(refresh.bind(null, false)).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  if ('ResizeObserver' in window) {
    let resizeFrame = 0;
    new ResizeObserver(() => {
      if (!isActive()) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => render(false));
    }).observe(figure);
  }

  reduced.addEventListener('change', () => refresh(false));
  if (isActive()) refresh(false);
})();
