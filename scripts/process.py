"""Build a compact election.json for the web app from the killernay OCR dataset.

Usage: python3 -I process.py <matched_dir> <out_json>
"""
import json, glob, os, sys, collections, difflib

MATCHED, OUT = sys.argv[1], sys.argv[2]

# ---------- provinces: code -> (Thai, English (as in apisit/thailand.json), region)
PROV = {
 "10": ("กรุงเทพมหานคร", "Bangkok Metropolis", "bkk"),
 "11": ("สมุทรปราการ", "Samut Prakan", "central"), "12": ("นนทบุรี", "Nonthaburi", "central"),
 "13": ("ปทุมธานี", "Pathum Thani", "central"), "14": ("พระนครศรีอยุธยา", "Phra Nakhon Si Ayutthaya", "central"),
 "15": ("อ่างทอง", "Ang Thong", "central"), "16": ("ลพบุรี", "Lop Buri", "central"),
 "17": ("สิงห์บุรี", "Sing Buri", "central"), "18": ("ชัยนาท", "Chai Nat", "central"),
 "19": ("สระบุรี", "Saraburi", "central"), "20": ("ชลบุรี", "Chon Buri", "east"),
 "21": ("ระยอง", "Rayong", "east"), "22": ("จันทบุรี", "Chanthaburi", "east"), "23": ("ตราด", "Trat", "east"),
 "24": ("ฉะเชิงเทรา", "Chachoengsao", "east"), "25": ("ปราจีนบุรี", "Prachin Buri", "east"),
 "26": ("นครนายก", "Nakhon Nayok", "central"), "27": ("สระแก้ว", "Sa Kaeo", "east"),
 "30": ("นครราชสีมา", "Nakhon Ratchasima", "northeast"), "31": ("บุรีรัมย์", "Buri Ram", "northeast"),
 "32": ("สุรินทร์", "Surin", "northeast"), "33": ("ศรีสะเกษ", "Si Sa Ket", "northeast"),
 "34": ("อุบลราชธานี", "Ubon Ratchathani", "northeast"), "35": ("ยโสธร", "Yasothon", "northeast"),
 "36": ("ชัยภูมิ", "Chaiyaphum", "northeast"), "37": ("อำนาจเจริญ", "Amnat Charoen", "northeast"),
 "38": ("บึงกาฬ", "Bueng Kan", "northeast"), "39": ("หนองบัวลำภู", "Nong Bua Lam Phu", "northeast"),
 "40": ("ขอนแก่น", "Khon Kaen", "northeast"), "41": ("อุดรธานี", "Udon Thani", "northeast"),
 "42": ("เลย", "Loei", "northeast"), "43": ("หนองคาย", "Nong Khai", "northeast"),
 "44": ("มหาสารคาม", "Maha Sarakham", "northeast"), "45": ("ร้อยเอ็ด", "Roi Et", "northeast"),
 "46": ("กาฬสินธุ์", "Kalasin", "northeast"), "47": ("สกลนคร", "Sakon Nakhon", "northeast"),
 "48": ("นครพนม", "Nakhon Phanom", "northeast"), "49": ("มุกดาหาร", "Mukdahan", "northeast"),
 "50": ("เชียงใหม่", "Chiang Mai", "north"), "51": ("ลำพูน", "Lamphun", "north"),
 "52": ("ลำปาง", "Lampang", "north"), "53": ("อุตรดิตถ์", "Uttaradit", "north"),
 "54": ("แพร่", "Phrae", "north"), "55": ("น่าน", "Nan", "north"), "56": ("พะเยา", "Phayao", "north"),
 "57": ("เชียงราย", "Chiang Rai", "north"), "58": ("แม่ฮ่องสอน", "Mae Hong Son", "north"),
 "60": ("นครสวรรค์", "Nakhon Sawan", "north"), "61": ("อุทัยธานี", "Uthai Thani", "north"),
 "62": ("กำแพงเพชร", "Kamphaeng Phet", "north"), "63": ("ตาก", "Tak", "west"),
 "64": ("สุโขทัย", "Sukhothai", "north"), "65": ("พิษณุโลก", "Phitsanulok", "north"),
 "66": ("พิจิตร", "Phichit", "north"), "67": ("เพชรบูรณ์", "Phetchabun", "north"),
 "70": ("ราชบุรี", "Ratchaburi", "west"), "71": ("กาญจนบุรี", "Kanchanaburi", "west"),
 "72": ("สุพรรณบุรี", "Suphan Buri", "central"), "73": ("นครปฐม", "Nakhon Pathom", "central"),
 "74": ("สมุทรสาคร", "Samut Sakhon", "central"), "75": ("สมุทรสงคราม", "Samut Songkhram", "central"),
 "76": ("เพชรบุรี", "Phetchaburi", "west"), "77": ("ประจวบคีรีขันธ์", "Prachuap Khiri Khan", "west"),
 "80": ("นครศรีธรรมราช", "Nakhon Si Thammarat", "south"), "81": ("กระบี่", "Krabi", "south"),
 "82": ("พังงา", "Phangnga", "south"), "83": ("ภูเก็ต", "Phuket", "south"),
 "84": ("สุราษฎร์ธานี", "Surat Thani", "south"), "85": ("ระนอง", "Ranong", "south"),
 "86": ("ชุมพร", "Chumphon", "south"), "90": ("สงขลา", "Songkhla", "south"),
 "91": ("สตูล", "Satun", "south"), "92": ("ตรัง", "Trang", "south"),
 "93": ("พัทลุง", "Phatthalung", "south"), "94": ("ปัตตานี", "Pattani", "south"),
 "95": ("ยะลา", "Yala", "south"), "96": ("นราธิวาส", "Narathiwat", "south"),
}

