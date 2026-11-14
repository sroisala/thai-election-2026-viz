/* One map of constituency dots. Each election year is data/years/<year>.json. */
(async function () {
  const HEX_R = 6;
  const HEX_GAP = 0.4;
  const BKK_PC = '10';
  let index, provinces, MAP, YEARS, POLICIES, PROVINCE_STATS, META, MIN_WAGE, UNEMP;
  try {
    [index, provinces, MAP, POLICIES, PROVINCE_STATS, META, MIN_WAGE, UNEMP] = await Promise.all([
      d3.json('data/years/index.json'),
      d3.json('data/provinces.json'),
      d3.json('data/map.json'),
      d3.json('data/panel/policies.json').catch(() => ({})),
      d3.json('data/panel/province-stats.json').catch(() => ({})),
      d3.json('data/panel/party-meta.json').catch(() => ({})),
      d3.json('data/panel/province_min_wage.json').catch(() => ({})),
      d3.json(encodeURI('data/panel/unemployment by province 2560-2566.json')).catch(() => ({ provinces: [] })),
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
    // คะแนนบัญชีรายชื่อระดับประเทศตามผลทางการ (ถ้ามี) ทับยอดที่รวมจากรายเขต
    if (raw.partyListVotes && !raw.singleBallot) {
      for (const [name, v] of Object.entries(raw.partyListVotes)) if (partyIndex.has(name)) parties[partyIndex.get(name)].pv = +v;
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
      pvTotal: +raw.partyListVotesTotal || 0,
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

  const state = { limit: 10, anim: null,
    year: index.includes('2569') ? '2569' : YEARS[YEARS.length - 1].id,
    score: 'total', selected: null, tab: 'scores', compare: false,
    scoreQuery: '', sortKey: 'total', policyTopic: '', policyOpen: new Set([COMPARE[0].id]),
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
        state.anim = 'year';
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
        state.anim = 'score';
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
    const baseP = year.pvTotal || d3.sum(year.parties, p => p.pv) || 1;
    return year.parties
      .filter(p => p.cs + p.pls > 0 || p.cv + p.pv > 0)
      .sort((a, b) => seatsOf(b, state.sortKey) - seatsOf(a, state.sortKey) || (b.cs + b.pls) - (a.cs + a.pls) || votesOf(year, b, state.sortKey) - votesOf(year, a, state.sortKey) || b.cs - a.cs)
      // ใส่อันดับจริงก่อนกรองชื่อ เพื่อให้เลขอันดับคงเดิมตอนค้นหา
      .map((p, i) => ({ ...p, rank: i + 1, shareC: p.cv / baseC, shareP: p.pv / baseP }))
      .filter(p => matches(state.scoreQuery, p.name, p.en));
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
  // แท็บเศรษฐกิจ: กราฟเส้นเรียงลง แกน พ.ศ. 2558–2569 ปักปีเลือกตั้ง 2562, 2566, 2569
  const ECON_FROM = 2558;
  const ECON_TO = 2569;
  const ELECTION_YEARS = [2562, 2566, 2569];
  const UNEMP_BY_NAME = new Map(((UNEMP && UNEMP.provinces) || []).map(p => [p.province_name_th, p.unemployment_rate || {}]));
  const ECON_READ = 'เส้นประคือปีเลือกตั้ง 2562, 2566 และ 2569 จุดขาวคือปีเลือกตั้งที่มีตัวเลขแล้ว ปี 2569 ยังไม่มีตัวเลข แกนนอนเป็น พ.ศ. 2558–2569';
  const ECON_SERIES = [
    { key: 'gpp', label: 'GPP', unit: 'ล้านบาท', color: '#3a76b0', about: 'GPP จาก สศช. ราคาประจำปี', tip: v => `${fmtInt(Math.round(v))} ล้านบาท` },
    { key: 'tourists', label: 'นักท่องเที่ยว', unit: 'คน-ครั้ง', color: '#e0943a', about: 'นักท่องเที่ยวคือผู้เยี่ยมเยือนคนไทย (คน-ครั้ง) จากกระทรวงการท่องเที่ยวและกีฬา', tip: v => `${fmtInt(Math.round(v))} คน-ครั้ง` },
    { key: 'wage', label: 'ค่าแรงขั้นต่ำ', unit: 'บาท/วัน', color: '#2c8d82', about: 'ค่าแรงขั้นต่ำเป็นอัตรา ณ สิ้นปี จากกระทรวงแรงงาน', tip: v => `${fmtInt(Math.round(v))} บาท/วัน` },
    { key: 'unemp', label: 'อัตราว่างงาน', unit: '%', color: '#6d509e', about: 'อัตราว่างงานเป็นร้อยละของกำลังแรงงาน จาก สศช. / สำนักงานสถิติแห่งชาติ (มีถึงปี 2566)', tip: v => `${d3.format('.1f')(v)}%` },
  ];
  function econValue(th, key, year) {
    const y = String(year);
    let v = null;
    if (key === 'gpp' || key === 'tourists') v = ((PROVINCE_STATS || {})[y] || {})[th]?.[key];
    else if (key === 'wage') v = ((MIN_WAGE || {})[y] || {})[th]?.minWage;
    else v = (UNEMP_BY_NAME.get(th) || {})[y];
    if (v == null || v === '') return null;
    const n = +v;
    return Number.isNaN(n) ? null : n;
  }
  function econPoints(th) {
    const years = d3.range(ECON_FROM, ECON_TO + 1);
    return ECON_SERIES.map(spec => {
      const pts = years.map(year => ({ year, value: econValue(th, spec.key, year) }));
      const present = pts.filter(p => p.value != null);
      return {
        ...spec, pts, present,
        from: present.length ? present[0].year : null,
        to: present.length ? present[present.length - 1].year : null,
      };
    });
  }
  function econTick(key, v) {
    if (key === 'unemp') return `${d3.format('.1f')(v)}%`;
    if (Math.abs(v) >= 1e6) {
      const m = v / 1e6;
      const n = Math.abs(m) >= 10 ? d3.format('.0f')(m) : d3.format('.1f')(m);
      return `${n.replace(/\.0$/, '')}M`;
    }
    return d3.format(',.0f')(v);
  }
  // ---- รูปหัวหน้าพรรค / นายกฯ / โลโก้พรรค (data/panel/party-meta.json) ----
  const META_PM = (META && META.pm) || {};
  const META_LEADERS = (META && META.leaders) || {};
  const META_LOGOS = (META && META.logos) || {};
  // ตัวอักษรสำรองเมื่อไม่มีไฟล์รูป: พยัญชนะตัวแรกหลังคำนำหน้า
  const initialOf = s => {
    const t = String(s || '').replace(/^(พลเอก|พล\.อ\.|พล\.ต\.ท\.|พลตำรวจเอก|พลตำรวจโท|นางสาว|นาย|นาง|คุณหญิง|ร\.อ\.|ดร\.|ศ\.)\s*/, '');
    const m = t.match(/[ก-ฮA-Za-z]/);
    return m ? m[0] : '·';
  };
  function avatarHTML(kind, src, label, bg) {
    const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">` : '';
    const cut = kind === 'person' && /\.png$/i.test(src || '') ? ' cut' : '';
    return `<span class="av av-${kind}${cut}" style="--c:${esc(bg || '#a8a6a0')}" title="${esc(label)}"><b>${esc(initialOf(label))}</b>${img}</span>`;
  }
  const leaderMeta = (yearId, partyName) => (META_LEADERS[yearId] || {})[partyName] || null;
  // รูปหัวหน้าพรรคซ้อนเลเยอร์: แผ่นสีพรรค -> โลโก้จางเป็นลายน้ำ -> คนตัดพื้น PNG -> ป้ายโลโก้คมชัดทับมุมล่างขวา
  // จำไฟล์รูปที่โหลดแล้ว เพื่อไม่ให้เงา/ตัวอักษรย่อวาบขึ้นมาตอนวาดตารางใหม่ (กันภาพกระพริบ)
  const loadedImgs = new Set();
  window.__ld = loadedImgs;
  function layHTML(personSrc, logoSrc, label, partyName, color, rank) {
    const ok = 'decoding="sync" onload="this.parentNode.classList.add(\'ok\');window.__ld.add(this.getAttribute(\'src\'))" onerror="this.remove()"';
    const pSrc = personSrc ? `${esc(personSrc)}?v=20261113d` : '', lSrc = logoSrc ? `${esc(logoSrc)}?v=20261113d` : '';
    const person = personSrc ? `<img src="${pSrc}" alt="" ${ok}>` : '';
    const logo = logoSrc ? `<img src="${lSrc}" alt="" ${ok}>` : '';
    const pOk = personSrc && loadedImgs.has(pSrc) ? ' ok' : '', lOk = logoSrc && loadedImgs.has(lSrc) ? ' ok' : '';
    return `<span class="lay${rank ? ' has-no' : ''}" style="--c:${esc(color || '#a8a6a0')}" title="${esc(label)} · ${esc(partyName)}">
      <i class="plate"></i>
      <span class="wm${lOk}">${logo}</span>
      ${rank ? `<b class="no n${String(rank).length}">${rank}</b>` : ''}
      <span class="pp${pOk}"><svg class="sil" viewBox="0 0 100 120" aria-hidden="true"><path d="M50 14C38 14 31 24 31 37c0 9 3 17 8 22 1 2 1 5 0 8-3 5-12 8-21 11C9 81 4 92 4 120h92c0-28-5-39-14-42-9-3-18-6-21-11-1-3-1-6 0-8 5-5 8-13 8-22 0-13-7-23-19-23Z"/></svg>${person}</span>
      <span class="badge${lOk}"><b>${esc(initialOf(partyName))}</b>${logo}</span>
    </span>`;
  }
  const partyIdent = (yearId, p, withImg = true, rank = 0) => {
    const L = leaderMeta(yearId, p.name);
    if (!withImg) {
      // ลำดับ 11 ขึ้นไป: แสดงแค่ชื่อพรรค ไม่แสดงรูปหรือชื่อหัวหน้า
      return `<div class="ident ident-plain">${rank ? `<b class="no-plain">${rank}</b>` : ''}<div class="who">${esc(p.name)}</div></div>`;
    }
    return `<div class="ident">
      ${layHTML(L && L.photo, META_LOGOS[p.name], L ? L.name : p.name, p.name, p.color, rank)}
      <div class="who">${esc(p.name)}${L && L.photo && L.name ? `<small>${esc(L.name)}</small>` : ''}</div>
    </div>`;
  };
  const fmtVotes = v => (v >= 1e6 ? `${d3.format('.2f')(v / 1e6)} ล้าน` : fmtInt(v));
  const totalVotes = (year, p) => (year.singleBallot ? p.cv : p.cv + p.pv);
  const KEYS = ['const', 'list', 'total'];
  const seatsOf = (p, k) => (k === 'const' ? p.cs : k === 'list' ? p.pls : p.cs + p.pls);
  const votesOf = (year, p, k) => (k === 'const' ? p.cv : k === 'list' ? p.pv : totalVotes(year, p));
  function scoreCell(year, p, k, extra = '') {
    const sel = state.score === k;
    return `<td class="num ${sel ? 'on' : 'dim'}${extra}"><span class="seats">${fmtInt(seatsOf(p, k))}</span>${k === 'total' ? '' : `<small>${p.cv + p.pv > 0 ? fmtVotes(votesOf(year, p, k)) : '—'}</small>`}</td>`;
  }
  // หน้าต่างแรก: พรรคเรียงจากมากไปน้อยตามคะแนนที่เลือก
  function overallRowHTML() {
    const year = current();
    const all = overallRows();
    // แสดงตามจำนวนที่เลือกในดรอปดาวน์ (0 = ทุกพรรค) ถ้ากำลังค้นชื่อพรรคจะแสดงทั้งหมดที่ตรง
    const rows = state.scoreQuery ? all : all.slice(0, state.limit);
    return rows.map(p => `<tr class="${p.rank === 1 ? 'first' : ''}">
      <td class="name win-cell"><div class="wrow">${partyIdent(year.id, p, p.rank <= 10, p.rank)}</div></td>
      ${KEYS.map(k => scoreCell(year, p, k)).join('')}
    </tr>`).join('') || '<tr><td colspan="4">ไม่พบพรรคที่ค้น</td></tr>';
  }
  // หน้าต่างสอง: ปีเป็นคอลัมน์ แถวบนคือนายกฯ + โลโก้พรรค แล้วตามด้วยแถวเขต / บัญชีรายชื่อ / รวม
  const SCORE_LABEL = { const: 'เขต', list: 'บัญชีรายชื่อ', total: 'รวม' };
  function compareTableHTML() {
    const pmParty = year => {
      const pm = META_PM[year.id];
      const party = pm && year.parties.find(p => p.name === pm.party);
      return { pm, party };
    };
    const head = YEARS.map(y => `<th class="yh ${y.id === state.year ? 'yon' : ''}">${y.id}<small>${y.constSeats + y.listSeats} ที่นั่ง</small></th>`).join('');
    const who = YEARS.map(y => {
      const { pm, party } = pmParty(y);
      if (!pm || !party) return `<td class="yc ${y.id === state.year ? 'yon' : ''}">ยังไม่มีข้อมูลนายกฯ</td>`;
      return `<td class="yc ${y.id === state.year ? 'yon' : ''}"><div class="ident ident-v">
        ${layHTML(pm.photo, META_LOGOS[party.name], pm.name, party.name, party.color)}
        <div class="who">${esc(pm.name)}<small>${esc(party.name)}</small></div>
      </div></td>`;
    }).join('');
    const rows = KEYS.map(k => `<tr class="srow ${state.score === k ? 'row-on' : 'row-dim'}">
      <th class="lab">${SCORE_LABEL[k]}</th>
      ${YEARS.map(y => {
        const { party } = pmParty(y);
        const cls = `num ${y.id === state.year ? 'yon' : ''}`;
        if (!party) return `<td class="${cls}">—</td>`;
        return `<td class="${cls}"><span class="seats">${fmtInt(seatsOf(party, k))}</span><small>${fmtVotes(votesOf(y, party, k))}</small></td>`;
      }).join('')}
    </tr>`).join('');
    return `<table class="score-table board compare-t">
      <thead><tr><th class="lab"></th>${head}</tr></thead>
      <tbody><tr class="who-row"><th class="lab">นายกฯ · พรรค</th>${who}</tr>${rows}</tbody>
    </table>`;
  }
  function districtRowHTML(d) {
    const showName = state.score === 'const' || current().singleBallot;
    const rows = districtRows(d);
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
    const rows = all.filter(p => !topic || p.topic === topic);
    if (!rows.length) return '<p class="placeholder">ไม่มีนโยบายในหมวดนี้</p>';
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
    const series = econPoints(th);
    if (!series.some(s => s.present.length)) {
      return `<p class="placeholder">ยังไม่มีตัวเลขเศรษฐกิจของ${esc(th)}</p>`;
    }
    const cards = series.map(s => {
      const range = s.present.length ? `${s.from}–${s.to}` : 'ไม่มีข้อมูล';
      return `<figure class="econ-card" data-econ="${s.key}">
        <figcaption class="econ-head"><i class="mark" style="background:${s.color}"></i><b>${esc(s.label)}</b><span>${esc(s.unit)} · ${range}</span></figcaption>
        <div class="econ-plot"></div>
      </figure>`;
    }).join('');
    return `<div class="econ-stack" data-prov="${esc(th)}">${cards}</div>`;
  }
  function drawEconCharts() {
    const stack = document.querySelector('.econ-stack');
    if (!stack) return;
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(drawEconCharts);
    const series = econPoints(stack.dataset.prov);
    stack.querySelectorAll('.econ-card').forEach(card => {
      const spec = series.find(s => s.key === card.dataset.econ);
      const host = card.querySelector('.econ-plot');
      host.replaceChildren();
      if (!spec) return;
      drawEconChart(host, spec);
      const head = card.querySelector('.econ-head');
      const tipHtml = `<div class="t">${esc(spec.label)}</div><div>${esc(ECON_READ)}</div><div>${esc(spec.about)}</div>`;
      head.onmouseenter = head.onmousemove = ev => showTip(tipHtml, ev);
      head.onmouseleave = hideTip;
    });
  }
  function drawEconChart(host, spec) {
    const width = Math.max(260, host.clientWidth || 320);
    const height = 176;
    const plotTop = 34;
    const plotBottom = height - 22;
    const maxV = d3.max(spec.present, d => d.value) || 1;
    const y = d3.scaleLinear().domain([0, maxV]).nice().range([plotBottom, plotTop]);
    if (y.domain()[0] < 0) y.domain([0, y.domain()[1]]);
    const ticks = y.ticks(5).filter(t => t >= -1e-6);
    const svg = d3.select(host).append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', spec.present.length ? `${spec.label} ${spec.from} ถึง ${spec.to}` : `${spec.label} ไม่มีข้อมูล`)
      .attr('font-family', '"IBM Plex Sans Thai", sans-serif');
    const probe = svg.append('text').attr('font-size', 11).attr('visibility', 'hidden');
    let labelW = 24;
    ticks.forEach(t => {
      probe.text(econTick(spec.key, t));
      labelW = Math.max(labelW, probe.node().getBBox().width);
    });
    probe.remove();
    const marginLeft = Math.ceil(labelW) + 10;
    const marginRight = 18;
    const x = d3.scaleLinear().domain([ECON_FROM, ECON_TO]).range([marginLeft, width - marginRight]);
    svg.append('g').attr('fill', '#9b998f').attr('font-size', 11).attr('text-anchor', 'end')
      .selectAll('text').data(ticks).join('text')
      .attr('x', marginLeft - 8)
      .attr('y', t => y(t) + 4)
      .text(t => econTick(spec.key, t));
    const rules = svg.append('g').attr('stroke', '#c5c3bb').attr('stroke-width', 1.15).attr('stroke-dasharray', '2.4 3');
    ELECTION_YEARS.forEach(year => {
      rules.append('line').attr('x1', x(year)).attr('x2', x(year)).attr('y1', 2).attr('y2', plotBottom);
    });
    if (spec.present.length) {
      svg.append('path')
        .datum(spec.pts)
        .attr('fill', 'none')
        .attr('stroke', spec.color)
        .attr('stroke-width', 2.25)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', d3.line().defined(d => d.value != null).x(d => x(d.year)).y(d => y(d.value)));
      svg.append('g').selectAll('circle').data(spec.present).join('circle')
        .attr('cx', d => x(d.year))
        .attr('cy', d => y(d.value))
        .attr('r', d => ELECTION_YEARS.includes(d.year) ? 5.2 : 3.15)
        .attr('fill', d => ELECTION_YEARS.includes(d.year) ? '#fff' : spec.color)
        .attr('stroke', spec.color)
        .attr('stroke-width', d => ELECTION_YEARS.includes(d.year) ? 2.25 : 0);
    }
    svg.append('text')
      .attr('x', x(ECON_TO) - 5)
      .attr('y', plotBottom - 7)
      .attr('text-anchor', 'end')
      .attr('fill', '#a9a79f')
      .attr('font-size', 10.5)
      .text('ยังไม่มีข้อมูล');
    const yearProbe = svg.append('text').attr('font-size', 10).attr('visibility', 'hidden').text(String(ECON_TO));
    const yearLabW = yearProbe.node().getBBox().width;
    yearProbe.remove();
    const chosenYears = [];
    const yearFits = year => chosenYears.every(c => Math.abs(x(year) - x(c)) >= yearLabW + 6);
    [ECON_FROM, ...ELECTION_YEARS].forEach(year => { if (yearFits(year)) chosenYears.push(year); });
    d3.range(ECON_FROM, ECON_TO + 1).forEach(year => { if (!chosenYears.includes(year) && yearFits(year)) chosenYears.push(year); });
    chosenYears.sort((a, b) => a - b);
    svg.append('g').attr('fill', '#9b998f').attr('font-size', 10).attr('text-anchor', 'middle')
      .selectAll('text').data(chosenYears).join('text')
      .attr('x', year => x(year))
      .attr('y', height - 6)
      .text(year => year);
    drawElectionPills(svg, x, width);
    const focus = svg.append('circle')
      .attr('r', 6.5).attr('fill', 'none').attr('stroke', spec.color).attr('stroke-width', 2)
      .style('display', 'none');
    svg.append('rect').attr('fill', 'transparent').attr('width', width).attr('height', height)
      .on('mousemove', ev => {
        const [mx] = d3.pointer(ev);
        const year = Math.round(x.invert(mx));
        const pt = spec.pts.find(p => p.year === year);
        if (!pt || mx < marginLeft - 8 || mx > width - marginRight + 8) {
          hideTip();
          focus.style('display', 'none');
          return;
        }
        const head = ELECTION_YEARS.includes(year) ? `เลือกตั้ง ${year}` : String(year);
        const val = pt.value == null ? 'ยังไม่มีข้อมูล' : spec.tip(pt.value);
        showTip(`<div class="t">${esc(spec.label)}</div><div class="r"><span>${head}</span><span>${esc(val)}</span></div>`, ev);
        if (pt.value == null) { focus.style('display', 'none'); return; }
        focus.style('display', null).attr('cx', x(year)).attr('cy', y(pt.value));
      })
      .on('mouseleave', () => { hideTip(); focus.style('display', 'none'); });
  }
  function drawElectionPills(svg, x, width) {
    const place = short => {
      const g = svg.append('g').attr('class', 'econ-pills');
      const nodes = ELECTION_YEARS.map(year => {
        const t = g.append('text')
          .attr('x', x(year)).attr('y', 15)
          .attr('text-anchor', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', short ? 11 : 10.5)
          .attr('font-weight', 600)
          .text(short ? String(year) : `เลือกตั้ง ${year}`);
        return { year, t, b: t.node().getBBox() };
      });
      nodes.forEach(n => {
        const pad = 7;
        let shift = 0;
        if (n.b.x - pad < 1) shift = 1 - (n.b.x - pad);
        if (n.b.x + n.b.width + pad + shift > width - 1) shift = width - 1 - (n.b.x + n.b.width + pad);
        if (shift) n.t.attr('x', x(n.year) + shift);
        n.b = n.t.node().getBBox();
        n.pad = pad;
      });
      const boxes = nodes.map(n => [n.b.x - n.pad, n.b.x + n.b.width + n.pad]);
      const overlap = boxes.some((b, i) => boxes.slice(i + 1).some(c => b[0] < c[1] + 3 && c[0] < b[1] + 3));
      if (overlap && !short) { g.remove(); place(true); return; }
      nodes.forEach(n => {
        g.insert('rect', () => n.t.node())
          .attr('x', n.b.x - n.pad)
          .attr('y', n.b.y - 2.5)
          .attr('width', n.b.width + n.pad * 2)
          .attr('height', n.b.height + 5)
          .attr('rx', (n.b.height + 5) / 2)
          .attr('fill', '#1c1c1c');
      });
    };
    place(false);
  }
  function compareDistrictRowHTML(d) {
    const showName = state.score === 'const';
    const span = showName ? 4 : 3;
    return COMPARE.map(s => {
      const hit = sliceLeader(d.id, s.id);
      if (!hit || hit.missing || hit.empty) {
        return `<tr><td class="name">${s.id}</td><td colspan="${span}">${hit && hit.empty ? 'ไม่มีผล' : 'ไม่มีเขตนี้'}</td></tr>`;
      }
      const share = hit.L.good ? fmtPct(hit.L.v / hit.L.good) : '—';
      return `<tr class="${s.id === state.year ? 'on' : ''}">
        <td class="name">${s.id}</td>
        <td class="name"><span class="sw" style="background:${hit.party.color}"></span>${esc(hit.party.name)}</td>
        ${showName ? `<td class="cand">${esc(hit.L.name) || '—'}</td>` : ''}
        <td>${fmtInt(hit.L.v)}</td><td>${share}</td>
      </tr>`;
    }).join('');
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
  // One expandable section per year: the winning party's policies in that district.
  function comparePolicyInner(d) {
    return COMPARE.map(s => {
      const hit = sliceLeader(d.id, s.id);
      const known = hit && !hit.missing && !hit.empty;
      const name = known ? hit.party.name : '';
      const all = name ? ((POLICIES && POLICIES[s.id]) || {})[name] || [] : [];
      const count = known ? `${all.length} ข้อ` : '';
      const body = !known ? '<p class="placeholder">ไม่มีผู้ชนะในปีนี้</p>'
        : !all.length ? `<p class="placeholder">ยังไม่มีนโยบายของ${esc(name)}</p>`
          : all.map(p => `<article class="policy">
        ${p.topic ? `<div class="topic">${esc(p.topic)}</div>` : ''}
        <h4>${esc(p.title || 'นโยบาย')}</h4>
        ${p.detail ? `<p>${esc(p.detail)}</p>` : ''}
      </article>`).join('');
      const open = state.policyOpen.has(s.id) ? ' open' : '';
      return `<details class="year-policy" data-year="${s.id}"${open}>
        <summary>
          <span class="sw" style="background:${known ? hit.party.color : '#e4e2dc'}"></span>
          <b>${s.id}</b><span class="party">${known ? esc(name) : 'ไม่มีผู้ชนะ'}</span>
          <span class="count">${count}</span>
        </summary>
        <div class="year-policy-body">${body}</div>
      </details>`;
    }).join('');
  }
  function showAllHTML() {
    const n = overallRows().length;
    if (state.scoreQuery || state.limit >= n) return '';
    const step = Math.min(10, n - state.limit);
    return `<button type="button" class="more-btn" id="moreBtn"><span>ดูเพิ่มอีก ${step} อันดับ</span><small>แสดง ${state.limit} จาก ${n} พรรค</small></button>`;
  }
  function boardHTML() {
    if (state.compare) {
      return `<p class="eyebrow">เทียบ 3 ปี</p>
        <h3>พรรคของนายกรัฐมนตรีในแต่ละปี</h3>
        <p class="prov-line">ที่นั่งและคะแนนเสียงของพรรคที่นายกฯ สังกัด เทียบกันทั้งสามการเลือกตั้ง</p>
        ${compareTableHTML()}
        <p class="note">ตัวเลขใหญ่คือที่นั่ง ตัวเล็กคือคะแนนเสียง นายกฯ คือผู้ได้รับเลือกจากสภาหลังเลือกตั้งครั้งนั้น ปี 2566 ภายหลังเปลี่ยนนายกฯ อีกสองครั้ง ชื่อพรรคที่ยุบหรือตั้งใหม่ไม่ถูกนับต่อกัน</p>`;
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
      <div class="panel-tools">
        <input id="panelQuery" class="panel-search" type="search" placeholder="ค้นหาชื่อพรรค" value="${esc(state.scoreQuery)}" aria-label="ค้นหาชื่อพรรค">
        <select id="panelSort" class="panel-sort" aria-label="เรียงลำดับ">
          ${[['total', 'เรียงตามที่นั่งรวม'], ['const', 'เรียงตามจำนวนเขต'], ['list', 'เรียงตามจำนวนบัญชีรายชื่อ']].map(([k, l]) => `<option value="${k}"${state.sortKey === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <table class="score-table board"><thead><tr>
        <th class="winh">ผู้ชนะตามลำดับ</th>
        <th class="${col === 'const' ? 'on' : 'dim'}">เขต</th>
        <th class="${col === 'list' ? 'on' : 'dim'}">บัญชีรายชื่อ</th>
        <th class="${col === 'total' ? 'on' : 'dim'}">รวม</th>
      </tr></thead><tbody id="panelBody">${overallRowHTML()}</tbody></table>
      <div id="moreWrap">${showAllHTML()}</div>
      <p class="note">ตัวเลขใหญ่คือที่นั่ง ตัวเล็กคือคะแนนเสียง (คอลัมน์รวมแสดงเฉพาะที่นั่ง)${year.singleBallot ? ' ปี 2562 ใช้บัตรใบเดียว คะแนนเขตและบัญชีรายชื่อจึงเป็นคะแนนชุดเดียวกัน' : ''}</p>`;
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
    const tabs = [['scores', 'ตารางคะแนน'], ['policy', 'นโยบาย'], ['gpp', 'เศรษฐกิจ']];
    const showName = state.score === 'const' || year.singleBallot;
    let body = state.tab === 'policy'
      ? (state.compare ? `<div id="panelBody">${comparePolicyInner(d)}</div>` : (L ? policyHTML(partyName) : '<p class="placeholder">ไม่มีผู้ชนะในมุมมองนี้</p>'))
      : state.tab === 'gpp' ? gppHTML(prov.th)
        : state.compare
          ? `<table class="score-table"><thead><tr><th>ปี</th><th>พรรค</th>${state.score === 'const' ? '<th>ผู้สมัคร</th>' : ''}<th>คะแนน</th><th>สัดส่วน</th></tr></thead><tbody id="panelBody">${compareDistrictRowHTML(d)}</tbody></table>`
          : `<table class="score-table"><thead><tr><th></th><th>พรรค</th>${showName ? '<th>ผู้สมัคร</th>' : ''}<th>คะแนน</th><th>สัดส่วน</th></tr></thead><tbody id="panelBody">${districtRowHTML(d)}</tbody></table>`;
    const win = state.compare
      ? compareWinHTML(d)
      : (L ? `<div class="win"><span class="sw" style="background:${color(L.pi)}"></span><div class="who">${esc(L.name || partyName)}<small>${esc(partyName)} · ${L.good ? fmtPct(L.v / L.good) : '—'}</small></div></div>` : '<p class="placeholder">ไม่มีผลคะแนนของเขตนี้ในมุมมองที่เลือก</p>');
    el.innerHTML = `<h3>${esc(prov.th)} เขต ${d.n}</h3>
      <div class="prov-line">${state.compare ? 'เลขเขตเดียวกันในสามปี ขอบเขตแต่ละปีไม่เหมือนกัน' : `ปี ${year.id}`}</div>
      <button type="button" class="btn-ghost" id="unpin">กลับไปตารางรวม</button>
      ${win}
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}</button>`).join('')}</div>
      <div id="tabBody">${body}</div>
      ${d.gap && state.tab === 'scores' && !state.compare ? `<p class="warn">คะแนน สส.เขต ไม่ตรงกับจำนวนบัตรดี ${Math.abs(d.gap).toFixed(2)}%</p>` : ''}`;
    bindPanel();
  }
  function bindYearPolicy() {
    document.querySelectorAll('details.year-policy').forEach(el => {
      el.ontoggle = () => { state.policyOpen[el.open ? 'add' : 'delete'](el.dataset.year); };
    });
  }
  function bindPanel() {
    const q = document.getElementById('panelQuery');
    if (q) q.oninput = e => {
      state.scoreQuery = e.target.value;
      const host = document.getElementById('panelBody');
      if (!host) return;
      host.innerHTML = overallRowHTML();
      const mw = document.getElementById('moreWrap');
      if (mw) { mw.innerHTML = showAllHTML(); bindMore(); }
    };
    const sortSel = document.getElementById('panelSort');
    if (sortSel) sortSel.onchange = e => {
      state.sortKey = e.target.value;
      state.limit = 10;
      document.getElementById('panelBody').innerHTML = overallRowHTML();
      const mw = document.getElementById('moreWrap');
      if (mw) { mw.innerHTML = showAllHTML(); bindMore(); }
    };
    const bindMore = () => {
      const mb = document.getElementById('moreBtn');
      if (mb) mb.onclick = () => {
        state.limit += 10;
        document.getElementById('panelBody').innerHTML = overallRowHTML();
        document.getElementById('moreWrap').innerHTML = showAllHTML();
        bindMore();
      };
    };
    bindMore();
    const unpin = document.getElementById('unpin');
    if (unpin) unpin.onclick = () => { state.selected = null; updateRing(); renderDetail(); };
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; renderDetail(); };
    });
    bindYearPolicy();
    document.querySelectorAll('[data-topic]').forEach(btn => {
      btn.onclick = () => { state.policyTopic = btn.dataset.topic; renderDetail(); };
    });
    drawEconCharts();
  }
  window.addEventListener('resize', () => {
    clearTimeout(drawEconCharts._t);
    drawEconCharts._t = setTimeout(drawEconCharts, 120);
  });

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
    const host = document.getElementById('detail');
    if (host && state.anim && !state.selected && (state.compare ? state.anim === 'year' : true)) {
      const cls = state.compare ? 'pop-cmp' : 'pop-' + state.anim;
      host.classList.remove('pop-year', 'pop-score', 'pop-cmp');
      void host.offsetWidth;
      host.classList.add(cls);
      clearTimeout(render._t);
      render._t = setTimeout(() => host.classList.remove(cls), 900);
    }
    state.anim = null;
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.selected) { state.selected = null; updateRing(); renderDetail(); }
  });
  render();
})();
