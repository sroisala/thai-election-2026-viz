#!/usr/bin/env python3
"""ดึงรูปหัวหน้าพรรค/นายกฯ และโลโก้พรรค จากลิงก์ที่ใส่ใน assets/manifest.csv

ใช้เฉพาะ Python 3 มาตรฐาน ไม่ต้องติดตั้งอะไรเพิ่ม รันบนเครื่องที่ออกอินเทอร์เน็ตได้

    python3 scripts/fetch_assets.py init     # เติมแถวไฟล์ที่ party-meta.json ต้องใช้ลง manifest.csv
    python3 scripts/fetch_assets.py          # โหลดรูปจากแถวที่ใส่ url ครบ (ค่าเริ่มต้น)
    python3 scripts/fetch_assets.py check    # ดูว่าไฟล์ไหนยังขาด หรือยังไม่มีที่มา/สิทธิ์
    python3 scripts/fetch_assets.py credits  # สร้างตารางที่มาใน assets/CREDITS.md ใหม่

กติกา: แถวที่ไม่กรอก source_page (หน้าที่เอารูปมา) และ license (สิทธิ์การใช้งาน)
จะไม่ถูกโหลด เพื่อให้ทุกรูปมีที่มาที่ตอบได้เสมอ
"""
import argparse
import csv
import datetime
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
META = ROOT / 'data/panel/party-meta.json'
MANIFEST = ROOT / 'assets/manifest.csv'
CREDITS = ROOT / 'assets/CREDITS.md'
FIELDS = ['file', 'subject', 'url', 'source_page', 'license', 'retrieved', 'added_by']
MAX_BYTES = 5 * 1024 * 1024
BEGIN, END = '<!-- BEGIN:images -->', '<!-- END:images -->'


def expected_files():
    """ไฟล์ทั้งหมดที่หน้าเว็บมองหา (จาก party-meta.json) พร้อมคำอธิบายว่าเป็นรูปของใคร"""
    m = json.loads(META.read_text(encoding='utf-8'))
    people = {}

    def add(path, name, ctx):
        people.setdefault(path, {'name': name, 'ctx': []})['ctx'].append(ctx)

    for year, pm in m.get('pm', {}).items():
        add(pm['photo'], pm['name'], f'นายกฯ {year}')
    for year, parties in m.get('leaders', {}).items():
        for party, leader in parties.items():
            if leader.get('photo'):  # ไม่มีรูป = หน้าเว็บแสดงเงาคนแทน
                add(leader['photo'], leader['name'], f'หัวหน้า{party} {year}')
    out = {p: f"{v['name']} ({'; '.join(v['ctx'])})" for p, v in sorted(people.items())}
    for party, path in m.get('logos', {}).items():
        out[path] = f'โลโก้พรรค{party}'
    return out


def read_manifest():
    if not MANIFEST.exists():
        return []
    with MANIFEST.open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    return [{k: (r.get(k) or '').strip() for k in FIELDS} for r in rows]


def write_manifest(rows):
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def detect_ext(data):
    """ดูชนิดไฟล์จากเนื้อไฟล์จริง ไม่เชื่อนามสกุลหรือ header ของเว็บ"""
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return 'gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    head = data[:2048].lstrip().lower()
    if b'<svg' in data[:4096].lower() and (head.startswith(b'<') or head.startswith(b'\xef\xbb\xbf<')):
        return 'svg'
    return None


def same_ext(a, b):
    norm = {'jpeg': 'jpg'}
    return norm.get(a, a) == norm.get(b, b)


def cmd_init(_):
    rows = read_manifest()
    have = {r['file'] for r in rows}
    added = 0
    for path, subject in expected_files().items():
        if path not in have:
            rows.append({k: '' for k in FIELDS} | {'file': path, 'subject': subject})
            added += 1
    write_manifest(rows)
    render_credits(rows)
    print(f'manifest.csv: เพิ่ม {added} แถว รวม {len(rows)} แถว')