# Seats per province (400 total) - derived from the dataset's district numbers plus the 3 missing ones.
MISSING_CONST = {"10-15", "25-2", "55-1"}
MISSING_PL = {"10-15", "25-2", "41-6"}

# Official party-list seats certified by the ECT on 4 Mar 2026 (Thai Post report).
PL_SEATS_OFFICIAL = {
 "ประชาชน": 32, "ภูมิใจไทย": 19, "เพื่อไทย": 16, "ประชาธิปัตย์": 11, "เศรษฐกิจ": 3,
 "กล้าธรรม": 2, "รวมไทยสร้างชาติ": 2, "เพื่อชาติไทย": 2,
 "ใหม่": 1, "ไทยทรัพย์ทวี": 1, "ประชาธิปไตยใหม่": 1, "มิติใหม่": 1, "ไทยภักดี": 1,
 "ไทยสร้างไทย": 1, "รวมพลังประชาชน": 1, "เสรีรวมไทย": 1, "ทางเลือกใหม่": 1,
 "ไทรวมพลัง": 1, "พลังประชารัฐ": 1, "รวมใจไทย": 1, "ประชาชาติ": 1,
}
assert sum(PL_SEATS_OFFICIAL.values()) == 100

EN = {"ประชาชน": "People's Party", "ภูมิใจไทย": "Bhumjaithai", "เพื่อไทย": "Pheu Thai",
      "กล้าธรรม": "Kla Tham", "ประชาธิปัตย์": "Democrat", "ไทรวมพลัง": "Thai Ruam Palang",
      "พลังประชารัฐ": "Palang Pracharath", "ประชาชาติ": "Prachachat", "เศรษฐกิจ": "Economic",
      "รวมไทยสร้างชาติ": "United Thai Nation", "ไทยสร้างไทย": "Thai Sang Thai",
      "โอกาสใหม่": "Okat Mai", "เพื่อชาติไทย": "Puea Chat Thai", "เสรีรวมไทย": "Seri Ruam Thai"}

# ---------- canonical party names from party_code in party-list files
by_code = collections.defaultdict(collections.Counter)
pl_files = sorted(glob.glob(os.path.join(MATCHED, "party_list", "*.json")))
c_files = sorted(glob.glob(os.path.join(MATCHED, "constituency", "*.json")))
for f in pl_files:
    for p in json.load(open(f))["matched_parties"]:
        by_code[p["party_code"]][p["party"]] += 1
canon = {code: cnt.most_common(1)[0][0] for code, cnt in by_code.items()}
names = set(canon.values())

FIX = {"ไทยสร้างชาติ": "รวมไทยสร้างชาติ", "ไทยก้าวไทย": "ไทยก้าวใหม่", "แรงงานสร้างไทย": "แรงงานสร้างชาติ",
       "ปวงชนชาวไทย": "ปวงชนไทย", "บ้านเมือง": "เพื่อบ้านเมือง", "พรรคเศรษฐกิจ": "เศรษฐกิจ", "กล้าทา": "กล้าธรรม"}
AMBIG = {"ชาติ", "รวมพลัง", "สัมมาธิปไตย", "ประชาธิปัตย์ใหม่", "สร้างชาติ", "รักษ์ธรรม", "รวมพลังสร้างชาติ"}
fixlog = collections.Counter()
def norm_party(n):
    if n in names: return n
    if n in FIX: fixlog[(n, FIX[n])] += 1; return FIX[n]
    if n in AMBIG: fixlog[(n, "(unresolved)")] += 1; return "อื่น ๆ (ชื่อพรรคอ่านไม่ชัด)"
    m = difflib.get_close_matches(n, list(names), n=1, cutoff=0.6)
    if m: fixlog[(n, m[0])] += 1; return m[0]
    fixlog[(n, "(unresolved)")] += 1
    return "อื่น ๆ (ชื่อพรรคอ่านไม่ชัด)"

