"""Read radio messages with a small local model on the Mac GPU (MLX). Loads once, reads a batch, exits: no server.
Usage (MLX venv): .mlx/bin/python sib/read_mlx.py <in.jsonl> <out.jsonl> [model] [adapter_dir]
Each input line has "id" and "text"; each output line adds "raw" (model text), "parsed" (dict or null) and "ms"."""

import json
import sys
import time
from pathlib import Path

PROMPT = """You read military radio spot reports (English or French) and return ONLY a JSON object, no other text.
Fields:
- "time": the clock time as "HHMM" (e.g. "0640"), or null if the message gives none
- "count": the number of vehicles as an integer
- "unit_type": "armour" (tanks), "mech_inf" (BMP, APC, IFV, troop carriers), "recon" (light/scout/recce vehicles) or "unknown"
- "activity": "moving" or "halted"
- "heading": direction of travel, one of N NE E SE S SW W NW, or null if halted or not given
- "location": EITHER {"grid": "31U <easting> <northing>"} when a grid is given,
  OR {"anchor": <id>, "bearing": <N..NW or null>, "distance_km": <number or null>} relative to a landmark.
  Landmark ids: vitry, ramerupt, brienne, arcis, camp_mailly, X1, X4, X5, X6 (bridges). "the Ramerupt bridge" = X4, "the Brienne bridge" = X5.
  The bearing is FROM the landmark TO the vehicles ("2 km N of X4" = anchor X4, bearing N, distance 2).
Message:
"""


def sentinel_ok():
    try:
        return Path.home().joinpath(".pyrus/mac-sentinel/level").read_text().strip() == "ok"
    except OSError:
        return True


def parse(txt):
    s = txt.strip()
    if s.startswith("```"):
        s = s.strip("`").split("\n", 1)[-1]
    a, b = s.find("{"), s.rfind("}")
    try:
        return json.loads(s[a:b + 1]) if a >= 0 else None
    except json.JSONDecodeError:
        return None


def main():
    if not sentinel_ok():
        sys.exit("Mac memory sentinel is not 'ok': not loading a model now.")
    from mlx_lm import generate, load
    src, dst = sys.argv[1], sys.argv[2]
    model_id = sys.argv[3] if len(sys.argv) > 3 else "mlx-community/Qwen3.5-4B-MLX-4bit"
    adapter = sys.argv[4] if len(sys.argv) > 4 else None
    model, tok = load(model_id, adapter_path=adapter) if adapter else load(model_id)
    rows = [json.loads(l) for l in open(src)]
    done = set()
    if Path(dst).exists():                      # resume: keep what was already read
        done = {json.loads(l)["id"] for l in open(dst) if l.strip()}
    rows = [r for r in rows if r["id"] not in done]
    with open(dst, "a") as out:
        for n, r in enumerate(rows):
            msgs = [{"role": "user", "content": PROMPT + r["text"]}]
            try:
                prompt = tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False, enable_thinking=False)
            except TypeError:
                prompt = tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False)
            t0 = time.time()
            raw = generate(model, tok, prompt=prompt, max_tokens=180, verbose=False)
            out.write(json.dumps({"id": r["id"], "raw": raw, "parsed": parse(raw), "ms": round(1000 * (time.time() - t0))}, ensure_ascii=False) + "\n")
            out.flush()
            if n % 25 == 0:
                print(n, "of", len(rows), flush=True)
                if not sentinel_ok():
                    sys.exit("Mac memory sentinel left 'ok': stopping early.")
    print("DONE", len(rows))


if __name__ == "__main__":
    main()
