# -*- coding: utf-8 -*-
"""يبني أسئلة «أكمل الآية» من النصّ المنزَّل.

السؤال: الآية بلا كلمتها الأخيرة، وثلاثة خيارات إحداها الصحيحة.
والبدائل تُنتقى من أواخر آياتٍ أخرى تشترك معها في حرف الرويّ،
فلا تُعرف الإجابة بالشكل وحده بل بالحفظ.
"""
import json, random, re, sys, unicodedata

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
random.seed(1448)

raw = json.load(open(sys.argv[1], encoding="utf-8"))

HARAKAT = re.compile(r"[\u064B-\u0652\u0670\u0640\u06D6-\u06ED\u08F0-\u08F3]")
def bare(w):
    w = HARAKAT.sub("", w)
    w = w.replace("\u0671", "\u0627").replace("\u0622", "\u0627")
    w = w.replace("\u0623", "\u0627").replace("\u0625", "\u0627")
    w = w.replace("\u0649", "\u064A").replace("\u0629", "\u0647")
    return w.strip()

BASMALA_WORDS = 4

ZW = re.compile(r"[﻿​-‏‪-‮]")

def ayah_text(sura_no, n, t):
    """يُسقط البسملة من أول آية، فهي ليست من السورة في العدّ هنا"""
    t = ZW.sub("", t)
    if n == 1 and sura_no not in (1, 9):
        parts = t.split()
        if len(parts) > BASMALA_WORDS and bare(parts[0]).startswith("بسم"):
            return " ".join(parts[BASMALA_WORDS:])
    return t

# ─────────── جمع كل الآيات ───────────
items = []   # (level_key, surah_name, ayah_no, text)

LEVELS = [
    ("s", "البداية",      "قِصار السور التي يحفظها الصغار",  [114,113,112,111,110,109,108,107,106,105,104,103,102,101]),
    ("j", "جزء عمّ",       "ما بعد القِصار من جزء عمّ",        [100,99,98,97,96,95,94,93,92,91,90]),
    ("m", "المفصّل",       "سور أطول من الجزء نفسه",           [89,88,87,86,85,84,83,82]),
    ("t", "الطوال",        "أوائل جزء عمّ — أطولها",           [81,80,79,78]),
    ("f", "آيات مشهورة",   "آية الكرسي وأخواتها من السور الطوال", []),
]

pool = {}
for key, title, sub, suras in LEVELS:
    rows = []
    for sn in suras:
        s = raw["surahs"].get(str(sn))
        if not s: continue
        for a in s["ayahs"]:
            rows.append((s["name"], a["n"], ayah_text(sn, a["n"], a["t"])))
    pool[key] = rows

pool["f"] = [(v["name"], v["n"], ZW.sub("", v["t"])) for v in raw["ayahs"].values()]

# ─────────── مجموعة أواخر الكلمات للبدائل ───────────
all_last = []
for rows in pool.values():
    for _, _, t in rows:
        w = t.split()
        if len(w) >= 3: all_last.append(w[-1])

def rhyme(w):
    b = bare(w)
    return b[-2:] if len(b) >= 2 else b

by_rhyme = {}
for w in all_last:
    by_rhyme.setdefault(rhyme(w), []).append(w)

def distractors(ans):
    ab = bare(ans)
    same = [w for w in by_rhyme.get(rhyme(ans), []) if bare(w) != ab]
    other = [w for w in all_last if bare(w) != ab]
    out, seen = [], {ab}
    random.shuffle(same); random.shuffle(other)
    # الأوّل من حرف الرويّ نفسه، والثاني من حيث اتّفق — فلا يُعرف بالسجع
    for src in (same, other, other):
        for w in src:
            if bare(w) in seen: continue
            # قريبة في الطول حتى لا تُستبعد بالنظر
            if abs(len(bare(w)) - len(ab)) > 3: continue
            out.append(w); seen.add(bare(w)); break
        if len(out) == 2: break
    while len(out) < 2:
        w = random.choice(other)
        if bare(w) not in seen: out.append(w); seen.add(bare(w))
    return out[:2]

data, stats = {}, {}
for key, title, sub, _ in LEVELS:
    qs = []
    for name, n, t in pool[key]:
        words = t.split()
        if len(words) < 3: continue          # لا بدّ من سياقٍ يُستدلّ به
        ans = words[-1]
        prompt = " ".join(words[:-1])
        qs.append({"s": name, "n": n, "p": prompt, "a": ans, "d": distractors(ans)})
    data[key] = {"t": title, "sub": sub, "q": qs}
    stats[key] = len(qs)

print("أسئلة كل مرحلة:", stats, "| المجموع:", sum(stats.values()))

js = ("/* أسئلة «أكمل الآية» — النصّ من api.alquran.cloud (quran-uthmani)\n"
      "   مبنيّ آلياً، لا يُحرَّر باليد. */\nwindow.AYAT = ")
js += json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(sys.argv[2], "w", encoding="utf-8").write(js)
print("كُتب", sys.argv[2], len(js), "حرفاً")
