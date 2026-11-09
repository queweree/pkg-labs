/*
 * app.js — интерфейс лабораторной работы 5.
 *
 * Разделы:
 *   1. общие утилиты и Canvas-трансформации;
 *   2. основное поле (отрезки);
 *   3. многоугольники;
 *   4. Quadtree, 500 000 отрезков и замеры;
 *   5. автоматические тест-кейсы.
 */
(function () {
  'use strict';

  window.addEventListener('error', function (event) {
    var el = document.getElementById('toast');
    if (el) {
      el.textContent = 'Ошибка JavaScript: ' + (event.message || 'unknown');
      el.classList.add('show', 'error');
    }
  });

  const G = window.Geometry;
  const PC = window.PolygonClipper;
  const QT = window.Quadtree;
  const EPS = G.EPS;

  const $ = function (selector, scope) {
    return (scope || document).querySelector(selector);
  };

  const $$ = function (selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  };

  const VARIANT_METHOD = 'liang';
  const METHOD_NAMES = {
    sutherland: 'Сазерленд–Коэн',
    liang: 'Лианг–Барски',
    cyrus: 'Сайрус–Бек'
  };

  const COLORS = {
    bg: '#fbf9f2',
    grid: '#e9e4d8',
    gridStrong: '#ded8ca',
    axis: '#a8ad9f',
    label: '#8b8f83',
    original: '#b5ad9c',
    originalSoft: 'rgba(181, 173, 156, 0.55)',
    visible: '#55704a',
    visibleSoft: 'rgba(85, 112, 74, 0.52)',
    window: '#b46f50',
    windowFill: 'rgba(180, 111, 80, 0.055)',
    handleFill: '#fffdf8',
    tree: 'rgba(95, 120, 80, 0.18)',
    treeStrong: 'rgba(95, 120, 80, 0.38)',
    point: '#b46f50',
    clay: '#b46f50',
    ink: '#2b3129',
    muted: '#7d8276'
  };

  const numberFmt = new Intl.NumberFormat('ru-RU');
  const MONO_FONT = '8px ui-monospace, SFMono-Regular, Menlo, monospace';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fmtInt(value) {
    return numberFmt.format(Math.round(value));
  }

  function fmtCoord(value) {
    if (Math.abs(value) < 1e-9) return '0';
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  function fmtMs(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const d = digits === undefined ? (value >= 100 ? 1 : value >= 10 ? 2 : 3) : digits;
    return value.toFixed(d);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        resolve();
      });
    });
  }

  function toast(message, isError) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      el.classList.remove('show');
    }, 3200);
  }

  function downloadBlob(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 800);
  }

  /* ------------------------------------------------------------------ */
  /* Canvas helpers                                                      */
  /* ------------------------------------------------------------------ */

  function canvasSurface(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth));
    const h = Math.max(1, Math.round(canvas.clientHeight));
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function worldToScreen(view, x, y, w, h) {
    return {
      x: w / 2 + (x - view.cx) * view.scale,
      y: h / 2 - (y - view.cy) * view.scale
    };
  }

  function screenToWorld(view, sx, sy, w, h) {
    return {
      x: view.cx + (sx - w / 2) / view.scale,
      y: view.cy - (sy - h / 2) / view.scale
    };
  }

  function fitView(view, bounds, w, h, padding) {
    const pad = padding === undefined ? 46 : padding;
    const bw = Math.max(bounds.xmax - bounds.xmin, 1e-6);
    const bh = Math.max(bounds.ymax - bounds.ymin, 1e-6);
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    view.scale = clamp(scale, 0.02, 4000);
    view.cx = (bounds.xmin + bounds.xmax) / 2;
    view.cy = (bounds.ymin + bounds.ymax) / 2;
  }

  function expandBox(box, x, y) {
    if (!box) return { xmin: x, ymin: y, xmax: x, ymax: y };
    box.xmin = Math.min(box.xmin, x);
    box.ymin = Math.min(box.ymin, y);
    box.xmax = Math.max(box.xmax, x);
    box.ymax = Math.max(box.ymax, y);
    return box;
  }

  function niceStep(raw) {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    let mult = 1;
    if (norm <= 1) mult = 1;
    else if (norm <= 2) mult = 2;
    else if (norm <= 5) mult = 5;
    else mult = 10;
    return mult * pow;
  }

  function drawGrid(ctx, view, w, h, options) {
    const opts = options || {};
    ctx.fillStyle = opts.background || COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const target = 68;
    const step = niceStep(target / view.scale);
    const topLeft = screenToWorld(view, 0, 0, w, h);
    const bottomRight = screenToWorld(view, w, h, w, h);
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    const firstX = Math.ceil((minX - EPS) / step) * step;
    for (let x = firstX; x <= maxX + EPS; x += step) {
      const sx = worldToScreen(view, x, 0, w, h).x;
      ctx.moveTo(Math.round(sx) + 0.5, 0);
      ctx.lineTo(Math.round(sx) + 0.5, h);
    }
    const firstY = Math.ceil((minY - EPS) / step) * step;
    for (let y = firstY; y <= maxY + EPS; y += step) {
      const sy = worldToScreen(view, 0, y, w, h).y;
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(w, Math.round(sy) + 0.5);
    }
    ctx.stroke();

    const axes = [];
    if (minX <= 0 && maxX >= 0) axes.push('y');
    if (minY <= 0 && maxY >= 0) axes.push('x');

    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (axes.indexOf('y') !== -1) {
      const sx = Math.round(worldToScreen(view, 0, 0, w, h).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    if (axes.indexOf('x') !== -1) {
      const sy = Math.round(worldToScreen(view, 0, 0, w, h).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // Подписи сетки: по осям, а если ось за экраном — у нижнего/левого края.
    if (step * view.scale < 38) return;
    ctx.fillStyle = COLORS.label;
    ctx.font = MONO_FONT;
    ctx.textBaseline = 'top';
    const axisScreenY = worldToScreen(view, 0, 0, w, h).y;
    const labelY = axisScreenY >= 12 && axisScreenY <= h - 18 ? axisScreenY + 5 : h - 15;
    ctx.textAlign = 'center';
    for (let x = firstX; x <= maxX + EPS; x += step) {
      if (Math.abs(x) < step * 0.001) continue;
      const sx = worldToScreen(view, x, 0, w, h).x;
      if (sx < 18 || sx > w - 18) continue;
      ctx.fillText(fmtCoord(x), sx, labelY);
    }

    const axisScreenX = worldToScreen(view, 0, 0, w, h).x;
    const labelX = axisScreenX >= 28 && axisScreenX <= w - 38 ? axisScreenX + 6 : 7;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = firstY; y <= maxY + EPS; y += step) {
      if (Math.abs(y) < step * 0.001) continue;
      const sy = worldToScreen(view, 0, y, w, h).y;
      if (sy < 10 || sy > h - 10) continue;
      ctx.fillText(fmtCoord(y), labelX, sy);
    }
  }

  function drawWindowFill(ctx, win, view, w, h) {
    const a = worldToScreen(view, win.xmin, win.ymax, w, h);
    const b = worldToScreen(view, win.xmax, win.ymin, w, h);
    ctx.fillStyle = COLORS.windowFill;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  function windowHandlePoints(win, view, w, h) {
    const pts = [];
    const xs = [
      { hx: -1, x: win.xmin },
      { hx: 0, x: (win.xmin + win.xmax) / 2 },
      { hx: 1, x: win.xmax }
    ];
    const ys = [
      { hy: -1, y: win.ymin },
      { hy: 0, y: (win.ymin + win.ymax) / 2 },
      { hy: 1, y: win.ymax }
    ];
    for (let i = 0; i < xs.length; i++) {
      for (let k = 0; k < ys.length; k++) {
        if (xs[i].hx === 0 && ys[k].hy === 0) continue;
        const p = worldToScreen(view, xs[i].x, ys[k].y, w, h);
        pts.push({ hx: xs[i].hx, hy: ys[k].hy, x: p.x, y: p.y });
      }
    }
    return pts;
  }

  function drawWindowBorder(ctx, win, view, w, h, withHandles) {
    const a = worldToScreen(view, win.xmin, win.ymax, w, h);
    const b = worldToScreen(view, win.xmax, win.ymin, w, h);
    const rw = b.x - a.x;
    const rh = b.y - a.y;

    ctx.save();
    ctx.strokeStyle = COLORS.window;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(a.x, a.y, rw, rh);
    ctx.setLineDash([]);

    if (withHandles) {
      const handles = windowHandlePoints(win, view, w, h);
      for (let i = 0; i < handles.length; i++) {
        const p = handles[i];
        ctx.fillStyle = COLORS.handleFill;
        ctx.strokeStyle = COLORS.window;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.rect(p.x - 4.5, p.y - 4.5, 9, 9);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function handleAt(px, py, win, view, w, h) {
    const handles = windowHandlePoints(win, view, w, h);
    for (let i = 0; i < handles.length; i++) {
      const p = handles[i];
      if (Math.abs(px - p.x) <= 8 && Math.abs(py - p.y) <= 8) return p;
    }
    return null;
  }

  function cursorForHandle(handle) {
    if (!handle) return 'grab';
    if (handle.hx === -1 && handle.hy === 1) return 'nwse-resize';
    if (handle.hx === 1 && handle.hy === 1) return 'nesw-resize';
    if (handle.hx === -1 && handle.hy === -1) return 'nesw-resize';
    if (handle.hx === 1 && handle.hy === -1) return 'nwse-resize';
    if (handle.hx !== 0) return 'ew-resize';
    return 'ns-resize';
  }

  function pointInsideWindow(x, y, win) {
    return x >= win.xmin - EPS && x <= win.xmax + EPS && y >= win.ymin - EPS && y <= win.ymax + EPS;
  }

  function resizeWindow(win, handle, world, minSize) {
    const next = {
      xmin: win.xmin,
      ymin: win.ymin,
      xmax: win.xmax,
      ymax: win.ymax
    };
    const min = minSize || 0.5;
    if (handle.hx === -1) next.xmin = Math.min(world.x, win.xmax - min);
    if (handle.hx === 1) next.xmax = Math.max(world.x, win.xmin + min);
    if (handle.hy === -1) next.ymin = Math.min(world.y, win.ymax - min);
    if (handle.hy === 1) next.ymax = Math.max(world.y, win.ymin + min);
    return next;
  }

  function pointerPosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function zoomViewAround(view, surface, sx, sy, factor) {
    const before = screenToWorld(view, sx, sy, surface.w, surface.h);
    view.scale = clamp(view.scale * factor, 0.02, 4000);
    const after = screenToWorld(view, sx, sy, surface.w, surface.h);
    view.cx += before.x - after.x;
    view.cy += before.y - after.y;
  }

  function drawDegeneratePoints(ctx, results, view, w, h, radius) {
    const r = radius || 3.2;
    for (let i = 0; i < results.length; i++) {
      const clip = results[i].clip;
      if (!clip.degenerate) continue;
      const p = worldToScreen(view, clip.x1, clip.y1, w, h);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.handleFill;
      ctx.fill();
      ctx.strokeStyle = COLORS.point;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Default data                                                        */
  /* ------------------------------------------------------------------ */

  const DEFAULT_WINDOW = { xmin: -45, ymin: -30, xmax: 45, ymax: 30 };

  const DEFAULT_SEGMENT_DATA = [
    [-80, -20, 80, 10],
    [-70, 38, 70, 38],
    [-40, -20, 40, 20],
    [55, 40, 85, 60],
    [-60, -30, 60, -30],
    [-45, -30, 45, -30],
    [-45, 30, -45, -30],
    [45, 30, 45, -30],
    [-20, -45, -20, 45],
    [-45, 30, -45, 30],
    [0, 0, 0, 0],
    [-30, 45, 30, -45],
    [45, 30, 60, 45],
    [-85, 10, -55, 20],
    [20, -60, 35, -35],
    [-20, 30, 20, 30],
    [44, 29, 70, 29],
    [-60, 0, -38, 0]
  ];

  function makeSegments(rows) {
    return rows.map(function (row, index) {
      const s = {
        id: index,
        x1: row[0],
        y1: row[1],
        x2: row[2],
        y2: row[3],
        _stamp: 0
      };
      s.box = G.segmentBox(s);
      return s;
    });
  }

  function defaultSegments() {
    return makeSegments(DEFAULT_SEGMENT_DATA);
  }

  function segmentsBounds(segments, win) {
    let box = null;
    for (let i = 0; i < segments.length; i++) {
      box = expandBox(box, segments[i].x1, segments[i].y1);
      box = expandBox(box, segments[i].x2, segments[i].y2);
    }
    if (win) {
      box = expandBox(box, win.xmin, win.ymin);
      box = expandBox(box, win.xmax, win.ymax);
    }
    if (!box) box = { xmin: -50, ymin: -50, xmax: 50, ymax: 50 };
    const pad = Math.max(4, Math.max(box.xmax - box.xmin, box.ymax - box.ymin) * 0.05);
    return {
      xmin: box.xmin - pad,
      ymin: box.ymin - pad,
      xmax: box.xmax + pad,
      ymax: box.ymax + pad
    };
  }

  function parseSegmentsFile(text) {
    const cleaned = text.replace(/#.*$/gm, ' ').replace(/;/g, ' ').replace(/,/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) throw new Error('Файл пуст или содержит меньше шести чисел.');
    const numbers = tokens.map(Number);
    if (numbers.some(function (n) { return !Number.isFinite(n); })) {
      throw new Error('В файле есть нечисловые значения.');
    }
    const n = Math.floor(numbers[0]);
    if (!Number.isFinite(n) || n <= 0 || n > 200000) {
      throw new Error('Первое число должно быть количеством отрезков (1…200 000).');
    }
    if (numbers.length < 1 + n * 4 + 4) {
      throw new Error('Недостаточно координат: нужно ' + n + ' строк по 4 числа и окно из 4 чисел.');
    }
    const rows = [];
    let index = 1;
    for (let i = 0; i < n; i++) {
      rows.push([numbers[index], numbers[index + 1], numbers[index + 2], numbers[index + 3]]);
      index += 4;
    }
    const win = {
      xmin: numbers[index],
      ymin: numbers[index + 1],
      xmax: numbers[index + 2],
      ymax: numbers[index + 3]
    };
    return { segments: makeSegments(rows), window: normalizeWin(win) };
  }

  function normalizeWin(win) {
    return {
      xmin: Math.min(win.xmin, win.xmax),
      ymin: Math.min(win.ymin, win.ymax),
      xmax: Math.max(win.xmin, win.xmax),
      ymax: Math.max(win.ymin, win.ymax)
    };
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  const state = {
    main: {
      segments: defaultSegments(),
      window: Object.assign({}, DEFAULT_WINDOW),
      method: VARIANT_METHOD,
      edit: false,
      selected: null,
      showOriginal: true,
      showAabb: false,
      showTree: false,
      tree: null,
      result: null,
      time: 0,
      comparison: null,
      view: { cx: 0, cy: 0, scale: 0 },
      drag: null,
      lastMetric: null
    },
    poly: {
      preset: 'convex',
      algorithm: 'convex',
      contours: [],
      window: { xmin: 20, ymin: 20, xmax: 80, ymax: 80 },
      result: null,
      view: { cx: 0, cy: 0, scale: 0 },
      showOriginal: true,
      showFill: true,
      showNodes: true,
      edit: false,
      drag: null
    },
    perf: {
      dataset: null,
      groups: [],
      trees: null,
      count: 0,
      maxDepth: 8,
      capacity: 64,
      buildMs: 0,
      base: null,
      baseDirty: true,
      phase: 0,
      view: { cx: 500, cy: 500, scale: 0 },
      window: { xmin: 430, ymin: 405, xmax: 545, ymax: 495 },
      live: false,
      animationId: 0,
      lastFrameTs: 0,
      fpsFrames: [],
      fps: 0,
      lastStats: null,
      showTree: false,
      drag: null,
      busy: false,
      prepared: false,
      autoStarted: false,
      depthResults: null,
      densityResults: null
    }
  };

  /* ------------------------------------------------------------------ */
  /* Main workbench                                                      */
  /* ------------------------------------------------------------------ */

  const mainCanvas = $('#mainCanvas');

  function fitMainView() {
    const surface = canvasSurface(mainCanvas);
    fitView(state.main.view, segmentsBounds(state.main.segments, state.main.window), surface.w, surface.h, 58);
    renderMain();
  }

  function ensureMainTree() {
    if (!state.main.showTree || state.main.segments.length === 0) return;
    if (state.main.tree || state.main.drag?.type === 'segment') return;
    const bounds = segmentsBounds(state.main.segments, state.main.window);
    const tree = new QT.QuadTree(bounds, { maxDepth: 4, capacity: 4 });
    for (let i = 0; i < state.main.segments.length; i++) tree.insert(state.main.segments[i]);
    state.main.tree = tree;
  }

  function drawTreeCells(ctx, tree, rect, view, w, h, limit, stopDepth) {
    if (!tree) return;
    const stack = [tree.root];
    let drawn = 0;
    const max = limit || 700;
    ctx.save();
    ctx.strokeStyle = COLORS.tree;
    ctx.lineWidth = 1;
    while (stack.length && drawn < max) {
      const node = stack.pop();
      const b = node.bounds;
      if (b.xmax < rect.xmin - EPS || b.xmin > rect.xmax + EPS || b.ymax < rect.ymin - EPS || b.ymin > rect.ymax + EPS) {
        continue;
      }
      const drawHere = !node.children || (stopDepth !== undefined && node.depth >= stopDepth);
      if (drawHere) {
        const a = worldToScreen(view, b.xmin, b.ymax, w, h);
        const c = worldToScreen(view, b.xmax, b.ymin, w, h);
        const cw = c.x - a.x;
        if (cw >= 3) {
          ctx.strokeRect(a.x + 0.5, a.y + 0.5, cw, c.y - a.y);
          drawn++;
        }
        continue;
      }
      for (let i = 0; i < 4; i++) stack.push(node.children[i]);
    }
    ctx.restore();
  }

  function renderMain() {
    const surface = canvasSurface(mainCanvas);
    const ctx = surface.ctx;
    const w = surface.w;
    const h = surface.h;
    const view = state.main.view;
    const win = state.main.window;
    if (!view.scale) return;

    drawGrid(ctx, view, w, h);
    ensureMainTree();

    if (state.main.showTree && state.main.tree) {
      drawTreeCells(ctx, state.main.tree, segmentsBounds(state.main.segments, win), view, w, h, 900);
    }

    drawWindowFill(ctx, win, view, w, h);

    if (state.main.showOriginal) {
      ctx.beginPath();
      for (let i = 0; i < state.main.segments.length; i++) {
        const s = state.main.segments[i];
        const a = worldToScreen(view, s.x1, s.y1, w, h);
        const b = worldToScreen(view, s.x2, s.y2, w, h);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = COLORS.originalSoft;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (state.main.showAabb) {
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 0; i < state.main.segments.length; i++) {
        const s = state.main.segments[i];
        const code = G.outcodeBox(s.box, win);
        const a = worldToScreen(view, s.box.xmin, s.box.ymax, w, h);
        const b = worldToScreen(view, s.box.xmax, s.box.ymin, w, h);
        ctx.strokeStyle = code === 0 ? 'rgba(95,120,80,.32)' : 'rgba(180,111,80,.16)';
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (state.main.result) {
      const results = state.main.result.results;
      ctx.beginPath();
      for (let i = 0; i < results.length; i++) {
        const c = results[i].clip;
        const a = worldToScreen(view, c.x1, c.y1, w, h);
        const b = worldToScreen(view, c.x2, c.y2, w, h);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = COLORS.visible;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.stroke();
      drawDegeneratePoints(ctx, results, view, w, h);
    }

    drawWindowBorder(ctx, win, view, w, h, true);
    if (state.main.edit && state.main.selected) {
      const segment = state.main.selected;
      const a = worldToScreen(view, segment.x1, segment.y1, w, h);
      const b = worldToScreen(view, segment.x2, segment.y2, w, h);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.handleFill;
      for (const point of [a, b]) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function updateMethodUI() {
    $$('.method-option[data-method]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-method') === state.main.method);
    });
    $$('.algo-card').forEach(function (card) {
      card.classList.toggle('active', card.getAttribute('data-method') === state.main.method);
    });
    const name = METHOD_NAMES[state.main.method];
    $('#currentMethodName').textContent = name;
    $('#mainMeta').textContent = 'Вариант 11 · ' + fmtInt(state.main.segments.length) + ' отрезков · ' + name;
  }

  function syncWindowInputs() {
    const w = state.main.window;
    $('#winXmin').value = fmtCoord(w.xmin);
    $('#winYmin').value = fmtCoord(w.ymin);
    $('#winXmax').value = fmtCoord(w.xmax);
    $('#winYmax').value = fmtCoord(w.ymax);
    $('#mainWindowLabel').textContent =
      fmtCoord(w.xmin) + '…' + fmtCoord(w.xmax) + ' · ' + fmtCoord(w.ymin) + '…' + fmtCoord(w.ymax);
    $('#mainWindowLabel').title = 'x: ' + fmtCoord(w.xmin) + '…' + fmtCoord(w.xmax) + '; y: ' + fmtCoord(w.ymin) + '…' + fmtCoord(w.ymax);
  }

  function updateMainMetrics(result) {
    $('#mainTotal').textContent = fmtInt(state.main.segments.length);
    $('#mainVisible').textContent = fmtInt(result.visible);
    $('#mainPoints').textContent = 'вырожденных точек: ' + fmtInt(result.points);
    $('#mainRejected').textContent = fmtInt(result.rejected);
    $('#mainAabb').textContent = 'AABB-префильтр: ' + fmtInt(result.prefiltered);
    const value = state.main.time < 0.0005 ? '< 0.001' : state.main.time.toFixed(3);
    $('#mainTime').innerHTML = value + ' <small>мс</small>';
  }

  function updateMainComparison() {
    if (!state.main.segments.length) {
      $('#opsBody').innerHTML = '';
      return;
    }
    const methods = ['sutherland', 'liang', 'cyrus'];
    const iterations = clamp(Math.floor(250000 / state.main.segments.length), 1, 600);
    const rows = [];
    for (let m = 0; m < methods.length; m++) {
      const method = methods[m];
      const counters = G.makeCounters();
      G.clipAll(state.main.segments, state.main.window, method, { counters: counters, collect: false, aabb: false });

      const t0 = performance.now();
      let last = null;
      for (let k = 0; k < iterations; k++) {
        last = G.clipAll(state.main.segments, state.main.window, method, { counters: false, collect: false, aabb: false });
      }
      const elapsed = (performance.now() - t0) / iterations;

      const equal = method === VARIANT_METHOD || state.main.segments.every(function (segment) {
        const a = G.clipSegment(VARIANT_METHOD, segment, state.main.window);
        const b = G.clipSegment(method, segment, state.main.window);
        return G.sameResult(a, b);
      });
      if (!last) last = { visible: 0 };
      rows.push({
        method: method,
        mul: counters.mul,
        div: counters.div,
        add: counters.add,
        cmp: counters.cmp,
        time: elapsed,
        visible: last.visible,
        equal: equal
      });
    }

    const totalOps = rows.reduce(function (sum, row) {
      return sum + row.mul + row.div;
    }, 0);
    const allEqual = rows.every(function (row) { return row.equal; });
    state.main.comparison = { rows: rows, equal: allEqual };

    $('#opsBody').innerHTML = rows.map(function (row) {
      const sigma = row.mul + row.div + row.add;
      return (
        '<tr' + (row.method === state.main.method ? ' class="selected-row"' : '') + '>' +
          '<td class="method-name">' + METHOD_NAMES[row.method] + '</td>' +
          '<td class="num">' + fmtInt(row.mul) + '</td>' +
          '<td class="num">' + fmtInt(row.div) + '</td>' +
          '<td class="num">' + fmtInt(sigma) + '</td>' +
          '<td class="num">' + fmtInt(row.cmp) + '</td>' +
          '<td class="num">' + (row.time < 0.0005 ? '< 0.001' : row.time.toFixed(4)) + ' мс</td>' +
          '<td><span class="status-pill' + (row.equal ? '' : ' fail') + '">' + (row.equal ? (row.method === VARIANT_METHOD ? 'базовый' : '✓ совпал') : '≠') + '</span></td>' +
        '</tr>'
      );
    }).join('');

    $('#opsBadge').textContent = fmtInt(state.main.segments.length) + ' отрезков';
    $('#opsNote').textContent = 'Умножений/делений всего: ' + fmtInt(totalOps) +
      '. Время — среднее за ' + iterations + ' прогонов без подготовки Canvas. ' +
      (allEqual ? 'Все три метода дают одинаковую видимую часть.' : 'Обнаружено расхождение результатов — проверьте тесты.');
  }

  function recomputeMain(skipComparison) {
    const warmup = skipComparison ? 0 : clamp(Math.floor(25000 / Math.max(1, state.main.segments.length)), 0, 48);
    const t0 = performance.now();
    for (let i = 0; i < warmup; i++) {
      G.clipAll(state.main.segments, state.main.window, state.main.method, {
        collect: false,
        counters: false,
        aabb: true
      });
    }
    const elapsed = performance.now() - t0;
    const clipStart = performance.now();
    const result = G.clipAll(state.main.segments, state.main.window, state.main.method, {
      collect: true,
      counters: true,
      aabb: true
    });
    state.main.time = warmup ? elapsed / warmup : performance.now() - clipStart;
    state.main.result = result;
    updateMainMetrics(result);
    updateMethodUI();
    if (!skipComparison) updateMainComparison();
    renderMain();
  }

  function applyWindowFromInputs(prefix) {
    const isPoly = prefix === 'poly';
    const ids = isPoly
      ? ['polyXmin', 'polyYmin', 'polyXmax', 'polyYmax']
      : ['winXmin', 'winYmin', 'winXmax', 'winYmax'];
    const values = ids.map(function (id) {
      return Number($('#' + id).value);
    });
    if (values.some(function (value) { return !Number.isFinite(value); })) {
      toast('Введите числовые координаты окна.', true);
      return;
    }
    const w = { xmin: values[0], ymin: values[1], xmax: values[2], ymax: values[3] };
    if (Math.abs(w.xmax - w.xmin) < 0.5 || Math.abs(w.ymax - w.ymin) < 0.5) {
      toast('Окно должно иметь ненулевой размер (минимум 0.5).', true);
      return;
    }
    const norm = normalizeWin(w);
    if (isPoly) {
      state.poly.window = norm;
      updatePoly();
    } else {
      state.main.window = norm;
      syncWindowInputs();
      recomputeMain();
    }
  }

  function loadMainData(segments, win, message) {
    state.main.segments = segments;
    state.main.selected = null;
    state.main.window = normalizeWin(win);
    state.main.tree = null;
    state.main.view.scale = 0;
    syncWindowInputs();
    fitMainView();
    recomputeMain();
    $('#mainDatasetInfo').textContent = fmtInt(segments.length) + ' сегментов';
    if (message) toast(message);
  }

  function randomSegments(count) {
    const rows = [];
    let seed = 0x2f6e2b1 + count;
    function rnd() {
      seed += 0x6d2b79f5;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const win = { xmin: -45, ymin: -30, xmax: 45, ymax: 30 };
    for (let i = 0; i < count; i++) {
      const angle = rnd() * Math.PI * 2;
      const len = 15 + rnd() * 115;
      const x = -80 + rnd() * 160;
      const y = -55 + rnd() * 110;
      rows.push([x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len]);
    }
    return { segments: makeSegments(rows), window: win };
  }

  function bindMain() {
    $('#methodSwitch').addEventListener('click', function (event) {
      const button = event.target.closest('[data-method]');
      if (!button) return;
      state.main.method = button.getAttribute('data-method');
      recomputeMain();
    });

    $$('.algo-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.main.method = card.getAttribute('data-method');
        recomputeMain();
        document.getElementById('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    $('#applyWindow').addEventListener('click', function () {
      applyWindowFromInputs('main');
    });

    ['winXmin', 'winYmin', 'winXmax', 'winYmax'].forEach(function (id) {
      $('#' + id).addEventListener('keydown', function (event) {
        if (event.key === 'Enter') applyWindowFromInputs('main');
      });
    });

    $('#showOriginal').addEventListener('change', function (event) {
      state.main.showOriginal = event.target.checked;
      renderMain();
    });

    $('#showAabb').addEventListener('change', function (event) {
      state.main.showAabb = event.target.checked;
      renderMain();
    });

    $('#showMainTree').addEventListener('change', function (event) {
      state.main.showTree = event.target.checked;
      if (state.main.showTree) state.main.tree = null;
      renderMain();
    });

    $('#mainZoomIn').addEventListener('click', function () {
      const surface = canvasSurface(mainCanvas);
      zoomViewAround(state.main.view, surface, surface.w / 2, surface.h / 2, 1.3);
      renderMain();
    });

    $('#mainZoomOut').addEventListener('click', function () {
      const surface = canvasSurface(mainCanvas);
      zoomViewAround(state.main.view, surface, surface.w / 2, surface.h / 2, 1 / 1.3);
      renderMain();
    });

    $('#mainFit').addEventListener('click', fitMainView);
    $('#mainEditToggle').addEventListener('click', function () {
      state.main.edit = !state.main.edit;
      if (!state.main.edit) state.main.selected = null;
      this.classList.toggle('active', state.main.edit);
      this.setAttribute('aria-pressed', String(state.main.edit));
      $('#mainHint').textContent = state.main.edit
        ? 'Тяните отрезок за линию для переноса, за конец — для изменения длины и угла.'
        : 'Тяните окно за центр, ручки меняют размер. ✎ включает правку отрезков.';
      renderMain();
    });

    $('#randomMain').addEventListener('click', function () {
      const data = randomSegments(26);
      loadMainData(data.segments, data.window, 'Сгенерировано 26 случайных отрезков.');
    });

    $('#resetMain').addEventListener('click', function () {
      loadMainData(defaultSegments(), DEFAULT_WINDOW, 'Демо-набор восстановлен.');
    });

    $('#mainFileInput').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = parseSegmentsFile(String(reader.result || ''));
          loadMainData(parsed.segments, parsed.window, 'Загружено: ' + file.name);
        } catch (error) {
          toast(error.message, true);
        }
      };
      reader.onerror = function () {
        toast('Не удалось прочитать файл.', true);
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    $('#exportMainPng').addEventListener('click', function () {
      const canvas = mainCanvas;
      const a = document.createElement('a');
      a.download = 'clipping-segments.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });

    bindMainPointer();
  }

  function hitSegment(pos, view, w, h) {
    let best = null;
    for (const segment of state.main.segments) {
      if (!state.main.showOriginal && segment !== state.main.selected) continue;
      const a = worldToScreen(view, segment.x1, segment.y1, w, h);
      const b = worldToScreen(view, segment.x2, segment.y2, w, h);
      const d1 = Math.hypot(pos.x - a.x, pos.y - a.y);
      const d2 = Math.hypot(pos.x - b.x, pos.y - b.y);
      const end = Math.min(d1, d2) <= 7 ? (d1 < d2 ? 1 : 2) : 0;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length2 = dx * dx + dy * dy;
      const t = length2 > 0 ? clamp(((pos.x - a.x) * dx + (pos.y - a.y) * dy) / length2, 0, 1) : 0;
      const distance = end ? Math.min(d1, d2) : Math.hypot(pos.x - a.x - t * dx, pos.y - a.y - t * dy);
      if (end && segment === state.main.selected) return { segment: segment, end: end };
      if (distance <= 7 && (!best || distance < best.distance)) best = { segment: segment, end: end, distance: distance };
    }
    return best;
  }

  function bindMainPointer() {
    const canvas = mainCanvas;
    canvas.addEventListener('pointerdown', function (event) {
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.main.view;
      const win = state.main.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
      const hit = state.main.edit && hitSegment(pos, view, surface.w, surface.h);
      canvas.setPointerCapture(event.pointerId);

      if (hit) {
        state.main.selected = hit.segment;
        state.main.drag = { type: 'segment', end: hit.end, startWorld: world, initial: { ...hit.segment } };
        canvas.style.cursor = 'grabbing';
        renderMain();
      } else if (handle) {
        state.main.drag = { type: 'resize', handle: handle };
        canvas.style.cursor = cursorForHandle(handle);
      } else if (pointInsideWindow(world.x, world.y, win)) {
        state.main.drag = {
          type: 'move',
          startWorld: world,
          startWindow: Object.assign({}, win)
        };
        canvas.style.cursor = 'move';
      } else {
        state.main.drag = {
          type: 'pan',
          startX: pos.x,
          startY: pos.y,
          cx: view.cx,
          cy: view.cy,
          scale: view.scale
        };
        canvas.style.cursor = 'grabbing';
      }
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', function (event) {
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.main.view;
      const win = state.main.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const readout = $('#mainCursor');
      readout.textContent = 'Курсор: x = ' + fmtCoord(world.x) + ' · y = ' + fmtCoord(world.y);

      const drag = state.main.drag;
      if (!drag) {
        const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
        const hit = state.main.edit && hitSegment(pos, view, surface.w, surface.h);
        canvas.style.cursor = hit ? (hit.end ? 'crosshair' : 'move')
          : handle ? cursorForHandle(handle) : pointInsideWindow(world.x, world.y, win) ? 'move' : 'grab';
        return;
      }

      if (drag.type === 'segment') {
        const s = state.main.selected;
        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        if (drag.end !== 2) {
          s.x1 = drag.initial.x1 + dx;
          s.y1 = drag.initial.y1 + dy;
        }
        if (drag.end !== 1) {
          s.x2 = drag.initial.x2 + dx;
          s.y2 = drag.initial.y2 + dy;
        }
        s.box = G.segmentBox(s);
        state.main.tree = null;
        recomputeMain(true);
      } else if (drag.type === 'resize') {
        state.main.window = resizeWindow(win, drag.handle, world, 1);
        syncWindowInputs();
        recomputeMain(true);
      } else if (drag.type === 'move') {
        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        state.main.window = {
          xmin: drag.startWindow.xmin + dx,
          ymin: drag.startWindow.ymin + dy,
          xmax: drag.startWindow.xmax + dx,
          ymax: drag.startWindow.ymax + dy
        };
        syncWindowInputs();
        recomputeMain(true);
      } else if (drag.type === 'pan') {
        view.cx = drag.cx - (pos.x - drag.startX) / drag.scale;
        view.cy = drag.cy + (pos.y - drag.startY) / drag.scale;
        renderMain();
      }
    });

    function endDrag() {
      if (state.main.drag) {
        state.main.drag = null;
        recomputeMain();
      }
      canvas.style.cursor = 'grab';
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (!state.main.drag) {
        $('#mainCursor').textContent = 'Курсор: наведите на поле';
      }
    });

    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const factor = Math.exp(-event.deltaY * 0.0014);
      zoomViewAround(state.main.view, surface, pos.x, pos.y, factor);
      renderMain();
    }, { passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Polygon workbench                                                   */
  /* ------------------------------------------------------------------ */

  function pentagramContour(cx, cy, radius, points) {
    const count = points || 5;
    const result = [];
    for (let k = 0; k < count; k++) {
      const index = (k * 2) % count;
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      result.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    return result;
  }

  function regularPolygonContour(cx, cy, radius, count, rotation) {
    const result = [];
    const rot = rotation === undefined ? -Math.PI / 2 : rotation;
    for (let i = 0; i < count; i++) {
      const angle = rot + (i * Math.PI * 2) / count;
      result.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    return result;
  }

  const POLY_PRESETS = {
    convex: {
      name: 'Выпуклый шестиугольник',
      algorithm: 'convex',
      contours: [regularPolygonContour(50, 50, 38, 6, -Math.PI / 2)],
      window: { xmin: 20, ymin: 20, xmax: 80, ymax: 80 }
    },
    concave: {
      name: 'Вогнутый L-профиль',
      algorithm: 'general',
      contours: [[
        { x: 8, y: 14 }, { x: 62, y: 14 }, { x: 62, y: 40 }, { x: 86, y: 40 },
        { x: 86, y: 86 }, { x: 42, y: 86 }, { x: 42, y: 62 }, { x: 8, y: 62 }
      ]],
      window: { xmin: 25, ymin: 28, xmax: 75, ymax: 72 }
    },
    hole: {
      name: 'Фигура с отверстием',
      algorithm: 'general',
      contours: [
        [{ x: 6, y: 8 }, { x: 94, y: 8 }, { x: 94, y: 92 }, { x: 6, y: 92 }],
        [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }]
      ],
      window: { xmin: 18, ymin: 20, xmax: 82, ymax: 80 }
    },
    star: {
      name: 'Самопересекающаяся звезда',
      algorithm: 'general',
      contours: [pentagramContour(50, 50, 46, 5)],
      window: { xmin: 24, ymin: 22, xmax: 76, ymax: 78 }
    },
    multi: {
      name: 'Две изолированные части',
      algorithm: 'general',
      contours: [[
        { x: 22, y: 14 }, { x: 40, y: 14 }, { x: 40, y: 78 }, { x: 60, y: 78 },
        { x: 60, y: 14 }, { x: 78, y: 14 }, { x: 78, y: 88 }, { x: 22, y: 88 }
      ]],
      window: { xmin: 18, ymin: 20, xmax: 82, ymax: 74 }
    }
  };

  const polyCanvas = $('#polyCanvas');

  function polyBounds() {
    let box = null;
    for (let c = 0; c < state.poly.contours.length; c++) {
      const contour = state.poly.contours[c];
      for (let i = 0; i < contour.length; i++) {
        box = expandBox(box, contour[i].x, contour[i].y);
      }
    }
    box = expandBox(box, state.poly.window.xmin, state.poly.window.ymin);
    box = expandBox(box, state.poly.window.xmax, state.poly.window.ymax);
    if (!box) box = { xmin: 0, ymin: 0, xmax: 100, ymax: 100 };
    const pad = Math.max(4, Math.max(box.xmax - box.xmin, box.ymax - box.ymin) * 0.06);
    return {
      xmin: box.xmin - pad,
      ymin: box.ymin - pad,
      xmax: box.xmax + pad,
      ymax: box.ymax + pad
    };
  }

  function fitPolyView() {
    const surface = canvasSurface(polyCanvas);
    fitView(state.poly.view, polyBounds(), surface.w, surface.h, 46);
    renderPoly();
  }

  function syncPolyInputs() {
    const w = state.poly.window;
    $('#polyXmin').value = fmtCoord(w.xmin);
    $('#polyYmin').value = fmtCoord(w.ymin);
    $('#polyXmax').value = fmtCoord(w.xmax);
    $('#polyYmax').value = fmtCoord(w.ymax);
  }

  function updatePolyAlgorithmUI() {
    $$('.method-option[data-poly-algorithm]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-poly-algorithm') === state.poly.algorithm);
    });
    const label = $('#polyAlgorithmLabel');
    if (label) {
      label.textContent = state.poly.algorithm === 'convex'
        ? 'Сазерленд–Ходжман'
        : 'Уайлер–Атертон';
    }
  }

  function updatePoly() {
    const result = PC.clipPolygonToRect(state.poly.contours, state.poly.window, {
      mode: state.poly.algorithm
    });
    if (state.poly.algorithm === 'convex' && result.algorithm !== 'convex-sh') {
      state.poly.algorithm = 'general';
      toast('Для сложного контура включён Уайлер–Атертон.');
    }
    state.poly.result = result;

    $('#polyLoopCount').textContent = fmtInt(result.loops.length);
    $('#polyComponents').textContent = fmtInt(result.components);
    $('#polyHoles').textContent = fmtInt(result.holes);
    $('#polyArea').textContent = fmtCoord(result.area);
    $('#polyVertices').textContent = fmtInt(state.poly.contours.reduce(function (sum, contour) {
      return sum + contour.length;
    }, 0));
    $('#polyIntersections').textContent = fmtInt(result.intersections.length);
    $('#polyLoopsLabel').textContent = fmtInt(result.loops.length) + ' контуров';
    $('#loopListCount').textContent = result.loops.length + ' / ' + result.components;

    if (!result.loops.length) {
      $('#polyLoopList').innerHTML = '<div class="loop-empty">Пересечение с заполненной областью пусто.</div>';
    } else {
      $('#polyLoopList').innerHTML = result.loops.slice(0, 12).map(function (loop, index) {
        const label = loop.type === 'outer' ? 'Часть ' + (index + 1) : 'Дыра ' + (index + 1);
        return '<div class="loop-row ' + loop.type + '"><span class="loop-name"><i></i>' + label +
          '</span><span class="loop-area">S = ' + fmtCoord(loop.area) + ' · ' + loop.points.length + ' верш.</span></div>';
      }).join('');
    }
    updatePolyAlgorithmUI();
    syncPolyInputs();
    renderPoly();
  }

  function setPreset(name) {
    const preset = POLY_PRESETS[name];
    if (!preset) return;
    state.poly.preset = name;
    state.poly.algorithm = preset.algorithm || 'general';
    state.poly.contours = PC.cloneContours(preset.contours);
    state.poly.window = Object.assign({}, preset.window);
    $$('.preset').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-preset') === name);
    });
    updatePolyAlgorithmUI();
    fitPolyView();
    updatePoly();
  }

  function renderPoly() {
    const surface = canvasSurface(polyCanvas);
    const ctx = surface.ctx;
    const w = surface.w;
    const h = surface.h;
    const view = state.poly.view;
    const win = state.poly.window;
    const result = state.poly.result;
    if (!view.scale) return;

    drawGrid(ctx, view, w, h);
    drawWindowFill(ctx, win, view, w, h);

    if (state.poly.showOriginal) {
      ctx.beginPath();
      for (let c = 0; c < state.poly.contours.length; c++) {
        const contour = state.poly.contours[c];
        for (let i = 0; i < contour.length; i++) {
          const p = worldToScreen(view, contour[i].x, contour[i].y, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(181, 173, 156, 0.13)';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(155, 148, 132, 0.72)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (result && result.loops.length) {
      ctx.beginPath();
      for (let i = 0; i < result.loops.length; i++) {
        const pts = result.loops[i].points;
        for (let k = 0; k < pts.length; k++) {
          const p = worldToScreen(view, pts[k].x, pts[k].y, w, h);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }
      if (state.poly.showFill) {
        ctx.fillStyle = 'rgba(95, 120, 80, 0.22)';
        ctx.fill('evenodd');
      }
      for (let i = 0; i < result.loops.length; i++) {
        const loop = result.loops[i];
        ctx.beginPath();
        const pts = loop.points;
        for (let k = 0; k < pts.length; k++) {
          const p = worldToScreen(view, pts[k].x, pts[k].y, w, h);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = loop.type === 'outer' ? COLORS.visible : COLORS.clay;
        ctx.lineWidth = loop.type === 'outer' ? 2 : 1.6;
        ctx.setLineDash(loop.type === 'hole' ? [4, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (state.poly.showNodes && result) {
      for (let i = 0; i < result.intersections.length; i++) {
        const p = worldToScreen(view, result.intersections[i].x, result.intersections[i].y, w, h);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.handleFill;
        ctx.fill();
        ctx.strokeStyle = COLORS.point;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    if (state.poly.edit) {
      for (let c = 0; c < state.poly.contours.length; c++) {
        for (let i = 0; i < state.poly.contours[c].length; i++) {
          const p = worldToScreen(view, state.poly.contours[c][i].x, state.poly.contours[c][i].y, w, h);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.handleFill;
          ctx.fill();
          ctx.strokeStyle = COLORS.clay;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
      }
    }

    drawWindowBorder(ctx, win, view, w, h, true);
  }

  function nearestVertex(pos, view, w, h) {
    let best = null;
    for (let c = 0; c < state.poly.contours.length; c++) {
      for (let i = 0; i < state.poly.contours[c].length; i++) {
        const p = worldToScreen(view, state.poly.contours[c][i].x, state.poly.contours[c][i].y, w, h);
        const d = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (d <= 8 && (!best || d < best.distance)) {
          best = { c: c, i: i, distance: d };
        }
      }
    }
    return best;
  }

  function bindPoly() {
    $('#presetGrid').addEventListener('click', function (event) {
      const button = event.target.closest('[data-preset]');
      if (!button) return;
      setPreset(button.getAttribute('data-preset'));
    });

    $('#polyAlgorithmSwitch').addEventListener('click', function (event) {
      const button = event.target.closest('[data-poly-algorithm]');
      if (!button) return;
      state.poly.algorithm = button.getAttribute('data-poly-algorithm');
      updatePolyAlgorithmUI();
      updatePoly();
    });

    $('#applyPolyWindow').addEventListener('click', function () {
      applyWindowFromInputs('poly');
    });

    ['polyXmin', 'polyYmin', 'polyXmax', 'polyYmax'].forEach(function (id) {
      $('#' + id).addEventListener('keydown', function (event) {
        if (event.key === 'Enter') applyWindowFromInputs('poly');
      });
    });

    $('#resetPoly').addEventListener('click', function () {
      setPreset(state.poly.preset);
    });

    $('#polyFit').addEventListener('click', fitPolyView);

    $('#polyEditToggle').addEventListener('click', function () {
      state.poly.edit = !state.poly.edit;
      $('#polyEditToggle').classList.toggle('active', state.poly.edit);
      $('#polyHint').textContent = state.poly.edit
        ? 'Тяните вершины контура; окно — за центр или ручки.'
        : 'Включите редактирование, чтобы двигать вершины.';
      renderPoly();
    });

    $('#polyShowOriginal').addEventListener('change', function (event) {
      state.poly.showOriginal = event.target.checked;
      renderPoly();
    });

    $('#polyShowFill').addEventListener('change', function (event) {
      state.poly.showFill = event.target.checked;
      renderPoly();
    });

    $('#polyShowNodes').addEventListener('change', function (event) {
      state.poly.showNodes = event.target.checked;
      renderPoly();
    });

    $('#exportPolySvg').addEventListener('click', exportPolygonSvg);
    bindPolyPointer();
  }

  function exportPolygonSvg() {
    const contours = state.poly.contours;
    const result = state.poly.result;
    const win = state.poly.window;
    let box = polyBounds();
    const pad = Math.max(1, (box.xmax - box.xmin) * 0.03);
    box = { xmin: box.xmin - pad, ymin: box.ymin - pad, xmax: box.xmax + pad, ymax: box.ymax + pad };
    const width = box.xmax - box.xmin;
    const height = box.ymax - box.ymin;
    function x(v) { return (v - box.xmin).toFixed(3); }
    function y(v) { return (box.ymax - v).toFixed(3); }
    function path(points, close) {
      return points.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + x(p.x) + ' ' + y(p.y);
      }).join(' ') + (close ? ' Z' : '');
    }

    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width.toFixed(2) + ' ' + height.toFixed(2) + '">');
    parts.push('<rect width="100%" height="100%" fill="#fbf9f2"/>');
    parts.push('<rect x="' + x(win.xmin) + '" y="' + y(win.ymax) + '" width="' + (win.xmax - win.xmin).toFixed(3) + '" height="' + (win.ymax - win.ymin).toFixed(3) + '" fill="rgba(180,111,80,.05)" stroke="#b46f50" stroke-dasharray="5 4"/>');
    if (state.poly.showOriginal) {
      parts.push('<path d="' + contours.map(function (c) { return path(c, true); }).join(' ') + '" fill="rgba(181,173,156,.12)" fill-rule="evenodd" stroke="#9b9484" stroke-width="0.35" stroke-dasharray="2 2"/>');
    }
    if (result && result.loops.length) {
      parts.push('<path d="' + result.loops.map(function (loop) { return path(loop.points, true); }).join(' ') + '" fill="rgba(95,120,80,.22)" fill-rule="evenodd" stroke="#55704a" stroke-width="0.6"/>');
    }
    parts.push('</svg>');
    downloadBlob('clipped-polygon.svg', 'image/svg+xml;charset=utf-8', parts.join('\n'));
  }

  function bindPolyPointer() {
    const canvas = polyCanvas;
    canvas.addEventListener('pointerdown', function (event) {
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.poly.view;
      const win = state.poly.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const vertex = state.poly.edit ? nearestVertex(pos, view, surface.w, surface.h) : null;
      const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
      canvas.setPointerCapture(event.pointerId);

      if (vertex) {
        state.poly.drag = { type: 'vertex', c: vertex.c, i: vertex.i };
        canvas.style.cursor = 'grabbing';
      } else if (handle) {
        state.poly.drag = { type: 'resize', handle: handle };
        canvas.style.cursor = cursorForHandle(handle);
      } else if (pointInsideWindow(world.x, world.y, win)) {
        state.poly.drag = { type: 'move', startWorld: world, startWindow: Object.assign({}, win) };
        canvas.style.cursor = 'move';
      } else {
        state.poly.drag = { type: 'pan', startX: pos.x, startY: pos.y, cx: view.cx, cy: view.cy, scale: view.scale };
        canvas.style.cursor = 'grabbing';
      }
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', function (event) {
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.poly.view;
      const win = state.poly.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const readout = $('#polyCursor');
      readout.textContent = 'Курсор: x = ' + fmtCoord(world.x) + ' · y = ' + fmtCoord(world.y);

      const drag = state.poly.drag;
      if (!drag) {
        const vertex = state.poly.edit ? nearestVertex(pos, view, surface.w, surface.h) : null;
        const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
        canvas.style.cursor = vertex ? 'crosshair' : handle ? cursorForHandle(handle) : pointInsideWindow(world.x, world.y, win) ? 'move' : 'grab';
        return;
      }

      if (drag.type === 'vertex') {
        state.poly.contours[drag.c][drag.i] = { x: world.x, y: world.y };
        updatePoly();
      } else if (drag.type === 'resize') {
        state.poly.window = resizeWindow(win, drag.handle, world, 0.5);
        updatePoly();
      } else if (drag.type === 'move') {
        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        state.poly.window = {
          xmin: drag.startWindow.xmin + dx,
          ymin: drag.startWindow.ymin + dy,
          xmax: drag.startWindow.xmax + dx,
          ymax: drag.startWindow.ymax + dy
        };
        updatePoly();
      } else {
        view.cx = drag.cx - (pos.x - drag.startX) / drag.scale;
        view.cy = drag.cy + (pos.y - drag.startY) / drag.scale;
        renderPoly();
      }
    });

    function endDrag() {
      state.poly.drag = null;
      canvas.style.cursor = 'grab';
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (!state.poly.drag) $('#polyCursor').textContent = 'Курсор: наведите на поле';
    });

    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      zoomViewAround(state.poly.view, surface, pos.x, pos.y, Math.exp(-event.deltaY * 0.0014));
      renderPoly();
    }, { passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Performance lab                                                     */
  /* ------------------------------------------------------------------ */

  const perfCanvas = $('#perfCanvas');
  const PERF_BOUNDS = { xmin: 0, ymin: 0, xmax: 1000, ymax: 1000 };

  function fitPerfView() {
    const surface = canvasSurface(perfCanvas);
    fitView(state.perf.view, PERF_BOUNDS, surface.w, surface.h, 34);
    state.perf.baseDirty = true;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generatePerfSegments(count) {
    const rnd = mulberry32(20251105);
    const clusters = [];
    for (let i = 0; i < 18; i++) {
      clusters.push({
        x: 70 + rnd() * 860,
        y: 70 + rnd() * 860,
        r: 35 + rnd() * 115
      });
    }
    const segments = new Array(count);
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      if (rnd() < 0.42) {
        const c = clusters[Math.floor(rnd() * clusters.length)];
        const angle = rnd() * Math.PI * 2;
        const radius = Math.sqrt(rnd()) * c.r;
        x = c.x + Math.cos(angle) * radius;
        y = c.y + Math.sin(angle) * radius;
      } else {
        x = 8 + rnd() * 984;
        y = 8 + rnd() * 984;
      }
      x = clamp(x, 8, 992);
      y = clamp(y, 8, 992);
      const angle = rnd() * Math.PI * 2;
      const length = 4 + rnd() * 16;
      let x2 = clamp(x + Math.cos(angle) * length, 5, 995);
      let y2 = clamp(y + Math.sin(angle) * length, 5, 995);
      const s = { id: i, x1: x, y1: y, x2: x2, y2: y2, _stamp: 0 };
      s.box = G.segmentBox(s);
      segments[i] = s;
    }
    return segments;
  }

  const MOTION_GROUPS = 4;
  const MOTION_BLOCK_SIZE = 1024;

  function partitionSegments(dataset) {
    const groups = Array.from({ length: MOTION_GROUPS }, function () { return []; });
    for (const segment of dataset) {
      const group = Math.floor(segment.id / MOTION_BLOCK_SIZE) % MOTION_GROUPS;
      groups[group].push(segment);
    }
    return groups;
  }

  function motionOffset(group, phase) {
    const angle = group * Math.PI / 2;
    return {
      x: 8 * Math.sin(phase * 0.9 + angle),
      y: 6 * Math.sin(phase * 1.2 + 2 * angle + group * 0.3)
    };
  }

  function translatedRect(rect, dx, dy) {
    return { xmin: rect.xmin + dx, ymin: rect.ymin + dy, xmax: rect.xmax + dx, ymax: rect.ymax + dy };
  }

  function buildMotionTrees(groups, depth) {
    return groups.map(function (segments) {
      return new QT.QuadTree(PERF_BOUNDS, { maxDepth: depth, capacity: state.perf.capacity }).build(segments);
    });
  }

  function treeSummary(trees) {
    let depth = 0;
    let nodes = 0;
    for (const tree of trees || []) {
      depth = Math.max(depth, tree.maxUsedDepth);
      nodes += tree.nodeCount;
    }
    return { depth: depth, nodes: nodes };
  }

  function buildPerfTree(depth = state.perf.maxDepth) {
    const t0 = performance.now();
    state.perf.trees = buildMotionTrees(state.perf.groups, depth);
    state.perf.maxDepth = depth;
    state.perf.buildMs = performance.now() - t0;
    updatePerfTreeLabels();
  }

  function updatePerfTreeLabels() {
    const summary = treeSummary(state.perf.trees);
    $('#perfTreeDepth').textContent = 'глубина ' + (summary.depth || '—');
    $('#perfTreeNodes').textContent = 'узлов ' + (summary.nodes ? fmtInt(summary.nodes) : '—');
    $('#perfBuild').textContent = state.perf.buildMs ? fmtMs(state.perf.buildMs, 0) : '—';
    $('#perfDatasetLabel').textContent = state.perf.count
      ? fmtInt(state.perf.count) + ' отрезков · ' + MOTION_GROUPS + ' движущиеся группы'
      : 'набор ещё не создан';
  }

  function setPerfStatus(kind, text) {
    const el = $('#perfStatus');
    el.classList.remove('running', 'done');
    if (kind) el.classList.add(kind);
    $('#perfStatusText').textContent = text;
  }

  function setPerfBusy(busy) {
    state.perf.busy = busy;
    for (const id of ['#preparePerf', '#perfDepth', '#perfFit']) $(id).disabled = busy;
    for (const id of ['#liveToggle', '#rebuildTree', '#runDepthBench', '#runDensityBench']) {
      $(id).disabled = busy || !state.perf.prepared;
    }
  }

  async function runPerfTask(task) {
    if (state.perf.busy) return;
    stopLive();
    setPerfBusy(true);
    try {
      await task();
    } catch (error) {
      setPerfStatus(null, 'Операция прервана');
      $('#perfNote').textContent = error.message;
    } finally {
      setPerfBusy(false);
    }
  }

  async function preparePerf() {
    const total = 500000;
    state.perf.prepared = false;
    state.perf.maxDepth = Number($('#perfDepth').value);
    setPerfStatus('running', 'генерация ' + fmtInt(total) + ' отрезков…');
    $('#perfProgress').style.width = '12%';
    await nextFrame();

    state.perf.trees = null;
    state.perf.dataset = generatePerfSegments(total);
    state.perf.groups = partitionSegments(state.perf.dataset);
    state.perf.phase = 0;
    state.perf.count = total;
    state.perf.baseDirty = true;
    state.perf.base = null;
    $('#perfProgress').style.width = '42%';
    setPerfStatus('running', 'построение деревьев Quadtree…');
    await nextFrame();

    buildPerfTree();
    $('#perfProgress').style.width = '68%';
    setPerfStatus('running', 'рендер базового слоя…');
    await nextFrame();

    fitPerfView();
    buildPerfBase();
    $('#perfProgress').style.width = '100%';
    state.perf.prepared = true;
    setPerfStatus('done', 'готово · ' + fmtInt(total) + ' отрезков');
    renderPerf();
    $('#perfNote').textContent = 'Набор готов. Включите живой режим для FPS или запустите замеры глубины и плотности.';
    toast('База из ' + fmtInt(total) + ' отрезков готова. Включите живой режим.');
  }

  function buildPerfBase() {
    if (!state.perf.dataset || !state.perf.view.scale) return;
    const { w, h, dpr } = canvasSurface(perfCanvas);
    const view = state.perf.view;

    function newLayer() {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { canvas: canvas, ctx: ctx };
    }

    const grid = newLayer();
    drawGrid(grid.ctx, view, w, h);
    const layers = state.perf.groups.map(function (segments) {
      const layer = newLayer();
      const ctx = layer.ctx;
      ctx.strokeStyle = 'rgba(122, 118, 102, 0.075)';
      ctx.lineWidth = 0.85;
      ctx.lineCap = 'round';
      const batch = 25000;
      for (let start = 0; start < segments.length; start += batch) {
        ctx.beginPath();
        for (let i = start; i < Math.min(segments.length, start + batch); i++) {
          const s = segments[i];
          const a = worldToScreen(view, s.x1, s.y1, w, h);
          const b = worldToScreen(view, s.x2, s.y2, w, h);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      return layer.canvas;
    });
    state.perf.base = { grid: grid.canvas, layers: layers };
    state.perf.baseDirty = false;
  }

  function drawPerfVisible(ctx, batches, view, w, h) {
    ctx.beginPath();
    const points = [];
    for (const { results, offset } of batches) {
      const sx = w / 2 + (offset.x - view.cx) * view.scale;
      const sy = h / 2 - (offset.y - view.cy) * view.scale;
      for (const c of results) {
        const x1 = sx + c.x1 * view.scale;
        const y1 = sy - c.y1 * view.scale;
        if (c.degenerate) {
          points.push({ x: x1, y: y1 });
        } else {
          ctx.moveTo(x1, y1);
          ctx.lineTo(sx + c.x2 * view.scale, sy - c.y2 * view.scale);
        }
      }
    }
    ctx.strokeStyle = COLORS.visibleSoft;
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = COLORS.point;
    for (const p of points) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }

  function renderPerf(ts) {
    const { ctx, w, h } = canvasSurface(perfCanvas);
    const view = state.perf.view;
    if (!view.scale) return;
    if (state.perf.baseDirty && state.perf.dataset) buildPerfBase();

    const win = state.perf.window;
    const offsets = state.perf.groups.map(function (_, i) { return motionOffset(i, state.perf.phase); });
    if (state.perf.base) {
      ctx.drawImage(state.perf.base.grid, 0, 0, w, h);
      state.perf.base.layers.forEach(function (layer, i) {
        ctx.drawImage(layer, offsets[i].x * view.scale, -offsets[i].y * view.scale, w, h);
      });
    } else {
      drawGrid(ctx, view, w, h);
    }

    if (state.perf.showTree && state.perf.trees) {
      const treeRect = { xmin: win.xmin - 100, ymin: win.ymin - 100, xmax: win.xmax + 100, ymax: win.ymax + 100 };
      state.perf.trees.forEach(function (tree, i) {
        const { x, y } = offsets[i];
        const localView = { ...view, cx: view.cx - x, cy: view.cy - y };
        drawTreeCells(ctx, tree, translatedRect(treeRect, -x, -y), localView, w, h, 225, 6);
      });
    }
    drawWindowFill(ctx, win, view, w, h);

    const stats = { nodes: 0, leaves: 0, tested: 0, candidates: 0, rejectedAABB: 0, rejectedNodes: 0 };
    const batches = [];
    let visible = 0;
    const t0 = performance.now();
    for (let i = 0; i < (state.perf.trees || []).length; i++) {
      const offset = offsets[i];
      const local = translatedRect(win, -offset.x, -offset.y);
      const candidates = state.perf.trees[i].query(local, stats);
      const results = [];
      for (const segment of candidates) {
        const r = G.clipSegment(state.main.method, segment, local, false);
        if (r) results.push(r);
      }
      visible += results.length;
      batches.push({ results: results, offset: offset });
    }
    const queryMs = performance.now() - t0;

    drawPerfVisible(ctx, batches, view, w, h);
    drawWindowBorder(ctx, win, view, w, h, true);

    state.perf.lastStats = { queryMs: queryMs, candidates: stats.candidates, visible: visible, stats: stats, window: win };
    if (ts !== undefined) updateFps(ts);
    const now = performance.now();
    if (!state.perf.live || !state.perf.lastUiAt || now - state.perf.lastUiAt > 110) {
      state.perf.lastUiAt = now;
      updatePerfStats();
    }
  }

  function updateFps(ts) {
    if (state.perf.lastFrameTs) {
      const dt = ts - state.perf.lastFrameTs;
      if (dt > 0) {
        state.perf.fpsFrames.push(dt);
        if (state.perf.fpsFrames.length > 40) state.perf.fpsFrames.shift();
        const avg = state.perf.fpsFrames.reduce(function (a, b) { return a + b; }, 0) / state.perf.fpsFrames.length;
        state.perf.fps = 1000 / avg;
      }
    }
    state.perf.lastFrameTs = ts;
  }

  function updatePerfStats() {
    const data = state.perf.lastStats;
    if (!data) return;
    $('#perfQuery').textContent = fmtMs(data.queryMs, 2);
    $('#perfCandidates').textContent = fmtInt(data.candidates);
    $('#perfVisible').textContent = fmtInt(data.visible);
    $('#perfTreeTested').textContent = 'проверено ' + fmtInt(data.stats.nodes);
    $('#perfWindowLabel').textContent =
      Math.round(data.window.xmin) + '…' + Math.round(data.window.xmax) + ' · ' +
      Math.round(data.window.ymin) + '…' + Math.round(data.window.ymax);
    if (state.perf.live && state.perf.fps) {
      $('#fpsBadge').textContent = Math.round(state.perf.fps) + ' FPS';
      $('#perfFrameNote').textContent = 'frame ' + (1000 / state.perf.fps).toFixed(2) + ' ms';
    }
  }

  function startLive() {
    if (!state.perf.prepared) return;
    state.perf.live = true;
    state.perf.lastFrameTs = 0;
    state.perf.fpsFrames = [];
    $('#liveToggle').classList.add('active');
    $('#liveToggle').innerHTML = '<span class="live-dot"></span> Пауза';
    $('#fpsBadge').textContent = 'FPS …';
    const initialPhase = state.perf.phase;
    let start;
    const tick = function (ts) {
      if (!state.perf.live) return;
      if (start === undefined) start = ts;
      state.perf.phase = initialPhase + (ts - start) / 1000;
      const t = state.perf.phase * 0.22;
      const cx = 500 + 335 * Math.sin(t);
      const cy = 500 + 285 * Math.sin(t * 1.63 + 1.1);
      const width = 116;
      const height = 92;
      state.perf.window = {
        xmin: clamp(cx - width / 2, 12, 1000 - width - 12),
        ymin: clamp(cy - height / 2, 12, 1000 - height - 12),
        xmax: 0,
        ymax: 0
      };
      state.perf.window.xmax = state.perf.window.xmin + width;
      state.perf.window.ymax = state.perf.window.ymin + height;
      renderPerf(ts);
      state.perf.animationId = requestAnimationFrame(tick);
    };
    state.perf.animationId = requestAnimationFrame(tick);
  }

  function stopLive() {
    state.perf.live = false;
    cancelAnimationFrame(state.perf.animationId);
    $('#liveToggle').classList.remove('active');
    $('#liveToggle').innerHTML = '<span class="live-dot"></span> Живой режим';
    state.perf.lastFrameTs = 0;
    state.perf.fps = 0;
    $('#fpsBadge').textContent = 'FPS —';
    $('#perfFrameNote').textContent = 'frame —';
  }

  function makeBenchWindows(count) {
    const windows = [];
    for (let i = 0; i < count; i++) {
      const t = (i / Math.max(1, count - 1)) * Math.PI * 2;
      const cx = 500 + 300 * Math.sin(t);
      const cy = 500 + 250 * Math.sin(t * 1.7 + 0.8);
      const width = 120;
      const height = 96;
      windows.push({
        xmin: clamp(cx - width / 2, 10, 1000 - width - 10),
        ymin: clamp(cy - height / 2, 10, 1000 - height - 10),
        xmax: clamp(cx - width / 2, 10, 1000 - width - 10) + width,
        ymax: clamp(cy - height / 2, 10, 1000 - height - 10) + height
      });
    }
    return windows;
  }

  function measurePerf(groups, windows, trees) {
    const visible = [];
    let total = 0;
    for (let i = 0; i < windows.length; i++) {
      const t0 = performance.now();
      let count = 0;
      for (let group = 0; group < groups.length; group++) {
        const offset = motionOffset(group, i * 0.5);
        const local = translatedRect(windows[i], -offset.x, -offset.y);
        const segments = trees ? trees[group].query(local) : groups[group];
        for (const segment of segments) {
          if (!trees && G.outcodeBox(segment.box, local) !== 0) continue;
          if (G.clipSegment(VARIANT_METHOD, segment, local, false)) count++;
        }
      }
      total += performance.now() - t0;
      visible.push(count);
    }
    return { ms: total / windows.length, visible: visible };
  }

  async function runDepthBenchmark() {
    const windows = makeBenchWindows(48);
    const results = [];
    const depths = [4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < depths.length; i++) {
      const depth = depths[i];
      setPerfStatus('running', 'глубина ' + depth + ' / 10 · построение…');
      $('#perfProgress').style.width = Math.round((i / depths.length) * 100) + '%';
      await nextFrame();
      const t0 = performance.now();
      const trees = buildMotionTrees(state.perf.groups, depth);
      const buildMs = performance.now() - t0;
      await nextFrame();
      setPerfStatus('running', 'глубина ' + depth + ' / 10 · замер…');
      await nextFrame();
      const m = measurePerf(state.perf.groups, windows, trees);
      results.push({
        depth: depth,
        ms: m.ms,
        buildMs: buildMs,
        nodes: treeSummary(trees).nodes
      });
      $('#perfProgress').style.width = Math.round(((i + 1) / depths.length) * 100) + '%';
      await nextFrame();
    }
    state.perf.depthResults = results;
    renderDepthChart(results);
    const best = results.reduce(function (a, b) { return a.ms <= b.ms ? a : b; });
    setPerfStatus('done', 'глубина: лучшая ' + best.depth + ' · ' + fmtMs(best.ms, 2) + ' мс');
    $('#perfProgress').style.width = '100%';
    $('#perfNote').textContent = 'Замер глубины: 48 положений окна и базы на 500 000 отрезков. Лучший результат — глубина ' + best.depth + '.';
  }

  async function runDensityBenchmark() {
    const windows = makeBenchWindows(32);
    const counts = [25000, 50000, 100000, 200000, 350000, 500000];
    const results = [];
    for (let i = 0; i < counts.length; i++) {
      const count = counts[i];
      const groups = partitionSegments(state.perf.dataset.slice(0, count));
      setPerfStatus('running', fmtInt(count) + ' отрезков · построение…');
      $('#perfProgress').style.width = Math.round((i / counts.length) * 100) + '%';
      await nextFrame();
      const trees = buildMotionTrees(groups, state.perf.maxDepth);
      await nextFrame();
      setPerfStatus('running', fmtInt(count) + ' · Quadtree…');
      await nextFrame();
      const indexed = measurePerf(groups, windows, trees);
      await nextFrame();
      setPerfStatus('running', fmtInt(count) + ' · полный перебор…');
      await nextFrame();
      const brute = measurePerf(groups, windows);
      if (!indexed.visible.every(function (count, i) { return count === brute.visible[i]; })) {
        throw new Error('Замер плотности: число видимых частей отличается от полного перебора.');
      }
      results.push({
        count: count,
        qtree: indexed.ms,
        brute: brute.ms
      });
      $('#perfProgress').style.width = Math.round(((i + 1) / counts.length) * 100) + '%';
      await nextFrame();
    }
    state.perf.densityResults = results;
    renderDensityChart(results);
    setPerfStatus('done', 'плотность: ' + fmtInt(counts[counts.length - 1]) + ' отрезков');
    $('#perfProgress').style.width = '100%';
    $('#perfNote').textContent = 'Замер плотности: 32 положения окна и базы. Число видимых частей совпало с полным перебором.';
  }

  function renderDepthChart(results) {
    const labels = results.map(function (r) { return String(r.depth); });
    const series = [{
      name: 'query + clip',
      color: '#5f7850',
      values: results.map(function (r) { return r.ms; }),
      showValues: true
    }];
    renderChart($('#depthChart'), {
      labels: labels,
      series: series,
      yLabel: 'мс',
      xTitle: 'глубина',
      valueLabels: true
    });
    const best = results.reduce(function (a, b) { return a.ms <= b.ms ? a : b; });
    $('#depthChartMeta').textContent = 'лучшая ' + best.depth + ' · ' + fmtInt(best.nodes) + ' узлов';
  }

  function renderDensityChart(results) {
    const labels = results.map(function (r) {
      if (r.count >= 1000) return Math.round(r.count / 1000) + 'k';
      return String(r.count);
    });
    renderChart($('#densityChart'), {
      labels: labels,
      series: [
        { name: 'Quadtree', color: '#5f7850', values: results.map(function (r) { return r.qtree; }) },
        { name: 'O(N)', color: '#b46f50', values: results.map(function (r) { return r.brute; }) }
      ],
      yLabel: 'мс',
      xTitle: 'N',
      xValues: results.map(function (r) { return r.count; }),
      valueLabels: false
    });
    $('#densityChartMeta').textContent = 'глубина ' + state.perf.maxDepth + ' · ' + results.length + ' точек';
  }

  function renderChart(container, config) {
    const labels = config.labels || [];
    const series = (config.series || []).filter(function (s) { return s.values && s.values.length; });
    if (!labels.length || !series.length) {
      container.innerHTML = '<div class="chart-empty"><span>↗</span><p>Нет данных для графика</p></div>';
      return;
    }
    const W = 560;
    const H = 232;
    const L = 46;
    const R = 12;
    const T = 16;
    const B = 36;
    const plotW = W - L - R;
    const plotH = H - T - B;
    let maxValue = 0;
    series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (Number.isFinite(v)) maxValue = Math.max(maxValue, v);
      });
    });
    if (maxValue <= 0) maxValue = 1;
    const yMax = niceStep((maxValue * 1.16) / 4) * 4;
    const safeMax = yMax || 1;

    function xAt(index) {
      if (labels.length === 1) return L + plotW / 2;
      const values = config.xValues;
      const fraction = values
        ? (values[index] - values[0]) / (values[values.length - 1] - values[0])
        : index / (labels.length - 1);
      return L + fraction * plotW;
    }
    function yAt(value) {
      return T + plotH - (value / safeMax) * plotH;
    }
    function axisNumber(value) {
      if (value >= 100) return String(Math.round(value));
      if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
      return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    const parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График зависимости времени отсечения">');
    for (let i = 0; i <= 4; i++) {
      const value = (safeMax / 4) * i;
      const y = yAt(value);
      parts.push('<line class="chart-grid-line" x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '"/>');
      parts.push('<text class="chart-label" x="' + (L - 7) + '" y="' + (y + 2.6).toFixed(1) + '" text-anchor="end">' + axisNumber(value) + '</text>');
    }
    parts.push('<line class="chart-axis" x1="' + L + '" y1="' + (T + plotH) + '" x2="' + (W - R) + '" y2="' + (T + plotH) + '"/>');
    parts.push('<line class="chart-axis" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + plotH) + '"/>');

    labels.forEach(function (label, index) {
      parts.push('<text class="chart-label" x="' + xAt(index).toFixed(1) + '" y="' + (T + plotH + 16) + '" text-anchor="middle">' + escapeHtml(label) + '</text>');
    });

    for (let s = 0; s < series.length; s++) {
      const item = series[s];
      const points = item.values.map(function (value, index) {
        return { x: xAt(index), y: yAt(value), value: value };
      });
      if (points.length > 1) {
        const d = points.map(function (p, i) {
          return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        parts.push('<path class="chart-line" d="' + d + '" stroke="' + item.color + '"/>');
      }
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        parts.push('<circle class="chart-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="' + item.color + '"><title>' +
          escapeHtml(item.name + ': ' + p.value.toFixed(2) + ' мс, ' + labels[i]) + '</title></circle>');
        if (config.valueLabels && series.length === 1) {
          const first = i === 0;
          const last = i === points.length - 1;
          const tx = p.x + (first ? 7 : last ? -7 : 0);
          const anchor = first ? 'start' : last ? 'end' : 'middle';
          parts.push('<text class="chart-value" x="' + tx.toFixed(1) + '" y="' + (p.y - 7).toFixed(1) + '" text-anchor="' + anchor + '">' + axisNumber(p.value) + '</text>');
        }
      }
    }

    parts.push('<text class="chart-label" x="' + (W - R) + '" y="' + (H - 5) + '" text-anchor="end">' + escapeHtml(config.xTitle || '') + '</text>');
    parts.push('</svg>');
    container.innerHTML = parts.join('');
  }

  function bindPerf() {
    $('#preparePerf').addEventListener('click', function () {
      runPerfTask(preparePerf);
    });

    $('#liveToggle').addEventListener('click', function () {
      if (state.perf.live) stopLive();
      else startLive();
    });

    $('#perfDepth').addEventListener('input', function (event) {
      $('#perfDepthValue').textContent = event.target.value;
    });

    $('#rebuildTree').addEventListener('click', function () {
      runPerfTask(async function () {
        const depth = Number($('#perfDepth').value);
        setPerfStatus('running', 'перестроение индекса…');
        await nextFrame();
        buildPerfTree(depth);
        await nextFrame();
        setPerfStatus('done', 'глубина ' + depth + ' · ' + fmtInt(treeSummary(state.perf.trees).nodes) + ' узлов');
        renderPerf();
      });
    });

    $('#showPerfTree').addEventListener('change', function (event) {
      state.perf.showTree = event.target.checked;
      renderPerf();
    });

    $('#runDepthBench').addEventListener('click', function () { runPerfTask(runDepthBenchmark); });
    $('#runDensityBench').addEventListener('click', function () { runPerfTask(runDensityBenchmark); });
    $('#perfFit').addEventListener('click', function () {
      fitPerfView();
      buildPerfBase();
      renderPerf();
    });

    bindPerfPointer();

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        for (let i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting && !state.perf.autoStarted) {
            state.perf.autoStarted = true;
            setTimeout(function () {
              if (!state.perf.prepared) runPerfTask(preparePerf);
            }, 260);
          }
        }
      }, { threshold: 0.08 });
      observer.observe($('#performance'));
    }
  }

  function bindPerfPointer() {
    const canvas = perfCanvas;
    canvas.addEventListener('pointerdown', function (event) {
      if (state.perf.busy) return;
      if (state.perf.live) stopLive();
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.perf.view;
      const win = state.perf.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
      canvas.setPointerCapture(event.pointerId);
      if (handle) {
        state.perf.drag = { type: 'resize', handle: handle };
      } else if (pointInsideWindow(world.x, world.y, win)) {
        state.perf.drag = { type: 'move', startWorld: world, startWindow: Object.assign({}, win) };
      }
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', function (event) {
      const surface = canvasSurface(canvas);
      const pos = pointerPosition(canvas, event);
      const view = state.perf.view;
      const win = state.perf.window;
      const world = screenToWorld(view, pos.x, pos.y, surface.w, surface.h);
      const drag = state.perf.drag;
      $('#perfCursor').textContent = 'Курсор: x = ' + fmtCoord(world.x) + ' · y = ' + fmtCoord(world.y);
      if (!drag) {
        const handle = handleAt(pos.x, pos.y, win, view, surface.w, surface.h);
        canvas.style.cursor = handle ? cursorForHandle(handle) : pointInsideWindow(world.x, world.y, win) ? 'move' : 'default';
        return;
      }
      if (drag.type === 'resize') {
        state.perf.window = resizeWindow(win, drag.handle, world, 30);
      } else {
        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        state.perf.window = {
          xmin: drag.startWindow.xmin + dx,
          ymin: drag.startWindow.ymin + dy,
          xmax: drag.startWindow.xmax + dx,
          ymax: drag.startWindow.ymax + dy
        };
      }
      renderPerf();
    });

    function end() {
      state.perf.drag = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () {
      if (!state.perf.drag) $('#perfCursor').textContent = 'Курсор: наведите на поле';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tests                                                               */
  /* ------------------------------------------------------------------ */

  const TEST_WINDOW = { xmin: -45, ymin: -30, xmax: 45, ymax: 30 };

  function expectedEndpoints(r, x1, y1, x2, y2) {
    if (!r) return false;
    const t = 1e-5;
    const direct = G.eq(r.x1, x1, t) && G.eq(r.y1, y1, t) && G.eq(r.x2, x2, t) && G.eq(r.y2, y2, t);
    const reverse = G.eq(r.x1, x2, t) && G.eq(r.y1, y2, t) && G.eq(r.x2, x1, t) && G.eq(r.y2, y1, t);
    return direct || reverse;
  }

  function segmentTest(name, marker, description, segment, expected, win = TEST_WINDOW) {
    const results = {};
    const methods = ['sutherland', 'liang', 'cyrus'];
    let same = true;
    for (let i = 0; i < methods.length; i++) {
      results[methods[i]] = G.clipSegment(methods[i], segment, win);
      if (i > 0 && !G.sameResult(results.sutherland, results[methods[i]], 1e-6)) same = false;
    }
    const first = results.sutherland;
    let pass = same;
    if (expected.visible === false) {
      pass = pass && first === null;
    } else {
      pass = pass && first !== null;
    }
    if (first && expected.degenerate !== undefined) {
      pass = pass && first.degenerate === expected.degenerate;
    }
    if (first && expected.points) {
      pass = pass && expectedEndpoints(first, expected.points[0], expected.points[1], expected.points[2], expected.points[3]);
    }
    let detail = 'вне окна';
    if (first) {
      detail = fmtCoord(first.x1) + ',' + fmtCoord(first.y1) + ' → ' + fmtCoord(first.x2) + ',' + fmtCoord(first.y2);
    }
    if (!same) detail += ' · методы расходятся';
    return {
      marker: marker,
      name: name,
      description: description,
      detail: detail,
      pass: pass
    };
  }

  function allPointsInside(result, win) {
    for (let i = 0; i < result.loops.length; i++) {
      const pts = result.loops[i].points;
      for (let k = 0; k < pts.length; k++) {
        if (pts[k].x < win.xmin - EPS || pts[k].x > win.xmax + EPS || pts[k].y < win.ymin - EPS || pts[k].y > win.ymax + EPS) {
          return false;
        }
      }
    }
    return true;
  }

  function polygonTest(name, marker, description, contours, win, expected) {
    let result;
    try {
      result = PC.clipPolygonToRect(contours, win);
    } catch (error) {
      return { marker: marker, name: name, description: description, detail: 'исключение', pass: false };
    }
    let pass = true;
    if (expected.area !== undefined) pass = pass && Math.abs(result.area - expected.area) <= 0.01;
    if (expected.components !== undefined) pass = pass && result.components === expected.components;
    if (expected.holes !== undefined) pass = pass && result.holes === expected.holes;
    if (expected.loops !== undefined) pass = pass && result.loops.length === expected.loops;
    if (expected.minLoops !== undefined) pass = pass && result.loops.length >= expected.minLoops;
    if (expected.positiveArea) pass = pass && result.area > EPS;
    pass = pass && allPointsInside(result, win);
    if (!result.loops.length && expected.allowEmpty !== true) pass = false;
    const detail = result.loops.length + ' конт. · S=' + fmtCoord(result.area) +
      ' · дыр ' + result.holes + ' · перес. ' + result.intersections.length;
    return {
      marker: marker,
      name: name,
      description: description,
      detail: detail,
      pass: pass
    };
  }

  function buildTestRows() {
    const rows = [];
    rows.push(segmentTest(
      'Отрезок полностью внутри',
      'boundary',
      'Оба конца внутри; результат совпадает с исходным.',
      { x1: -20, y1: -10, x2: 20, y2: 10 },
      { visible: true, degenerate: false, points: [-20, -10, 20, 10] }
    ));
    rows.push(segmentTest(
      'Отрезок полностью вне',
      'boundary',
      'Оба конца вне одной полуплоскости; отсечение до пересечения.',
      { x1: -80, y1: 50, x2: 80, y2: 50 },
      { visible: false }
    ));
    rows.push(segmentTest(
      'Пересечение левой границы',
      'boundary',
      'Видимая часть начинается ровно на x = xmin.',
      { x1: -80, y1: 0, x2: -20, y2: 0 },
      { visible: true, degenerate: false, points: [-45, 0, -20, 0] }
    ));
    rows.push(segmentTest(
      'Отрезок на нижней границе',
      'boundary',
      'Коллинеарен границе; граница считается видимой.',
      { x1: -60, y1: -30, x2: 60, y2: -30 },
      { visible: true, degenerate: false, points: [-45, -30, 45, -30] }
    ));
    rows.push(segmentTest(
      'Нулевая длина в вершине',
      'degenerate',
      'Точка ровно в углу окна; результат — вырожденный отрезок.',
      { x1: -45, y1: 30, x2: -45, y2: 30 },
      { visible: true, degenerate: true, points: [-45, 30, -45, 30] }
    ));
    rows.push(segmentTest(
      'Нулевая длина вне окна',
      'degenerate',
      'Точка снаружи не должна превращаться в видимую часть.',
      { x1: 50, y1: 40, x2: 50, y2: 40 },
      { visible: false }
    ));
    rows.push(segmentTest(
      'Вертикальный через окно',
      'boundary',
      'Граница пересекается под прямым углом; проверка деления на dx.',
      { x1: 0, y1: -80, x2: 0, y2: 80 },
      { visible: true, degenerate: false, points: [0, -30, 0, 30] }
    ));
    rows.push(segmentTest(
      'Выход из вершины',
      'vertex',
      'Начало в углу, конец снаружи; остаётся одна точка.',
      { x1: 45, y1: 30, x2: 60, y2: 45 },
      { visible: true, degenerate: true, points: [45, 30, 45, 30] }
    ));
    rows.push(segmentTest(
      'Граница в пределах ε',
      'degenerate',
      'Конец на 10⁻⁹ правее xmax должен считаться границей.',
      { x1: 45 + 1e-9, y1: 0, x2: 60, y2: 0 },
      { visible: true, degenerate: true, points: [45, 0, 45, 0] }
    ));
    rows.push(segmentTest(
      'Диагональ через всё окно',
      'boundary',
      'Полное пересечение; все три метода должны совпасть.',
      { x1: -70, y1: -40, x2: 70, y2: 40 },
      { visible: true, degenerate: false }
    ));

    const W = { xmin: 0, ymin: 0, xmax: 10, ymax: 10 };
    rows.push(polygonTest(
      'Вогнутый L-профиль',
      'polygon',
      'Одна изолированная часть после отсечения.',
      [[{ x: 2, y: 2 }, { x: 12, y: 2 }, { x: 12, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 12 }, { x: 2, y: 12 }]],
      W,
      { area: 39, components: 1, holes: 0, loops: 1 }
    ));
    rows.push(polygonTest(
      'Отверстие внутри окна',
      'hole',
      'Внешний контур и дыра; заливка even-odd, площадь с вычетом.',
      [
        [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 15 }, { x: -5, y: 15 }],
        [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }]
      ],
      W,
      { area: 64, components: 1, holes: 1, loops: 2 }
    ));
    rows.push(polygonTest(
      'Ребро по границе окна',
      'boundary',
      'Совпадающее ребро не должно удваивать площадь.',
      [[{ x: 0, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 0, y: 8 }]],
      W,
      { area: 60, components: 1, holes: 0, loops: 1 }
    ));
    rows.push(polygonTest(
      'Ребро через вершину окна',
      'vertex',
      'Ромб проходит точно через угол (0,0); результат — всё окно.',
      [[{ x: -5, y: 5 }, { x: 5, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 15 }]],
      W,
      { area: 100, components: 1, holes: 0, loops: 1 }
    ));
    rows.push(polygonTest(
      'Две изолированные части',
      'polygon',
      'Окно пересекает два независимых контура.',
      [
        [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
        [{ x: 8, y: 7 }, { x: 14, y: 7 }, { x: 14, y: 14 }, { x: 8, y: 14 }]
      ],
      W,
      { area: 15, components: 2, holes: 0, loops: 2 }
    ));
    rows.push(polygonTest(
      'Самопересекающаяся звезда',
      'self',
      'Граница обходится как набор рёбер; все вершины попадают в окно.',
      [pentagramContour(5, 5, 4.5, 5)],
      { xmin: 2, ymin: 2, xmax: 8, ymax: 8 },
      { area: 13.36, components: 5, holes: 0, loops: 5 }
    ));
    rows.push(polygonTest(
      'Дыра прижата к границе',
      'hole',
      'Дыра выходит на край окна и становится вырезом.',
      [
        [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 15 }, { x: -5, y: 15 }],
        [{ x: 0, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 8 }, { x: 0, y: 8 }]
      ],
      W,
      { area: 64, components: 1, holes: 0, loops: 1 }
    ));
    rows.push(polygonTest(
      'Самопересекающийся «бант»',
      'self',
      'Нулевая алгебраическая площадь; две треугольные грани.',
      [[{ x: 2, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }, { x: 8, y: 2 }]],
      W,
      { area: 18, components: 2, holes: 0, loops: 2 }
    ));
    rows.push(segmentTest(
      'Промах рядом с углом', 'vertex',
      'Параметрический допуск не должен превращать промах в видимую точку.',
      { x1: -100, y1: 99.999995, x2: 100, y2: -100.000005 },
      { visible: false }, W
    ));
    rows.push(segmentTest(
      'Почти параллельно границе', 'boundary',
      'Один конец попадает в допуск, видна только часть отрезка.',
      { x1: 10 + 1.1e-7, y1: 2, x2: 10 + 0.5e-7, y2: 8 },
      { visible: true, points: [10, 3, 10, 8] }, W
    ));
    const outer = [{ x: -10, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 20 }, { x: -10, y: 20 }];
    rows.push(polygonTest(
      'Окно внутри дыры', 'hole', 'Оба контура после отсечения совпадают и взаимно исключаются.',
      [outer, [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 15 }, { x: -5, y: 15 }]],
      W, { area: 0, components: 0, holes: 0, loops: 0, allowEmpty: true }
    ));
    rows.push(polygonTest(
      'Дыра разрезает область', 'hole', 'Через всё окно проходит вырез, остаются две части.',
      [outer, [{ x: 4, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 15 }, { x: 4, y: 15 }]],
      W, { area: 80, components: 2, holes: 0, loops: 2 }
    ));
    rows.push(polygonTest(
      'Распад одного контура', 'polygon', 'Окно отсекает перемычку U-образной фигуры.',
      [[{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 11 }, { x: 7, y: 11 },
        { x: 7, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 13 }, { x: 1, y: 13 }]],
      W, { area: 36, components: 2, holes: 0, loops: 2 }
    ));
    rows.push(polygonTest(
      'Совпадающие рёбра двух контуров', 'self', 'Заливка even-odd исключает область двойного покрытия.',
      [[{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
        [{ x: 4, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 8 }, { x: 4, y: 8 }]],
      W, { area: 18, components: 2, holes: 0, loops: 2 }
    ));
    return rows;
  }

  function runTests() {
    const rows = buildTestRows();
    const passed = rows.filter(function (row) { return row.pass; }).length;
    $('#testBody').innerHTML = rows.map(function (row) {
      const status = row.pass
        ? '<span class="status-pill">✓ PASS</span>'
        : '<span class="status-pill fail">× FAIL</span>';
      return '<tr>' +
        '<td><i class="test-dot ' + row.marker + '"></i></td>' +
        '<td>' + escapeHtml(row.name) + '</td>' +
        '<td>' + escapeHtml(row.description) + '</td>' +
        '<td>' + escapeHtml(row.detail) + '</td>' +
        '<td>' + status + '</td>' +
        '</tr>';
    }).join('');
    $('#testSummary').innerHTML = '<b>' + passed + ' / ' + rows.length + '</b> пройдено';
    $('#testSummary').style.color = passed === rows.length ? '' : '#9a5035';
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function bindNavigation() {
    const links = $$('.nav-link');
    const sections = links.map(function (link) {
      return document.querySelector(link.getAttribute('href'));
    }).filter(Boolean);
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const id = '#' + entry.target.id;
        links.forEach(function (link) {
          link.classList.toggle('active', link.getAttribute('href') === id);
        });
      });
    }, { rootMargin: '-35% 0px -55% 0px', threshold: 0.01 });
    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function init() {
    state.main.segments = defaultSegments();
    state.main.window = Object.assign({}, DEFAULT_WINDOW);
    state.poly.preset = 'convex';
    state.poly.algorithm = 'convex';
    state.poly.contours = PC.cloneContours(POLY_PRESETS.convex.contours);
    state.poly.window = Object.assign({}, POLY_PRESETS.convex.window);

    syncWindowInputs();
    updateMethodUI();
    updatePolyAlgorithmUI();
    updatePerfTreeLabels();
    syncPolyInputs();
    bindMain();
    bindPoly();
    bindPerf();
    bindNavigation();
    runTests();
    $('#runTests').addEventListener('click', runTests);

    fitMainView();
    fitPolyView();
    fitPerfView();
    recomputeMain();
    updatePoly();
    renderPerf();

    requestAnimationFrame(function () {
      if (!state.main.view.scale) fitMainView();
      if (!state.poly.view.scale) fitPolyView();
      if (!state.perf.view.scale) fitPerfView();
      renderMain();
      renderPoly();
      renderPerf();
    });

    if ('ResizeObserver' in window) {
      const mainShell = $('.main-shell');
      const polyShell = $('.polygon-shell');
      const perfShell = $('.perf-shell');
      const mainObserver = new ResizeObserver(function () {
        if (!state.main.view.scale) fitMainView();
        else renderMain();
      });
      mainObserver.observe(mainShell);
      const polyObserver = new ResizeObserver(function () {
        if (!state.poly.view.scale) fitPolyView();
        else renderPoly();
      });
      polyObserver.observe(polyShell);
      const perfObserver = new ResizeObserver(function () {
        fitPerfView();
        if (state.perf.dataset) {
          state.perf.baseDirty = true;
          buildPerfBase();
        }
        renderPerf();
      });
      perfObserver.observe(perfShell);
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();