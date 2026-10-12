import fs from 'fs';
import { geoMercator, geoPath, geoArea } from 'd3-geo';
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force';

const [geoFile, dataFile, outFile] = process.argv.slice(2);
const geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'));
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
for (const f of geo.features) {
  if (geoArea(f) > 2 * Math.PI) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) ring.reverse();
  }
}
const en2pc = Object.fromEntries(Object.entries(data.provinces).map(([pc, p]) => [p.en, pc]));

const W = 520, H = 940, R = 6.4;
const proj = geoMercator().fitExtent([[40, 22], [W - 40, H - 22]], geo);
const path = geoPath(proj);
const r = v => Math.round(v * 10) / 10;

const provinces = geo.features.map(f => {
  const pc = en2pc[f.properties.name];
  if (!pc) throw new Error('unmapped ' + f.properties.name);
  const [cx, cy] = path.centroid(f);
  return { pc, d: path(f).replace(/(\d+\.\d)\d+/g, '$1'), cx: r(cx), cy: r(cy) };
});
const cen = Object.fromEntries(provinces.map(p => [p.pc, p]));

// Level 1: one circle per province, sized by seat count, pulled to its centroid.
const G = 2 * R + 1.6; // dot pitch
const hexOffsets = n => { // first n points of a hexagonal spiral, centre first
  const pts = [[0, 0]];
  for (let ring = 1; pts.length < n; ring++) {
    let x = ring, y = 0; // axial coords walking the ring
    const dirs = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
    for (const [dx, dy] of dirs) for (let k = 0; k < ring; k++) { pts.push([x, y]); x += dx; y += dy; }
  }
  return pts.slice(0, n).map(([q, s]) => [G * (q + s / 2), G * (s * Math.sqrt(3) / 2)]);
};
const pnodes = provinces.map(p => {
  const n = data.provinces[p.pc].seats;
  const offs = hexOffsets(n);
  const rad = Math.max(...offs.map(([x, y]) => Math.hypot(x, y))) + R;
  return { pc: p.pc, n, offs, rad, tx: p.cx, ty: p.cy, x: p.cx, y: p.cy };
});
const sim = forceSimulation(pnodes)
  .force('x', forceX(d => d.tx).strength(0.12))
  .force('y', forceY(d => d.ty).strength(0.12))
  .force('c', forceCollide(d => d.rad + 1.4).iterations(6))
  .stop();
for (let i = 0; i < 800; i++) sim.tick();
const pmap = Object.fromEntries(pnodes.map(p => [p.pc, p]));
// Level 2: districts on the hex spiral inside their province, ordered by district number.
const byProv = {};
for (const d of data.districts) (byProv[d.pc] ||= []).push(d);
const nodes = [];
for (const [pc, ds] of Object.entries(byProv)) {
  const p = pmap[pc];
  ds.sort((a, b) => a.n - b.n).forEach((d, i) => nodes.push({ id: d.id, x: p.x + p.offs[i][0], y: p.y + p.offs[i][1], tx: p.tx, ty: p.ty }));
}
const dots = Object.fromEntries(nodes.map(n => [n.id, [r(n.x), r(n.y)]]));
const blobs = Object.fromEntries(pnodes.map(p => [p.pc, [r(p.x), r(p.y), r(p.rad)]]));
fs.writeFileSync(outFile, JSON.stringify({ w: W, h: H, r: R, provinces, dots, blobs }));
console.log('provinces', provinces.length, 'dots', nodes.length, 'bytes', fs.statSync(outFile).size);
const maxShift = Math.max(...nodes.map(n => Math.hypot(n.x - n.tx, n.y - n.ty)));
console.log('max displacement px', maxShift.toFixed(1));
