import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGraph, crossesInterior, distance } from '../dist/core.js';

const data = JSON.parse(fs.readFileSync(new URL('../dist/coordinates.json', import.meta.url), 'utf8'));
const graph = createGraph(data);
const EPS = 1e-9;
const point = (x, y) => ({ x, y });
const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function onSegment(p, a, b) {
  return Math.abs(orient(a, b, p)) <= EPS
    && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS
    && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

// Independent oracle: classify a point with the odd/even ray-crossing rule.
// Boundary points are deliberately excluded because obstacle edges are traversable.
function strictlyInside(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(p, a, b)) return false;
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

// Split the segment at every polygon-boundary intersection, then classify each
// open interval's midpoint. Unlike production half-plane clipping, this method
// also works for simple concave polygons and does not assume polygon winding.
function independentInteriorCrossing(a, b, polygon) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return strictlyInside(a, polygon);
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i], d = polygon[(i + 1) % polygon.length];
    const ex = d.x - c.x, ey = d.y - c.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > EPS) {
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    } else if (Math.abs(orient(a, b, c)) <= EPS) {
      // Collinear overlap must still split at polygon-edge endpoints.
      for (const p of [c, d]) {
        const t = Math.abs(dx) > Math.abs(dy) ? (p.x - a.x) / dx : (p.y - a.y) / dy;
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
  }
  const sorted = [...new Set(cuts)].sort((x, y) => x - y);
  return sorted.slice(1).some((right, i) => {
    const t = (sorted[i] + right) / 2;
    return strictlyInside(point(a.x + t * dx, a.y + t * dy), polygon);
  });
}

const square = [point(0, 0), point(4, 0), point(4, 4), point(0, 4)];
const cases = [
  ['edge travel', point(0, 0), point(4, 0), false],
  ['extended edge overlap', point(-2, 0), point(6, 0), false],
  ['part of edge', point(1, 0), point(3, 0), false],
  ['vertex tangent', point(-1, 1), point(1, -1), false],
  ['ends at vertex from outside', point(-1, -1), point(0, 0), false],
  ['crosses opposite edges', point(-1, 2), point(5, 2), true],
  ['vertex to opposite vertex', point(0, 0), point(4, 4), true],
  ['enters through vertex', point(-1, -1), point(2, 2), true],
  ['inside endpoints', point(1, 1), point(3, 3), true],
  ['inside to boundary', point(2, 2), point(4, 2), true],
  ['outside segment', point(-2, 1), point(-1, 3), false],
  ['boundary point', point(0, 2), point(0, 2), false],
  ['inside point', point(2, 2), point(2, 2), true],
];
for (const [name, a, b, expected] of cases) {
  for (const polygon of [square, [...square].reverse()]) {
    for (const [start, end] of [[a, b], [b, a]]) {
      assert.equal(independentInteriorCrossing(start, end, polygon), expected, `Oracle: ${name}`);
      assert.equal(crossesInterior(start, end, polygon), expected, `Production: ${name}`);
    }
  }
}

// Check that the oracle does not accidentally implement the convex-only rule.
const concave = [point(0, 0), point(4, 0), point(4, 1), point(1, 1), point(1, 4), point(0, 4)];
assert.equal(independentInteriorCrossing(point(2, 2), point(3, 3), concave), false);
assert.equal(independentInteriorCrossing(point(-1, 3), point(2, 3), concave), true);

const polygons = data.obstacles.map(ids => ids.map(id => data.points[id]));
for (const [index, polygon] of polygons.entries()) {
  assert.ok(polygon.length >= 3, `Obstacle ${index + 1} needs at least three vertices`);
  const winding = Math.sign(orient(polygon[0], polygon[1], polygon[2]));
  assert.notEqual(winding, 0, `Obstacle ${index + 1} has a degenerate turn`);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    // Every other vertex must lie strictly on the same side of each boundary
    // edge. This validates the convex-polygon contract of production clipping.
    for (let j = 0; j < polygon.length; j++) {
      if (j === i || j === (i + 1) % polygon.length) continue;
      assert.ok(winding * orient(a, b, polygon[j]) > EPS,
        `Obstacle ${index + 1} must be strictly convex and consistently ordered`);
    }
  }
}

const ids = Object.keys(data.points);
const expectedEdges = new Set();
let pairCount = 0, classificationCount = 0;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    let blocked = false;
    pairCount++;
    for (const [index, polygon] of polygons.entries()) {
      const expected = independentInteriorCrossing(data.points[a], data.points[b], polygon);
      assert.equal(crossesInterior(data.points[a], data.points[b], polygon), expected,
        `${a} -> ${b}, obstacle ${index + 1}`);
      classificationCount++;
      blocked ||= expected;
    }
    if (!blocked) expectedEdges.add(`${a}:${b}`);
    assert.equal(graph.adjacency[a].includes(b), !blocked, `Visibility ${a} -> ${b}`);
    assert.equal(graph.adjacency[b].includes(a), !blocked, `Visibility ${b} -> ${a}`);
  }
}
assert.equal(pairCount, 595);
assert.equal(classificationCount, 4760);
assert.equal(expectedEdges.size, 118);
assert.deepEqual(new Set(graph.edges.map(({ a, b }) => `${a}:${b}`)), expectedEdges);

// Regression for the reported O23 -> O29 -> O31 detour: the direct edge must
// stay available, and its actual distance is shorter than the two-edge route.
assert.ok(graph.adjacency.O23.includes('O31'));
const direct = distance(data.points.O23, data.points.O31);
const detour = distance(data.points.O23, data.points.O29) + distance(data.points.O29, data.points.O31);
assert.ok(Math.abs(direct - 177.81451009408656) < EPS);
assert.ok(Math.abs(detour - 204.22871315705365) < EPS);
assert.ok(direct < detour);

console.log('PASS: independent geometry oracle matches all 4,760 polygon checks (595 pairs, 118 visible edges); convexity, boundary cases, and O23 -> O31 verified.');
