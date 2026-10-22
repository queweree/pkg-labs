(() => {
  'use strict';

  const canvas = document.getElementById('rasterCanvas');
  const ctx = canvas.getContext('2d');
  const message = document.getElementById('message');
  const ui = {
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
    }
    setPixel(x, y, intensity = 1) {
      x = Math.round(x); y = Math.round(y);
      const col = x - GRID.minX;
      const row = GRID.maxY - y;
      if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
      const index = row * this.width + col;
      this.values[index] = Math.max(this.values[index], Math.max(0, Math.min(1, intensity)));
    }
    clear() { this.values.fill(0); }
  }

  const raster = new VirtualGrid(GRID.width, GRID.height);

  function render() {
    canvas.width = GRID.width * cellSize + 1;
    canvas.height = GRID.height * cellSize + 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  function showEndpoints() {
    raster.clear();
    const x0 = Number(ui.x0.value), y0 = Number(ui.y0.value);
    const x1 = Number(ui.x1.value), y1 = Number(ui.y1.value);
    const method = ui.algorithm.value;
    const started = performance.now();
    if (method === 'dda') plotDDA(raster, x0, y0, x1, y1);
    else if (method === 'bresenham') plotBresenham(raster, x0, y0, x1, y1);
    else plotStepwise(raster, x0, y0, x1, y1);
    const elapsed = performance.now() - started;
    render();
    message.textContent = `${({ step: 'Пошаговый алгоритм', dda: 'ЦДА', bresenham: 'Брезенхем' })[method]}: растр построен за ${elapsed.toFixed(3)} мс. Алгоритм работает с целочисленными ячейками.`;
  }

  ui.draw.addEventListener('click', showEndpoints);
  ui.zoomIn.addEventListener('click', () => { cellSize = Math.min(24, cellSize + 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });
  ui.zoomOut.addEventListener('click', () => { cellSize = Math.max(8, cellSize - 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });

  showEndpoints();
})();
