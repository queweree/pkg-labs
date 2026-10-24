(() => {
  'use strict';

  const canvas = document.getElementById('rasterCanvas');
  const ctx = canvas.getContext('2d');
  const message = document.getElementById('message');
  const ui = {
    primitive: document.getElementById('primitive'), lineCoordinates: document.querySelector('.line-coordinates'), circleControls: document.getElementById('circleControls'),
    cx: document.getElementById('cx'), cy: document.getElementById('cy'), radius: document.getElementById('radius'), octantDemo: document.getElementById('octantDemo'),
    clearRaster: document.getElementById('clearRaster'), downloadImage: document.getElementById('downloadImage'), traceCount: document.getElementById('traceCount'), traceTableBody: document.getElementById('traceTableBody'),
    cursorReadout: document.getElementById('cursorReadout'), pixelMetric: document.getElementById('pixelMetric'), timeMetric: document.getElementById('timeMetric'), methodMetric: document.getElementById('methodMetric'), gridSizeLabel: document.getElementById('gridSizeLabel'),
    x0: document.getElementById('x0'), y0: document.getElementById('y0'),
    x1: document.getElementById('x1'), y1: document.getElementById('y1'),
    draw: document.getElementById('drawButton'), algorithm: document.getElementById('algorithm'), zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'), zoomValue: document.getElementById('zoomValue')
  };

  const GRID = { width: 41, height: 31, minX: -20, maxX: 20, minY: -15, maxY: 15 };
  let cellSize = 16;

  class VirtualGrid {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.values = new Float32Array(width * height);
      this.trace = [];
    }
    setPixel(x, y, intensity = 1) {
      x = Math.round(x); y = Math.round(y);
      const col = x - GRID.minX;
      const row = GRID.maxY - y;
      if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
      const index = row * this.width + col;
      const value = Math.max(0, Math.min(1, intensity));
      if (this.values[index] === 0 && value > 0) this.trace.push({ x, y, intensity: value });
      this.values[index] = Math.max(this.values[index], value);
    }
    clear() { this.values.fill(0); this.trace = []; }
    count() { let total = 0; for (const value of this.values) if (value > 0) total++; return total; }
  }

  const raster = new VirtualGrid(GRID.width, GRID.height);

  function render() {
    canvas.width = GRID.width * cellSize + 1;
    canvas.height = GRID.height * cellSize + 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ui.gridSizeLabel.textContent = `${GRID.width} × ${GRID.height} ячеек`;
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < GRID.height; row++) {
      for (let col = 0; col < GRID.width; col++) {
        const value = raster.values[row * GRID.width + col];
        if (value > 0) {
          ctx.fillStyle = `rgba(96,119,80,${value})`;
          ctx.fillRect(col * cellSize + 1, row * cellSize + 1, cellSize - 1, cellSize - 1);
        }
      }
    }

    ctx.beginPath();
    ctx.strokeStyle = '#e4e0d6';
    ctx.lineWidth = 1;
    for (let col = 0; col <= GRID.width; col++) {
      const x = col * cellSize + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, GRID.height * cellSize);
    }
    for (let row = 0; row <= GRID.height; row++) {
      const y = row * cellSize + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(GRID.width * cellSize, y);
    }
    ctx.stroke();

    const axisX = (0 - GRID.minX) * cellSize + 0.5;
    const axisY = (GRID.maxY - 0) * cellSize + 0.5;
    ctx.beginPath(); ctx.strokeStyle = '#75806b'; ctx.lineWidth = 1.5;
    ctx.moveTo(axisX, 0); ctx.lineTo(axisX, GRID.height * cellSize);
    ctx.moveTo(0, axisY); ctx.lineTo(GRID.width * cellSize, axisY); ctx.stroke();

    if (cellSize >= 14) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#7b8075';
      for (let x = GRID.minX; x <= GRID.maxX; x += 5) {
        const px = (x - GRID.minX) * cellSize;
        ctx.fillText(String(x), px + 3, Math.max(11, axisY - 4));
      }
      for (let y = GRID.minY; y <= GRID.maxY; y += 5) {
        const py = (GRID.maxY - y) * cellSize;
        if (y !== 0) ctx.fillText(String(y), axisX + 4, py - 3);
      }
    }
  }

  function plotStepwise(target, x0, y0, x1, y1) {
    let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
    const dx = x1 - x0;
    const slope = dx === 0 ? 0 : (y1 - y0) / dx;
    for (let x = x0; x <= x1; x++) {
      const y = Math.round(y0 + slope * (x - x0));
      target.setPixel(steep ? y : x, steep ? x : y);
    }
  }

  function plotDDA(target, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) { target.setPixel(x0, y0); return; }
    const xStep = dx / steps;
    const yStep = dy / steps;
    let x = x0, y = y0;
    for (let i = 0; i <= steps; i++) {
      target.setPixel(Math.round(x), Math.round(y));
      x += xStep; y += yStep;
    }
  }

  function plotBresenham(target, x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      target.setPixel(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x0 += sx; }
      if (doubled <= dx) { error += dx; y0 += sy; }
    }
  }


  // Xiaolin Wu's line algorithm: fractional position is split between two neighbouring pixels.
  function fractionalPart(value) { return value - Math.floor(value); }
  function reverseFraction(value) { return 1 - fractionalPart(value); }

  function plotWu(target, x0, y0, x1, y1) {
    if (x0 === x1 && y0 === y1) { target.setPixel(x0, y0, 1); return; }
    let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
    const dx = x1 - x0, dy = y1 - y0;
    const gradient = dx === 0 ? 0 : dy / dx;
    const plot = (x, y, intensity) => target.setPixel(steep ? y : x, steep ? x : y, intensity);

    let xEnd = Math.round(x0);
    let yEnd = y0 + gradient * (xEnd - x0);
    let xGap = reverseFraction(x0 + 0.5);
    let xPixel1 = xEnd, yPixel1 = Math.floor(yEnd);
    plot(xPixel1, yPixel1, reverseFraction(yEnd) * xGap);
    plot(xPixel1, yPixel1 + 1, fractionalPart(yEnd) * xGap);
    let interY = yEnd + gradient;

    xEnd = Math.round(x1);
    yEnd = y1 + gradient * (xEnd - x1);
    xGap = fractionalPart(x1 + 0.5);
    const xPixel2 = xEnd, yPixel2 = Math.floor(yEnd);
    for (let x = xPixel1 + 1; x < xPixel2; x++) {
      plot(x, Math.floor(interY), reverseFraction(interY));
      plot(x, Math.floor(interY) + 1, fractionalPart(interY));
      interY += gradient;
    }
    plot(xPixel2, yPixel2, reverseFraction(yEnd) * xGap);
    plot(xPixel2, yPixel2 + 1, fractionalPart(yEnd) * xGap);
  }

  function plotBresenhamCircle(target, cx, cy, radius) {
    let x = 0, y = Math.round(radius), decision = 3 - 2 * y;
    while (y >= x) {
      const points = [
        [cx + x, cy + y], [cx - x, cy + y], [cx + x, cy - y], [cx - x, cy - y],
        [cx + y, cy + x], [cx - y, cy + x], [cx + y, cy - x], [cx - y, cy - x]
      ];
      for (const [px, py] of points) target.setPixel(px, py);
      if (decision < 0) decision += 4 * x + 6;
      else { decision += 4 * (x - y) + 10; y--; }
      x++;
    }
  }

  function showOctants() {
    raster.clear();
    const directions = [[15,5],[15,11],[5,15],[-5,15],[-15,11],[-15,5],[-15,-5],[-8,-15]];
    for (const [x, y] of directions) plotBresenham(raster, 0, 0, x, y);
    render();
    ui.pixelMetric.textContent = String(raster.count());
    updateTrace();
    ui.methodMetric.textContent = 'Брезенхем · 8 октантов';
    ui.timeMetric.textContent = '—';
    message.textContent = 'Проверка восьми октантов: все отрезки растеризуются одной обобщённой целочисленной формулой.';
  }

  function showEndpoints() {
    raster.clear();
    const method = ui.algorithm.value;
    const started = performance.now();
    if (ui.primitive.value === 'circle') {
      plotBresenhamCircle(raster, Number(ui.cx.value), Number(ui.cy.value), Number(ui.radius.value));
    } else {
      const x0 = Number(ui.x0.value), y0 = Number(ui.y0.value);
      const x1 = Number(ui.x1.value), y1 = Number(ui.y1.value);
      if (method === 'dda') plotDDA(raster, x0, y0, x1, y1);
      else if (method === 'bresenham') plotBresenham(raster, x0, y0, x1, y1);
      else if (method === 'wu') plotWu(raster, x0, y0, x1, y1);
      else plotStepwise(raster, x0, y0, x1, y1);
    }
    const elapsed = performance.now() - started;
    render();
    updateTrace();
    ui.pixelMetric.textContent = String(raster.count());
    ui.timeMetric.textContent = elapsed.toFixed(3);
    const objectName = ui.primitive.value === 'circle' ? 'Окружность Брезенхема' : ({ step: 'Пошаговый алгоритм', dda: 'ЦДА', bresenham: 'Брезенхем', wu: 'Ву · сглаживание' })[method];
    ui.methodMetric.textContent = objectName;
    message.textContent = `${objectName}: растр построен за ${elapsed.toFixed(3)} мс. Координаты привязаны к центрам ячеек.`;
  }

  ui.primitive.addEventListener('change', () => {
    const isCircle = ui.primitive.value === 'circle';
    ui.lineCoordinates.classList.toggle('hidden', isCircle);
    ui.circleControls.classList.toggle('hidden', !isCircle);
    if (isCircle) ui.algorithm.disabled = true;
    else ui.algorithm.disabled = false;
    showEndpoints();
  });


  function updateTrace() {
    const shown = raster.trace.slice(0, 100);
    ui.traceCount.textContent = `${raster.trace.length} точек`;
    ui.traceTableBody.replaceChildren();
    shown.forEach((point, index) => {
      const row = document.createElement('tr');
      [index + 1, point.x, point.y, point.intensity.toFixed(2)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });
      ui.traceTableBody.appendChild(row);
    });
    if (raster.trace.length > shown.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = `Показаны первые ${shown.length} точек из ${raster.trace.length}.`;
      row.appendChild(cell);
      ui.traceTableBody.appendChild(row);
    }
  }

  function clearRaster() {
    raster.clear();
    render();
    updateTrace();
    ui.pixelMetric.textContent = '0';
    ui.timeMetric.textContent = '—';
    message.textContent = 'Виртуальный растр очищен.';
  }

  function downloadPNG() {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'raster-grid.png';
    link.click();
  }

  ui.draw.addEventListener('click', showEndpoints);
  ui.octantDemo.addEventListener('click', showOctants);
  ui.clearRaster.addEventListener('click', clearRaster);
  ui.downloadImage.addEventListener('click', downloadPNG);
  ui.zoomIn.addEventListener('click', () => { cellSize = Math.min(24, cellSize + 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });
  ui.zoomOut.addEventListener('click', () => { cellSize = Math.max(8, cellSize - 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });

  let nextPoint = 0;
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    const x = Math.floor(px / cellSize) + GRID.minX;
    const y = GRID.maxY - Math.floor(py / cellSize);
    if (x >= GRID.minX && x <= GRID.maxX && y >= GRID.minY && y <= GRID.maxY) {
      ui.cursorReadout.textContent = `Координаты: (${x}, ${y})`;
    } else ui.cursorReadout.textContent = 'Координаты: вне сетки';
  });
  canvas.addEventListener('mouseleave', () => { ui.cursorReadout.textContent = 'Координаты: —'; });
  canvas.addEventListener('click', (event) => {
    if (ui.primitive.value !== 'line') return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    const x = Math.max(GRID.minX, Math.min(GRID.maxX, Math.floor(px / cellSize) + GRID.minX));
    const y = Math.max(GRID.minY, Math.min(GRID.maxY, GRID.maxY - Math.floor(py / cellSize)));
    if (nextPoint === 0) { ui.x0.value = x; ui.y0.value = y; nextPoint = 1; message.textContent = `Начало отрезка задано: (${x}, ${y}). Выберите вторую точку.`; }
    else { ui.x1.value = x; ui.y1.value = y; nextPoint = 0; message.textContent = `Конец отрезка задан: (${x}, ${y}). Нажмите «Построить».`; }
  });

  showEndpoints();
})();
