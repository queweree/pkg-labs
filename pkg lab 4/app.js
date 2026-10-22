(() => {
  'use strict';

  const canvas = document.getElementById('rasterCanvas');
  const ctx = canvas.getContext('2d');
  const message = document.getElementById('message');
  const ui = {
    x0: document.getElementById('x0'), y0: document.getElementById('y0'),
    x1: document.getElementById('x1'), y1: document.getElementById('y1'),
    draw: document.getElementById('drawButton'), zoomIn: document.getElementById('zoomIn'),
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

  function showEndpoints() {
    raster.clear();
    raster.setPixel(Number(ui.x0.value), Number(ui.y0.value));
    raster.setPixel(Number(ui.x1.value), Number(ui.y1.value));
    render();
    message.textContent = 'Виртуальный растр заполнен двумя опорными точками. Одна координатная пара — одна ячейка массива.';
  }

  ui.draw.addEventListener('click', showEndpoints);
  ui.zoomIn.addEventListener('click', () => { cellSize = Math.min(24, cellSize + 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });
  ui.zoomOut.addEventListener('click', () => { cellSize = Math.max(8, cellSize - 2); ui.zoomValue.textContent = `${cellSize} px`; render(); });

  showEndpoints();
})();
