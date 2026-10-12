/* Thai Election 2026 — visual analytics (D3 v7, no build step) */
(async function () {
  const [DATA, MAP] = await Promise.all([
    d3.json('data/election.json'),
    d3.json('data/map.json'),
  ]);

  // ---------------------------------------------------------------- constants
  const PARTY_COLOR = {
    'ภูมิใจไทย': '#3358b8', 'ประชาชน': '#f58220', 'เพื่อไทย': '#b01530',
    'กล้าธรรม': '#14946a', 'ประชาธิปัตย์': '#4fb3e6',
  };
  const OTHER = '#a8a6a0', FADE = '#dcdad3';
  const REGIONS = [
    ['all', 'ทั้งประเทศ'], ['bkk', 'กรุงเทพฯ'], ['central', 'กลาง'], ['north', 'เหนือ'],
    ['northeast', 'อีสาน'], ['east', 'ตะวันออก'], ['west', 'ตะวันตก'], ['south', 'ใต้'],
  ];
  const REGION_NAME = Object.fromEntries(REGIONS);
  const regionLabel = r => (r === 'bkk' ? 'กรุงเทพฯ' : r === 'all' ? 'ทั้งประเทศ' : 'ภาค' + REGION_NAME[r]);
  const MAP_MODES = [
    ['winner', 'พรรคผู้ชนะ'], ['margin', 'ความสูสี'], ['share', 'คะแนนพรรคที่เลือก'],
    ['turnout', 'ผู้มาใช้สิทธิ'], ['invalid', 'บัตรเสีย'],
  ];
  const TIGHT = 0.05; // "swing seat" threshold used in text
  const fmtPct = d3.format('.1%'), fmtPct0 = d3.format('.0%'), fmtInt = d3.format(',');
  const pts = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' จุด';

  const parties = DATA.parties.map((p, i) => ({ ...p, i, total: p.cs + p.pls, color: PARTY_COLOR[p.name] || OTHER }));
  const color = i => (i == null ? OTHER : parties[i].color);
  const pname = i => parties[i].name;
  const MAIN = parties.filter(p => PARTY_COLOR[p.name]).map(p => p.i);

  // ---------------------------------------------------------------- derive districts
  const districts = DATA.districts.map(d => {
    const prov = DATA.provinces[d.pc];
    const o = { id: d.id, pc: d.pc, n: d.n, prov: prov.th, region: prov.region, label: `${prov.th} เขต ${d.n}` };
    o.xy = MAP.dots[d.id];
    if (d.c) {
      const [el, came, good, inv, nov, sumdiff, cand] = d.c;
      Object.assign(o, { el, came, good, inv, nov, sumdiff, cand });
      o.win = cand[0][0]; o.winV = cand[0][1]; o.winName = cand[0][2];
      o.run = cand[1] ? cand[1][0] : null; o.runV = cand[1] ? cand[1][1] : 0;
      o.margin = (o.winV - o.runV) / good;
      o.winShare = o.winV / good;
      o.turnout = came / el; o.invalid = inv / came; o.novote = nov / came;
      o.cShare = new Map(); cand.forEach(([pi, v]) => o.cShare.set(pi, (o.cShare.get(pi) || 0) + v / good));
    }
    if (d.p) {
      const [el, came, good, inv, nov, sumdiff, votes] = d.p;
      o.pl = { el, came, good, inv, nov, sumdiff, votes };
      o.pShare = new Map(votes.map(([pi, v]) => [pi, v / good]));
    }
    return o;
  });
  const byId = new Map(districts.map(d => [d.id, d]));

  // ---------------------------------------------------------------- state
  const state = { party: null, region: 'all', mapMode: 'winner', brush: null, brushLabel: '', selected: null, hover: null, sort: { key: 'id', dir: 1 }, search: '' };
  const inRegion = d => state.region === 'all' || d.region === state.region;
  const isActive = d => inRegion(d) && (!state.brush || state.brush.has(d.id));
  const splitParty = () => (state.party != null ? state.party : parties[0].i);

  // ---------------------------------------------------------------- tooltip
  const tip = document.getElementById('tooltip');
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const pad = 14, r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  const sw = c => `<span class="sw" style="background:${c}"></span>`;
  function districtTip(d) {
    if (!d.cand) return `<div class="t">${d.label}</div><div>ไม่มีข้อมูล สส.เขต</div>`;
    return `<div class="t">${d.label}</div>
      <div>${sw(color(d.win))}${d.winName}</div>
      <div class="r"><span>${pname(d.win)}</span><span>${fmtPct(d.winShare)}</span></div>
      ${d.run != null ? `<div class="r"><span>ห่างจาก ${pname(d.run)}</span><span>${fmtPct(d.margin)}</span></div>` : ''}`;
  }

  // ---------------------------------------------------------------- filters UI
  const partyChips = d3.select('#partyChips');
  function renderPartyChips() {
    const opts = [{ i: null, name: 'ทุกพรรค' }, ...MAIN.map(i => parties[i])];
    partyChips.selectAll('button.chip').data(opts, d => d.i).join(enter => {
      const b = enter.append('button').attr('class', 'chip').attr('type', 'button').attr('role', 'radio');
      b.each(function (d) { if (d.i != null) d3.select(this).append('span').attr('class', 'sw').style('background', color(d.i)); });
      b.append('span').text(d => d.name);
      b.on('click', (e, d) => setParty(d.i));
      return b;
    }).attr('aria-checked', d => String(d.i === state.party));
    // "other parties" select
    let sel = partyChips.select('select');
    if (sel.empty()) {
      sel = partyChips.append('select').attr('class', 'chip').attr('aria-label', 'พรรคอื่น');
      const others = parties.filter(p => !PARTY_COLOR[p.name] && (p.cs > 0 || p.pv > 150000));
      sel.append('option').attr('value', '').text('พรรคอื่น…');
      others.forEach(p => sel.append('option').attr('value', p.i).text(`${p.name} (${p.total})`));
      sel.on('change', e => setParty(e.target.value === '' ? null : +e.target.value));
    }
    const isOther = state.party != null && !MAIN.includes(state.party);
    sel.property('value', isOther ? state.party : '').classed('on', isOther);
  }
  d3.select('#regionChips').selectAll('button').data(REGIONS).join('button')
    .attr('class', 'chip').attr('type', 'button').attr('role', 'radio').text(d => d[1])
    .on('click', (e, d) => { state.region = d[0]; clearBrush(); update(); });
  d3.select('#resetBtn').on('click', () => {
    Object.assign(state, { party: null, region: 'all', mapMode: 'winner', brush: null, selected: null });
    update();
  });
  d3.select('#clearSelection').on('click', () => clearBrush('full'));

  function setParty(i) {
    state.party = i;
    if (state.mapMode === 'share' && i == null) state.mapMode = 'winner';
    clearBrush();
    update();
  }
  // mode: 'full' re-renders everything (also wipes brush rectangles), 'linked' only refreshes the linked views
  function clearBrush(mode) {
    const had = !!state.brush;
    state.brush = null; state.brushLabel = '';
    if (mode === 'full') update();
    else if (mode === 'linked' && had) updateLinked();
  }
  function setBrush(set, label) {
    state.brush = set; state.brushLabel = label;
    updateLinked();
  }

  // ---------------------------------------------------------------- KPIs
  function renderKPIs() {
    const ds = districts.filter(d => inRegion(d) && d.cand);
    const sum = k => d3.sum(ds, d => d[k]);
    const tight = ds.filter(d => d.margin < TIGHT).length;
    const scope = regionLabel(state.region);
    const tiles = [
      ['ผู้มาใช้สิทธิ', fmtPct(sum('came') / sum('el')), `${fmtInt(sum('came'))} จาก ${fmtInt(sum('el'))} คน`],
      ['บัตรเสีย (สส.เขต)', fmtPct(sum('inv') / sum('came')), `${fmtInt(sum('inv'))} ใบ`],
      ['ไม่เลือกผู้ใด', fmtPct(sum('nov') / sum('came')), `${fmtInt(sum('nov'))} ใบ`],
      ['เขตที่ชนะห่างไม่ถึง 5%', `${tight} เขต`, `จาก ${ds.length} เขตที่มีข้อมูล · ${scope}`],
    ];
    d3.select('#kpis').selectAll('.kpi').data(tiles).join(enter => {
      const k = enter.append('div').attr('class', 'kpi');
      k.append('div').attr('class', 'label'); k.append('div').attr('class', 'value'); k.append('div').attr('class', 'note');
      return k;
    }).call(k => {
      k.select('.label').text(d => d[0]); k.select('.value').text(d => d[1]); k.select('.note').text(d => d[2]);
    });
  }

  // ---------------------------------------------------------------- 1. hemicycle
  const hemi = (() => {
    const W = 640, H = 350, cx = W / 2, cy = H - 14, R = 300, r0 = 120, rows = 13, N = 500;
    const radii = d3.range(rows).map(i => r0 + (R - r0) * i / (rows - 1));
    const tot = d3.sum(radii);
    let counts = radii.map(r => Math.round(N * r / tot));
    counts[rows - 1] += N - d3.sum(counts);
    const seats = [];
    radii.forEach((r, ri) => {
      const n = counts[ri];
      for (let j = 0; j < n; j++) {
        const a = Math.PI * (1 - j / (n - 1));
        seats.push({ a, r, x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
      }
    });
    seats.sort((p, q) => d3.descending(p.a, q.a) || d3.ascending(p.r, q.r));
    const list = [];
    parties.filter(p => p.total > 0).forEach(p => {
      for (let k = 0; k < p.cs; k++) list.push({ p: p.i, kind: 'c' });
      for (let k = 0; k < p.pls; k++) list.push({ p: p.i, kind: 'l' });
    });
    while (list.length < N) list.push({ p: null, kind: 'm' });
    seats.forEach((s, k) => Object.assign(s, list[k]));
    const dotR = (R - r0) / (rows - 1) * 0.38;
    const svg = d3.select('#hemicycle').append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img')
      .attr('aria-label', 'ผังที่นั่งสภา 500 ที่นั่ง');
    const g = svg.append('g');
    const nodes = g.selectAll('circle').data(seats).join('circle')
      .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => (d.kind === 'l' ? dotR - 1 : dotR))
      .attr('stroke-width', d => (d.kind === 'l' ? 2 : 0))
      .attr('stroke-dasharray', d => (d.kind === 'm' ? '2 2' : null))
      .style('cursor', d => (d.p != null ? 'pointer' : 'default'))
      .on('mousemove', (e, d) => {
        if (d.p == null) return showTip('<div class="t">ไม่มีข้อมูล</div>3 เขตที่ยังไม่มีผลใน dataset', e);
        const p = parties[d.p];
        showTip(`<div class="t">${sw(p.color)}${p.name}${p.en ? ` <small>${p.en}</small>` : ''}</div>
          <div class="r"><span>สส.เขต</span><span>${p.cs}</span></div>
          <div class="r"><span>บัญชีรายชื่อ</span><span>${p.pls}</span></div>
          <div class="r"><span><b>รวม</b></span><span><b>${p.total}</b></span></div>`, e);
      })
      .on('mouseleave', hideTip)
      .on('click', (e, d) => { if (d.p != null) setParty(state.party === d.p ? null : d.p); });
    // majority line between seat 250 and 251
    const a = (seats[249].a + seats[250].a) / 2;
    g.append('line').attr('x1', cx + (r0 - 16) * Math.cos(a)).attr('y1', cy - (r0 - 16) * Math.sin(a))
      .attr('x2', cx + (R + 14) * Math.cos(a)).attr('y2', cy - (R + 14) * Math.sin(a))
      .attr('stroke', '#0b0b0b').attr('stroke-dasharray', '4 3').attr('stroke-width', 1.2);
    g.append('text').attr('x', cx + (R + 22) * Math.cos(a)).attr('y', cy - (R + 22) * Math.sin(a))
      .attr('text-anchor', 'middle').attr('class', 'anno').text('251');
    const big = g.append('text').attr('x', cx).attr('y', cy - 40).attr('text-anchor', 'middle')
      .style('font-size', '40px').style('font-weight', 700);
    const bigSub = g.append('text').attr('x', cx).attr('y', cy - 12).attr('text-anchor', 'middle').attr('class', 'anno').style('font-size', '13px');
    return function render() {
      nodes.attr('fill', d => (d.p == null ? '#fff' : d.kind === 'l' ? '#fff' : color(d.p)))
        .attr('stroke', d => (d.p == null ? '#c9c7c0' : color(d.p)))
        .attr('opacity', d => (state.party == null || d.p === state.party ? 1 : 0.18));
      const p = state.party != null ? parties[state.party] : parties[0];
      big.text(p.total).attr('fill', '#0b0b0b');
      bigSub.text(state.party != null ? `ที่นั่งของ${p.name} (${p.cs} เขต + ${p.pls} บัญชีฯ)` : `ที่นั่งพรรคอันดับ 1: ${p.name}`);
    };
  })();

  function renderSeatTable() {
    const withSeats = parties.filter(p => p.total > 0);
    const top = withSeats.slice(0, 8), rest = withSeats.slice(8);
    const rows = [...top.map(p => ({ ...p, kind: 'p' })),
      { kind: 'rest', name: `อีก ${rest.length} พรรค`, cs: d3.sum(rest, p => p.cs), pls: d3.sum(rest, p => p.pls), total: d3.sum(rest, p => p.total), sub: 'พรรคละ 1–3 ที่นั่ง' },
      { kind: 'miss', name: 'ไม่มีข้อมูลในชุดข้อมูล', cs: 400 - d3.sum(parties, p => p.cs), pls: 0, total: 400 - d3.sum(parties, p => p.cs), sub: 'กทม.15 · ปราจีนบุรี 2 · น่าน 1' }];
    const t = d3.select('#seatTable');
    t.selectAll('*').remove();
    const h = t.append('div').attr('class', 'seat-row head');
    ['', 'พรรค', 'เขต', 'บัญชีฯ', 'รวม'].forEach((s, k) => h.append('span').attr('class', k >= 2 ? 'num' : '').text(s));
    rows.forEach(r => {
      const row = t.append('div').attr('class', 'seat-row' + (r.kind === 'p' && r.i === state.party ? ' active' : ''))
        .attr('role', r.kind === 'p' ? 'button' : null).attr('tabindex', r.kind === 'p' ? 0 : null);
      row.append('span').attr('class', 'sw').style('background', r.kind === 'p' ? r.color : r.kind === 'rest' ? OTHER : 'transparent')
        .style('border', r.kind === 'miss' ? '1px dashed #c9c7c0' : null);
      row.append('span').attr('class', 'name').html(`${r.name}${r.en ? `<small>${r.en}</small>` : ''}${r.sub ? `<small>${r.sub}</small>` : ''}`);
      row.append('span').attr('class', 'num').text(r.cs);
      row.append('span').attr('class', 'num').text(r.pls);
      row.append('span').attr('class', 'num total').text(r.total);
      if (r.kind === 'p') {
        row.on('click', () => setParty(state.party === r.i ? null : r.i));
        row.on('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setParty(state.party === r.i ? null : r.i); } });
      }
    });
  }

  // ---------------------------------------------------------------- 2. map
  const mapSvg = d3.select('#map').attr('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
  const provG = mapSvg.append('g');
  const provPaths = provG.selectAll('path').data(MAP.provinces).join('path').attr('class', 'prov').attr('d', d => d.d);
  const dotG = mapSvg.append('g');
  const dots = dotG.selectAll('circle').data(districts, d => d.id).join('circle')
    .attr('class', d => 'dot' + (d.cand ? '' : ' missing'))
    .attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1]).attr('r', MAP.r)
    .attr('tabindex', -1)
    .on('mousemove', (e, d) => { showTip(districtTip(d), e); if (state.hover !== d.id) { state.hover = d.id; renderDetail(); } })
    .on('mouseleave', () => { hideTip(); state.hover = null; renderDetail(); })
    .on('click', (e, d) => { state.selected = state.selected === d.id ? null : d.id; updateSelection(); });
  const selRing = mapSvg.append('circle').attr('class', 'dot-sel').attr('r', MAP.r + 3.5).style('display', 'none');

  d3.select('#mapMode').selectAll('button').data(MAP_MODES).join('button').attr('type', 'button').attr('role', 'radio')
    .text(d => d[1]).on('click', (e, d) => { state.mapMode = d[0]; renderMap(); renderLegend(); });

  const rampMargin = d3.scaleSequential(d3.interpolateRgb('#0d366b', '#cde2fb')).domain([0, 0.35]).clamp(true);
  const rampTurnout = d3.scaleSequential(d3.interpolateRgb('#cde2fb', '#0d366b')).domain([0.55, 0.85]).clamp(true);
  const rampInvalid = d3.scaleSequential(d3.interpolateRgb('#fde4d4', '#8a3608')).domain([0, 0.06]).clamp(true);
  const rampShare = () => d3.scaleSequential(d3.interpolateRgb('#f1f0ec', color(state.party))).domain([0, 0.6]).clamp(true);

  function dotFill(d) {
    if (!d.cand) return '#fff';
    switch (state.mapMode) {
      case 'margin': return rampMargin(d.margin);
      case 'turnout': return rampTurnout(d.turnout);
      case 'invalid': return rampInvalid(d.invalid);
      case 'share': return rampShare()(d.cShare.get(state.party) || 0);
      default: return state.party == null || d.win === state.party ? color(d.win) : FADE;
    }
  }
  function renderMap() {
    d3.select('#mapMode').selectAll('button')
      .attr('aria-checked', d => String(d[0] === state.mapMode))
      .property('disabled', d => d[0] === 'share' && state.party == null)
      .attr('title', d => (d[0] === 'share' && state.party == null ? 'เลือกพรรคด้านบนก่อน' : null));
    const regionProv = new Set(districts.filter(inRegion).map(d => d.pc));
    provPaths.classed('dim', d => state.region !== 'all' && !regionProv.has(d.pc));
    dots.attr('fill', dotFill).classed('faded', d => !isActive(d));
    updateSelectionRing();
  }
  function renderLegend() {
    const L = d3.select('#mapLegend'); L.selectAll('*').remove();
    const ramp = (scale, lo, hi, note) => {
      const span = L.append('span').attr('class', 'ramp');
      span.append('span').text(lo);
      const stops = d3.range(0, 1.0001, 0.1).map(t => scale(scale.domain()[0] + t * (scale.domain()[1] - scale.domain()[0])));
      span.append('span').attr('class', 'bar').style('background', `linear-gradient(90deg, ${stops.join(',')})`);
      span.append('span').text(hi);
      if (note) L.append('span').text(note);
    };
    if (state.mapMode === 'winner') {
      const counts = d3.rollup(districts.filter(d => d.cand && inRegion(d)), v => v.length, d => (PARTY_COLOR[pname(d.win)] ? d.win : 'o'));
      MAIN.forEach(i => {
        const it = L.append('span').attr('class', 'item');
        it.append('span').attr('class', 'sw').style('background', color(i)).style('opacity', state.party == null || state.party === i ? 1 : 0.3);
        it.append('span').text(`${pname(i)} ${counts.get(i) || 0}`);
      });
      const it = L.append('span').attr('class', 'item');
      it.append('span').attr('class', 'sw').style('background', OTHER);
      it.append('span').text(`อื่น ๆ ${counts.get('o') || 0}`);
    } else if (state.mapMode === 'margin') ramp(rampMargin, 'สูสี 0%', 'ห่าง 35%+', 'ยิ่งเข้มยิ่งสูสี');
    else if (state.mapMode === 'turnout') ramp(rampTurnout, '55%', '85%', 'ผู้มาใช้สิทธิ ÷ ผู้มีสิทธิ');
    else if (state.mapMode === 'invalid') ramp(rampInvalid, '0%', '6%+', 'บัตรเสีย ÷ ผู้มาใช้สิทธิ (สส.เขต)');
    else if (state.mapMode === 'share') ramp(rampShare(), '0%', '60%+', `คะแนนผู้สมัคร${pname(state.party)} ÷ บัตรดี`);
    const it = L.append('span').attr('class', 'item');
    it.append('span').attr('class', 'sw').style('border', '1px dashed #b9b7b0');
    it.append('span').text('ไม่มีข้อมูล');
  }
  function updateSelectionRing() {
    const d = state.selected && byId.get(state.selected);
    selRing.style('display', d ? null : 'none');
    if (d) selRing.attr('cx', d.xy[0]).attr('cy', d.xy[1]);
  }

  // ---------------------------------------------------------------- detail panel
  function bars(rows, max) {
    return `<div class="bars">${rows.map(r => `<div class="row"><span class="lbl" title="${r.title || r.label}">${r.label}</span>
      <span class="track"><span class="fill" style="display:block;width:${(r.v / max * 100).toFixed(1)}%;background:${r.c}"></span></span>
      <span class="val">${fmtPct(r.v)}</span></div>`).join('')}</div>`;
  }
  function renderDetail() {
    const el = document.getElementById('detail');
    const d = byId.get(state.hover || state.selected);
    if (!d) { el.innerHTML = summaryPanel(); return; }
    let html = `<h3>${d.label}</h3><div class="prov-line">${regionLabel(d.region)}${state.selected === d.id ? ' · ปักหมุดไว้ (คลิกอีกครั้งเพื่อยกเลิก)' : ''}</div>`;
    if (d.cand) {
      html += `<div class="win">${sw(color(d.win))}<div class="who">${d.winName}<small>${pname(d.win)} · ${fmtPct(d.winShare)} · ชนะห่าง ${fmtPct(d.margin)}${d.run != null ? ` จาก${pname(d.run)}` : ''}</small></div></div>`;
      const top = d.cand.slice(0, 6);
      html += `<h4>สส.เขต — คะแนนผู้สมัคร (% บัตรดี)</h4>` + bars(top.map(([pi, v, name]) => ({ label: pname(pi), title: `${name} (${pname(pi)})`, v: v / d.good, c: color(pi) })), top[0][1] / d.good);
    } else html += `<p class="placeholder">ไม่มีผล สส.เขต ในชุดข้อมูล</p>`;
    if (d.pl) {
      const top = d.pl.votes.slice(0, 6);
      html += `<h4>บัญชีรายชื่อ — คะแนนพรรค (% บัตรดี)</h4>` + bars(top.map(([pi, v]) => ({ label: pname(pi), v: v / d.pl.good, c: color(pi) })), top[0][1] / d.pl.good);
    } else html += `<h4>บัญชีรายชื่อ</h4><p class="placeholder">ไม่มีข้อมูลบัญชีรายชื่อของเขตนี้</p>`;
    if (d.cand) {
      html += `<div class="stats">
        <div class="stat"><div class="k">ผู้มีสิทธิ</div><div class="v">${fmtInt(d.el)}</div></div>
        <div class="stat"><div class="k">มาใช้สิทธิ</div><div class="v">${fmtPct(d.turnout)}</div></div>
        <div class="stat"><div class="k">บัตรเสีย (เขต / บัญชีฯ)</div><div class="v">${fmtPct(d.invalid)}${d.pl ? ` / ${fmtPct(d.pl.inv / d.pl.came)}` : ''}</div></div>
        <div class="stat"><div class="k">ไม่เลือกผู้ใด (เขต)</div><div class="v">${fmtPct(d.novote)}</div></div></div>`;
      const issues = [];
      if (Math.abs(d.sumdiff) > 0) issues.push(`สส.เขต: ผลรวมคะแนนต่างจากบัตรดี ${Math.abs(d.sumdiff).toFixed(2)}%`);
      if (d.pl && Math.abs(d.pl.sumdiff) > 0) issues.push(`บัญชีฯ: ผลรวมคะแนนต่างจากบัตรดี ${Math.abs(d.pl.sumdiff).toFixed(2)}%`);
      if (issues.length) html += `<div class="warn">⚠ ข้อมูล OCR อาจคลาดเคลื่อน — ${issues.join(' · ')}</div>`;
    }
    el.innerHTML = html;
  }
  function summaryPanel() {
    const ds = districts.filter(d => isActive(d) && d.cand);
    const scope = regionLabel(state.region) + (state.brush ? ' · เฉพาะเขตที่เลือก' : '');
    const counts = d3.rollups(ds, v => v.length, d => d.win).sort((a, b) => b[1] - a[1]);
    const max = counts.length ? counts[0][1] : 1;
    return `<div class="placeholder"><div class="big">${ds.length}</div>เขตที่มีข้อมูล · ${scope}</div>
      <h4>ที่นั่ง สส.เขต ที่แต่ละพรรคชนะ</h4>
      <div class="bars">${counts.map(([pi, n]) => `<div class="row"><span class="lbl">${pname(pi)}</span>
        <span class="track"><span class="fill" style="display:block;width:${(n / max * 100).toFixed(1)}%;background:${color(pi)}"></span></span>
        <span class="val">${n}</span></div>`).join('')}</div>
      <p class="placeholder" style="margin-top:14px">ชี้หรือคลิกจุดบนแผนที่เพื่อดูผลรายเขต</p>`;
  }

  // ---------------------------------------------------------------- 3. margin beeswarm
  function dodge(items, x, r) {
    const placed = [], sorted = items.slice().sort((a, b) => x(a) - x(b)), d2 = (2 * r + 1) ** 2;
    for (const it of sorted) {
      const xi = x(it); let y = 0;
      for (let k = 0; ; k++) {
        y = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r + 0.6);
        if (!placed.some(p => (p.x - xi) ** 2 + (p.y - y) ** 2 < d2 && Math.abs(p.x - xi) < 2 * r + 1)) break;
      }
      placed.push({ it, x: xi, y });
    }
    return placed;
  }
  function renderMargin() {
    const host = d3.select('#marginChart'); host.selectAll('*').remove();
    const W = 1140, mL = 150, mR = 24, r = 4.6;
    const x = d3.scaleLinear().domain([0, 0.6]).range([mL, W - mR]).clamp(true);
    const base = districts.filter(d => inRegion(d) && d.cand);
    const P = state.party;
    const lanes = P == null
      ? [{ key: 'all', label: 'ทุกเขต', sub: 'สีตามพรรคผู้ชนะ', items: base }]
      : [{ key: 'won', label: `${pname(P)} ชนะ`, sub: 'เขตที่ต้องรักษา', items: base.filter(d => d.win === P) },
         { key: 'lost', label: `${pname(P)} ได้ที่ 2`, sub: 'เขตที่มีโอกาสพลิก', items: base.filter(d => d.run === P) }];
    let y0 = 10; const allPts = [];
    lanes.forEach(l => {
      l.placed = dodge(l.items, d => x(d.margin), r);
      const ext = l.placed.length ? d3.max(l.placed, p => Math.abs(p.y)) : 0;
      l.h = Math.max(54, 2 * ext + 2 * r + 18); l.cy = y0 + l.h / 2; y0 += l.h + 10;
    });
    const H = y0 + 34;
    const svg = host.append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'การกระจายของระยะห่างคะแนน');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - 28})`)
      .call(d3.axisBottom(x).tickValues(d3.range(0, 0.61, 0.05)).tickSize(-(H - 38)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - 28})`)
      .call(d3.axisBottom(x).tickValues(d3.range(0, 0.61, 0.1)).tickFormat(v => (v >= 0.6 ? '60%+' : fmtPct0(v))));
    svg.append('text').attr('class', 'anno').attr('x', W - mR).attr('y', H - 2).attr('text-anchor', 'end').text('ระยะห่างคะแนน อันดับ 1 – อันดับ 2 (% บัตรดี) →');
    // tight band
    svg.append('rect').attr('x', x(0)).attr('width', x(TIGHT) - x(0)).attr('y', 4).attr('height', H - 36)
      .attr('fill', '#0b0b0b').attr('opacity', 0.035);
    svg.append('text').attr('class', 'anno').attr('x', x(TIGHT / 2)).attr('y', 2).attr('text-anchor', 'middle').attr('dy', '-0.2em').text('< 5%');
    lanes.forEach(l => {
      const g = svg.append('g');
      g.append('text').attr('class', 'lane-label').attr('x', 0).attr('y', l.cy - 4).text(l.label);
      g.append('text').attr('class', 'lane-sub').attr('x', 0).attr('y', l.cy + 12).text(`${l.sub} · ${l.items.length} เขต`);
      g.selectAll('circle').data(l.placed).join('circle')
        .attr('class', 'mdot').attr('cx', p => p.x).attr('cy', p => l.cy + p.y).attr('r', r)
        .attr('fill', p => color(l.key === 'lost' ? p.it.win : p.it.win))
        .attr('stroke', '#fcfcfb').attr('stroke-width', 1)
        .style('pointer-events', 'none');
      l.placed.forEach(p => allPts.push({ ...p, cy: l.cy + p.y }));
    });
    // brush
    const brush = d3.brushX().extent([[mL - 4, 4], [W - mR + 4, H - 30]])
      .on('end', ({ selection, sourceEvent }) => {
        if (!sourceEvent) return;
        if (!selection) { clearBrush('linked'); return; }
        const [a, b] = selection.map(x.invert);
        const set = new Set(lanes.flatMap(l => l.items).filter(d => d.margin >= a && d.margin <= b).map(d => d.id));
        setBrush(set, `ระยะห่าง ${fmtPct(a)}–${b >= 0.6 ? '60%+' : fmtPct(b)}${P != null ? ` (เขตที่${pname(P)}ได้ที่ 1 หรือ 2)` : ''}`);
      });
    const bg = svg.append('g').attr('class', 'brush').call(brush);
    svg.selectAll('.mdot').raise();
    // hover / click through the brush overlay using the nearest dot
    const del = d3.Delaunay.from(allPts, p => p.x, p => p.cy);
    const near = e => { const [mx, my] = d3.pointer(e, svg.node()); const p = allPts[del.find(mx, my)]; return p && Math.hypot(p.x - mx, p.cy - my) <= 12 ? p : null; };
    bg.select('.overlay')
      .on('mousemove.tip', e => { const p = near(e); if (p) showTip(districtTip(p.it), e); else hideTip(); })
      .on('mouseleave.tip', hideTip)
      .on('click.pick', e => { const p = near(e); if (p) { state.selected = p.it.id; updateSelection(); } });
    marginDots = svg.selectAll('.mdot');
    // insight
    const ins = d3.select('#marginInsight');
    const scope = state.region === 'all' ? '' : ` ใน${regionLabel(state.region)}`;
    if (P == null) {
      const tight = base.filter(d => d.margin < TIGHT);
      const by = d3.rollups(tight, v => v.length, d => d.win).sort((a, b) => b[1] - a[1]);
      ins.html(`<strong>${tight.length} เขต</strong>${scope} ตัดสินกันด้วยระยะห่างไม่ถึง 5% ของบัตรดี — พรรคที่ชนะเขตสูสีเหล่านี้: ${by.map(([pi, n]) => `${sw(color(pi))}${pname(pi)} ${n}`).join(' · ')}.
        <br>เลือกพรรคด้านบนเพื่อแยกเป็น “เขตที่ต้องรักษา” กับ “เขตที่มีโอกาสพลิก”`);
    } else {
      const defend = lanes[0].items.filter(d => d.margin < TIGHT), attack = lanes[1].items.filter(d => d.margin < TIGHT);
      const from = d3.rollups(attack, v => v.length, d => d.win).sort((a, b) => b[1] - a[1]);
      ins.html(`${sw(color(P))}<strong>${pname(P)}</strong>${scope}: ชนะ ${lanes[0].items.length} เขต โดย <strong>${defend.length} เขตชนะห่างไม่ถึง 5%</strong> (เสี่ยงเสียครั้งหน้า) ·
        ได้ที่ 2 อีก ${lanes[1].items.length} เขต ซึ่ง <strong>${attack.length} เขตแพ้ไม่ถึง 5%</strong>${from.length ? ` — ส่วนใหญ่แพ้ให้ ${from.slice(0, 3).map(([pi, n]) => `${pname(pi)} ${n}`).join(', ')}` : ''}.
        ถ้าพลิกเขตเหล่านี้ได้ทั้งหมด จะได้ที่นั่งเพิ่มเป็น <strong>${parties[P].total + attack.length}</strong> ที่นั่ง`);
    }
  }
  let marginDots = d3.select(null);
  function scrollToMap() {
    const el = document.getElementById('sec-map');
    if (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().top > innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- 4. candidate vs party scatter
  let splitDots = d3.select(null);
  function renderSplit() {
    const P = splitParty(), p = parties[P];
    d3.select('#splitSub').html(`${sw(p.color)}<b>${p.name}</b>${state.party == null ? ' (พรรคที่นั่งสูงสุด — เลือกพรรคด้านบนเพื่อเปลี่ยน)' : ''} · แต่ละจุด = 1 เขต ·
      แกนนอน = คะแนนบัญชีรายชื่อของพรรค (แบรนด์พรรค) · แกนตั้ง = คะแนนผู้สมัคร สส.เขต ของพรรค · จุดทึบ = ชนะเขต · ลากเพื่อเลือกกลุ่มเขต`);
    const host = d3.select('#splitChart'); host.selectAll('*').remove();
    const items = districts.filter(d => inRegion(d) && d.cand && d.pShare && d.cShare.has(P))
      .map(d => ({ d, x: d.pShare.get(P) || 0, y: d.cShare.get(P), won: d.win === P }));
    const W = 680, H = 520, m = { l: 52, r: 16, t: 14, b: 44 };
    const max = Math.min(1, Math.max(0.2, d3.max(items, i => Math.max(i.x, i.y)) * 1.05 || 0.2));
    const x = d3.scaleLinear().domain([0, max]).range([m.l, W - m.r]).nice();
    const y = d3.scaleLinear().domain(x.domain()).range([H - m.b, m.t]);
    const svg = host.append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'คะแนนผู้สมัครเทียบคะแนนบัญชีรายชื่อ');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(fmtPct0));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(fmtPct0));
    svg.append('text').attr('class', 'anno').attr('x', W - m.r).attr('y', H - 8).attr('text-anchor', 'end').text('คะแนนบัญชีรายชื่อของพรรคในเขต →');
    svg.append('text').attr('class', 'anno').attr('transform', `translate(14,${m.t}) rotate(-90)`).attr('text-anchor', 'end').text('← คะแนนผู้สมัคร สส.เขต');
    const [d0, d1] = x.domain();
    svg.append('line').attr('class', 'diag').attr('x1', x(d0)).attr('y1', y(d0)).attr('x2', x(d1)).attr('y2', y(d1));
    svg.append('text').attr('class', 'anno').attr('x', x(d1 * 0.06)).attr('y', y(d1 * 0.94)).text('↖ ผู้สมัครแรงกว่าแบรนด์พรรค');
    svg.append('text').attr('class', 'anno').attr('x', x(d1 * 0.97)).attr('y', y(d1 * 0.06)).attr('text-anchor', 'end').text('แบรนด์พรรคแรงกว่าผู้สมัคร ↘');
    const g = svg.append('g');
    splitDots = g.selectAll('circle').data(items, i => i.d.id).join('circle')
      .attr('class', 'sdot').attr('cx', i => x(i.x)).attr('cy', i => y(i.y)).attr('r', 4.5)
      .attr('fill', i => (i.won ? p.color : '#fcfcfb')).attr('stroke', i => (i.won ? '#fcfcfb' : p.color))
      .attr('stroke-width', i => (i.won ? 1 : 1.6));
    // nearest-point hover via Delaunay
    const del = d3.Delaunay.from(items, i => x(i.x), i => y(i.y));
    const ring = svg.append('circle').attr('r', 8).attr('fill', 'none').attr('stroke', '#0b0b0b').attr('stroke-width', 1.5).style('display', 'none').style('pointer-events', 'none');
    const brush = d3.brush().extent([[m.l, m.t], [W - m.r, H - m.b]])
      .on('end', ({ selection, sourceEvent }) => {
        if (!sourceEvent) return;
        if (!selection) { clearBrush('linked'); return; }
        const [[a, b], [c, e]] = selection;
        const set = new Set(items.filter(i => x(i.x) >= a && x(i.x) <= c && y(i.y) >= b && y(i.y) <= e).map(i => i.d.id));
        setBrush(set, `${set.size} เขตจากกราฟตัวคน vs แบรนด์ (${p.name})`);
      });
    const bg = svg.append('g').attr('class', 'brush').call(brush);
    bg.select('.overlay')
      .on('mousemove.tip', e => {
        const [mx, my] = d3.pointer(e, svg.node());
        const k = del.find(mx, my); const it = items[k];
        if (!it || Math.hypot(x(it.x) - mx, y(it.y) - my) > 24) { ring.style('display', 'none'); hideTip(); return; }
        ring.style('display', null).attr('cx', x(it.x)).attr('cy', y(it.y));
        showTip(`${districtTip(it.d)}<div class="r"><span>ผู้สมัคร${p.name}</span><span>${fmtPct(it.y)}</span></div>
          <div class="r"><span>บัญชีฯ ${p.name}</span><span>${fmtPct(it.x)}</span></div>
          <div class="r"><span>ส่วนต่าง (ตัวคน − พรรค)</span><span>${pts(it.y - it.x)}</span></div>`, e);
      })
      .on('mouseleave.tip', () => { ring.style('display', 'none'); hideTip(); })
      .on('click.pick', e => {
        const [mx, my] = d3.pointer(e, svg.node());
        const it = items[del.find(mx, my)];
        if (it && Math.hypot(x(it.x) - mx, y(it.y) - my) <= 24) { state.selected = it.d.id; updateSelection(); }
      });
    g.raise(); g.style('pointer-events', 'none');
    svg.append('circle').attr('class', 'split-sel').attr('r', 8).attr('fill', 'none').attr('stroke', '#0b0b0b').attr('stroke-width', 2).style('display', 'none').style('pointer-events', 'none');
    renderSplitInsight(items, p);
  }
  function renderSplitInsight(items, p) {
    const gaps = items.map(i => i.y - i.x);
    const above = gaps.filter(v => v > 0).length;
    const med = d3.median(gaps) || 0;
    const won = items.filter(i => i.won);
    const wonByCand = won.filter(i => i.d.pl && i.d.pl.votes[0][0] !== p.i).length;
    const plTop = items.filter(i => i.d.pl && i.d.pl.votes[0][0] === p.i && !i.won);
    const listRows = arr => arr.map(i => `<li><a href="#" data-id="${i.d.id}">${i.d.label}</a> · ${pts(i.y - i.x)}</li>`).join('');
    const best = items.slice().sort((a, b) => (b.y - b.x) - (a.y - a.x)).slice(0, 4);
    const worst = items.slice().sort((a, b) => (a.y - a.x) - (b.y - b.x)).slice(0, 4);
    const ins = d3.select('#splitInsight').html(`
      <div>${sw(p.color)}<strong>${p.name}</strong> ส่งผู้สมัคร ${items.length} เขต${state.region === 'all' ? '' : 'ใน' + regionLabel(state.region)}</div>
      <ul>
        <li>ผู้สมัครได้คะแนน<strong>${med >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}</strong>คะแนนบัญชีรายชื่อของพรรค (ค่ามัธยฐาน ${pts(med)}) · อยู่เหนือเส้นทแยง ${above} จาก ${items.length} เขต</li>
        <li>ชนะเขต ${won.length} เขต (ที่มีข้อมูลบัญชีฯ) — ในจำนวนนี้ <strong>${wonByCand}</strong> เขตที่บัญชีรายชื่อของพรรค<strong>ไม่ได้</strong>มาที่ 1 (ชนะเพราะตัวผู้สมัคร)</li>
        <li><strong>${plTop.length}</strong> เขตที่บัญชีรายชื่อพรรคมาที่ 1 แต่ผู้สมัครแพ้ — เป้าหมายในการเปลี่ยนตัวหรือเสริมผู้สมัคร</li>
      </ul>
      <div style="margin-top:10px"><strong>ผู้สมัครดึงคะแนนเกินพรรคมากที่สุด</strong><ul>${listRows(best)}</ul></div>
      <div style="margin-top:8px"><strong>พรรคแรงแต่ผู้สมัครตามไม่ทัน</strong><ul>${listRows(worst)}</ul></div>`);
    ins.selectAll('a[data-id]').on('click', function (e) { e.preventDefault(); state.selected = this.dataset.id; updateSelection(); scrollToMap(); });
  }

  // ---------------------------------------------------------------- 5. table
  const COLS = [
    { key: 'id', label: 'เขต', get: d => d.label, sortv: d => +d.pc * 100 + d.n },
    { key: 'win', label: 'พรรคผู้ชนะ', get: d => (d.cand ? `${sw(color(d.win))}${pname(d.win)}` : '—'), sortv: d => (d.cand ? pname(d.win) : null) },
    { key: 'name', label: 'ผู้ชนะ', get: d => d.winName || '—', sortv: d => d.winName ?? null },
    { key: 'share', label: '% ผู้ชนะ', num: true, get: d => (d.cand ? fmtPct(d.winShare) : '—'), sortv: d => d.winShare },
    { key: 'margin', label: 'ห่าง', num: true, get: d => (d.cand ? fmtPct(d.margin) : '—'), sortv: d => d.margin },
    { key: 'run', label: 'อันดับ 2', get: d => (d.run != null ? pname(d.run) : '—'), sortv: d => (d.run != null ? pname(d.run) : null) },
    { key: 'turnout', label: 'มาใช้สิทธิ', num: true, get: d => (d.cand ? fmtPct(d.turnout) : '—'), sortv: d => d.turnout },
    { key: 'invalid', label: 'บัตรเสีย', num: true, get: d => (d.cand ? fmtPct(d.invalid) : '—'), sortv: d => d.invalid },
  ];
  const focusCols = P => [
    { key: 'pc', label: `ผู้สมัคร${pname(P)}`, num: true, get: d => (d.cShare && d.cShare.has(P) ? fmtPct(d.cShare.get(P)) : '—'), sortv: d => (d.cShare ? d.cShare.get(P) : null) },
    { key: 'pp', label: `บัญชีฯ ${pname(P)}`, num: true, get: d => (d.pShare ? fmtPct(d.pShare.get(P) || 0) : '—'), sortv: d => (d.pShare ? d.pShare.get(P) || 0 : null) },
  ];
  function renderTable() {
    const cols = state.party != null ? [...COLS, ...focusCols(state.party)] : COLS;
    if (!cols.some(c => c.key === state.sort.key)) state.sort = { key: 'id', dir: 1 };
    const q = state.search.trim();
    let rows = districts.filter(isActive);
    if (q) rows = rows.filter(d => d.label.includes(q) || (d.cand && d.cand.some(c => c[2].includes(q))) || (d.cand && pname(d.win).includes(q)));
    const col = cols.find(c => c.key === state.sort.key);
    rows.sort((a, b) => {
      const va = col.sortv(a), vb = col.sortv(b);
      if (va == null || vb == null) return (va == null) - (vb == null); // missing always last
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.sort.dir;
    });
    const t = d3.select('#table'); t.selectAll('*').remove();
    t.append('thead').append('tr').selectAll('th').data(cols).join('th')
      .attr('class', c => (c.num ? 'num' : null)).attr('scope', 'col').attr('tabindex', 0)
      .attr('aria-sort', c => (c.key === state.sort.key ? (state.sort.dir > 0 ? 'ascending' : 'descending') : null))
      .text(c => c.label)
      .on('click keydown', (e, c) => {
        if (e.type === 'keydown' && e.key !== 'Enter') return;
        state.sort = { key: c.key, dir: state.sort.key === c.key ? -state.sort.dir : (c.key === 'margin' ? 1 : c.num ? -1 : 1) };
        renderTable();
      });
    const tb = t.append('tbody');
    tb.selectAll('tr').data(rows, d => d.id).join('tr')
      .classed('sel', d => d.id === state.selected)
      .on('click', (e, d) => { state.selected = d.id; updateSelection(); scrollToMap(); })
      .selectAll('td').data(d => cols.map(c => [c, d])).join('td')
      .attr('class', ([c]) => (c.num ? 'num' : null)).html(([c, d]) => c.get(d));
  }
  d3.select('#search').on('input', e => { state.search = e.target.value; renderTable(); });

  // ---------------------------------------------------------------- orchestration
  function updateSelectionBar() {
    const bar = document.getElementById('selectionBar');
    bar.hidden = !state.brush;
    if (state.brush) document.getElementById('selectionText').textContent = `กำลังเลือก ${state.brush.size} เขต: ${state.brushLabel}`;
  }
  function updateLinked() { // brush changed: everything except the chart that owns the brush keeps its geometry
    renderMap(); renderDetail(); renderTable(); updateSelectionBar();
    marginDots.attr('opacity', p => (!state.brush || state.brush.has(p.it.id) ? 1 : 0.2));
    splitDots.attr('opacity', i => (!state.brush || state.brush.has(i.d.id) ? 1 : 0.2));
  }
  function updateSelection() {
    updateSelectionRing(); renderDetail();
    d3.select('#table').selectAll('tbody tr').classed('sel', d => d.id === state.selected);
    marginDots.attr('stroke', p => (p.it.id === state.selected ? '#0b0b0b' : '#fcfcfb')).attr('stroke-width', p => (p.it.id === state.selected ? 2 : 1));
    const s = d3.select('#splitChart .split-sel');
    const hit = splitDots.filter(i => i.d.id === state.selected);
    if (!hit.empty()) s.style('display', null).attr('cx', hit.attr('cx')).attr('cy', hit.attr('cy')); else s.style('display', 'none');
  }
  function update() {
    renderPartyChips();
    d3.select('#regionChips').selectAll('button').attr('aria-checked', d => String(d[0] === state.region));
    renderKPIs(); hemi(); renderSeatTable();
    renderMap(); renderLegend(); renderDetail();
    renderMargin(); renderSplit(); renderTable();
    updateSelectionBar(); updateSelection();
    if (state.brush) updateLinked();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { state.selected = null; if (state.brush) clearBrush('full'); else updateSelection(); } });
  update();
})();
