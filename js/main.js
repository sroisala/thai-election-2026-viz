/* One map of constituency dots. Each election year is data/years/<year>.json. */
(async function () {
  const HEX_R = 6;
  const HEX_GAP = 0.4;
  const BKK_PC = '10';
  let index, provinces, MAP, YEARS, POLICIES, PROVINCE_STATS;
  try {
    [index, provinces, MAP, POLICIES, PROVINCE_STATS] = await Promise.all([
      d3.json('data/years/index.json'),
      d3.json('data/provinces.json'),
      d3.json('data/map.json'),
      d3.json('data/panel/policies.json').catch(() => ({})),
      d3.json('data/panel/province-stats.json').catch(() => ({})),
    ]);
    const files = await Promise.all(index.map(id => d3.json(`data/years/${id}.json`)));
    YEARS = files.map(raw => normalizeYear(raw, provinces));
    placeDots(YEARS, MAP);
  } catch (err) {
    console.error(err);
    document.getElementById('detail').innerHTML = '<p class="warn">โหลดข้อมูลไม่สำเร็จ</p>';
    return;
  }
  const yearById = new Map(YEARS.map(y => [y.id, y]));
  YEARS.forEach(y => { y.byId = new Map(y.districts.map(d => [d.id, d])); });
  const COMPARE = [
    { id: '2569', part: 'top' },
    { id: '2566', part: 'left' },
    { id: '2562', part: 'right' },
  ];
  const provOf = pc => provinces[pc];
  const SCORES = [['const', 'เขต'], ['list', 'บัญชีรายชื่อ'], ['total', 'รวม']];
  const fmtPct = d3.format('.1%');
  const fmtInt = d3.format(',');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function normalizeYear(raw, provinceList) {
    const byName = new Map(Object.entries(provinceList).map(([pc, p]) => [p.th, pc]));
    const parties = (raw.parties || []).map(p => ({
      name: p.name, en: p.en || '', color: p.color || '#a8a6a0',
      cs: 0, pls: +p.partyListSeats || 0, cv: 0, pv: 0,
    }));
    const partyIndex = new Map(parties.map((p, i) => [p.name, i]));
    const piOf = name => {
      if (partyIndex.has(name)) return partyIndex.get(name);
      parties.push({ name, en: '', color: '#a8a6a0', cs: 0, pls: 0, cv: 0, pv: 0 });
      partyIndex.set(name, parties.length - 1);
      return parties.length - 1;
    };
    const unknown = new Set();
    const seen = new Set();
    const districts = [];
    for (const d of raw.districts || []) {
      const pc = byName.get(d.province) || (provinceList[d.province] ? String(d.province) : null);
      if (!pc) { if (d.province) unknown.add(d.province); continue; }
      const id = `${pc}-${d.district}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const cands = (d.candidates || [])
        .map(c => [piOf(c.party), +c.votes || 0, c.name || ''])
        .filter(c => c[1] > 0)
        .sort((a, b) => b[1] - a[1]);
      const list = (d.partyList || [])
        .map(c => [piOf(c.party), +c.votes || 0])
        .filter(c => c[1] > 0)
        .sort((a, b) => b[1] - a[1]);
      const o = { id, pc, n: +d.district };
      if (d.eligible) o.el = +d.eligible;
      if (d.turnout) o.came = +d.turnout;
      if (d.invalid) o.inv = +d.invalid;
      if (d.noVote) o.nov = +d.noVote;
      if (d.voteGap) o.gap = +d.voteGap;
      if (cands.length) {
        o.c = cands.map(([pi, v, name]) => (name ? [pi, v, name] : [pi, v]));
        o.good = d3.sum(cands, c => c[1]);
        parties[cands[0][0]].cs += 1;
        cands.forEach(([pi, v]) => { parties[pi].cv += v; });
        if (raw.singleBallot) cands.forEach(([pi, v]) => { parties[pi].pv += v; });
      }
      if (list.length && !raw.singleBallot) {
        o.p = list;
        o.pl = { good: d3.sum(list, r => r[1]) };
        list.forEach(([pi, v]) => { parties[pi].pv += v; });
      }
      districts.push(o);
    }
    let note = raw.note || '';
    if (unknown.size) {
      const extra = `ชื่อจังหวัดที่ไม่ตรงกับ data/provinces.json จึงไม่ขึ้นบนแผนที่: ${[...unknown].join(', ')}`;
      note = note ? `${note} ${extra}` : extra;
    }
    return {
      id: String(raw.year),
      constSeats: raw.constSeats || districts.length,
      listSeats: raw.listSeats || 0,
      majority: raw.majority || 251,
      singleBallot: !!raw.singleBallot,
      note, parties, districts,
    };
  }

  function placeDots(years, map) {
    const G = Math.sqrt(3) * HEX_R + HEX_GAP;
    const hexOffsets = n => {
      const pts = [[0, 0]];
      for (let ring = 1; pts.length < n; ring++) {
        let x = ring, y = 0;
        const dirs = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
        for (const [dx, dy] of dirs) for (let k = 0; k < ring; k++) { pts.push([x, y]); x += dx; y += dy; }
      }
      return pts.slice(0, n).map(([q, s]) => [G * (q + s / 2), G * (s * Math.sqrt(3) / 2)]);
    };
    const cen = Object.fromEntries(map.provinces.map(p => [p.pc, p]));
    const maxN = {};
    for (const year of years) {
      const c = {};
      for (const d of year.districts) c[d.pc] = (c[d.pc] || 0) + 1;
      for (const [pc, n] of Object.entries(c)) maxN[pc] = Math.max(maxN[pc] || 0, n);
    }
    const offsOf = Object.fromEntries(Object.entries(maxN).filter(([pc]) => cen[pc]).map(([pc, n]) => [pc, hexOffsets(n)]));
    const bkkAt = [408, 590];
    map.bkk = bkkAt;
    const nodes = Object.entries(maxN).filter(([pc]) => cen[pc]).map(([pc, n]) => {
      const p = cen[pc];
      const offs = offsOf[pc];
      const reach = Math.max(...offs.map(([x, y]) => Math.hypot(x, y)), 0) + HEX_R + 2.5;
      const fixed = pc === BKK_PC;
      return { pc, offs, reach, fixed, x: fixed ? bkkAt[0] : p.cx, y: fixed ? bkkAt[1] : p.cy };
    });
    for (let iter = 0; iter < 90; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          const min = a.reach + b.reach;
          if (dist >= min) continue;
          if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
          const overlap = (min - dist) / dist;
          if (a.fixed && b.fixed) continue;
          if (a.fixed) { b.x += dx * overlap; b.y += dy * overlap; }
          else if (b.fixed) { a.x -= dx * overlap; a.y -= dy * overlap; }
          else {
            a.x -= dx * overlap * 0.5; a.y -= dy * overlap * 0.5;
            b.x += dx * overlap * 0.5; b.y += dy * overlap * 0.5;
          }
        }
      }
    }
    const placed = Object.fromEntries(nodes.map(n => [n.pc, n]));
    const round = v => Math.round(v * 10) / 10;
    let minX = 0, minY = 0, maxX = map.w, maxY = map.h;
    for (const year of years) {
      const by = {};
      for (const d of year.districts) (by[d.pc] ||= []).push(d);
      for (const [pc, ds] of Object.entries(by)) {
        const p = placed[pc];
        if (!p) continue;
        ds.sort((a, b) => a.n - b.n).forEach((d, i) => {
          d.xy = [round(p.x + p.offs[i][0]), round(p.y + p.offs[i][1])];
          minX = Math.min(minX, d.xy[0] - HEX_R);
          minY = Math.min(minY, d.xy[1] - HEX_R);
          maxX = Math.max(maxX, d.xy[0] + HEX_R);
          maxY = Math.max(maxY, d.xy[1] + HEX_R);
        });
      }
    }
    const pad = 14;
    map.vx = minX - pad;
    map.vy = minY - pad;
    map.vw = maxX - minX + pad * 2;
    map.vh = maxY - minY + pad * 2;
  }

  const state = {
    year: index.includes('2569') ? '2569' : YEARS[YEARS.length - 1].id,
    score: 'total', selected: null, tab: 'scores', compare: false,
    scoreQuery: '', policyQuery: '', policyTopic: '',
  };
  let byId = new Map();
  const current = () => yearById.get(state.year);
  const color = pi => current().parties[pi]?.color || '#a8a6a0';
  const pname = pi => current().parties[pi]?.name || '—';

  function tally(rows) {
    const m = new Map();
    for (const [pi, v] of rows || []) m.set(pi, (m.get(pi) || 0) + v);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  // Who leads this district under the active score filter.
  function leaderOf(d, score = state.score, year = current()) {
    if (!d) return null;
    if (score === 'list' && !year.singleBallot) {
      if (!d.p?.length) return null;
      const good = d.pl?.good || d3.sum(d.p, r => r[1]);
      return { pi: d.p[0][0], v: d.p[0][1], good, rows: d.p };
    }
    if (score === 'total' && !year.singleBallot) {
      if (!d.c?.length && !d.p?.length) return null;
      const rows = tally([...(d.c || []), ...(d.p || [])]);
      return { pi: rows[0][0], v: rows[0][1], good: d3.sum(rows, r => r[1]), rows };
    }
    if (!d.c?.length) return null;
    const run = d.c[1];
    return {
      pi: d.c[0][0], v: d.c[0][1], good: d.good, name: d.c[0][2] || '',
      run: run ? run[0] : null, runV: run ? run[1] : 0, rows: d.c,
    };
  }

  const tip = document.getElementById('tooltip');
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function sliceLeader(districtId, yearId) {
    const year = yearById.get(yearId);
    if (!year) return null;
    const other = year.byId.get(districtId);
    if (!other) return { year, missing: true };
    const L = leaderOf(other, state.score, year);
    if (!L) return { year, empty: true };
    const party = year.parties[L.pi] || { name: '—', color: '#a8a6a0' };
    return { year, L, party };
  }
  function districtTip(d) {
    const L = leaderOf(d);
    const prov = provOf(d.pc);
    const head = `<div class="t">${esc(prov.th)} เขต ${d.n}</div>`;
    if (state.compare) {
      const rows = COMPARE.map(s => {
        const hit = sliceLeader(d.id, s.id);
        if (!hit || hit.missing) return `<div class="r"><span>${s.id}</span><span>ไม่มีเขตนี้</span></div>`;
        if (hit.empty) return `<div class="r"><span>${s.id}</span><span>ไม่มีผล</span></div>`;
        return `<div class="r"><span><span class="sw" style="background:${hit.party.color}"></span>${s.id}</span><span>${esc(hit.party.name)}</span></div>`;
      }).join('');
      return head + rows;
    }
    if (!L) return head + '<div>ไม่มีผลคะแนนในชุดข้อมูล</div>';
    const share = L.good ? fmtPct(L.v / L.good) : '—';
    const who = state.score === 'const' && L.name ? esc(L.name) : esc(pname(L.pi));
    let extra = '';
    if (state.score === 'const' && L.run != null && L.good) {
      extra = `<div class="r"><span>ห่างจาก ${esc(pname(L.run))}</span><span>${fmtPct((L.v - L.runV) / L.good)}</span></div>`;
    }
    return `${head}<div><span class="sw" style="background:${color(L.pi)}"></span>${who}</div>
      <div class="r"><span>${esc(pname(L.pi))}</span><span>${share}</span></div>${extra}`;
  }

  function bindFilters() {
    d3.select('#yearChips').selectAll('button').data(YEARS).join('button')
      .attr('class', 'chip').attr('type', 'button').attr('role', 'radio')
      .attr('aria-checked', y => String(y.id === state.year))
      .text(y => y.id)
      .on('click', (e, y) => {
        if (state.year === y.id) return;
        state.year = y.id;
        state.hover = null;
        if (!yearById.get(y.id).districts.some(d => d.id === state.selected)) state.selected = null;
        hideTip();
        render();
      });
    d3.select('#scoreChips').selectAll('button').data(SCORES).join('button')
      .attr('class', 'chip').attr('type', 'button').attr('role', 'radio')
      .attr('aria-checked', s => String(s[0] === state.score))
      .text(s => s[1])
      .on('click', (e, s) => {
        if (state.score === s[0]) return;
        state.score = s[0];
        hideTip();
        render();
      });
    const toggle = document.getElementById('compareToggle');
    toggle.setAttribute('aria-checked', String(state.compare));
    toggle.onclick = () => {
      state.compare = !state.compare;
      hideTip();
      render();
    };
  }

  function hexGeometry(r) {
    const pt = deg => {
      const a = deg * Math.PI / 180;
      return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
    };
    const top = pt(-90), ur = pt(-30), lr = pt(30), bot = pt(90), ll = pt(150), ul = pt(210);
    const rightMid = [ur[0], 0], leftMid = [ul[0], 0];
    const d = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') + 'Z';
    return {
      full: d([top, ur, lr, bot, ll, ul]),
      top: d([leftMid, ul, top, ur, rightMid]),
      left: d([leftMid, ll, bot, [0, 0]]),
      right: d([[0, 0], bot, lr, rightMid]),
    };
  }
  const HEX = hexGeometry(HEX_R);
  const RING = hexGeometry(HEX_R + 1.15).full;

  const mapSvg = d3.select('#map').attr('viewBox', `${MAP.vx} ${MAP.vy} ${MAP.vw} ${MAP.vh}`);
  const mapRoot = mapSvg.append('g');
  mapRoot.append('g').selectAll('path').data(MAP.provinces).join('path')
    .attr('class', 'prov').attr('d', d => d.d);
  const bkk = MAP.bkk;
  mapRoot.append('rect').attr('class', 'bkk-frame')
    .attr('x', bkk[0] - 46).attr('y', bkk[1] - 58)
    .attr('width', 92).attr('height', 104).attr('rx', 10);
  mapRoot.append('text').attr('class', 'bkk-label')
    .attr('x', bkk[0]).attr('y', bkk[1] - 42)
    .attr('text-anchor', 'middle').attr('font-size', 11).text('กรุงเทพฯ');
  const labelG = mapRoot.append('g').attr('class', 'prov-labels');
  const dotG = mapRoot.append('g');
  const ring = mapRoot.append('path').attr('class', 'dot-sel').attr('d', RING).style('display', 'none');
  dotG.on('mouseleave', hideTip);
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[MAP.vx - 24, MAP.vy - 24], [MAP.vx + MAP.vw + 24, MAP.vy + MAP.vh + 24]])
    .on('zoom', event => {
      mapRoot.attr('transform', event.transform);
      hideTip();
    });
  mapSvg.call(zoom).on('dblclick.zoom', null);
  document.getElementById('zoomIn').onclick = () => mapSvg.transition().duration(180).call(zoom.scaleBy, 1.6);
  document.getElementById('zoomOut').onclick = () => mapSvg.transition().duration(180).call(zoom.scaleBy, 1 / 1.6);
  document.getElementById('zoomReset').onclick = () => mapSvg.transition().duration(220).call(zoom.transform, d3.zoomIdentity);

  function paintSeat(node) {
    const g = d3.select(node);
    const d = g.datum();
    const shape = g.select('.shape');
    shape.selectAll('*').remove();
    if (!state.compare) {
      const L = leaderOf(d);
      shape.append('path').attr('class', 'hex').classed('missing', !L)
        .attr('d', HEX.full).attr('fill', L ? color(L.pi) : '#fff');
      return;
    }
    COMPARE.forEach(s => {
      const hit = sliceLeader(d.id, s.id);
      const known = hit && !hit.missing && !hit.empty;
      shape.append('path').attr('class', 'hex').classed('empty', !known)
        .attr('d', HEX[s.part]).attr('fill', known ? hit.party.color : null);
    });
  }
  function renderMap() {
    const year = current();
    dotG.selectAll('g.seat').interrupt();
    const sel = dotG.selectAll('g.seat').data(year.districts, d => d.id);
    sel.exit().transition().duration(280)
      .attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(0)`).remove();
    const enter = sel.enter().append('g').attr('class', 'seat')
      .attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(0)`);
    const zoom = enter.append('g').attr('class', 'zoom');
    zoom.append('g').attr('class', 'shape');
    zoom.append('text').attr('class', 'dot-num').attr('text-anchor', 'middle').attr('dominant-baseline', 'central');
    const all = enter.merge(sel);
    all.on('mousemove', (e, d) => { showTip(districtTip(d), e); })
      .on('mouseenter', function () { d3.select(this).raise(); ring.raise(); })
      .on('click', (e, d) => {
        state.selected = state.selected === d.id ? null : d.id;
        updateRing();
        renderDetail();
      });
    all.each(function () { paintSeat(this); });
    const flat = Math.sqrt(3) * HEX_R;
    all.select('text').text(d => d.n)
      .attr('font-size', d => (String(d.n).length > 1 ? 0.5 : 0.68) * flat)
      .attr('fill', d => numFill(d));
    all.transition().duration(420).attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(1)`);
    updateRing();
  }
  function updateRing() {
    const d = state.selected && byId.get(state.selected);
    ring.interrupt();
    if (!d) { ring.style('display', 'none'); return; }
    ring.style('display', null).raise();
    ring.transition().duration(420).attr('transform', `translate(${d.xy[0]},${d.xy[1]})`);
  }

  // Boxed example hexagon (top-right of the map) showing which slice is which year.
  function renderCompareKey() {
    const box = d3.select('#compareKey');
    box.selectAll('*').remove();
    box.attr('hidden', state.compare ? null : '');
    if (!state.compare) return;
    const R = 18, cx = 56, cy = 38, half = Math.sqrt(3) / 2 * R;
    box.append('div').attr('class', 'compare-key-title').text('แต่ละช่องคือปี');
    const svg = box.append('svg').attr('viewBox', '0 0 112 66').attr('width', 112).attr('height', 66)
      .attr('role', 'img').attr('aria-label', 'ตัวอย่าง: ครึ่งบนคือปี 2569 ล่างซ้ายคือปี 2566 ล่างขวาคือปี 2562');
    const g = svg.append('g').attr('transform', `translate(${cx},${cy}) scale(${R / HEX_R})`);
    const tone = { top: '#8f8d86', left: '#b9b7b0', right: '#d8d6cf' };
    COMPARE.forEach(s => g.append('path').attr('class', 'hex').attr('d', HEX[s.part])
      .attr('fill', tone[s.part]).style('stroke-width', 0.35));
    const label = {
      top: [cx, cy - R - 7, 'middle'],
      left: [cx - half - 4, cy + R * 0.5, 'end'],
      right: [cx + half + 4, cy + R * 0.5, 'start'],
    };
    COMPARE.forEach(s => {
      const [x, y, anchor] = label[s.part];
      svg.append('text').attr('x', x).attr('y', y).attr('text-anchor', anchor)
        .attr('dominant-baseline', 'middle').attr('font-size', 11).attr('font-weight', 600)
        .attr('fill', 'var(--text)').text(s.id);
    });
  }

  function renderLegend() {
    const year = current();
    const counts = d3.rollups(
      year.districts.filter(d => leaderOf(d)),
      v => v.length,
      d => leaderOf(d).pi,
    ).sort((a, b) => b[1] - a[1]);
    const L = d3.select('#mapLegend');
    L.selectAll('*').remove();
    const caption = state.compare
      ? 'ครึ่งบน 2569 · ล่างซ้าย 2566 · ล่างขวา 2562'
      : year.singleBallot
        ? 'บัตรใบเดียว — สีคือพรรคของผู้สมัครที่ได้คะแนนสูงสุด'
        : state.score === 'const' ? 'สีคือพรรคที่ชนะ สส.เขต'
          : state.score === 'list' ? 'สีคือพรรคที่คะแนนบัญชีรายชื่อสูงสุดในเขต'
            : 'สีคือพรรคที่คะแนนเขตบวกบัญชีรายชื่อสูงสุด';
    L.append('span').attr('class', 'cap').text(caption);
    renderCompareKey();
    counts.slice(0, 6).forEach(([pi, n]) => {
      const it = L.append('span').attr('class', 'item');
      it.append('span').attr('class', 'sw').style('background', color(pi));
      it.append('span').text(`${pname(pi)} ${n}`);
    });
    const rest = d3.sum(counts.slice(6), d => d[1]);
    if (rest) {
      const it = L.append('span').attr('class', 'item');
      it.append('span').attr('class', 'sw').style('background', '#a8a6a0');
      it.append('span').text(`อื่น ๆ ${rest}`);
    }
    const none = year.districts.length - d3.sum(counts, d => d[1]);
    if (none) {
      const it = L.append('span').attr('class', 'item');
      it.append('span').attr('class', 'sw').style('border', '1px dashed #b9b7b0');
      it.append('span').text(`ไม่มีข้อมูล ${none}`);
    }
  }

  function metric(p) {
    if (state.score === 'const') return p.cs;
    if (state.score === 'list') return p.pls;
    return p.cs + p.pls;
  }
  const matches = (q, ...parts) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return parts.some(p => String(p || '').toLowerCase().includes(s));
  };
  function overallRows() {
    const year = current();
    const baseC = d3.sum(year.parties, p => p.cv) || 1;
    const baseP = d3.sum(year.parties, p => p.pv) || 1;
    return year.parties
      .filter(p => p.cs + p.pls > 0 || p.cv + p.pv > 0)
      .filter(p => matches(state.scoreQuery, p.name, p.en))
      .sort((a, b) => metric(b) - metric(a) || b.cs - a.cs)
      .map(p => ({ ...p, shareC: p.cv / baseC, shareP: p.pv / baseP }));
  }
  function districtRows(d) {
    const year = current();
    if (state.score === 'list' && !year.singleBallot) {
      const good = d.pl?.good || d3.sum(d.p || [], r => r[1]) || 1;
      return (d.p || []).map(([pi, v]) => ({ party: pname(pi), color: color(pi), name: '', votes: v, share: v / good }));
    }
    if (state.score === 'total' && !year.singleBallot) {
      const rows = tally([...(d.c || []), ...(d.p || [])]);
      const good = d3.sum(rows, r => r[1]) || 1;
      return rows.map(([pi, v]) => ({ party: pname(pi), color: color(pi), name: '', votes: v, share: v / good }));
    }
    const good = d.good || 1;
    return (d.c || []).map(([pi, v, name]) => ({ party: pname(pi), color: color(pi), name: name || '', votes: v, share: good ? v / good : 0 }));
  }
  function policiesFor(partyName) {
    const bag = (POLICIES && POLICIES[current().id]) || {};
    return bag[partyName] || [];
  }
  function provinceSeries(th) {
    return Object.keys(PROVINCE_STATS || {})
      .filter(y => PROVINCE_STATS[y] && PROVINCE_STATS[y][th])
      .sort()
      .map(y => ({ year: y, ...PROVINCE_STATS[y][th] }));
  }
  function overallRowHTML() {
    const col = state.score;
    const cell = (key, text) => `<td class="${col === key ? 'on' : ''}">${text}</td>`;
    return overallRows().map((p, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name"><span class="sw" style="background:${p.color}"></span>${esc(p.name)}</td>
      ${cell('const', fmtInt(p.cs))}${cell('list', fmtInt(p.pls))}${cell('total', fmtInt(p.cs + p.pls))}
      <td>${fmtPct(p.shareC)}</td><td>${p.pv ? fmtPct(p.shareP) : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="7">ไม่พบพรรคที่ค้น</td></tr>';
  }
  function districtRowHTML(d) {
    const showName = state.score === 'const' || current().singleBallot;
    const rows = districtRows(d).filter(r => matches(state.scoreQuery, r.party, r.name));
    return rows.map((r, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name"><span class="sw" style="background:${r.color}"></span>${esc(r.party)}</td>
      ${showName ? `<td class="cand">${esc(r.name) || '—'}</td>` : ''}
      <td>${fmtInt(r.votes)}</td><td>${fmtPct(r.share)}</td>
    </tr>`).join('') || '<tr><td colspan="5">ไม่มีผลคะแนนในมุมมองนี้</td></tr>';
  }
  function policyListHTML(partyName) {
    const all = policiesFor(partyName);
    const topics = [...new Set(all.map(p => p.topic).filter(Boolean))];
    const topic = topics.includes(state.policyTopic) ? state.policyTopic : '';
    const rows = all.filter(p => (!topic || p.topic === topic) && matches(state.policyQuery, p.topic, p.title, p.detail));
    if (!rows.length) return '<p class="placeholder">ไม่พบนโยบายที่ค้น</p>';
    return rows.map(p => `<article class="policy">
      ${p.topic ? `<div class="topic">${esc(p.topic)}</div>` : ''}
      <h4>${esc(p.title || 'นโยบาย')}</h4>
      ${p.detail ? `<p>${esc(p.detail)}</p>` : ''}
    </article>`).join('');
  }
  function policyHTML(partyName) {
    const all = policiesFor(partyName);
    if (!all.length) return `<p class="placeholder">ยังไม่มีนโยบายของ${esc(partyName)} ในปี ${current().id}</p>`;
    const topics = [...new Set(all.map(p => p.topic).filter(Boolean))];
    const topic = topics.includes(state.policyTopic) ? state.policyTopic : '';
    const chips = [`<button type="button" class="chip" data-topic="" aria-checked="${topic === ''}">ทั้งหมด</button>`]
      .concat(topics.map(t => `<button type="button" class="chip" data-topic="${esc(t)}" aria-checked="${t === topic}">${esc(t)}</button>`)).join('');
    return `<div class="chips topic-chips">${chips}</div><div id="panelBody">${policyListHTML(partyName)}</div>`;
  }
  function gppHTML(th) {
    const series = provinceSeries(th);
    if (!series.length) {
      return `<p class="placeholder">ยังไม่มีตัวเลข GPP และนักท่องเที่ยวของ${esc(th)}</p>`;
    }
    const yearId = current().id;
    const focus = series.find(r => r.year === yearId) || series[series.length - 1];
    let html = `<p class="prov-line">${focus.year === yearId ? `ปี ${focus.year}` : `ไม่มีของปี ${yearId} แสดงปี ${focus.year}`} · ระดับจังหวัด</p>
      <div class="stats">
        <div class="stat"><div class="k">GPP</div><div class="v">${focus.gpp == null ? '—' : fmtInt(focus.gpp)}</div><div class="k">${esc(focus.gppUnit || 'ล้านบาท')}</div></div>
        <div class="stat"><div class="k">นักท่องเที่ยว</div><div class="v">${focus.tourists == null ? '—' : fmtInt(focus.tourists)}</div><div class="k">คน</div></div>
      </div>`;
    if (series.length > 1) {
      html += `<table class="score-table"><thead><tr><th>ปี</th><th>GPP</th><th>นักท่องเที่ยว</th></tr></thead><tbody>
        ${series.map(r => `<tr class="${r.year === focus.year ? 'on' : ''}"><td class="name">${esc(r.year)}</td><td>${r.gpp == null ? '—' : fmtInt(r.gpp)}</td><td>${r.tourists == null ? '—' : fmtInt(r.tourists)}</td></tr>`).join('')}
      </tbody></table>`;
    }
    if (focus.note) html += `<p class="note">${esc(focus.note)}</p>`;
    return html;
  }
  function compareParties() {
    const map = new Map();
    for (const year of YEARS) {
      for (const p of year.parties) {
        if ((p.cs || 0) + (p.pls || 0) <= 0 && (p.cv || 0) + (p.pv || 0) <= 0) continue;
        const row = map.get(p.name) || { name: p.name, en: p.en || '', color: p.color, years: {} };
        row.years[year.id] = p;
        if (year.id === state.year) row.color = p.color;
        map.set(p.name, row);
      }
    }
    const focus = id => {
      const row = map.get(id);
      return row && row.years[state.year] ? metric(row.years[state.year]) : -1;
    };
    return [...map.values()]
      .filter(r => matches(state.scoreQuery, r.name, r.en))
      .sort((a, b) => focus(b.name) - focus(a.name) || a.name.localeCompare(b.name, 'th'));
  }
  function compareRowHTML() {
    const rows = compareParties();
    if (!rows.length) return '<tr><td colspan="5">ไม่พบพรรคที่ค้น</td></tr>';
    return rows.map((r, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}</td>
      ${YEARS.map(y => {
        const p = r.years[y.id];
        return `<td class="${y.id === state.year ? 'on' : ''}">${p ? fmtInt(metric(p)) : '—'}</td>`;
      }).join('')}
    </tr>`).join('');
  }
  function compareDistrictRowHTML(d) {
    const showName = state.score === 'const';
    const span = showName ? 4 : 3;
    return COMPARE.map(s => {
      const hit = sliceLeader(d.id, s.id);
      if (!hit || hit.missing || hit.empty) {
        return `<tr><td class="name">${s.id}</td><td colspan="${span}">${hit && hit.empty ? 'ไม่มีผล' : 'ไม่มีเขตนี้'}</td></tr>`;
      }
      if (!matches(state.scoreQuery, hit.party.name, hit.L.name)) return '';
      const share = hit.L.good ? fmtPct(hit.L.v / hit.L.good) : '—';
      return `<tr class="${s.id === state.year ? 'on' : ''}">
        <td class="name">${s.id}</td>
        <td class="name"><span class="sw" style="background:${hit.party.color}"></span>${esc(hit.party.name)}</td>
        ${showName ? `<td class="cand">${esc(hit.L.name) || '—'}</td>` : ''}
        <td>${fmtInt(hit.L.v)}</td><td>${share}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5">ไม่พบผลที่ค้น</td></tr>';
  }
  function compareWinHTML(d) {
    return `<div class="compare-wins">${COMPARE.map(s => {
      const hit = sliceLeader(d.id, s.id);
      if (!hit || hit.missing || hit.empty) {
        return `<div class="win"><div class="who">${s.id}<small>${hit && hit.empty ? 'ไม่มีผล' : 'ไม่มีเขตนี้'}</small></div></div>`;
      }
      const who = state.score === 'const' && hit.L.name ? esc(hit.L.name) : esc(hit.party.name);
      return `<div class="win"><span class="sw" style="background:${hit.party.color}"></span><div class="who">${who}<small>${s.id} · ${esc(hit.party.name)}</small></div></div>`;
    }).join('')}</div>`;
  }
  function comparePolicyInner(d) {
    return COMPARE.map(s => {
      const hit = sliceLeader(d.id, s.id);
      const name = hit && hit.party ? hit.party.name : '';
      const all = name ? ((POLICIES && POLICIES[s.id]) || {})[name] || [] : [];
      const rows = all.filter(p => matches(state.policyQuery, p.topic, p.title, p.detail));
      const head = `<h4>${s.id}${name ? ` · ${esc(name)}` : ''}</h4>`;
      if (!hit || hit.missing || hit.empty) return head + '<p class="placeholder">ไม่มีผู้ชนะในปีนี้</p>';
      if (!all.length) return head + `<p class="placeholder">ยังไม่มีนโยบายของ${esc(name)}</p>`;
      if (!rows.length) return head + '<p class="placeholder">ไม่พบนโยบายที่ค้น</p>';
      return head + rows.map(p => `<article class="policy">
        ${p.topic ? `<div class="topic">${esc(p.topic)}</div>` : ''}
        <h4>${esc(p.title || 'นโยบาย')}</h4>
        ${p.detail ? `<p>${esc(p.detail)}</p>` : ''}
      </article>`).join('');
    }).join('');
  }
  function boardHTML() {
    if (state.compare) {
      const unit = state.score === 'const' ? 'ที่นั่งเขต' : state.score === 'list' ? 'ที่นั่งบัญชีรายชื่อ' : 'ที่นั่งรวม';
      return `<p class="eyebrow">เทียบสามปี</p>
        <h3>${unit}</h3>
        <p class="prov-line">เรียงตามปี ${current().id} ชื่อพรรคคนละปีไม่ถูกนับเป็นพรรคเดียวกัน</p>
        <input id="panelQuery" class="panel-search" type="search" placeholder="กรองชื่อพรรค" value="${esc(state.scoreQuery)}" aria-label="กรองชื่อพรรค">
        <table class="score-table"><thead><tr>
          <th></th><th>พรรค</th>
          ${YEARS.map(y => `<th class="${y.id === state.year ? 'on' : ''}">${y.id}</th>`).join('')}
        </tr></thead><tbody id="panelBody">${compareRowHTML()}</tbody></table>
        <p class="note">แผนที่ใช้เลขเขตในปีที่เลือก ครึ่งบนคือ 2569 ล่างซ้าย 2566 ล่างขวา 2562</p>`;
    }
    const year = current();
    const shown = year.parties.filter(p => metric(p) > 0).sort((a, b) => metric(b) - metric(a));
    const sum = d3.sum(shown, metric) || 1;
    const house = year.constSeats + year.listSeats;
    const cap = state.score === 'total' ? house : state.score === 'const' ? year.constSeats : year.listSeats;
    const unit = state.score === 'const' ? 'ที่นั่งเขต' : state.score === 'list' ? 'ที่นั่งบัญชีรายชื่อ' : 'ที่นั่งรวม';
    const lead = shown[0];
    const gap = sum === cap ? '' : ` · มีข้อมูล ${fmtInt(sum)} จาก ${fmtInt(cap)} ที่นั่ง`;
    const col = state.score;
    let html = `<p class="eyebrow">ภาพรวมทั้งประเทศ</p>
      <h3>ตารางคะแนน ปี ${year.id}</h3>
      <p class="prov-line">${lead ? `${esc(lead.name)} อันดับ 1 · ${fmtInt(metric(lead))} ${unit}${gap}` : ''}</p>
      <div class="scale"><div class="stack">`;
    shown.forEach(p => {
      html += `<i title="${esc(p.name)} ${metric(p)}" style="width:${(metric(p) / cap * 100).toFixed(2)}%;background:${p.color}"></i>`;
    });
    html += '</div>';
    if (state.score === 'total') html += `<div class="tick" style="left:${(year.majority / house * 100).toFixed(2)}%"><span>เสียงข้างมาก ${year.majority}</span></div>`;
    html += `</div>
      <input id="panelQuery" class="panel-search" type="search" placeholder="กรองชื่อพรรค" value="${esc(state.scoreQuery)}" aria-label="กรองชื่อพรรค">
      <table class="score-table"><thead><tr>
        <th></th><th>พรรค</th>
        <th class="${col === 'const' ? 'on' : ''}">เขต</th>
        <th class="${col === 'list' ? 'on' : ''}">บัญชี</th>
        <th class="${col === 'total' ? 'on' : ''}">รวม</th>
        <th>% คะแนนเขต</th><th>% บัญชี</th>
      </tr></thead><tbody id="panelBody">${overallRowHTML()}</tbody></table>`;
    return html;
  }
  function renderDetail() {
    const el = document.getElementById('detail');
    const d = state.selected && byId.get(state.selected);
    if (!d) { el.innerHTML = boardHTML(); bindPanel(); return; }
    const year = current();
    const prov = provOf(d.pc);
    const L = leaderOf(d);
    const partyName = L ? pname(L.pi) : '';
    const tabs = [['scores', 'ตารางคะแนน'], ['policy', 'นโยบาย'], ['gpp', 'GPP และนักท่องเที่ยว']];
    const showName = state.score === 'const' || year.singleBallot;
    let body = state.tab === 'policy'
      ? (state.compare ? `<div id="panelBody">${comparePolicyInner(d)}</div>` : (L ? policyHTML(partyName) : '<p class="placeholder">ไม่มีผู้ชนะในมุมมองนี้</p>'))
      : state.tab === 'gpp' ? gppHTML(prov.th)
        : state.compare
          ? `<table class="score-table"><thead><tr><th>ปี</th><th>พรรค</th>${state.score === 'const' ? '<th>ผู้สมัคร</th>' : ''}<th>คะแนน</th><th>สัดส่วน</th></tr></thead><tbody id="panelBody">${compareDistrictRowHTML(d)}</tbody></table>`
          : `<table class="score-table"><thead><tr><th></th><th>พรรค</th>${showName ? '<th>ผู้สมัคร</th>' : ''}<th>คะแนน</th><th>สัดส่วน</th></tr></thead><tbody id="panelBody">${districtRowHTML(d)}</tbody></table>`;
    const query = state.tab === 'policy' ? state.policyQuery : state.scoreQuery;
    const placeholder = state.tab === 'policy' ? 'กรองนโยบาย' : 'กรองพรรคหรือผู้สมัคร';
    const win = state.compare
      ? compareWinHTML(d)
      : (L ? `<div class="win"><span class="sw" style="background:${color(L.pi)}"></span><div class="who">${esc(L.name || partyName)}<small>${esc(partyName)} · ${L.good ? fmtPct(L.v / L.good) : '—'}</small></div></div>` : '<p class="placeholder">ไม่มีผลคะแนนของเขตนี้ในมุมมองที่เลือก</p>');
    el.innerHTML = `<h3>${esc(prov.th)} เขต ${d.n}</h3>
      <div class="prov-line">${state.compare ? 'เลขเขตเดียวกันในสามปี ขอบเขตแต่ละปีไม่เหมือนกัน' : `ปี ${year.id}`}</div>
      <button type="button" class="btn-ghost" id="unpin">กลับไปตารางรวม</button>
      ${win}
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}</button>`).join('')}</div>
      ${state.tab === 'gpp' ? '' : `<input id="panelQuery" class="panel-search" type="search" placeholder="${placeholder}" value="${esc(query)}" aria-label="${placeholder}">`}
      <div id="tabBody">${body}</div>
      ${d.gap && state.tab === 'scores' && !state.compare ? `<p class="warn">คะแนน สส.เขต ไม่ตรงกับจำนวนบัตรดี ${Math.abs(d.gap).toFixed(2)}%</p>` : ''}`;
    bindPanel();
  }
  function bindPanel() {
    const q = document.getElementById('panelQuery');
    if (q) q.oninput = e => {
      const d = state.selected && byId.get(state.selected);
      if (d && state.tab === 'policy') state.policyQuery = e.target.value;
      else state.scoreQuery = e.target.value;
      const host = document.getElementById('panelBody');
      if (!host) return;
      if (!d) host.innerHTML = state.compare ? compareRowHTML() : overallRowHTML();
      else if (state.tab === 'policy') host.innerHTML = state.compare ? comparePolicyInner(d) : policyListHTML(leaderOf(d) ? pname(leaderOf(d).pi) : '');
      else host.innerHTML = state.compare ? compareDistrictRowHTML(d) : districtRowHTML(d);
    };
    const unpin = document.getElementById('unpin');
    if (unpin) unpin.onclick = () => { state.selected = null; updateRing(); renderDetail(); };
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; renderDetail(); };
    });
    document.querySelectorAll('[data-topic]').forEach(btn => {
      btn.onclick = () => { state.policyTopic = btn.dataset.topic; renderDetail(); };
    });
  }

  function numFill(d) {
    if (!state.compare) {
      const L = leaderOf(d);
      if (!L) return '#3a3a3a';
      const c = d3.color(color(L.pi));
      if (c) {
        const y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        return y > 186 ? '#1a1a1a' : '#fff';
      }
    }
    return '#fff';
  }
  function renderLabels() {
    const year = current();
    const font = 7.4;
    const groups = d3.groups(year.districts.filter(d => d.pc !== BKK_PC && d.xy), d => d.pc);
    const labels = groups.map(([pc, ds]) => {
      const xs = ds.map(d => d.xy[0]);
      const ys = ds.map(d => d.xy[1]);
      return {
        pc,
        name: provinces[pc]?.th || '',
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: Math.min(...ys) - HEX_R - 1.5,
      };
    });
    labelG.selectAll('text').data(labels, d => d.pc).join('text')
      .attr('class', 'prov-label')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('text-anchor', 'middle')
      .attr('font-size', font)
      .text(d => d.name);
  }
  function render() {
    const year = current();
    byId = new Map(year.districts.map(d => [d.id, d]));
    bindFilters();
    renderMap();
    renderLabels();
    renderLegend();
    renderDetail();
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.selected) { state.selected = null; updateRing(); renderDetail(); }
  });
  render();
})();
