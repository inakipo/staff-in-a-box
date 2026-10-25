"""Out-of-template test set: another model rewrites each eval message in its own words, keeping every fact. A rewrite is
kept only if every number (time, count, grid digits, distance) and the landmark survive. Groq gpt-oss-120b."""
import concurrent.futures as cf
import json
import os
import re
import subprocess
import time

from .reading import D

ASK = """Rewrite this military radio spot report as a different soldier would say it on the radio, in the SAME language ({lang}).
Change the wording, word order and style freely (more or less formal, abbreviations, filler words), but keep EVERY fact exactly:
the same time digits, the same number of vehicles, the same vehicle type, moving or halted, the same direction, and the same location
(keep grid digits exactly, or the same landmark with the same distance and direction). Do not add facts. Reply with the rewritten
message only.

Message: {text}"""


def nums(t):
    return sorted(re.findall(r"\d+", t.replace(",", ".").replace(".", " ")))


def call(prompt):
    body = json.dumps({"model": "openai/gpt-oss-120b", "temperature": 0.7, "messages": [{"role": "user", "content": prompt}]})
    for attempt in range(8):
        r = subprocess.run(["curl", "-s", "https://api.groq.com/openai/v1/chat/completions", "-H", f"Authorization: Bearer {os.environ['GROQ_API_KEY']}",
                            "-H", "Content-Type: application/json", "-d", body], capture_output=True, text=True)
        try:
            return json.loads(r.stdout)["choices"][0]["message"]["content"].strip()
        except (KeyError, json.JSONDecodeError):
            time.sleep(4 + 3 * attempt)
    return None


def main():
    msgs = json.load((D / "eval.json").open())
    landmarks = ["X1", "X4", "X5", "X6", "Vitry", "Ramerupt", "Brienne", "Arcis", "Mailly", "camp"]

    def one(m):
        out = call(ASK.format(lang="French" if m["lang"] == "fr" else "English", text=m["text"]))
        if not out:
            return m["uid"], None, "no answer"
        if nums(out) != nums(m["text"]):
            return m["uid"], None, "numbers changed"
        lm = [l for l in landmarks if l.lower() in m["text"].lower()]
        if any(l.lower() not in out.lower() for l in lm):
            return m["uid"], None, "landmark lost"
        return m["uid"], out, "ok"

    with cf.ThreadPoolExecutor(3) as ex:
        res = list(ex.map(one, msgs))
    kept = {u: t for u, t, why in res if t}
    why = {}
    for _, _, w in res:
        why[w] = why.get(w, 0) + 1
    rows = [dict(m, text=kept[m["uid"]]) for m in msgs if m["uid"] in kept]
    json.dump(rows, (D / "eval_rw.json").open("w"), ensure_ascii=False)
    with (D / "eval_rw.jsonl").open("w") as f:
        for m in rows:
            f.write(json.dumps({"id": m["uid"], "text": m["text"]}, ensure_ascii=False) + "\n")
    print(len(rows), "kept of", len(msgs), why)


if __name__ == "__main__":
    main()