def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ClassProjectAssetFetcher/1.0 (https://github.com/oum292929/thai-election-2026-viz-panel)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('ไฟล์ใหญ่เกิน 5 MB')
    return data


def cmd_fetch(args):
    rows = read_manifest()
    if not rows:
        print('ยังไม่มี manifest.csv รัน `python3 scripts/fetch_assets.py init` ก่อน')
        return 1
    ok = skipped = failed = 0
    today = datetime.date.today().isoformat()
    for r in rows:
        if not r['url']:
            continue
        target = ROOT / r['file']
        if target.exists() and not args.force:
            print(f"ข้าม {r['file']}: มีไฟล์อยู่แล้ว (ใช้ --force เพื่อโหลดทับ)")
            skipped += 1
            continue
        missing = [n for n in ('source_page', 'license') if not r[n]]
        if missing:
            print(f"ข้าม {r['file']}: ต้องกรอก {', '.join(missing)} ก่อน (เพื่อให้มีที่มา)")
            skipped += 1
            continue
        try:
            data = download(r['url'])
        except (urllib.error.URLError, ValueError, OSError) as e:
            print(f"ล้มเหลว {r['file']}: {e}")
            failed += 1
            continue
        kind = detect_ext(data)
        want = target.suffix.lstrip('.').lower()
        if kind is None:
            print(f"ล้มเหลว {r['file']}: ลิงก์นี้ไม่ใช่ไฟล์รูป (อาจเป็นหน้าเว็บ ให้ใช้ลิงก์ตรงของรูป)")
            failed += 1
            continue
        if not same_ext(kind, want):
            print(f"ล้มเหลว {r['file']}: เนื้อไฟล์เป็น .{kind} แต่ชื่อไฟล์เป็น .{want} "
                  f"แก้นามสกุลในคอลัมน์ file และใน data/panel/party-meta.json ให้ตรงกัน")
            failed += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        r['retrieved'] = today
        print(f"โหลดแล้ว {r['file']} ({len(data) // 1024} KB)")
        ok += 1
    write_manifest(rows)
    render_credits(rows)
    print(f'สรุป: โหลดสำเร็จ {ok}, ข้าม {skipped}, ล้มเหลว {failed}')
    return 1 if failed else 0


def cmd_check(_):
    rows = read_manifest()
    by_file = {r['file']: r for r in rows}
    need = expected_files()
    absent = [p for p in need if not (ROOT / p).exists()]
    print(f'ไฟล์ที่ต้องใช้ {len(need)} ไฟล์ มีแล้ว {len(need) - len(absent)} ยังขาด {len(absent)}')
    for p in absent:
        print(f'  ขาด  {p}  ({need[p]})')
    problems = 0
    for p in need:
        if (ROOT / p).exists():
            r = by_file.get(p, {})
            if not (r.get('source_page') and r.get('license')):
                print(f'  มีไฟล์แต่ยังไม่มีที่มา/สิทธิ์  {p}')
                problems += 1
    print('ที่มาครบทุกไฟล์ที่มีอยู่' if not problems else f'ต้องกรอกที่มาเพิ่ม {problems} ไฟล์')
    return 0


def cell(s):
    return (s or '').replace('|', '\\|') or ' '


def table(rows):
    head = '| ไฟล์ | เป็นรูปของ | หน้าต้นทาง | สิทธิ์การใช้งาน | วันที่เข้าถึง | ผู้เพิ่ม | สถานะ |\n|---|---|---|---|---|---|---|'
    lines = []
    for r in rows:
        src = f"[ลิงก์]({r['source_page']})" if r['source_page'] else ' '
        status = 'มีไฟล์' if (ROOT / r['file']).exists() else 'ยังไม่มีไฟล์'
        lines.append(f"| `{r['file']}` | {cell(r['subject'])} | {src} | {cell(r['license'])} | "
                     f"{cell(r['retrieved'])} | {cell(r['added_by'])} | {status} |")
    return head + '\n' + '\n'.join(lines)


def render_credits(rows):
    if not CREDITS.exists():
        return
    text = CREDITS.read_text(encoding='utf-8')
    if BEGIN not in text or END not in text:
        return
    people = [r for r in rows if r['file'].startswith('assets/people/')]
    logos = [r for r in rows if r['file'].startswith('assets/logos/')]
    block = (f'{BEGIN}\n\n### รูปคน (`assets/people/`)\n\n{table(people)}\n\n'
             f'### โลโก้พรรค (`assets/logos/`)\n\n{table(logos)}\n\n{END}')
    a, b = text.index(BEGIN), text.index(END) + len(END)
    CREDITS.write_text(text[:a] + block + text[b:], encoding='utf-8')


def cmd_credits(_):
    render_credits(read_manifest())
    print('อัปเดต assets/CREDITS.md แล้ว')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')
    sub.add_parser('init')
    f = sub.add_parser('fetch')
    f.add_argument('--force', action='store_true', help='โหลดทับไฟล์ที่มีอยู่แล้ว')
    sub.add_parser('check')
    sub.add_parser('credits')
    args = ap.parse_args()
    if args.cmd is None:
        args = ap.parse_args(['fetch'])
    sys.exit({'init': cmd_init, 'fetch': cmd_fetch, 'check': cmd_check, 'credits': cmd_credits}[args.cmd](args) or 0)


if __name__ == '__main__':
    main()
