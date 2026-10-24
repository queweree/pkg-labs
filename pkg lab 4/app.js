(() => {
  'use strict';

  const GRID = { width: 61, height: 41, minX: -30, maxX: 30, minY: -20, maxY: 20 };
  const BENCH = { width: 512, height: 512 };
  const MARGIN = { left: 42, top: 18, right: 18, bottom: 34 };
  const $ = (id) => document.getElementById(id);
  const ui = {
    canvas: $('rasterCanvas'), scroller: $('canvasScroller'), primitive: $('primitive'), algorithm: $('algorithm'),
    lineFields: $('lineFields'), circleFields: $('circleFields'), curveFields: $('curveFields'),
    cursorReadout: $('cursorReadout'), canvasHint: $('canvasHint'), zoomValue: $('zoomValue'),
    gridSizeLabel: $('gridSizeLabel'), pixelMetric: $('pixelMetric'), timeMetric: $('timeMetric'),
    methodMetric: $('methodMetric'), objectMetric: $('objectMetric'), formulaTitle: $('formulaTitle'),
    formulaDescription: $('formulaDescription'), formulaCode: $('formulaCode'), complexityBadge: $('complexityBadge'),
    traceCount: $('traceCount'), traceIntro: $('traceIntro'), traceTableBody: $('traceTableBody'),
    message: $('formMessage'), toast: $('toast'), radius: $('radius'), radiusValue: $('radiusValue'),
    drawButton: $('drawButton'), keepPixels: $('keepPixels'), clearRaster: $('clearRaster'),
    zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), resetView: $('resetView'), downloadImage: $('downloadImage'),
    octantDemo: $('octantDemo'), runBenchmark: $('runBenchmark'), benchmarkStatus: $('benchmarkStatus'),
    benchmarkProgress: $('benchmarkProgress'), lineBenchStat: $('lineBenchStat'), circleBenchStat: $('circleBenchStat'),
    totalBenchStat: $('totalBenchStat'), countChart: $('countChart'), lengthChart: $('lengthChart'),
    lengthChartLegend: $('lengthChartLegend')
  };

  const methodNames = { step: 'Пошаговый', dda: 'ЦДА (DDA)', bresenham: 'Брезенхем', wu: 'Ву' };
  const formulas = {
    step: {
      title: 'Пошаговый алгоритм', complexity: 'O(N)',
      description: 'Для каждого значения ведущей координаты вычисляется другая координата по уравнению прямой. Метод прост, но внутри цикла используются умножение, деление и округление.',
      code: ['m = Δy / Δx', 'y = y₀ + m · (x − x₀)', 'plot(x, round(y))']
    },
    dda: {
      title: 'Цифровой дифференциальный анализатор', complexity: 'O(N)',
      description: 'Отрезок разбивается на N равных шагов. Координаты последовательно увеличиваются на Δx/N и Δy/N, после чего округляются к ближайшей ячейке.',
      code: ['N = max(|Δx|, |Δy|)', 'xᵢ₊₁ = xᵢ + Δx / N', 'yᵢ₊₁ = yᵢ + Δy / N']
    },
    bresenham: {
      title: 'Алгоритм Брезенхема', complexity: 'O(max(Δx, Δy))',
      description: 'Решение принимается по целочисленной ошибке. На каждой итерации выбирается горизонтальный, вертикальный или диагональный шаг — без вычисления дробных координат.',
      code: ['e = 2 · err', 'если e ≥ −Δy → x += sx', 'если e ≤  Δx → y += sy']
    },
    wu: {
      title: 'Алгоритм Ву · антиалиасинг', complexity: 'O(N)',
      description: 'Дробная часть идеальной координаты задаёт вклад в два соседних пикселя. Интенсивности вычисляются как 1 − f и f, а не как бинарный флаг.',
      code: ['f = frac(y)', 'I(x, floor(y)) = 1 − f', 'I(x, floor(y) + 1) = f']
    }
  };

  class VirtualGrid {
    constructor(width, height, minX = 0, maxY = height - 1, minY = 0) {
      this.width = width;
      this.height = height;
      this.minX = minX;
      this.maxY = maxY;
      this.minY = minY;
      this.values = new Float32Array(width * height);
      this.setPixel = this.setPixel.bind(this);
    }
    setPixel(x, y, intensity = 1) {
      x = Math.round(x); y = Math.round(y);
      const col = x - this.minX;
      const row = this.maxY - y;
      if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
      const value = Math.max(0, Math.min(1, intensity));
      if (value <= 0) return;
      const index = row * this.width + col;
      if (value > this.values[index]) this.values[index] = value;
    }
    clear() { this.values.fill(0); }
    count() {
      let count = 0;
      for (let i = 0; i < this.values.length; i++) if (this.values[i] > 0) count++;
      return count;
    }
  }

  const raster = new VirtualGrid(GRID.width, GRID.height, GRID.minX, GRID.maxY, GRID.minY);
  let cellSize = 14;
  let toastTimer = null;
  let clickStep = 0;
  let benchmarkRunning = false;
  const benchmarkHistory = [];
  let lastObjectLabel = 'Отрезок · все октанты';

  function plotLineStepwise(target, x0, y0, x1, y1, collector) {
    let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
    const dx = x1 - x0;
    const dy = y1 - y0;
    const slope = dx === 0 ? 0 : dy / dx;
    for (let x = x0; x <= x1; x++) {
      const y = Math.round(y0 + slope * (x - x0));
      if (steep) writePoint(target, y, x, 1, collector);
      else writePoint(target, x, y, 1, collector);
    }
  }

  function plotDDA(target, x0, y0, x1, y1, collector) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) { writePoint(target, x0, y0, 1, collector); return; }
    const xStep = dx / steps, yStep = dy / steps;
    let x = x0, y = y0;
    for (let i = 0; i <= steps; i++) {
      writePoint(target, Math.round(x), Math.round(y), 1, collector);
      x += xStep; y += yStep;
    }
  }

  function plotBresenham(target, x0, y0, x1, y1, collector) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      writePoint(target, x0, y0, 1, collector);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function fractionalPart(value) { return value - Math.floor(value); }
  function reverseFraction(value) { return 1 - fractionalPart(value); }

  function plotWu(target, x0, y0, x1, y1, collector) {
    if (x0 === x1 && y0 === y1) { writePoint(target, x0, y0, 1, collector); return; }
    let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
    const dx = x1 - x0, dy = y1 - y0;
    const gradient = dx === 0 ? 0 : dy / dx;
    const plot = (x, y, intensity) => writePoint(target, steep ? y : x, steep ? x : y, intensity, collector);
    let xend = Math.round(x0);
    let yend = y0 + gradient * (xend - x0);
    let xgap = reverseFraction(x0 + 0.5);
    const xpxl1 = xend, ypxl1 = Math.floor(yend);
    plot(xpxl1, ypxl1, reverseFraction(yend) * xgap);
    plot(xpxl1, ypxl1 + 1, fractionalPart(yend) * xgap);
    let intery = yend + gradient;
    xend = Math.round(x1);
    yend = y1 + gradient * (xend - x1);
    xgap = fractionalPart(x1 + 0.5);
    const xpxl2 = xend, ypxl2 = Math.floor(yend);
    for (let x = xpxl1 + 1; x < xpxl2; x++) {
      plot(x, Math.floor(intery), reverseFraction(intery));
      plot(x, Math.floor(intery) + 1, fractionalPart(intery));
      intery += gradient;
    }
    plot(xpxl2, ypxl2, reverseFraction(yend) * xgap);
    plot(xpxl2, ypxl2 + 1, fractionalPart(yend) * xgap);
  }

  function writePoint(target, x, y, intensity, collector) {
    target.setPixel(x, y, intensity);
    if (collector && collector.length < collector.limit) collector.push({ x: Math.round(x), y: Math.round(y), intensity });
  }

  function plotBresenhamCircle(target, cx, cy, radius, collector) {
    let x = 0, y = Math.round(radius), decision = 3 - 2 * y;
    const drawSymmetry = (px, py) => {
      const points = [[cx + px, cy + py], [cx - px, cy + py], [cx + px, cy - py], [cx - px, cy - py],
        [cx + py, cy + px], [cx - py, cy + px], [cx + py, cy - px], [cx - py, cy - px]];
      for (const point of points) writePoint(target, point[0], point[1], 1, collector);
    };
    while (y >= x) {
      drawSymmetry(x, y);
      if (decision < 0) decision += 4 * x + 6;
      else { decision += 4 * (x - y) + 10; y--; }
      x++;
    }
  }

  function getOctant(dfdx, dfdy) {
    let oct = 0;
    if (dfdx < 0) { oct = 7; dfdx = -dfdx; }
    if (dfdy > 0) { oct ^= 3; dfdy = -dfdy; }
    if (dfdx > -dfdy) oct ^= 1;
    return oct + 1;
  }

  function truncDiv(value, divisor) { return Math.trunc(value / divisor); }

  // Integer finite-difference implementation of Pitteway's conic tracker.
  function pittewayConic(target, xs, ys, xe, ye, A, B, C, D, E, F) {
    let x, y, swap, octant, octantCount, pixelCount;
    let dxsquare, dysquare, dxdiag, dydiag;
    let d, u, v, k1, k2, k3, dSdx, dSdy;
    octant = getOctant(D, E);
    if (xs !== xe || ys !== ye) {
      x = xe - xs; y = ye - ys;
      dSdx = 2 * A * x + B * y + D;
      dSdy = B * x + 2 * C * y + E;
      octantCount = getOctant(dSdx, dSdy) - octant;
      if (octantCount < 0) octantCount += 8;
    } else octantCount = 8;

    dxdiag = dydiag = 1;
    dxsquare = dysquare = 0;
    if ((octant + 1) & 4) { D = -D; dxdiag = -1; }
    if ((octant - 1) & 4) { E = -E; dydiag = -1; }
    if ((octant - 1) & 2) B = -B;
    if (octant & 2) {
      dysquare = dydiag;
      swap = A; A = C; C = swap;
      swap = D; D = E; E = swap;
    } else dxsquare = dxdiag;

    A *= 4; B *= 4; C *= 4; D *= 4; E *= 4; F *= 4;
    d = A + truncDiv(B, 2) + truncDiv(C, 4) + D + truncDiv(E, 2) + F;
    u = A + truncDiv(B, 2) + D;
    v = A + truncDiv(B, 2) + D + E;
    k1 = 2 * A; k2 = 2 * A + B; k3 = 2 * A + 2 * B + 2 * C;
    if (!(octant & 1)) { d = -d; k1 = -k1; u = -u; k2 = -k2; v = -v; k3 = -k3; }
    x = xs; y = ys; pixelCount = -1;
    let guard = 0;
    for (;;) {
      if (++guard > 100000) { plotBresenham(target, x, y, xe, ye); return; }
      if (!octantCount) pixelCount = (octant & 2) ? 1 + Math.abs(ye - y) : 1 + Math.abs(xe - x);
      while ((u > 0 || (octant & 1)) && (v < 0 || !(octant & 1))) {
        target.setPixel(x, y, 1);
        if (--pixelCount === 0) return;
        if (d < 0) {
          x += dxsquare; y += dysquare;
          u += k1; v += k2; d += u;
        } else {
          x += dxdiag; y += dydiag;
          u += k2; v += k3; d += v;
        }
        if (++guard > 100000) { plotBresenham(target, x, y, xe, ye); return; }
      }
      if (--octantCount < 0) { plotBresenham(target, x, y, xe, ye); return; }
      if (++octant & 1) {
        d = -d - u + v - k1 + k2;
        v = -2 * u + v - k1 + k2;
        u = -u - k1 + k2;
        k3 = -4 * k1 + 4 * k2 - k3;
        k2 = -2 * k1 + k2;
        k1 = -k1;
        swap = dxdiag; dxdiag = -dydiag; dydiag = swap;
      } else {
        d = -d + u - truncDiv(v, 2) + truncDiv(k2, 2) - truncDiv(3 * k3, 8);
        u = u - v + truncDiv(k2, 2) - truncDiv(k3, 2);
        v = -v + k2 - truncDiv(k3, 2);
        k1 = -k1 + 2 * k2 - k3;
        k2 = k2 - k3;
        k3 = -k3;
        swap = dxsquare; dxsquare = -dysquare; dysquare = swap;
      }
    }
  }

  function plotPittewayCurve(target, xs, ys, xc, yc, xe, ye) {
    let xq = xe - xs, yq = ye - ys, xr = xc - xs, yr = yc - ys;
    let xprod = xr * yq - xq * yr;
    let A, B, C, D, E, F;
    if (xprod === 0) {
      plotBresenham(target, xs, ys, xc, yc);
      plotBresenham(target, xc, yc, xe, ye);
      return;
    }
    if (xprod < 0) {
      [xs, xe] = [xe, xs]; [ys, ye] = [ye, ys];
      xq = -xq; yq = -yq; xr += xq; yr += yq; xprod = -xprod;
    }
    A = 4 * (yr - yq) * yr + yq * yq;
    B = 4 * ((xq - xr) * yr - (yr - yq) * xr) - 2 * xq * yq;
    C = 4 * (xr - xq) * xr + xq * xq;
    D = 4 * yr * xprod;
    E = -4 * xr * xprod;
    F = 0;
    pittewayConic(target, xs, ys, xe, ye, A, B, C, D, E, F);
    // Endpoints are explicitly included, so a very short/steep conic never loses its knots.
    target.setPixel(xs, ys, 1); target.setPixel(xe, ye, 1);
  }

  function getLineAlgorithm(name) {
    return name === 'step' ? plotLineStepwise : name === 'dda' ? plotDDA : name === 'wu' ? plotWu : plotBresenham;
  }
  function currentAlgorithmName() { return methodNames[ui.algorithm.value] || 'Брезенхем'; }
  function activePrimitive() { return ui.primitive.value; }
  function intValue(id) { return Math.round(Number($(id).value)); }
  function readLineParams() { return { x0: intValue('x0'), y0: intValue('y0'), x1: intValue('x1'), y1: intValue('y1') }; }
  function readCircleParams() { return { x: intValue('cx'), y: intValue('cy'), r: intValue('radius') }; }
  function readCurveParams() { return { x0: intValue('qx0'), y0: intValue('qy0'), xc: intValue('qxc'), yc: intValue('qyc'), x1: intValue('qx1'), y1: intValue('qy1') }; }
  function validatePoint(x, y, name) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < GRID.minX || x > GRID.maxX || y < GRID.minY || y > GRID.maxY) {
      return `${name}: координаты должны быть в пределах x от ${GRID.minX} до ${GRID.maxX}, y от ${GRID.minY} до ${GRID.maxY}.`;
    }
    return '';
  }
  function validateInputs(type) {
    if (type === 'line') {
      const p = readLineParams();
      return validatePoint(p.x0, p.y0, 'Точка A') || validatePoint(p.x1, p.y1, 'Точка B');
    }
    if (type === 'circle') {
      const p = readCircleParams();
      return validatePoint(p.x, p.y, 'Центр окружности') || (p.r < 1 || p.r > 20 ? 'Радиус должен быть от 1 до 20 пикселей.' : '');
    }
    const p = readCurveParams();
    return validatePoint(p.x0, p.y0, 'Начало') || validatePoint(p.xc, p.yc, 'Контрольная точка') || validatePoint(p.x1, p.y1, 'Конец');
  }

  function drawCanvas() {
    const canvas = ui.canvas, ctx = canvas.getContext('2d');
    const gridWidth = GRID.width * cellSize, gridHeight = GRID.height * cellSize;
    const cssWidth = MARGIN.left + gridWidth + MARGIN.right;
    const cssHeight = MARGIN.top + gridHeight + MARGIN.bottom;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f8f6ef'; ctx.fillRect(0, 0, cssWidth, cssHeight);
    const gx = MARGIN.left, gy = MARGIN.top;
    for (let row = 0; row < GRID.height; row++) {
      for (let col = 0; col < GRID.width; col++) {
        const value = raster.values[row * GRID.width + col];
        if (value <= 0) continue;
        ctx.globalAlpha = value;
        ctx.fillStyle = '#607750';
        ctx.fillRect(gx + col * cellSize + 0.7, gy + row * cellSize + 0.7, Math.max(1, cellSize - 1.4), Math.max(1, cellSize - 1.4));
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e0dbcf';
    ctx.beginPath();
    for (let col = 0; col <= GRID.width; col++) { const x = gx + col * cellSize + 0.5; ctx.moveTo(x, gy); ctx.lineTo(x, gy + gridHeight); }
    for (let row = 0; row <= GRID.height; row++) { const y = gy + row * cellSize + 0.5; ctx.moveTo(gx, y); ctx.lineTo(gx + gridWidth, y); }
    ctx.stroke();
    const axisX = gx + (0 - GRID.minX) * cellSize + 0.5;
    const axisY = gy + (GRID.maxY - 0) * cellSize + 0.5;
    ctx.strokeStyle = 'rgba(91,103,79,.82)'; ctx.lineWidth = 1.3; ctx.beginPath();
    ctx.moveTo(gx, axisY); ctx.lineTo(gx + gridWidth, axisY); ctx.moveTo(axisX, gy); ctx.lineTo(axisX, gy + gridHeight); ctx.stroke();
    ctx.fillStyle = '#6f756a'; ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = GRID.minX; x <= GRID.maxX; x += 5) {
      const px = gx + (x - GRID.minX + 0.5) * cellSize;
      ctx.strokeStyle = '#9a9b8c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, axisY - 3); ctx.lineTo(px, axisY + 3); ctx.stroke();
      ctx.fillStyle = x === 0 ? '#3f4d37' : '#7b8075'; ctx.fillText(String(x), px, gy + gridHeight + 17);
    }
    ctx.textAlign = 'right';
    for (let y = GRID.maxY; y >= GRID.minY; y -= 5) {
      const py = gy + (GRID.maxY - y + 0.5) * cellSize;
      ctx.strokeStyle = '#9a9b8c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(axisX - 3, py); ctx.lineTo(axisX + 3, py); ctx.stroke();
      ctx.fillStyle = y === 0 ? '#3f4d37' : '#7b8075'; ctx.fillText(String(y), gx - 8, py);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.font = '10px "DM Mono", monospace'; ctx.fillStyle = '#607750'; ctx.fillText('x →', gx + gridWidth + 1, gy + gridHeight + 31);
    ctx.textAlign = 'left'; ctx.fillText('↑ y', gx - 35, gy - 5);
  }

  function setMetric(type, algorithm, time) {
    ui.pixelMetric.textContent = raster.count().toLocaleString('ru-RU');
    ui.timeMetric.innerHTML = `${time.toFixed(3)} <small>мс</small>`;
    ui.methodMetric.textContent = type === 'line' ? methodNames[algorithm] : type === 'circle' ? 'Брезенхем' : 'Кастла–Питвея';
    ui.objectMetric.textContent = type === 'line' ? 'Отрезок · все октанты' : type === 'circle' ? 'Окружность · 8 симметрий' : 'Коническая дуга · целые шаги';
  }

  function describeAction(type, method) {
    if (type === 'circle') return { title: 'Брезенхем для окружности', complexity: 'O(r)', description: 'Одна восьмая окружности строится целочисленной ошибкой; симметрия переносит каждый найденный пиксель в восемь октантов. Дробные координаты и тригонометрические функции не используются.', code: ['d = 3 − 2r', 'если d > 0 → y -= 1', 'добавить 8 симметричных точек'] };
    if (type === 'curve') return { title: 'Кастла–Питвея · коническая дуга', complexity: 'O(N)', description: 'Параболический сегмент задаётся неявным уравнением второго порядка. Конечные разности и управляющая ошибка определяют квадратный или диагональный шаг по дискретной сетке.', code: ['f(x,y) = Ax² + Bxy + Cy²', 'd < 0 → квадратный шаг', 'иначе → диагональный шаг'] };
    return formulas[method];
  }

  function renderFormula(type, method) {
    const f = describeAction(type, method);
    ui.formulaTitle.textContent = f.title;
    ui.complexityBadge.textContent = f.complexity;
    ui.formulaDescription.textContent = f.description;
    ui.formulaCode.innerHTML = f.code.map((line, i) => `<span>${escapeHTML(line)}</span>`).join('');
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function collector(limit = 14) { const c = []; c.limit = limit; return c; }
  function updateTrace(type, method, points, params) {
    let intro = '';
    if (type === 'line') intro = `Отрезок A(${params.x0}, ${params.y0}) → B(${params.x1}, ${params.y1}). Последовательность первых дискретных шагов.`;
    else if (type === 'circle') intro = `Окружность C(${params.x}, ${params.y}), r = ${params.r}. Показаны первые симметричные точки обхода.`;
    else intro = `Параболическая дуга P₀(${params.x0}, ${params.y0}) → P₂(${params.x1}, ${params.y1}) с контролем P₁(${params.xc}, ${params.yc}).`;
    ui.traceIntro.textContent = intro;
    const subset = points.slice(0, 12);
    ui.traceCount.textContent = `${points.length}${points.length >= 14 ? '+' : ''} точек`;
    ui.traceTableBody.innerHTML = subset.map((p, i) => {
      let decision = type === 'circle' ? 'симметрия' : type === 'curve' ? 'целый шаг' : method === 'wu' ? `α ${(p.intensity || 1).toFixed(2)}` : method === 'dda' ? 'приращение' : method === 'step' ? 'уравнение' : 'ошибка';
      return `<tr${i === 0 ? ' class="active-row"' : ''}><td>${i + 1}</td><td>${p.x}</td><td>${p.y}</td><td>${decision}</td></tr>`;
    }).join('');
    if (!subset.length) ui.traceTableBody.innerHTML = '<tr><td colspan="4">Нет пикселей для отображения</td></tr>';
  }

  function renderCurrent() {
    const type = activePrimitive(), method = ui.algorithm.value;
    const validation = validateInputs(type);
    if (validation) { ui.message.textContent = validation; return false; }
    ui.message.textContent = '';
    if (!ui.keepPixels.checked) raster.clear();
    const trace = collector(14);
    const start = performance.now();
    if (type === 'line') {
      const p = readLineParams();
      getLineAlgorithm(method)(raster, p.x0, p.y0, p.x1, p.y1, trace);
      updateTrace(type, method, trace, p);
      lastObjectLabel = 'Отрезок · все октанты';
    } else if (type === 'circle') {
      const p = readCircleParams();
      plotBresenhamCircle(raster, p.x, p.y, p.r, trace);
      updateTrace(type, 'bresenham', trace, p);
      lastObjectLabel = 'Окружность · 8 симметрий';
    } else {
      const p = readCurveParams();
      plotPittewayCurve(raster, p.x0, p.y0, p.xc, p.yc, p.x1, p.y1);
      // Trace is collected from the resulting curve in scan order for a visible, reproducible sample.
      for (let row = 0; row < GRID.height && trace.length < trace.limit; row++) {
        for (let col = 0; col < GRID.width && trace.length < trace.limit; col++) {
          if (raster.values[row * GRID.width + col] > 0) trace.push({ x: col + GRID.minX, y: GRID.maxY - row, intensity: raster.values[row * GRID.width + col] });
        }
      }
      updateTrace(type, 'bresenham', trace, p);
      lastObjectLabel = 'Коническая дуга · целые шаги';
    }
    const elapsed = performance.now() - start;
    drawCanvas(); setMetric(type, method, elapsed); renderFormula(type, method);
    return true;
  }

  function clearRaster() {
    raster.clear(); drawCanvas();
    ui.pixelMetric.textContent = '0'; ui.timeMetric.innerHTML = '— <small>мс</small>';
    ui.traceCount.textContent = '0 точек'; ui.traceIntro.textContent = 'Растр очищен. Постройте объект, чтобы увидеть последовательность пикселей.';
    ui.traceTableBody.innerHTML = '';
  }

  function updatePrimitiveFields() {
    const type = activePrimitive();
    ui.lineFields.classList.toggle('hidden', type !== 'line');
    ui.circleFields.classList.toggle('hidden', type !== 'circle');
    ui.curveFields.classList.toggle('hidden', type !== 'curve');
    clickStep = 0;
    ui.message.textContent = '';
    ui.canvasHint.textContent = type === 'line' ? 'Для отрезка кликните две точки: начало и конец.' : type === 'circle' ? 'Кликните центр окружности; радиус задайте ползунком.' : 'Кликните три точки: начало, контрольную точку и конец дуги.';
    renderFormula(type, ui.algorithm.value);
  }

  function showToast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }

  function canvasToGrid(event) {
    const rect = ui.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left - MARGIN.left;
    const py = event.clientY - rect.top - MARGIN.top;
    const col = Math.floor(px / cellSize), row = Math.floor(py / cellSize);
    if (col < 0 || col >= GRID.width || row < 0 || row >= GRID.height) return null;
    return { x: col + GRID.minX, y: GRID.maxY - row };
  }
  function setInput(id, value) { $(id).value = String(value); }
  function assignCanvasPoint(p) {
    if (!p) return;
    const type = activePrimitive();
    if (type === 'circle') { setInput('cx', p.x); setInput('cy', p.y); clickStep = 0; }
    else if (type === 'line') {
      if (clickStep % 2 === 0) { setInput('x0', p.x); setInput('y0', p.y); }
      else { setInput('x1', p.x); setInput('y1', p.y); }
      clickStep = (clickStep + 1) % 2;
      if (clickStep === 0) renderCurrent();
    } else {
      const ids = [['qx0', 'qy0'], ['qxc', 'qyc'], ['qx1', 'qy1']][clickStep % 3];
      setInput(ids[0], p.x); setInput(ids[1], p.y); clickStep = (clickStep + 1) % 3;
      if (clickStep === 0) renderCurrent();
    }
    if (type === 'circle') renderCurrent();
  }

  function showOctantDemo() {
    if (!ui.keepPixels.checked) raster.clear();
    const algorithm = getLineAlgorithm(ui.algorithm.value);
    const directions = [[25, 8], [8, 25], [-8, 25], [-25, 8], [-25, -8], [-8, -25], [8, -25], [25, -8]];
    const t0 = performance.now();
    for (const [x, y] of directions) algorithm(raster, 0, 0, x, y);
    const elapsed = performance.now() - t0;
    drawCanvas(); ui.pixelMetric.textContent = raster.count().toLocaleString('ru-RU');
    ui.timeMetric.innerHTML = `${elapsed.toFixed(3)} <small>мс</small>`;
    ui.methodMetric.textContent = methodNames[ui.algorithm.value]; ui.objectMetric.textContent = '8 лучей · все октанты';
    ui.traceIntro.textContent = 'Из начала координат построены восемь отрезков с разными знаками и соотношением Δx/Δy. Это проверка обобщённой обработки октантов.';
    ui.traceCount.textContent = '8 направлений';
    ui.traceTableBody.innerHTML = directions.map((p, i) => `<tr${i === 0 ? ' class="active-row"' : ''}><td>${i + 1}</td><td>${p[0]}</td><td>${p[1]}</td><td>октант ${i + 1}</td></tr>`).join('');
    lastObjectLabel = '8 лучей · все октанты';
    renderFormula('line', ui.algorithm.value);
  }

  function renderChart(container, series, options = {}) {
    const width = 620, height = 235, margin = { left: 47, right: 13, top: 15, bottom: 31 };
    const plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;
    const xMax = options.xMax ?? Math.max(1, ...series.flatMap(s => s.points.map(p => p.x)));
    const yMaxRaw = Math.max(0, ...series.flatMap(s => s.points.map(p => p.y)));
    const yMax = options.yMax ?? (yMaxRaw <= 0 ? 1 : yMaxRaw * 1.18);
    const x = value => margin.left + value / xMax * plotW;
    const y = value => margin.top + plotH - (value / yMax) * plotH;
    const ticksY = [0, .25, .5, .75, 1];
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График зависимости времени выполнения от количества операций" xmlns="http://www.w3.org/2000/svg">`;
    ticksY.forEach((fraction) => {
      const py = y(yMax * fraction);
      svg += `<line x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}" stroke="#e4dfd4" stroke-width="1"/>`;
      svg += `<text x="${margin.left - 9}" y="${py + 3}" fill="#777b70" font-size="9" font-family="DM Mono, monospace" text-anchor="end">${(yMax * fraction).toFixed(yMax < 10 ? 2 : 0)}</text>`;
    });
    const ticksX = options.xTicks || [0, xMax * .25, xMax * .5, xMax * .75, xMax];
    ticksX.forEach((value) => {
      const px = x(value);
      svg += `<line x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}" stroke="#e9e4d9" stroke-width="1" stroke-dasharray="2 4"/>`;
      const label = options.xLabel ? options.xLabel(value) : String(Math.round(value));
      svg += `<text x="${px}" y="${height - 10}" fill="#777b70" font-size="9" font-family="DM Mono, monospace" text-anchor="middle">${escapeHTML(label)}</text>`;
    });
    svg += `<line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#bdb8aa"/>`;
    for (const s of series) {
      if (!s.points.length) continue;
      const points = s.points.map(p => `${x(p.x).toFixed(2)},${y(p.y).toFixed(2)}`).join(' ');
      svg += `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const p of s.points) svg += `<circle cx="${x(p.x).toFixed(2)}" cy="${y(p.y).toFixed(2)}" r="3" fill="#fffdf8" stroke="${s.color}" stroke-width="1.7"/>`;
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  }
  function makeBenchLineData(count, seed = 20261022) {
    const random = seededRandom(seed), result = new Array(count), center = 256;
    for (let i = 0; i < count; i++) {
      const octant = Math.floor(random() * 8), major = 4 + Math.floor(random() * 180), minor = Math.floor(random() * (major + 1));
      const vectors = [[major, minor], [minor, major], [-minor, major], [-major, minor], [-major, -minor], [-minor, -major], [minor, -major], [major, -minor]];
      const [dx, dy] = vectors[octant];
      result[i] = [center, center, center + dx, center + dy];
    }
    return result;
  }
  function makeBenchCircleData(count, seed = 20261023) {
    const random = seededRandom(seed), result = new Array(count);
    for (let i = 0; i < count; i++) result[i] = [100 + Math.floor(random() * 312), 100 + Math.floor(random() * 312), 4 + Math.floor(random() * 77)];
    return result;
  }
  function makeBenchTarget() {
    const values = new Uint8Array(BENCH.width * BENCH.height);
    return { values, setPixel(x, y, intensity = 1) {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < BENCH.width && y >= 0 && y < BENCH.height) values[y * BENCH.width + x] = intensity > 0 ? 1 : values[y * BENCH.width + x];
    } };
  }
  function fmtMs(value) { return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} мс`; }
  async function runPrimitiveBenchmark(linesMethod) {
    benchmarkRunning = true; ui.runBenchmark.disabled = true; ui.benchmarkStatus.className = 'benchmark-status running';
    ui.benchmarkStatus.innerHTML = '<i></i> Выполняется'; ui.benchmarkProgress.style.width = '0%';
    ui.lineBenchStat.textContent = '…'; ui.circleBenchStat.textContent = '…'; ui.totalBenchStat.textContent = '…';
    ui.countChart.innerHTML = '<div class="chart-empty"><span>⌁</span><p>Вычисляем зависимость…</p></div>';
    ui.lengthChart.innerHTML = '<div class="chart-empty"><span>∿</span><p>Вычисляем длину…</p></div>';
    const lines = makeBenchLineData(100000), circles = makeBenchCircleData(50000);
    const lineTarget = makeBenchTarget(), circleTarget = makeBenchTarget();
    const lineAlg = getLineAlgorithm(linesMethod);
    const lineMarks = [1000, 5000, 10000, 25000, 50000, 75000, 100000];
    const circleMarks = [1000, 5000, 10000, 25000, 50000];
    const lineSeries = [], circleSeries = [];
    let lineElapsed = 0, circleElapsed = 0, nextMark = 0;
    const chunkLines = 500;
    try {
      for (let start = 0; start < lines.length; start += chunkLines) {
        const end = Math.min(lines.length, start + chunkLines);
        const t0 = performance.now();
        for (let i = start; i < end; i++) {
          const a = lines[i]; lineAlg(lineTarget, a[0], a[1], a[2], a[3]);
        }
        lineElapsed += performance.now() - t0;
        while (nextMark < lineMarks.length && end >= lineMarks[nextMark]) {
          lineSeries.push({ x: lineMarks[nextMark], y: lineElapsed }); nextMark++;
        }
        ui.benchmarkProgress.style.width = `${end / 150000 * 62}%`;
        ui.lineBenchStat.textContent = fmtMs(lineElapsed);
        if (end % 5000 === 0) await wait(0);
      }
      let nextCircleMark = 0;
      const chunkCircles = 250;
      for (let start = 0; start < circles.length; start += chunkCircles) {
        const end = Math.min(circles.length, start + chunkCircles);
        const t0 = performance.now();
        for (let i = start; i < end; i++) {
          const c = circles[i]; plotBresenhamCircle(circleTarget, c[0], c[1], c[2]);
        }
        circleElapsed += performance.now() - t0;
        while (nextCircleMark < circleMarks.length && end >= circleMarks[nextCircleMark]) {
          circleSeries.push({ x: circleMarks[nextCircleMark], y: circleElapsed }); nextCircleMark++;
        }
        ui.benchmarkProgress.style.width = `${62 + end / 50000 * 28}%`;
        ui.circleBenchStat.textContent = fmtMs(circleElapsed);
        if (end % 2500 === 0) await wait(0);
      }
      ui.totalBenchStat.textContent = fmtMs(lineElapsed + circleElapsed);
      ui.lineBenchStat.textContent = fmtMs(lineElapsed);
      ui.circleBenchStat.textContent = fmtMs(circleElapsed);
      const lengthSamples = [16, 32, 64, 128, 192, 256];
      const lengthPoints = [];
      const random = seededRandom(20261024);
      for (let j = 0; j < lengthSamples.length; j++) {
        const length = lengthSamples[j], testLines = new Array(1000);
        for (let i = 0; i < testLines.length; i++) {
          const startX = 80 + Math.floor(random() * (300 - Math.min(length, 250)));
          const startY = 80 + Math.floor(random() * 300);
          const signX = random() < .5 ? -1 : 1, signY = random() < .5 ? -1 : 1;
          const minor = Math.floor(random() * (length + 1));
          testLines[i] = [startX, startY, startX + signX * length, startY + signY * minor];
        }
        const target = makeBenchTarget(); let elapsed = 0;
        for (let start = 0; start < testLines.length; start += 200) {
          const end = Math.min(testLines.length, start + 200), t0 = performance.now();
          for (let i = start; i < end; i++) { const a = testLines[i]; lineAlg(target, a[0], a[1], a[2], a[3]); }
          elapsed += performance.now() - t0;
          if (end % 400 === 0) await wait(0);
        }
        lengthPoints.push({ x: length, y: elapsed });
        ui.benchmarkProgress.style.width = `${90 + (j + 1) / lengthSamples.length * 10}%`;
      }
      renderChart(ui.countChart, [
        { name: 'Отрезки', color: '#647c52', points: lineSeries },
        { name: 'Окружности', color: '#b87658', points: circleSeries }
      ], { xMax: 100000, xTicks: [0, 25000, 50000, 75000, 100000], xLabel: n => n === 0 ? '0' : `${Math.round(n / 1000)}k` });
      renderChart(ui.lengthChart, [{ name: methodNames[linesMethod], color: '#8b9b71', points: lengthPoints }], {
        xMax: 256, xTicks: lengthSamples, xLabel: n => String(n)
      });
      ui.lengthChartLegend.textContent = methodNames[linesMethod];
      benchmarkHistory.push({
        method: methodNames[linesMethod], methodKey: linesMethod, timestamp: new Date().toISOString(),
        lineElapsed, circleElapsed, totalElapsed: lineElapsed + circleElapsed,
        lineSeries: lineSeries.map(p => ({ ...p })), circleSeries: circleSeries.map(p => ({ ...p })),
        lengthPoints: lengthPoints.map(p => ({ ...p }))
      });
      ui.benchmarkProgress.style.width = '100%';
      ui.benchmarkStatus.className = 'benchmark-status done'; ui.benchmarkStatus.innerHTML = '<i></i> Завершено';
      showToast(`Готово: 100 000 отрезков и 50 000 окружностей. Общая растеризация — ${fmtMs(lineElapsed + circleElapsed)}.`);
    } catch (error) {
      console.error(error); ui.benchmarkStatus.className = 'benchmark-status'; ui.benchmarkStatus.innerHTML = '<i></i> Ошибка теста';
      showToast('Не удалось завершить тест. Повторите запуск или уменьшите нагрузку в другой вкладке.');
    } finally {
      benchmarkRunning = false; ui.runBenchmark.disabled = false;
    }
  }

  function handleCanvasClick(event) {
    const point = canvasToGrid(event);
    if (!point) return;
    assignCanvasPoint(point);
  }

  ui.canvas.addEventListener('mousemove', event => {
    const p = canvasToGrid(event);
    ui.cursorReadout.textContent = p ? `x: ${p.x}, y: ${p.y}` : 'Координаты: наведите на сетку';
  });
  ui.canvas.addEventListener('mouseleave', () => { ui.cursorReadout.textContent = 'Координаты: наведите на сетку'; });
  ui.canvas.addEventListener('click', handleCanvasClick);
  ui.primitive.addEventListener('change', () => { updatePrimitiveFields(); renderCurrent(); });
  ui.algorithm.addEventListener('change', () => { renderFormula(activePrimitive(), ui.algorithm.value); if (activePrimitive() === 'line') renderCurrent(); });
  ui.drawButton.addEventListener('click', renderCurrent);
  ui.clearRaster.addEventListener('click', () => { clearRaster(); showToast('Виртуальный растр очищен.'); });
  ui.octantDemo.addEventListener('click', showOctantDemo);
  ui.radius.addEventListener('input', () => { ui.radiusValue.textContent = ui.radius.value; });
  ui.zoomIn.addEventListener('click', () => { cellSize = Math.min(22, cellSize + 2); ui.zoomValue.textContent = `${cellSize} px`; drawCanvas(); });
  ui.zoomOut.addEventListener('click', () => { cellSize = Math.max(8, cellSize - 2); ui.zoomValue.textContent = `${cellSize} px`; drawCanvas(); });
  ui.resetView.addEventListener('click', () => { cellSize = 14; ui.zoomValue.textContent = '14 px'; drawCanvas(); });
  ui.downloadImage.addEventListener('click', () => {
    ui.canvas.toBlob(blob => {
      if (!blob) { showToast('Не удалось подготовить PNG.'); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'raster-field.png'; a.click(); URL.revokeObjectURL(url);
      showToast('PNG растра подготовлен.');
    }, 'image/png');
  });
  function buildBenchmarkSection() {
    if (!benchmarkHistory.length) return `## Фактические измерения\n\nСтресс-тест ещё не запускался в этой вкладке, поэтому фактические миллисекунды не записаны. Откройте приложение, выполните тест и скачайте отчёт повторно.\n\n`;
    const lines = [
      '## Фактические измерения', '',
      'Все значения получены в этой сессии браузера. Таймер включает растеризацию в виртуальный массив; создание данных и обновление UI исключены. Значения зависят от оборудования, браузера и фоновой нагрузки.', '',
      '| Запуск | Алгоритм отрезка | 100 000 отрезков, мс | 50 000 окружностей, мс | Всего, мс |',
      '|---:|---|---:|---:|---:|'
    ];
    benchmarkHistory.forEach((r, i) => lines.push(`| ${i + 1} | ${r.method} | ${r.lineElapsed.toFixed(3)} | ${r.circleElapsed.toFixed(3)} | ${r.totalElapsed.toFixed(3)} |`));
    lines.push('', '### Время в зависимости от количества примитивов', '', '| Алгоритм отрезка | Число отрезков | Накопленное время, мс |', '|---|---:|---:|');
    benchmarkHistory.forEach(r => r.lineSeries.forEach(p => lines.push(`| ${r.method} | ${p.x.toLocaleString('en-US')} | ${p.y.toFixed(3)} |`)));
    lines.push('', '| Окружности (алгоритм Брезенхема) | Число окружностей | Накопленное время, мс |', '|---|---:|---:|');
    benchmarkHistory.forEach(r => r.circleSeries.forEach(p => lines.push(`| Тест ${r.method} | ${p.x.toLocaleString('en-US')} | ${p.y.toFixed(3)} |`)));
    lines.push('', '### Время в зависимости от длины отрезка', '', '| Алгоритм | Длина, пикселей | Время на 1 000 отрезков, мс |', '|---|---:|---:|');
    benchmarkHistory.forEach(r => r.lengthPoints.forEach(p => lines.push(`| ${r.method} | ${p.x} | ${p.y.toFixed(3)} |`)));
    lines.push('', '### Интерпретация', '', 'Сравнивайте алгоритмы при одинаковой платформе и близкой фоновой нагрузке. Все методы для отрезка линейны по числу обрабатываемых пикселей, но имеют разную стоимость итерации. Брезенхем использует целочисленную ошибку и сложение/сравнения; ЦДА опирается на дробные приращения и округление; пошаговый метод вычисляет координату по уравнению. Окончательный вывод следует делать по таблице и графикам именно этой сессии.', '');
    return lines.join('\n');
  }

  async function downloadAnalyticalReport(event) {
    event.preventDefault();
    const link = event.currentTarget;
    let baseReport = '';
    try {
      const response = await fetch(link.getAttribute('href'));
      if (response.ok) baseReport = await response.text();
    } catch (_) { /* file:// access may block fetch; a self-contained fallback is below */ }
    if (!baseReport) {
      baseReport = `# Аналитический отчёт: растровые алгоритмы\n\nВ приложении реализованы пошаговый алгоритм, ЦДА, Брезенхем для отрезка и окружности, сглаживание Ву и целочисленная трассировка параболической дуги Кастла–Питвея.\n\n## Виртуальный растр и отображение\n\nЯдро использует двумерный числовой массив. Алгоритмы вызывают только setPixel(x, y, intensity); экранная сетка и увеличенные ячейки рисуются UI после завершения расчёта. Координаты x = −30…30 и y = −20…20 сопоставлены индексам формулой (20 − y) · 61 + (x + 30). Ось y математически направлена вверх.\n\n## Анализ сложности\n\nДля линии длины N все методы линейны по количеству пиксельных шагов. Пошаговый алгоритм вычисляет уравнение прямой и округляет значения на каждой итерации. ЦДА накапливает дробные приращения. Брезенхем обновляет целочисленную ошибку при помощи сложения и сравнений, без деления в цикле. Поэтому он часто быстрее, но фактический результат требуется подтверждать замерами.\n\nПример A(2, 1) → B(9, 5): Δx = 7, Δy = 4, N = 7, xStep = 1, yStep = 4/7 ≈ 0,5714. Растровые координаты: (2,1), (3,2), (4,2), (5,3), (6,3), (7,4), (8,4), (9,5).\n\nДля Ву, если y = 1 + 4/7 ≈ 1,5714, дробная часть f ≈ 0,5714; соседние пиксели получают интенсивности 1 − f ≈ 0,4286 и f ≈ 0,5714.\n\n${buildBenchmarkSection()}\n## Источники\n\n- J. E. Bresenham, “Algorithm for Computer Control of a Digital Plotter”, IBM Systems Journal, 1965.\n- M. L. V. Pitteway, “Algorithm for Drawing Ellipses or Hyperbolae with a Digital Plotter”, The Computer Journal, 1967, DOI: 10.1093/comjnl/10.3.282.\n- Схема конечных разностей конических дуг: https://github.com/jvanaken1/conic-draw (MIT; см. THIRD_PARTY_NOTICES.md).\n`;
    } else {
      const section = buildBenchmarkSection();
      if (baseReport.includes('## Экспериментальная методика')) baseReport = baseReport.replace('## Экспериментальная методика', `${section}## Экспериментальная методика`);
      else baseReport += `\n\n${section}`;
    }
    const blob = new Blob([baseReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'analytical-report.md'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(benchmarkHistory.length ? 'Отчёт скачан вместе с фактическими измерениями.' : 'Отчёт скачан. Запустите тест, чтобы добавить фактические измерения.');
  }

  document.querySelector('.report-download').addEventListener('click', downloadAnalyticalReport);
  ui.runBenchmark.addEventListener('click', () => { if (!benchmarkRunning) runPrimitiveBenchmark(ui.algorithm.value); });
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active')); link.classList.add('active');
  }));
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id;
        document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${id}` || (id === 'top' && link.getAttribute('href') === '#workspace')));
      }
    }, { rootMargin: '-22% 0px -65% 0px' });
    ['workspace', 'benchmark', 'report-download'].forEach(id => { const section = $(id); if (section) sectionObserver.observe(section); });
  }

  // Expose a narrow, read-only diagnostic hook for automated smoke tests.
  window.RasterStudio = Object.freeze({
    algorithms: Object.freeze({ step: plotLineStepwise, dda: plotDDA, bresenham: plotBresenham, wu: plotWu, circle: plotBresenhamCircle, pitteway: plotPittewayCurve }),
    createGrid: () => new VirtualGrid(GRID.width, GRID.height, GRID.minX, GRID.maxY, GRID.minY),
    gridSize: Object.freeze({ ...GRID })
  });

  updatePrimitiveFields();
  drawCanvas();
  renderCurrent();
})();
