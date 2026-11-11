"""Build one JSON file per election year for the site.

Writes data/years/<year>.json, data/years/index.json and data/provinces.json.
2569 is read from data/source/election-2569.json.
2566 votes come from the ECT report workbook.
2562 is a single-ballot election: a candidate's votes are also the party vote.
Party-list seat totals are the certified national allocation.

The page places the dots itself, so these files do not store coordinates.
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/tmp/election-src')
OTHER = '#a8a6a0'

# Certified party-list seats. Constituency seats are counted from district winners
# and checked against these official totals.
PLS_2562 = {
    'พลังประชารัฐ': 19, 'เพื่อไทย': 0, 'อนาคตใหม่': 50, 'ประชาธิปัตย์': 20, 'ภูมิใจไทย': 12,
    'เสรีรวมไทย': 10, 'ชาติไทยพัฒนา': 4, 'เศรษฐกิจใหม่': 6, 'ประชาชาติ': 1, 'เพื่อชาติ': 5,
    'รวมพลังประชาชาติไทย': 4, 'ชาติพัฒนา': 2, 'พลังท้องถิ่นไท': 3, 'รักษ์ผืนป่าประเทศไทย': 2,
    'พลังปวงชนไทย': 1, 'พลังชาติไทย': 1, 'ประชาภิวัฒน์': 1, 'พลังไทยรักไทย': 1,
    'ไทยศรีวิไลย์': 1, 'ประชานิยม': 1, 'ครูไทยเพื่อประชาชน': 1, 'ประชาธรรมไทย': 1,
    'ประชาชนปฏิรูป': 1, 'พลเมืองไทย': 1, 'ประชาธิปไตยใหม่': 1, 'พลังธรรมใหม่': 1,
}
CS_2562 = {
    'พลังประชารัฐ': 97, 'เพื่อไทย': 136, 'อนาคตใหม่': 31, 'ประชาธิปัตย์': 33, 'ภูมิใจไทย': 39,
    'ชาติไทยพัฒนา': 6, 'ประชาชาติ': 6, 'รวมพลังประชาชาติไทย': 1, 'ชาติพัฒนา': 1,
}
PLS_2566 = {
    'ก้าวไกล': 39, 'เพื่อไทย': 29, 'รวมไทยสร้างชาติ': 13, 'ภูมิใจไทย': 3, 'ประชาธิปัตย์': 3,
    'ประชาชาติ': 2, 'พลังประชารัฐ': 1, 'เสรีรวมไทย': 1, 'ไทยสร้างไทย': 1, 'ประชาธิปไตยใหม่': 1,
    'ใหม่': 1, 'ชาติพัฒนากล้า': 1, 'ท้องที่ไทย': 1, 'ชาติไทยพัฒนา': 1, 'เป็นธรรม': 1,
    'พลังสังคมใหม่': 1, 'ครูไทยเพื่อประชาชน': 1,
}
CS_2566 = {
    'ก้าวไกล': 112, 'เพื่อไทย': 112, 'รวมไทยสร้างชาติ': 23, 'ภูมิใจไทย': 68, 'ประชาธิปัตย์': 22,
    'ประชาชาติ': 7, 'พลังประชารัฐ': 39, 'ไทยสร้างไทย': 5, 'ชาติพัฒนากล้า': 1,
    'ชาติไทยพัฒนา': 9, 'เพื่อไทรวมพลัง': 2,
}
EN = {
    'ภูมิใจไทย': 'Bhumjaithai', 'ประชาชน': "People's", 'เพื่อไทย': 'Pheu Thai', 'กล้าธรรม': 'Kla Tham',
    'ประชาธิปัตย์': 'Democrat', 'ก้าวไกล': 'Move Forward', 'อนาคตใหม่': 'Future Forward',
    'พลังประชารัฐ': 'Palang Pracharath', 'รวมไทยสร้างชาติ': 'United Thai Nation',
    'ชาติไทยพัฒนา': 'Chartthaipattana', 'ประชาชาติ': 'Prachachat', 'ไทยสร้างไทย': 'Thai Sang Thai',
    'เสรีรวมไทย': 'Thai Liberal', 'ชาติพัฒนากล้า': 'Chart Pattana Kla', 'เศรษฐกิจใหม่': 'New Economics',
    'เพื่อชาติ': 'Puea Chat', 'รวมพลังประชาชาติไทย': 'Action Coalition',
}
COLOR_2569 = {
    'ภูมิใจไทย': '#3358b8', 'ประชาชน': '#f58220', 'เพื่อไทย': '#b01530',
    'กล้าธรรม': '#14946a', 'ประชาธิปัตย์': '#4fb3e6', 'พลังประชารัฐ': '#5b6ea8',
    'ไทรวมพลัง': '#e24b8a', 'ประชาชาติ': '#c4a35a', 'เศรษฐกิจ': '#6b7280',
    'รวมไทยสร้างชาติ': '#1e3a8a', 'ไทยสร้างไทย': '#1d4ed8',
}


def norm_th(name):
    s = name.strip().replace(' ', '').replace('จังหวัด', '')
    return {'กรุงเทพฯ': 'กรุงเทพมหานคร', 'กรุงเทพ': 'กรุงเทพมหานคร', 'กทม.': 'กรุงเทพมหานคร'}.get(s, s)


def load_provinces():
    base = json.loads((ROOT / 'data/source/election-2569.json').read_text())
    by_name = {}
    for pc, p in base['provinces'].items():
        by_name[norm_th(p['th'])] = pc
    return base, by_name


def party_index(parties, name, color):
    for i, p in enumerate(parties):
        if p['name'] == name:
            if p['color'] == OTHER and color and color != OTHER:
                p['color'] = color
            return i
    parties.append({'name': name, 'en': EN.get(name, ''), 'color': color or OTHER, 'cs': 0, 'pls': 0, 'cv': 0, 'pv': 0})
    return len(parties) - 1


def apply_pls(parties, table, label):
    names = {p['name'] for p in parties}
    missing = [k for k, v in table.items() if v and k not in names]
    if missing:
        print(f'WARN {label} list-seat parties not in the vote file:', missing)
    for p in parties:
        if p['name'] in table:
            p['pls'] = table[p['name']]


def check_cs(parties, expected, label):
    got = {p['name']: p['cs'] for p in parties if p['cs']}
    bad = []
    for name, n in expected.items():
        if got.get(name, 0) != n:
            bad.append(f'{name} data {got.get(name, 0)} official {n}')
    extra = [f'{name} {n}' for name, n in got.items() if name not in expected]
    if bad or extra:
        print(f'WARN {label} constituency seats differ')
        for line in bad + [f'extra {e}' for e in extra]:
            print(' ', line)
    else:
        print(f'{label} constituency seats match the certified totals')


def trim_named(rows, keep=8):
    """rows of (votes, pi, name) -> [pi, votes, name?] with names on the leaders only."""
    rows = sorted(rows, key=lambda r: -r[0])
    out = []
    for i, (votes, pi, name) in enumerate(rows):
        if votes <= 0:
            continue
        item = [pi, int(votes)]
        if name and i < keep:
            item.append(name)
        out.append(item)
    return out


def build_2569(base):
    parties = []
    for p in base['parties']:
        parties.append({
            'name': p['name'], 'en': p.get('en') or EN.get(p['name'], ''),
            'color': COLOR_2569.get(p['name'], OTHER),
            'cs': p['cs'], 'pls': p['pls'], 'cv': p.get('cv', 0), 'pv': p.get('pv', 0),
        })
    districts = []
    missing = []
    for d in base['districts']:
        o = {'id': d['id'], 'pc': d['pc'], 'n': d['n']}
        if d.get('c'):
            el, came, good, inv, nov, gap, cand = d['c']
            o.update(el=el, came=came, good=good, inv=inv, nov=nov)
            if gap:
                o['gap'] = gap
            o['c'] = trim_named([(v, pi, name) for pi, v, name, *_ in cand])
        else:
            missing.append(d['id'])
        if d.get('p'):
            el, came, good, inv, nov, gap, votes = d['p']
            o['pl'] = {'el': el, 'came': came, 'good': good, 'inv': inv, 'nov': nov}
            if gap:
                o['pl']['gap'] = gap
            o['p'] = trim_named([(v, pi, None) for pi, v in votes], keep=0)
        districts.append(o)
    note = ''
    if missing:
        note = 'ขาดผล สส.เขต 3 เขต (กทม. 15, ปราจีนบุรี 2, น่าน 1) และบัญชีรายชื่อ 3 เขต (กทม. 15, ปราจีนบุรี 2, อุดรธานี 6) ที่นั่งบัญชีรายชื่อเป็นตัวเลขที่ กกต. รับรอง'
    return {
        'id': '2569', 'constSeats': 400, 'listSeats': 100, 'majority': 251,
        'singleBallot': False, 'note': note, 'parties': parties, 'districts': districts,
    }


def build_2566(by_name):
    import openpyxl
    wb = openpyxl.load_workbook(SRC / 'ect66.xlsx', read_only=True, data_only=True)
    parties_src = {}
    ws = wb['info_party_overview']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if row[0] is None or not isinstance(row[0], (int, float)):
            continue
        parties_src[int(row[0])] = {'name': row[2], 'color': row[4] or OTHER}
    prov_name = {}
    ws = wb['info_province']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if row[1]:
            prov_name[row[1]] = row[2]
    cons = {}
    ws = wb['info_constituency']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if not row[0] or row[0] in cons:
            continue
        prov = prov_name.get(row[2])
        pc = by_name.get(norm_th(prov or ''))
        if not pc:
            sys.exit(f'unmapped 2566 province {prov}')
        cons[row[0]] = {'pc': pc, 'n': int(row[1]), 'el': int(row[3] or 0)}
    ws = wb['result_constituencies_status']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if row[1] in cons and row[2] is not None:
            cons[row[1]]['came'] = int(row[2])
    names = {}
    ws = wb['Candidate_Constituency']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if row[0]:
            names[row[0]] = row[1]
    cand = defaultdict(list)
    ws = wb['result_constituencies_Candidate']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if not row[0] or row[3] is None:
            continue
        pid = int(row[5])
        cand[row[0]].append((int(row[3]), pid, names.get(row[1], '')))
    plist = defaultdict(list)
    ws = wb['result_constituencies_PartyList']
    rows = ws.iter_rows(values_only=True)
    next(rows)
    for row in rows:
        if not row[0] or not row[2]:
            continue
        plist[row[0]].append((int(row[2]), int(row[1])))
    wb.close()

    parties = []
    districts = []
    wins = defaultdict(int)
    for cons_id, meta in cons.items():
        o = {'id': f"{meta['pc']}-{meta['n']}", 'pc': meta['pc'], 'n': meta['n'], 'el': meta['el']}
        if meta.get('came'):
            o['came'] = meta['came']
        c_rows = []
        for votes, pid, name in cand.get(cons_id, []):
            src = parties_src[pid]
            pi = party_index(parties, src['name'], src['color'])
            c_rows.append((votes, pi, name))
            parties[pi]['cv'] += votes
        if c_rows:
            o['good'] = sum(v for v, _, _ in c_rows)
            o['c'] = trim_named(c_rows)
            winner = max(c_rows)
            parties[winner[1]]['cs'] += 1
            wins[parties[winner[1]]['name']] += 1
        p_rows = []
        for votes, pid in plist.get(cons_id, []):
            src = parties_src.get(pid)
            if not src:
                continue
            pi = party_index(parties, src['name'], src['color'])
            p_rows.append((votes, pi, None))
            parties[pi]['pv'] += votes
        if p_rows:
            o['p'] = trim_named(p_rows, keep=0)
            o['pl'] = {'good': sum(v for v, _, _ in p_rows)}
        districts.append(o)
    apply_pls(parties, PLS_2566, '2566')
    check_cs(parties, CS_2566, '2566')
    old = list(parties)
    order = sorted(range(len(old)), key=lambda i: -(old[i]['cs'] + old[i]['pls']))
    remap = {old_i: new_i for new_i, old_i in enumerate(order)}
    parties = [old[i] for i in order]
    for d in districts:
        for key in ('c', 'p'):
            if key in d:
                for item in d[key]:
                    item[0] = remap[item[0]]
    print('2566 districts', len(districts), 'with votes', sum(1 for d in districts if d.get('c')))
    return {
        'id': '2566', 'constSeats': 400, 'listSeats': 100, 'majority': 251,
        'singleBallot': False,
        'note': 'คะแนนรายเขตมาจากรายงาน กกต. (ectreport66) ตอนนับได้ 100% จึงเป็นก้าวไกล 113 เขตและภูมิใจไทย 67 เขต ต่างจากที่นั่งแบ่งเขตที่รับรองสุดท้าย 1 ที่นั่ง (112 และ 68) ที่นั่งบัญชีรายชื่อเป็นผลรับรอง',
        'parties': parties, 'districts': districts,
    }


def build_2562(by_name):
    colors = {p['name']: p.get('color') or OTHER for p in json.loads((SRC / 'parties62.json').read_text())}
    grouped = defaultdict(list)
    with (SRC / 'candidate_result_2562.csv').open(newline='') as f:
        for row in csv.DictReader(f):
            pc = by_name.get(norm_th(row['province']))
            if not pc:
                sys.exit('unmapped 2562 province ' + row['province'])
            grouped[(pc, int(row['zone']))].append(row)
    parties = []
    districts = []
    for (pc, n), rows in sorted(grouped.items()):
        c_rows = []
        for row in rows:
            score = int(row['score'] or 0)
            if score <= 0 or not row['party']:
                continue
            name = f"{row['title'] or ''}{row['first_name']} {row['last_name']}".strip()
            pi = party_index(parties, row['party'], colors.get(row['party']))
            c_rows.append((score, pi, name))
            parties[pi]['cv'] += score
            parties[pi]['pv'] += score  # single ballot counts as the party vote
        if not c_rows:
            continue
        winner = max(c_rows)
        parties[winner[1]]['cs'] += 1
        districts.append({
            'id': f'{pc}-{n}', 'pc': pc, 'n': n,
            'good': sum(v for v, _, _ in c_rows),
            'c': trim_named(c_rows),
        })
    apply_pls(parties, PLS_2562, '2562')
    check_cs(parties, CS_2562, '2562')
    order = sorted(range(len(parties)), key=lambda i: -(parties[i]['cs'] + parties[i]['pls']))
    remap = {old: new for new, old in enumerate(order)}
    parties = [parties[i] for i in order]
    for d in districts:
        for item in d['c']:
            item[0] = remap[item[0]]
    print('2562 districts', len(districts), 'list seats', sum(p['pls'] for p in parties), 'const seats', sum(p['cs'] for p in parties))
    return {
        'id': '2562', 'constSeats': 350, 'listSeats': 150, 'majority': 251,
        'singleBallot': True,
        'note': 'ปี 2562 ใช้บัตรใบเดียว คะแนนผู้สมัครคือคะแนนบัญชีรายชื่อของพรรคนั้น สีบนแผนที่จึงเหมือนกันทุกมุมมอง ชุดข้อมูลเป็นผลวันเลือกตั้ง 350 เขต จึงนับเพื่อไทย 137 และอนาคตใหม่ 30 ต่างจากผลสุดท้าย 1 ที่นั่ง หลังเลือกตั้งซ่อมเชียงใหม่ เขต 8 ที่นั่งบัญชีรายชื่อเป็นผลรับรองหลังเลือกตั้งซ่อม',
        'parties': parties, 'districts': districts,
    }


def public_year(year, provinces):
    """Turn the compact build output into the file a person can edit."""
    parties = []
    for p in year['parties']:
        item = {'name': p['name'], 'color': p['color'], 'partyListSeats': p['pls']}
        if p.get('en'):
            item = {'name': p['name'], 'en': p['en'], 'color': p['color'], 'partyListSeats': p['pls']}
        parties.append(item)
    districts = []
    for d in sorted(year['districts'], key=lambda d: (d['pc'], d['n'])):
        row = {'province': provinces[d['pc']]['th'], 'district': d['n']}
        if d.get('el'):
            row['eligible'] = d['el']
        if d.get('came'):
            row['turnout'] = d['came']
        if d.get('inv'):
            row['invalid'] = d['inv']
        if d.get('nov'):
            row['noVote'] = d['nov']
        if d.get('gap'):
            row['voteGap'] = d['gap']
        if d.get('c'):
            row['candidates'] = []
            for item in d['c']:
                cand = {'party': year['parties'][item[0]]['name'], 'votes': item[1]}
                if len(item) > 2 and item[2]:
                    cand['name'] = item[2]
                row['candidates'].append(cand)
        if d.get('p'):
            row['partyList'] = [
                {'party': year['parties'][item[0]]['name'], 'votes': item[1]} for item in d['p']
            ]
        districts.append(row)
    return {
        'year': year['id'],
        'constSeats': year['constSeats'],
        'listSeats': year['listSeats'],
        'majority': year['majority'],
        'singleBallot': year['singleBallot'],
        'note': year.get('note') or '',
        'parties': parties,
        'districts': districts,
    }


def publish(years, provinces):
    """Write data/provinces.json, data/years/index.json and one file per year."""
    year_dir = ROOT / 'data' / 'years'
    year_dir.mkdir(parents=True, exist_ok=True)
    names = {
        pc: {'th': p['th'], 'en': p['en'], 'region': p['region']}
        for pc, p in provinces.items()
    }
    (ROOT / 'data' / 'provinces.json').write_text(
        json.dumps(names, ensure_ascii=False, indent=2) + '\n')
    index = [y['id'] for y in years]
    (year_dir / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    for year in years:
        dest = year_dir / f"{year['id']}.json"
        dest.write_text(json.dumps(public_year(year, provinces), ensure_ascii=False, indent=2) + '\n')
        print('wrote', dest, 'bytes', dest.stat().st_size)


def main():
    base, by_name = load_provinces()
    years = [build_2562(by_name), build_2566(by_name), build_2569(base)]
    def counts(year):
        c = defaultdict(int)
        for d in year['districts']:
            c[d['pc']] += 1
        return c
    c62, c66, c69 = map(counts, years)
    changed = [pc for pc in c69 if c66[pc] != c69[pc] or c62[pc] != c66[pc]]
    print('provinces whose seat count changes across years:', len(changed))
    publish(years, base['provinces'])


if __name__ == '__main__':
    main()