def area_of(d):
    return f'{d["province_code"]}-{d["constituency_number"]}'

districts = {}
def get(aid, d):
    if aid not in districts:
        pc = d["province_code"]
        districts[aid] = {"id": aid, "pc": pc, "n": d["constituency_number"]}
    return districts[aid]

const_party_votes = collections.Counter()
for f in c_files:
    d = json.load(open(f)); aid = area_of(d); rec = get(aid, d); s = d["summary"]
    cands = []
    for c in d["matched_candidates"]:
        if not c.get("votes") and c.get("name") == "ถูกถอนชื่อ":
            continue
        p = norm_party(c["party"])
        cands.append([p, int(c["votes"] or 0), c["name"], c["number"]])
        const_party_votes[p] += int(c["votes"] or 0)
    cands.sort(key=lambda x: -x[1])
    rec["c"] = {"el": s["eligible_voters"], "came": s["voters_came"], "good": s["good_votes"],
                "inv": s["invalid_votes"], "nov": s["no_votes"],
                "sumdiff": d["_validation"]["sum_diff_pct"], "cand": cands}

pl_party_votes = collections.Counter()
for f in pl_files:
    d = json.load(open(f)); aid = area_of(d); rec = get(aid, d); s = d["summary"]
    votes = collections.Counter()
    for p in d["matched_parties"]:
        votes[canon[p["party_code"]]] += int(p["votes"] or 0)
    for p, v in votes.items(): pl_party_votes[p] += v
    rec["p"] = {"el": s["eligible_voters"], "came": s["voters_came"], "good": s["good_votes"],
                "inv": s["invalid_votes"], "nov": s["no_votes"],
                "sumdiff": d["_validation"]["sum_diff_pct"], "votes": dict(votes)}

for aid in MISSING_CONST | MISSING_PL:
    pc, n = aid.split("-")
    districts.setdefault(aid, {"id": aid, "pc": pc, "n": int(n)})

# ---------- party table, ordered by total seats then party-list votes
const_seats = collections.Counter(r["c"]["cand"][0][0] for r in districts.values() if "c" in r)
all_parties = set(const_party_votes) | set(pl_party_votes)
def total(p): return const_seats[p] + PL_SEATS_OFFICIAL.get(p, 0)
order = sorted(all_parties, key=lambda p: (-total(p), -pl_party_votes[p], -const_party_votes[p]))
pidx = {p: i for i, p in enumerate(order)}
parties = [{"name": p, "en": EN.get(p, ""), "cs": const_seats[p], "pls": PL_SEATS_OFFICIAL.get(p, 0),
            "cv": const_party_votes[p], "pv": pl_party_votes[p]} for p in order]

out_d = []
for aid in sorted(districts, key=lambda a: (int(a.split("-")[0]), int(a.split("-")[1]))):
    r = districts[aid]; o = {"id": aid, "pc": r["pc"], "n": r["n"]}
    if "c" in r:
        c = r["c"]
        o["c"] = [c["el"], c["came"], c["good"], c["inv"], c["nov"], round(c["sumdiff"], 3),
                  [[pidx[p], v, name, no] for p, v, name, no in c["cand"]]]
    if "p" in r:
        p = r["p"]
        o["p"] = [p["el"], p["came"], p["good"], p["inv"], p["nov"], round(p["sumdiff"], 3),
                  sorted([[pidx[k], v] for k, v in p["votes"].items() if v > 0], key=lambda x: -x[1])]
    out_d.append(o)

seats_per_prov = collections.Counter(r["pc"] for r in out_d)
provinces = {pc: {"th": th, "en": en, "region": reg, "seats": seats_per_prov[pc]} for pc, (th, en, reg) in PROV.items()}
assert len(out_d) == 400, len(out_d)
assert set(seats_per_prov) == set(PROV)

json.dump({"generated": "2026-10-12", "parties": parties, "provinces": provinces, "districts": out_d},
          open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))

print("districts", len(out_d), "const files", len(c_files), "pl files", len(pl_files))
print("const seats", const_seats.most_common(12))
print("top parties", [(p["name"], p["cs"], p["pls"], p["cs"] + p["pls"]) for p in parties[:12]])
print("name fixes", sorted(fixlog.items(), key=lambda kv: -kv[1]))
print("bytes", os.path.getsize(OUT))
