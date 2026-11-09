/*
 * Отсечение многоугольников прямоугольным окном.
 * Сазерленд–Ходжман для выпуклого контура и обобщённый Уайлер–Атертон
 * с общими узлами пересечений и правилом чётности для сложных контуров.
 */
(function (root) {
  'use strict';

  const G = root.Geometry || (typeof require === 'function' ? require('./geometry.js') : null);
  const EPS = G ? G.EPS : 1e-7;
  const SUBJECT = 1;
  const CLIP = 2;

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function signedArea(points) {
    if (points.length < 3) return 0;
    const { x, y } = points[0];
    let area = 0;
    for (let i = 1; i < points.length - 1; i++) {
      area += cross(points[i].x - x, points[i].y - y, points[i + 1].x - x, points[i + 1].y - y);
    }
    return area / 2;
  }

  function near(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
  }

  function cleanContour(points) {
    const out = [];
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (!out.length || !near(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
    }
    if (out.length > 1 && near(out[0], out[out.length - 1])) out.pop();
    return out;
  }

  function snap(value, min, max) {
    if (Math.abs(value - min) <= EPS) return min;
    if (Math.abs(value - max) <= EPS) return max;
    return value;
  }

  function pointOnEdge(p, edge) {
    const dx = p.x - edge.a.x;
    const dy = p.y - edge.a.y;
    const along = dx * edge.ux + dy * edge.uy;
    return along >= -EPS && along <= edge.length + EPS
      && Math.abs(cross(edge.ux, edge.uy, dx, dy)) <= EPS;
  }

  // 1 — внутри, 0 — снаружи, −1 — на границе.
  function pointInPolygon(px, py, points) {
    const p = { x: px, y: py };
    let inside = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const edge = makeEdge(a, b, SUBJECT);
      if (edge && pointOnEdge(p, edge)) return -1;
      if ((a.y > py) !== (b.y > py)) {
        const x = a.x + (py - a.y) * (b.x - a.x) / (b.y - a.y);
        if (x > px + EPS) inside = !inside;
      }
    }
    return inside ? 1 : 0;
  }

  function pointInContours(px, py, contours) {
    let inside = 0;
    for (const contour of contours) {
      const side = pointInPolygon(px, py, contour);
      if (side === -1) return -1;
      inside ^= side;
    }
    return inside;
  }

  function isConvex(points) {
    const area = signedArea(points);
    if (Math.abs(area) <= EPS * EPS) return false;
    const sign = Math.sign(area);
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const edge = makeEdge(a, points[(i + 1) % points.length], SUBJECT);
      if (!edge) continue;
      for (const p of points) {
        if (sign * cross(edge.ux, edge.uy, p.x - a.x, p.y - a.y) < -EPS) return false;
      }
    }
    // Повторный обход тех же вершин создаёт чётное наложение.
    return points.every(function (a, i) {
      return !points.slice(i + 1).some(function (b) { return near(a, b); });
    });
  }

  function intersectAtX(a, b, x) {
    const dx = b.x - a.x;
    const t = (x - a.x) / dx;
    return { x: x, y: a.y + t * (b.y - a.y) };
  }

  function intersectAtY(a, b, y) {
    const dy = b.y - a.y;
    const t = (y - a.y) / dy;
    return { x: a.x + t * (b.x - a.x), y: y };
  }

  function clipEdgeSH(points, inside, intersect) {
    const out = [];
    if (!points.length) return out;

    let prev = points[points.length - 1];
    let prevInside = inside(prev);

    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      const currInside = inside(curr);

      if (currInside) {
        if (!prevInside) out.push(intersect(prev, curr));
        out.push({ x: curr.x, y: curr.y });
      } else if (prevInside) {
        out.push(intersect(prev, curr));
      }

      prev = curr;
      prevInside = currInside;
    }

    return cleanContour(out);
  }

  /*
   * Классический Сазерленд–Ходжман для выпуклого контура и прямоугольника.
   * Контур последовательно отсекается четырьмя полуплоскостями окна.
   * Это и есть обязательный алгоритм части 2 для нечётных вариантов.
   */
  function clipConvexContourSH(contour, w) {
    let pts = cleanContour(contour.map(function (p) {
      return {
        x: snap(p.x, w.xmin, w.xmax),
        y: snap(p.y, w.ymin, w.ymax)
      };
    }));
    if (pts.length < 3) return [];

    pts = clipEdgeSH(
      pts,
      function (p) { return p.x >= w.xmin; },
      function (a, b) { return intersectAtX(a, b, w.xmin); }
    );
    pts = clipEdgeSH(
      pts,
      function (p) { return p.x <= w.xmax; },
      function (a, b) { return intersectAtX(a, b, w.xmax); }
    );
    pts = clipEdgeSH(
      pts,
      function (p) { return p.y >= w.ymin; },
      function (a, b) { return intersectAtY(a, b, w.ymin); }
    );
    pts = clipEdgeSH(
      pts,
      function (p) { return p.y <= w.ymax; },
      function (a, b) { return intersectAtY(a, b, w.ymax); }
    );

    return pts.length >= 3 ? pts : [];
  }

  function keyOf(x, y) {
    return Math.floor(x / EPS) + ':' + Math.floor(y / EPS);
  }

  // Общий узел для обеих границ. Соседние ячейки нужны на границе сетки.
  function makeNodeIndex() {
    const cells = new Map();
    let nextId = 0;
    return function (point) {
      const ix = Math.floor(point.x / EPS);
      const iy = Math.floor(point.y / EPS);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = cells.get((ix + dx) + ':' + (iy + dy));
          const existing = cell && cell.find(function (node) { return near(point, node); });
          if (existing) return existing;
        }
      }
      const node = { x: point.x, y: point.y, id: nextId++, out: [] };
      const key = keyOf(point.x, point.y);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(node);
      return node;
    };
  }

  function makeEdge(a, b, mask) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPS) return null;
    return { a: a, b: b, ux: dx / length, uy: dy / length, length: length, mask: mask };
  }

  function boundaryEdges(contours, mask) {
    const edges = [];
    for (const contour of contours) {
      for (let i = 0; i < contour.length; i++) {
        const edge = makeEdge(contour[i], contour[(i + 1) % contour.length], mask);
        if (edge) edges.push(edge);
      }
    }
    return edges;
  }

  function insertIntersections(a, b, add) {
    const dx = b.a.x - a.a.x;
    const dy = b.a.y - a.a.y;
    const denom = cross(a.ux, a.uy, b.ux, b.uy);
    const bDistance = cross(a.ux, a.uy, dx, dy);
    const aDistance = cross(b.ux, b.uy, -dx, -dy);
    if (Math.abs(bDistance) <= EPS && Math.abs(bDistance + b.length * denom) <= EPS
      && Math.abs(aDistance) <= EPS && Math.abs(aDistance - a.length * denom) <= EPS) {
      for (const p of [a.a, a.b, b.a, b.b]) {
        if (pointOnEdge(p, a) && pointOnEdge(p, b)) add(p);
      }
      return;
    }
    if (Math.abs(denom) <= Number.EPSILON) return;
    const t = aDistance / denom;
    const u = -bDistance / denom;
    if (t < -EPS || t > a.length + EPS || u < -EPS || u > b.length + EPS) return;
    const s = Math.max(0, Math.min(b.length, u));
    add({ x: b.a.x + b.ux * s, y: b.a.y + b.uy * s });
  }

  // Обход Уайлера–Атертона: вставляем пересечения в обе границы.
  // Совпадающие дуги хранятся один раз с маской чётности обеих фигур.
  function spliceBoundaries(subject, clip) {
    const edges = subject.concat(clip);
    const nodeAt = makeNodeIndex();
    const intersections = new Set();
    // Сначала вершины окна: совпадающие с ними узлы лежат точно в углах.
    for (const edge of clip.concat(subject)) {
      edge.cuts = new Set([nodeAt(edge.a), nodeAt(edge.b)]);
    }
    for (let i = 0; i < subject.length; i++) {
      const a = edges[i];
      for (let j = i + 1; j < edges.length; j++) {
        const b = edges[j];
        insertIntersections(a, b, function (p) {
          const node = nodeAt(p);
          a.cuts.add(node);
          b.cuts.add(node);
          if (b.mask === CLIP) intersections.add(node);
        });
      }
    }

    const arcs = new Map();
    for (const edge of edges) {
      const cuts = Array.from(edge.cuts).sort(function (a, b) {
        return (a.x - b.x) * edge.ux + (a.y - b.y) * edge.uy;
      });
      for (let i = 1; i < cuts.length; i++) {
        const a = cuts[i - 1];
        const b = cuts[i];
        const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
        const arc = arcs.get(key);
        if (arc) arc.mask ^= edge.mask;
        else arcs.set(key, makeEdge(a, b, edge.mask));
      }
    }
    return {
      arcs: Array.from(arcs.values()).filter(function (arc) { return arc.mask; }),
      intersections: Array.from(intersections, function (p) { return { x: p.x, y: p.y }; })
    };
  }

  /*
   * Проверяем покрытие слева от открытой дуги лучом вдоль её нормали.
   * Пересечения в начале луча уже учтены маской дуги: переход на правую
   * сторону меняет чётность только у фигур из этой маски.
   */
  function leftCoverage(arc, arcs) {
    const offset = arc.length / 2;
    const x = arc.a.x + arc.ux * offset;
    const y = arc.a.y + arc.uy * offset;
    let coverage = 0;
    for (const edge of arcs) {
      if (edge === arc) continue;
      const ax = edge.a.x - x;
      const ay = edge.a.y - y;
      const bx = edge.b.x - x;
      const by = edge.b.y - y;
      const alongA = ax * arc.ux + ay * arc.uy;
      const alongB = bx * arc.ux + by * arc.uy;
      // Полуоткрытое правило учитывает вершину пересекаемого ребра один раз.
      if ((alongA > 0) === (alongB > 0)) continue;
      const acrossA = cross(arc.ux, arc.uy, ax, ay);
      const acrossB = cross(arc.ux, arc.uy, bx, by);
      const hit = acrossA + (acrossB - acrossA) * (-alongA / (alongB - alongA));
      if (hit > EPS) coverage ^= edge.mask;
    }
    return coverage;
  }

  function nextBoundary(edge) {
    const back = edge.angle + Math.PI;
    let next = null;
    let best = Infinity;
    for (const candidate of edge.to.out) {
      const turn = (back - candidate.angle + 2 * Math.PI) % (2 * Math.PI);
      if (turn < best) {
        best = turn;
        next = candidate;
      }
    }
    return next;
  }

  function walkBoundaries(arcs, required) {
    const boundary = [];
    for (const arc of arcs) {
      const left = leftCoverage(arc, arcs);
      const leftInside = (left & required) === required;
      const rightInside = ((left ^ arc.mask) & required) === required;
      if (leftInside === rightInside) continue;
      const from = leftInside ? arc.a : arc.b;
      const to = leftInside ? arc.b : arc.a;
      const edge = { from: from, to: to, angle: Math.atan2(to.y - from.y, to.x - from.x), used: false };
      boundary.push(edge);
      from.out.push(edge);
    }

    // На выходе из одной границы продолжаем по другой через общий узел.
    // При касании выбираем дугу, сохраняющую материал слева.
    const loops = [];
    for (const start of boundary) {
      if (start.used) continue;
      const points = [];
      let edge = start;
      while (edge && !edge.used) {
        points.push({ x: edge.from.x, y: edge.from.y });
        edge.used = true;
        edge = nextBoundary(edge);
      }
      if (edge !== start) continue;
      const area = signedArea(points);
      if (Math.abs(area) > EPS * EPS) {
        loops.push({ points: points, area: area, type: area > EPS * EPS ? 'outer' : 'hole' });
      }
    }
    return { loops: loops, edges: boundary.length };
  }

  function decomposeContour(points) {
    const subject = boundaryEdges([cleanContour(points)], SUBJECT);
    const { arcs } = spliceBoundaries(subject, []);
    return walkBoundaries(arcs, SUBJECT).loops.map(function (loop) { return loop.points; });
  }

  function summarize(loops, contours, intersections, edges, algorithm) {
    const area = loops.reduce(function (sum, loop) { return sum + loop.area; }, 0);
    const components = loops.filter(function (loop) { return loop.type === 'outer'; }).length;
    return {
      loops: loops,
      contours: contours,
      intersections: intersections,
      area: area,
      edges: edges,
      components: components,
      holes: loops.length - components,
      algorithm: algorithm
    };
  }

  function clipPolygonToRect(rawContours, rawWindow, options) {
    const w = G ? G.normalizeWindow(rawWindow) : rawWindow;
    const cleaned = rawContours.map(cleanContour).filter(function (contour) { return contour.length >= 3; });
    if (options && options.mode === 'convex' && cleaned.length === 1 && isConvex(cleaned[0])) {
      const points = clipConvexContourSH(cleaned[0], w);
      const area = signedArea(points);
      if (area < -EPS * EPS) points.reverse();
      const loops = Math.abs(area) > EPS * EPS ? [{ points: points, area: Math.abs(area), type: 'outer' }] : [];
      const intersections = points.filter(function (p) {
        return p.x <= w.xmin + EPS || p.x >= w.xmax - EPS || p.y <= w.ymin + EPS || p.y >= w.ymax - EPS;
      });
      return summarize(loops, cleaned, intersections, points.length, 'convex-sh');
    }

    if (w.xmax - w.xmin <= EPS || w.ymax - w.ymin <= EPS) {
      return summarize([], cleaned, [], 0, 'weiler-atherton');
    }
    const rect = [
      { x: w.xmin, y: w.ymin }, { x: w.xmax, y: w.ymin },
      { x: w.xmax, y: w.ymax }, { x: w.xmin, y: w.ymax }
    ];
    const subject = boundaryEdges(cleaned, SUBJECT);
    const clip = boundaryEdges([rect], CLIP);
    const { arcs, intersections } = spliceBoundaries(subject, clip);
    const { loops, edges } = walkBoundaries(arcs, SUBJECT | CLIP);
    return summarize(loops, cleaned, intersections, edges, 'weiler-atherton');
  }

  function cloneContours(contours) {
    return contours.map(function (contour) {
      return contour.map(function (p) {
        return { x: p.x, y: p.y };
      });
    });
  }

  const api = {
    EPS: EPS,
    signedArea: signedArea,
    pointInPolygon: pointInPolygon,
    pointInContours: pointInContours,
    clipPolygonToRect: clipPolygonToRect,
    clipConvexPolygonToRect: clipConvexContourSH,
    decomposeContour: decomposeContour,
    cloneContours: cloneContours,
    keyOf: keyOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PolygonClipper = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);