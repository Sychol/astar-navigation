export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const compareSearchNodes = (a, b) => a.f - b.f || a.h - b.h || a.id.localeCompare(b.id, undefined, { numeric: true });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export function crossesInterior(a, b, polygon) {
  const area = polygon.reduce((sum, p, i) => sum + cross(p, polygon[(i + 1) % polygon.length]), 0);
  const sign = area > 0 ? 1 : -1;
  let lo = 0, hi = 1;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], edge = sub(polygon[(i + 1) % polygon.length], p);
    const c = sign * cross(edge, sub(a, p)), d = sign * cross(edge, sub(b, a));
    if (Math.abs(d) < 1e-9) { if (c <= 1e-9) return false; }
    else if (d > 0) lo = Math.max(lo, -c / d);
    else hi = Math.min(hi, -c / d);
    if (hi - lo <= 1e-9) return false;
  }
  return hi - lo > 1e-9;
}
export function createGraph(data) {
  const { points, obstacles } = data;
  const ids = Object.keys(points), polygons = obstacles.map(group => group.map(id => points[id]));
  const adjacency = Object.fromEntries(ids.map(id => [id, []])), edges = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    if (!polygons.some(poly => crossesInterior(points[a], points[b], poly))) {
      const cost = distance(points[a], points[b]);
      adjacency[a].push(b); adjacency[b].push(a); edges.push({ a, b, cost });
    }
  }
  return { points, obstacles, adjacency, edges };
}
export function pathCost(graph, path) {
  return path.slice(1).reduce((sum, id, i) => sum + distance(graph.points[path[i]], graph.points[id]), 0);
}
export function metrics(graph, path) {
  const id = path.at(-1), g = pathCost(graph, path), h = distance(graph.points[id], graph.points.G);
  return { id, g, h, f: g + h, depth: path.length - 1, path };
}
export function candidates(graph, path) {
  if (path.at(-1) === 'G') return [];
  return graph.adjacency[path.at(-1)].filter(id => !path.includes(id))
    .map(id => ({ ...metrics(graph, [...path, id]), step: distance(graph.points[path.at(-1)], graph.points[id]) }))
    .sort((a, b) => a.f - b.f || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
export function treeWindow(path) {
  const depth = path.length - 1;
  return { parent: path.at(-2) ?? null, current: path.at(-1), levels: [depth ? depth - 1 : null, depth, depth + 1] };
}
export function aStar(graph) {
  const open = new Map([['S', metrics(graph, ['S'])]]), closed = new Set(), best = new Map([['S', 0]]), frames = [];
  while (open.size) {
    const current = [...open.values()].sort(compareSearchNodes)[0], updates = [];
    open.delete(current.id); closed.add(current.id);
    if (current.id !== 'G') for (const id of graph.adjacency[current.id]) {
      const cost = current.g + distance(graph.points[current.id], graph.points[id]);
      if (cost + 1e-9 < (best.get(id) ?? Infinity)) {
        best.set(id, cost); closed.delete(id);
        const candidate = { ...metrics(graph, [...current.path, id]), g: cost, f: cost + distance(graph.points[id], graph.points.G) };
        open.set(id, candidate);
        updates.push(candidate);
      }
    }
    frames.push({ current, open: [...open.values()].sort(compareSearchNodes), updates: updates.sort(compareSearchNodes), closed: [...closed], done: current.id === 'G' });
    if (current.id === 'G') break;
  }
  return frames;
}
