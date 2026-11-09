/*
 * quadtree.js — пространственный индекс для габаритов отрезков.
 *
 * Каждый отрезок хранится по AABB. Если габарит пересекает несколько
 * квадрантов, отрезок попадает в каждый из них; при запросе дубликаты
 * отсекаются меткой _stamp. Быстрый префильтр использует 4-битные маски
 * (Geometry.outcodeBox), поэтому целые кластеры отбрасываются без
 * вычисления пересечений.
 */
(function (root) {
  'use strict';

  const G = root.Geometry || (typeof require === 'function' ? require('./geometry.js') : null);
  let QUERY_STAMP = 0;

  function intersects(a, b) {
    return !(
      a.xmax < b.xmin - 1e-7 ||
      a.xmin > b.xmax + 1e-7 ||
      a.ymax < b.ymin - 1e-7 ||
      a.ymin > b.ymax + 1e-7
    );
  }

  class QuadNode {
    constructor(bounds, depth) {
      this.bounds = bounds;
      this.depth = depth;
      this.items = [];
      this.children = null;
    }
  }

  class QuadTree {
    constructor(bounds, options) {
      const opts = options || {};
      this.bounds = {
        xmin: bounds.xmin,
        ymin: bounds.ymin,
        xmax: bounds.xmax,
        ymax: bounds.ymax
      };
      this.maxDepth = opts.maxDepth === undefined ? 8 : opts.maxDepth;
      this.capacity = opts.capacity === undefined ? 64 : opts.capacity;
      this.root = new QuadNode(this.bounds, 0);
      this.nodeCount = 1;
      this.leafCount = 1;
      this.maxUsedDepth = 0;
      this.size = 0;
    }

    clear() {
      this.root = new QuadNode(this.bounds, 0);
      this.nodeCount = 1;
      this.leafCount = 1;
      this.maxUsedDepth = 0;
      this.size = 0;
    }

    build(items) {
      this.clear();
      for (let i = 0; i < items.length; i++) this.insert(items[i]);
      return this;
    }

    insert(item) {
      if (!item.box) return;
      if (!intersects(item.box, this.bounds)) return;
      this._insert(this.root, item);
      this.size++;
    }

    _insert(node, item) {
      if (!intersects(item.box, node.bounds)) return;

      if (!node.children) {
        node.items.push(item);
        if (node.items.length > this.capacity && node.depth < this.maxDepth) {
          this._split(node);
        }
        return;
      }

      for (let i = 0; i < 4; i++) {
        this._insert(node.children[i], item);
      }
    }

    _split(node) {
      const b = node.bounds;
      const mx = (b.xmin + b.xmax) / 2;
      const my = (b.ymin + b.ymax) / 2;
      const d = node.depth + 1;
      node.children = [
        new QuadNode({ xmin: b.xmin, ymin: b.ymin, xmax: mx, ymax: my }, d),
        new QuadNode({ xmin: mx, ymin: b.ymin, xmax: b.xmax, ymax: my }, d),
        new QuadNode({ xmin: b.xmin, ymin: my, xmax: mx, ymax: b.ymax }, d),
        new QuadNode({ xmin: mx, ymin: my, xmax: b.xmax, ymax: b.ymax }, d)
      ];
      this.nodeCount += 4;
      this.leafCount += 3;
      this.maxUsedDepth = Math.max(this.maxUsedDepth, d);

      const old = node.items;
      node.items = [];
      for (let i = 0; i < old.length; i++) {
        for (let k = 0; k < 4; k++) {
          this._insert(node.children[k], old[i]);
        }
      }
    }

    query(rect, stats) {
      const out = [];
      const stamp = ++QUERY_STAMP;
      this._query(this.root, rect, out, stats || null, stamp);
      return out;
    }

    _query(node, rect, out, stats, stamp) {
      if (stats) stats.nodes++;
      if (G) {
        const code = G.outcodeBox(node.bounds, rect);
        if (code !== 0) {
          if (stats) stats.rejectedNodes++;
          return;
        }
      } else if (!intersects(node.bounds, rect)) {
        if (stats) stats.rejectedNodes++;
        return;
      }

      if (!node.children) {
        if (stats) stats.leaves++;
        for (let i = 0; i < node.items.length; i++) {
          const item = node.items[i];
          if (stats) stats.tested++;
          if (item._stamp === stamp) continue;
          item._stamp = stamp;
          if (G) {
            const code = G.outcodeBox(item.box, rect);
            if (code !== 0) {
              if (stats) stats.rejectedAABB++;
              continue;
            }
          }
          if (stats) stats.candidates++;
          out.push(item);
        }
        return;
      }

      for (let i = 0; i < 4; i++) {
        this._query(node.children[i], rect, out, stats, stamp);
      }
    }

    summary() {
      return {
        nodes: this.nodeCount,
        leaves: this.leafCount,
        depth: this.maxUsedDepth,
        size: this.size
      };
    }
  }

  const api = { QuadTree: QuadTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Quadtree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
