(() => {
  'use strict';

  const canvas = document.getElementById('rasterCanvas');
  const ctx = canvas.getContext('2d');
  const message = document.getElementById('message');
  const ui = {
    primitive: document.getElementById('primitive'), lineCoordinates: document.querySelector('.line-coordinates'), circleControls: document.getElementById('circleControls'), curveControls: document.getElementById('curveControls'),
    cx: document.getElementById('cx'), cy: document.getElementById('cy'), radius: document.getElementById('radius'), octantDemo: document.getElementById('octantDemo'),
    clearRaster: document.getElementById('clearRaster'), downloadImage: document.getElementById('downloadImage'), traceCount: document.getElementById('traceCount'), traceTableBody: document.getElementById('traceTableBody'),
    cursorReadout: document.getElementById('cursorReadout'), pixelMetric: document.getElementById('pixelMetric'), timeMetric: document.getElementById('timeMetric'), methodMetric: document.getElementById('methodMetric'), gridSizeLabel: document.getElementById('gridSizeLabel'),
    x0: document.getElementById('x0'), y0: document.getElementById('y0'),
    x1: document.getElementById('x1'), y1: document.getElementById('y1'),
    qx0: document.getElementById('qx0'), qy0: document.getElementById('qy0'), qxc: document.getElementById('qxc'), qyc: document.getElementById('qyc'), qx1: document.getElementById('qx1'), qy1: document.getElementById('qy1'),
    draw: document.getElementById('drawButton'), algorithm: document.getElementById('algorithm'), zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'), zoomValue: document.getElementById('zoomValue'),
    runBenchmark: document.getElementById('runBenchmark'), benchmarkStatus: document.getElementById('benchmarkStatus'), benchmarkProgress: document.getElementById('benchmarkProgress'),
    lineBenchStat: document.getElementById('lineBenchStat'), circleBenchStat: document.getElementById('circleBenchStat'), totalBenchStat: document.getElementById('totalBenchStat'),
    countChart: document.getElementById('countChart'), lengthChart: document.getElementById('lengthChart')
  };

  const GRID = { width: 41, height: 31, minX: -20, maxX: 20, minY: -15, maxY: 15 };
  let cellSize = 16;

  class VirtualGrid {
    constructor(width, height, minX = GRID.minX, maxY = GRID.maxY, minY = GRID.minY) {
      this.width = width; this.height = height;
      this.minX = minX; this.maxY = maxY; this.minY = minY;
      this.values = new Float32Array(width * height);
      this.trace = [];
    }
    setPixel(x, y, intensity = 1) {
      x = Math.round(x); y = Math.round(y);
      const col = x - this.minX;
      const row = this.maxY - y;
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


  function getOctant(dfdx, dfdy) {
    let oct = 0;
    if (dfdx < 0) { oct = 7; dfdx = -dfdx; }
    if (dfdy > 0) { oct ^= 3; dfdy = -dfdy; }
    if (dfdx > -dfdy) oct ^= 1;
    return oct + 1;
  }
  function truncDiv(value, divisor) { return Math.trunc(value / divisor); }

  // Integer finite-difference conic tracker based on Castle–Pitteway's approach.
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
    dxdiag = dydiag = 1; dxsquare = dysquare = 0;
    if ((octant + 1) & 4) { D = -D; dxdiag = -1; }
    if ((octant - 1) & 4) { E = -E; dydiag = -1; }
    if ((octant - 1) & 2) B = -B;
    if (octant & 2) {
      dysquare = dydiag; swap = A; A = C; C = swap; swap = D; D = E; E = swap;
    } else dxsquare = dxdiag;
    A *= 4; B *= 4; C *= 4; D *= 4; E *= 4; F *= 4;
    d = A + truncDiv(B, 2) + truncDiv(C, 4) + D + truncDiv(E, 2) + F;
    u = A + truncDiv(B, 2) + D; v = A + truncDiv(B, 2) + D + E;
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
        if (d < 0) { x += dxsquare; y += dysquare; u += k1; v += k2; d += u; }
        else { x += dxdiag; y += dydiag; u += k2; v += k3; d += v; }
        if (++guard > 100000) { plotBresenham(target, x, y, xe, ye); return; }
      }
      if (--octantCount < 0) { plotBresenham(target, x, y, xe, ye); return; }
      if (++octant & 1) {
        d = -d - u + v - k1 + k2; v = -2 * u + v - k1 + k2; u = -u - k1 + k2;
        k3 = -4 * k1 + 4 * k2 - k3; k2 = -2 * k1 + k2; k1 = -k1;
        swap = dxdiag; dxdiag = -dydiag; dydiag = swap;
      } else {
        d = -d + u - truncDiv(v, 2) + truncDiv(k2, 2) - truncDiv(3 * k3, 8);
        u = u - v + truncDiv(k2, 2) - truncDiv(k3, 2); v = -v + k2 - truncDiv(k3, 2);
        k1 = -k1 + 2 * k2 - k3; k2 = k2 - k3; k3 = -k3;
        swap = dxsquare; dxsquare = -dysquare; dysquare = swap;
      }
    }
  }
  function plotPittewayCurve(target, xs, ys, xc, yc, xe, ye) {
    let xq = xe - xs, yq = ye - ys, xr = xc - xs, yr = yc - ys;
    let xprod = xr * yq - xq * yr;
    let A, B, C, D, E, F;
    if (xprod === 0) { plotBresenham(target, xs, ys, xc, yc); plotBresenham(target, xc, yc, xe, ye); return; }
    if (xprod < 0) { [xs, xe] = [xe, xs]; [ys, ye] = [ye, ys]; xq = -xq; yq = -yq; xr += xq; yr += yq; xprod = -xprod; }
    A = 4 * (yr - yq) * yr + yq * yq;
    B = 4 * ((xq - xr) * yr - (yr - yq) * xr) - 2 * xq * yq;
    C = 4 * (xr - xq) * xr + xq * xq;
    D = 4 * yr * xprod; E = -4 * xr * xprod; F = 0;
    pittewayConic(target, xs, ys, xe, ye, A, B, C, D, E, F);
    target.setPixel(xs, ys, 1); target.setPixel(xe, ye, 1);
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
    } else if (ui.primitive.value === 'curve') {
      plotPittewayCurve(raster, Number(ui.qx0.value), Number(ui.qy0.value), Number(ui.qxc.value), Number(ui.qyc.value), Number(ui.qx1.value), Number(ui.qy1.value));
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
    const objectName = ui.primitive.value === 'circle' ? 'Окружность Брезенхема' : ui.primitive.value === 'curve' ? 'Дуга Кастла–Питвея' : ({ step: 'Пошаговый алгоритм', dda: 'ЦДА', bresenham: 'Брезенхем', wu: 'Ву · сглаживание' })[method];
    ui.methodMetric.textContent = objectName;
    message.textContent = `${objectName}: растр построен за ${elapsed.toFixed(3)} мс. Координаты привязаны к центрам ячеек.`;
  }

  ui.primitive.addEventListener('change', () => {
    const isCircle = ui.primitive.value === 'circle';
    const isCurve = ui.primitive.value === 'curve';
    ui.lineCoordinates.classList.toggle('hidden', isCircle || isCurve);
    ui.circleControls.classList.toggle('hidden', !isCircle);
    ui.curveControls.classList.toggle('hidden', !isCurve);
    ui.algorithm.disabled = isCircle || isCurve;
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



  function drawLineChart(canvas, series, options={}) {
    const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    const pad={left:58,right:18,top:20,bottom:48};
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,W,H);
    const plotW=W-pad.left-pad.right, plotH=H-pad.top-pad.bottom;
    const all=series.flatMap(s=>s.points); if (!all.length) return;
    const maxX=Math.max(1,...all.map(p=>p.x)), maxY=Math.max(1,...all.map(p=>p.y))*1.12;
    ctx.font='12px system-ui'; ctx.textAlign='right'; ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){const y=pad.top+plotH*i/4;ctx.strokeStyle='#e8e3d8';ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();ctx.fillStyle='#6e7369';ctx.fillText((maxY*(4-i)/4).toFixed(0),pad.left-8,y);}
    for(let i=0;i<=4;i++){const x=pad.left+plotW*i/4;ctx.strokeStyle='#f0ece3';ctx.beginPath();ctx.moveTo(x,pad.top);ctx.lineTo(x,H-pad.bottom);ctx.stroke();ctx.fillStyle='#6e7369';ctx.textAlign='center';ctx.fillText(Math.round(maxX*i/4).toLocaleString('ru-RU'),x,H-pad.bottom+14);}
    const colors=['#647c52','#b76d4e','#7d8d9b'];
    series.forEach((s,si)=>{ctx.beginPath();ctx.strokeStyle=colors[si%colors.length];ctx.lineWidth=2.4;s.points.forEach((p,i)=>{const x=pad.left+p.x/maxX*plotW,y=H-pad.bottom-p.y/maxY*plotH;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});
    ctx.fillStyle='#4a5244';ctx.textAlign='center';ctx.fillText(options.xLabel||'Количество примитивов',pad.left+plotW/2,H-12);
    ctx.save();ctx.translate(16,pad.top+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillText(options.yLabel||'Время, мс',0,0);ctx.restore();
    ctx.textAlign='left';let lx=pad.left;series.forEach((s,i)=>{ctx.fillStyle=colors[i%colors.length];ctx.fillRect(lx,pad.top,14,3);ctx.fillStyle='#4a5244';ctx.fillText(s.name,lx+19,pad.top+2);lx+=ctx.measureText(s.name).width+42;});
  }
  async function measureLengthSeries(method) {
    const lengths=[16,32,64,96,128,192,256], count=1000, target=new VirtualGrid(512,512,0,511,0);
    const fn=({step:plotStepwise,dda:plotDDA,bresenham:plotBresenham,wu:plotWu})[method]||plotBresenham;
    const result=[];
    for(const length of lengths){
      const lines=Array.from({length:count},(_,i)=>{const x=20+(i%100)*2,y=30+Math.floor(i/100)*4;return [x,y,Math.min(510,x+length),Math.min(510,y+Math.round(length*.37))];});
      const start=performance.now();for(const line of lines)fn(target,...line);const elapsed=performance.now()-start;
      result.push({x:length,y:elapsed});await nextFrame();
    }
    return result;
  }
  function updateBenchmarkCharts(results) {
    if(!results)return;
    drawLineChart(ui.countChart,[{name:'Отрезки',points:results.lineSeries},{name:'Окружности',points:results.circleSeries}],{xLabel:'Обработано примитивов',yLabel:'Накопленное время, мс'});
    drawLineChart(ui.lengthChart,[{name:'Время обработки',points:results.lengthSeries||[]}],{xLabel:'Длина отрезка, пикселей',yLabel:'Время на 1 000 линий, мс'});
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  }
  const benchmarkState = { results: null, running: false };
  const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
  const formatMs = value => `${value.toFixed(value < 10 ? 3 : 1)} мс`;
  async function runStressBenchmark() {
    if (benchmarkState.running) return;
    benchmarkState.running = true;
    ui.runBenchmark.disabled = true;
    ui.benchmarkStatus.textContent = 'Подготовка тестовых данных…';
    ui.benchmarkProgress.style.width = '0%';
    try {
      const randomLine = seededRandom(20261024), randomCircle = seededRandom(20261025);
      // Dataset generation intentionally happens outside the measured loops.
      const lines = new Array(100000);
      const octantVectors = [[1,1],[1,1],[-1,1],[-1,1],[-1,-1],[-1,-1],[1,-1],[1,-1]];
      for (let i=0;i<lines.length;i++) {
        // A sun-like test set: evenly distribute line directions over the eight octants.
        const octant = i % 8, major = 4 + Math.floor(randomLine()*180), minor = Math.floor(randomLine()*(major+1));
        const vectors = [[major,minor],[minor,major],[-minor,major],[-major,minor],[-major,-minor],[-minor,-major],[minor,-major],[major,-minor]];
        const [dx,dy] = vectors[octant];
        const x0=256, y0=256;
        lines[i]=[x0,y0,x0+dx,y0+dy];
      }
      const circles = new Array(50000);
      for (let i=0;i<circles.length;i++) {
        const radius = 2 + Math.floor(randomCircle()*36);
        circles[i]=[radius+Math.floor(randomCircle()*(512-2*radius)),radius+Math.floor(randomCircle()*(512-2*radius)),radius];
      }
      const target = new VirtualGrid(512,512,0,511,0);
      const lineFunction = ({step:plotStepwise, dda:plotDDA, bresenham:plotBresenham, wu:plotWu})[ui.algorithm.value] || plotBresenham;
      const lineSeries=[], circleSeries=[];
      let lineTime=0, circleTime=0;
      for (let start=0;start<lines.length;start+=5000) {
        const stop=Math.min(start+5000,lines.length), t0=performance.now();
        for (let i=start;i<stop;i++) lineFunction(target,...lines[i]);
        lineTime += performance.now()-t0;
        if (stop%10000===0 || stop===lines.length) lineSeries.push({x:stop,y:lineTime});
        ui.benchmarkProgress.style.width=`${stop/100000*60}%`;
        ui.benchmarkStatus.textContent=`Отрезки: ${stop.toLocaleString('ru-RU')} / 100 000`;
        await nextFrame();
      }
      for (let start=0;start<circles.length;start+=2500) {
        const stop=Math.min(start+2500,circles.length), t0=performance.now();
        for (let i=start;i<stop;i++) plotBresenhamCircle(target,...circles[i]);
        circleTime += performance.now()-t0;
        if (stop%5000===0 || stop===circles.length) circleSeries.push({x:stop,y:circleTime});
        ui.benchmarkProgress.style.width=`${60+stop/50000*40}%`;
        ui.benchmarkStatus.textContent=`Окружности: ${stop.toLocaleString('ru-RU')} / 50 000`;
        await nextFrame();
      }
      benchmarkState.results={method:ui.algorithm.value,lineTime,circleTime,totalTime:lineTime+circleTime,lineSeries,circleSeries};
      ui.lineBenchStat.textContent=formatMs(lineTime);
      ui.circleBenchStat.textContent=formatMs(circleTime);
      ui.totalBenchStat.textContent=formatMs(lineTime+circleTime);
      ui.benchmarkStatus.textContent='Измерение зависимости от длины отрезка…';
      benchmarkState.results.lengthSeries = await measureLengthSeries(ui.algorithm.value);
      updateBenchmarkCharts(benchmarkState.results);
      ui.benchmarkProgress.style.width='100%';
      ui.benchmarkStatus.textContent='Тест завершён. Время измерено отдельно от подготовки данных и обновления интерфейса.';
    } catch (error) {
      console.error(error); ui.benchmarkStatus.textContent='Ошибка во время теста: '+error.message;
    } finally {
      benchmarkState.running=false; ui.runBenchmark.disabled=false;
    }
  }

  ui.runBenchmark.addEventListener("click", runStressBenchmark);

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
