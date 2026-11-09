/*
 * geometry.js — ε-устойчивое ядро отсечения отрезков.
 *
 * Допуск EPS = 10⁻⁷ задан в мировых координатах.
 * Точка, лежащая на границе окна, считается видимой. Отрезок нулевой
 * длины внутри окна даёт вырожденный (точечный) результат.
 */
(function (root) {
  'use strict';

  const EPS = 1e-7;

  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;

  function eq(a, b, tol) {
    return Math.abs(a - b) <= (tol === undefined ? EPS : tol);
  }

  function lt(a, b, tol) {
    return a < b - (tol === undefined ? EPS : tol);
  }

  function gt(a, b, tol) {
    return a > b + (tol === undefined ? EPS : tol);
  }

  function le(a, b, tol) {
    return a <= b + (tol === undefined ? EPS : tol);
  }

  function ge(a, b, tol) {
    return a >= b - (tol === undefined ? EPS : tol);
  }

  function makeCounters() {
    return { mul: 0, div: 0, add: 0, cmp: 0 };
  }

  function addCounters(target, source) {
    if (!target || !source) return target;
    target.mul += source.mul;
    target.div += source.div;
    target.add += source.add;
    target.cmp += source.cmp;
    return target;
  }

  function normalizeWindow(w) {
    if (w.xmin <= w.xmax && w.ymin <= w.ymax) return w;
    return {
      xmin: Math.min(w.xmin, w.xmax),
      ymin: Math.min(w.ymin, w.ymax),
      xmax: Math.max(w.xmin, w.xmax),
      ymax: Math.max(w.ymin, w.ymax)
    };
  }

  /* Четырёхбитный код точки. Граница входит в окно. */
  function outcodePoint(x, y, w, counters, tol = EPS) {
    let code = 0;
    if (lt(x, w.xmin, tol)) code |= LEFT;
    else if (gt(x, w.xmax, tol)) code |= RIGHT;
    if (lt(y, w.ymin, tol)) code |= BOTTOM;
    else if (gt(y, w.ymax, tol)) code |= TOP;
    if (counters) counters.cmp += 2;
    return code;
  }

  /*
   * AABB-код габарита. Именно эта функция реализует быстрый битовый
   * префильтр: если codeA & codeB != 0, габариты не пересекаются.
   */
  function outcodeBox(box, w, counters) {
    let code = 0;
    if (lt(box.xmax, w.xmin)) code |= LEFT;
    else if (gt(box.xmin, w.xmax)) code |= RIGHT;
    if (lt(box.ymax, w.ymin)) code |= BOTTOM;
    else if (gt(box.ymin, w.ymax)) code |= TOP;
    if (counters) counters.cmp += 2;
    return code;
  }

  function segmentBox(s) {
    return {
      xmin: Math.min(s.x1, s.x2),
      ymin: Math.min(s.y1, s.y2),
      xmax: Math.max(s.x1, s.x2),
      ymax: Math.max(s.y1, s.y2)
    };
  }

  function snapToBounds(value, min, max) {
    if (value <= min + EPS) return min;
    if (value >= max - EPS) return max;
    return value;
  }

  function result(x1, y1, x2, y2, w) {
    x1 = snapToBounds(x1, w.xmin, w.xmax);
    y1 = snapToBounds(y1, w.ymin, w.ymax);
    x2 = snapToBounds(x2, w.xmin, w.xmax);
    y2 = snapToBounds(y2, w.ymin, w.ymax);
    return {
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      degenerate: eq(x1, x2) && eq(y1, y2)
    };
  }

  /*
   * Сазерленд–Коэн. Явное уравнение A·(x − ax) + B·(y − ay) = 0
   * задано в координатах относительно первого конца (ax, ay).
   */
  function sutherlandCohen(x1, y1, x2, y2, w, counters) {
    w = normalizeWindow(w);
    let c1 = outcodePoint(x1, y1, w, counters);
    let c2 = outcodePoint(x2, y2, w, counters);
    if ((c1 | c2) === 0) return result(x1, y1, x2, y2, w);
    if ((c1 & c2) !== 0) return null;

    // Отсечение в локальных координатах не округляет пересечение до
    // крупной мировой координаты перед повторной проверкой outcode.
    const bounds = {
      xmin: (w.xmin - EPS) - w.xmin,
      xmax: (w.xmax + EPS) - w.xmin,
      ymin: (w.ymin - EPS) - w.ymin,
      ymax: (w.ymax + EPS) - w.ymin
    };
    x1 -= w.xmin;
    x2 -= w.xmin;
    y1 -= w.ymin;
    y2 -= w.ymin;
    const ax = x1;
    const ay = y1;
    const A = y2 - y1;
    const B = x1 - x2;
    if (counters) counters.add += 6;

    for (let step = 0; step < 8; step++) {
      const code = c1 || c2;
      let x, y;
      // Разные коды гарантируют ненулевой делитель для выбранной стороны.
      if (code & (TOP | BOTTOM)) {
        y = code & TOP ? bounds.ymax : bounds.ymin;
        x = ax - B * (y - ay) / A;
      } else {
        x = code & RIGHT ? bounds.xmax : bounds.xmin;
        y = ay - A * (x - ax) / B;
      }
      if (counters) {
        counters.mul++;
        counters.div++;
        counters.add += 2;
      }

      if (c1) {
        x1 = x;
        y1 = y;
        c1 = outcodePoint(x1, y1, bounds, counters, 0);
      } else {
        x2 = x;
        y2 = y;
        c2 = outcodePoint(x2, y2, bounds, counters, 0);
      }
      if ((c1 | c2) === 0) {
        if (counters) counters.add += 4;
        return result(x1 + w.xmin, y1 + w.ymin, x2 + w.xmin, y2 + w.ymin, w);
      }
      if ((c1 & c2) !== 0) return null;
    }
    return null;
  }

  // Лианг–Барски: p·t ≤ q на четырёх сторонах окна с допуском в координатах.
  function liangBarsky(x1, y1, x2, y2, w, counters) {
    w = normalizeWindow(w);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const left = w.xmin - EPS;
    const right = w.xmax + EPS;
    const bottom = w.ymin - EPS;
    const top = w.ymax + EPS;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - left, right - x1, y1 - bottom, top - y1];
    const end = [x2 - left, right - x2, y2 - bottom, top - y2];
    if (counters) counters.add += 10;

    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
      // Знаки здесь относятся к уже расширенной на EPS полуплоскости.
      const startOutside = q[i] < 0;
      const endOutside = end[i] < 0;
      if (counters) counters.cmp += 2;
      if (startOutside && endOutside) return null;
      if (startOutside === endOutside) continue;
      const t = q[i] / p[i];
      if (counters) counters.div++;
      if (startOutside) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    return fromInterval(x1, y1, x2, y2, dx, dy, t0, t1, w, counters);
  }

  // Сайрус–Бек: скалярные произведения с внутренними нормалями окна.
  function cyrusBeck(x1, y1, x2, y2, w, counters) {
    w = normalizeWindow(w);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const sides = [
      { nx: 1, ny: 0, fx: w.xmin - EPS, fy: 0 },
      { nx: -1, ny: 0, fx: w.xmax + EPS, fy: 0 },
      { nx: 0, ny: 1, fx: 0, fy: w.ymin - EPS },
      { nx: 0, ny: -1, fx: 0, fy: w.ymax + EPS }
    ];
    if (counters) counters.add += 2;
    let t0 = 0;
    let t1 = 1;
    for (const { nx, ny, fx, fy } of sides) {
      const start = nx * (x1 - fx) + ny * (y1 - fy);
      const end = nx * (x2 - fx) + ny * (y2 - fy);
      const startOutside = start < 0;
      const endOutside = end < 0;
      if (counters) {
        counters.mul += 4;
        counters.add += 6;
        counters.cmp += 2;
      }
      if (startOutside && endOutside) return null;
      if (startOutside === endOutside) continue;
      const t = -start / (nx * dx + ny * dy);
      if (counters) {
        counters.mul += 2;
        counters.div++;
        counters.add++;
      }
      if (startOutside) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    return fromInterval(x1, y1, x2, y2, dx, dy, t0, t1, w, counters);
  }

  function fromInterval(x1, y1, x2, y2, dx, dy, t0, t1, w, counters) {
    if (t0 > t1) return null;
    // Вычисляем каждый конец относительно соответствующего исходного конца.
    if (t0 > 0) {
      x1 += t0 * dx;
      y1 += t0 * dy;
      if (counters) { counters.mul += 2; counters.add += 2; }
    }
    if (t1 < 1) {
      x2 -= (1 - t1) * dx;
      y2 -= (1 - t1) * dy;
      if (counters) { counters.mul += 2; counters.add += 2; }
    }
    return result(x1, y1, x2, y2, w);
  }

  const METHODS = {
    sutherland: sutherlandCohen,
    liang: liangBarsky,
    cyrus: cyrusBeck
  };

  function clipSegment(method, s, w, counters) {
    const fn = METHODS[method] || sutherlandCohen;
    return fn(s.x1, s.y1, s.x2, s.y2, w, counters);
  }

  /*
   * Пакетное отсечение. collect=true сохраняет видимые части для Canvas.
   * В быстром режиме (бенчмарк) объекты не создаются без необходимости.
   */
  function clipAll(segments, w, method, options) {
    w = normalizeWindow(w);
    const opts = options || {};
    const counters = opts.counters === false
      ? null
      : (opts.counters && opts.counters !== true ? opts.counters : makeCounters());
    const collect = opts.collect === true;
    const results = collect ? [] : null;
    let visible = 0;
    let rejected = 0;
    let points = 0;
    let tested = 0;
    let prefiltered = 0;

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      tested++;
      if (opts.aabb !== false) {
        const box = s.box || segmentBox(s);
        if (outcodeBox(box, w, counters) !== 0) {
          rejected++;
          prefiltered++;
          continue;
        }
      }
      const clipped = clipSegment(method, s, w, counters);
      if (clipped) {
        visible++;
        if (clipped.degenerate) points++;
        if (collect) results.push({ source: s, clip: clipped });
      } else {
        rejected++;
      }
    }

    return {
      results: results,
      visible: visible,
      rejected: rejected,
      points: points,
      tested: tested,
      prefiltered: prefiltered,
      counters: counters
    };
  }

  function reverseSegment(s) {
    return { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
  }

  function sameResult(a, b, tol) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const t = tol === undefined ? 1e-6 : tol;
    return (
      (eq(a.x1, b.x1, t) && eq(a.y1, b.y1, t) && eq(a.x2, b.x2, t) && eq(a.y2, b.y2, t)) ||
      (eq(a.x1, b.x2, t) && eq(a.y1, b.y2, t) && eq(a.x2, b.x1, t) && eq(a.y2, b.y1, t))
    );
  }

  const api = {
    EPS: EPS,
    LEFT: LEFT,
    RIGHT: RIGHT,
    BOTTOM: BOTTOM,
    TOP: TOP,
    eq: eq,
    lt: lt,
    gt: gt,
    le: le,
    ge: ge,
    makeCounters: makeCounters,
    addCounters: addCounters,
    normalizeWindow: normalizeWindow,
    outcodePoint: outcodePoint,
    outcodeBox: outcodeBox,
    segmentBox: segmentBox,
    clipSegment: clipSegment,
    clipAll: clipAll,
    sutherlandCohen: sutherlandCohen,
    liangBarsky: liangBarsky,
    cyrusBeck: cyrusBeck,
    reverseSegment: reverseSegment,
    sameResult: sameResult
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Geometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
