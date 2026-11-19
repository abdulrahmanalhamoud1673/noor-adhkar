# -*- coding: utf-8 -*-
"""ينزّل نصّ الآيات من api.alquran.cloud ويحفظه خاماً.

لا يكتب النصّ أحدٌ هنا — يُنقل كما هو من المصدر، ثم يُفحص.
"""
import json, sys, time, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "https://api.alquran.cloud/v1/surah/%d/quran-uthmani"

SURAHS = list(range(78, 115))          # جزء عمّ كاملاً
EXTRA  = ["2:255", "2:285", "2:286", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7",
          "18:1", "18:2", "36:1", "36:2", "36:3", "36:4",
          "55:1", "55:2", "55:3", "55:4", "59:22", "59:23", "59:24",
          "3:190", "3:191", "17:23", "17:24", "31:13", "31:14",
          "49:11", "49:12", "49:13", "25:63", "25:64", "23:1", "23:2", "23:3"]

out = {"surahs": {}, "ayahs": {}}

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(2 + i * 2)

for n in SURAHS:
    d = get(BASE % n)["data"]
    out["surahs"][str(n)] = {
        "name": d["name"], "ayahs": [
            {"n": a["numberInSurah"], "t": a["text"]} for a in d["ayahs"]
        ]
    }
    print("surah", n, d["numberOfAyahs"], "ayahs")
    time.sleep(0.15)

for ref in EXTRA:
    d = get("https://api.alquran.cloud/v1/ayah/%s/quran-uthmani" % ref)["data"]
    out["ayahs"][ref] = {"name": d["surah"]["name"], "n": d["numberInSurah"], "t": d["text"]}
    print("ayah", ref, "ok")
    time.sleep(0.15)

json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
print("saved", sys.argv[1])
