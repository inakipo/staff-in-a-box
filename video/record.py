"""Record the story video from the 3D viewer: one JPEG per frame on the Mac GPU (Chrome + Metal), 4 segments in parallel,
then one mp4 per segment, joined with the narration. Usage: record.py <audio_dir> [segment indexes]"""
import concurrent.futures as cf
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import story

HERE = Path(__file__).parent
AUDIO = Path(sys.argv[1])
OUT = HERE / "story_out"
OUT.mkdir(exist_ok=True)
FPS = 15
URL = (HERE.parent / "viewer" / "index.html").resolve().as_uri()
PLACES = {"camp_mailly": (48.665, 4.213), "vitry": (48.725, 4.585), "sommesous": (48.737, 4.203), "arcis": (48.535, 4.141),
          "brienne": (48.393, 4.526), "ramerupt": (48.515, 4.296)}
NAMES = {"camp_mailly": "Camp de Mailly", "vitry": "Vitry-le-François", "sommesous": "Sommesous (armour)"}

CSS = """
body.video #panel{display:none}
body.video.withpanel #panel{display:flex}
body.video #lplain, body.video .why, body.video .tech, body.video #nav, body.video #timebar, body.video #brand{display:none!important}
#vch{position:absolute;left:28px;top:22px;z-index:50;font:700 26px Inter,system-ui,sans-serif;color:#f5b25b;letter-spacing:.01em;
 background:rgba(10,14,20,.72);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.08)}
#vcap{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:50;max-width:78%;text-align:center;
 font:700 40px/1.2 Inter,system-ui,sans-serif;color:#fff;background:rgba(10,14,20,.8);padding:16px 30px;border-radius:16px;
 border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 40px rgba(0,0,0,.4)}
.vring{position:absolute;z-index:45;border:5px solid #ffd166;border-radius:50%;box-shadow:0 0 0 3px rgba(0,0,0,.35),0 0 30px rgba(255,209,102,.6);pointer-events:none}
.vlab{position:absolute;z-index:46;font:700 22px Inter,system-ui,sans-serif;color:#111;background:#ffd166;padding:4px 12px;border-radius:8px;transform:translateX(-50%)}
"""

OVERLAY_JS = """([ch, cap, foci, k, panel]) => {
  document.body.classList.add('video'); document.body.classList.toggle('withpanel', panel);
  const stage = document.getElementById('stage');
  let c = document.getElementById('vch'); if (!c) { c = document.createElement('div'); c.id = 'vch'; stage.appendChild(c); }
  let p = document.getElementById('vcap'); if (!p) { p = document.createElement('div'); p.id = 'vcap'; stage.appendChild(p); }
  c.textContent = ch; p.textContent = cap;
  document.querySelectorAll('.vring,.vlab').forEach(e => e.remove());
  const sr = stage.getBoundingClientRect();
  foci.forEach(([lat, lon, label]) => {
    const s = window.screenOf(lat, lon); if (!s.visible) return;
    const r = 46 + 8 * Math.sin(k * 0.35);
    const d = document.createElement('div'); d.className = 'vring';
    d.style.cssText = `left:${s.x - sr.left - r}px;top:${s.y - sr.top - r}px;width:${2*r}px;height:${2*r}px`;
    stage.appendChild(d);
    if (label) { const l = document.createElement('div'); l.className = 'vlab'; l.textContent = label;
      l.style.cssText = `left:${s.x - sr.left}px;top:${s.y - sr.top + r + 8}px`; stage.appendChild(l); }
  });
}"""


def durations():
    out = []
    for i in range(len(story.SEG)):
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(AUDIO / f"p_{i:02d}.wav")],
                                 capture_output=True, text=True).stdout)
        out.append(d)
    return out


def focus_points(seg, crossings):
    pts = []
    for k in seg.get("focus", []):
        if k in crossings:
            pts.append([crossings[k][0], crossings[k][1], k])
        else:
            la, lo = PLACES[k]
            pts.append([la, lo, NAMES.get(k, "")])
    return pts


def record(idx_list, durs):
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto(URL)
        pg.wait_for_function("window.ready === true", timeout=120000)
        pg.add_style_tag(content=CSS)
        crossings = pg.evaluate("() => Object.fromEntries(Object.entries(SIB.crossings).map(([k, v]) => [k, v.pos]))")
        for i in idx_list:
            seg = story.SEG[i]
            n = max(1, round(durs[i] * FPS))
            fdir = OUT / f"f_{i:02d}"
            fdir.mkdir(exist_ok=True)
            for f in fdir.glob("*.jpg"):
                f.unlink()
            li = pg.evaluate(f"lessonIndex('{seg['lesson']}')")
            pg.evaluate(f"goLesson({li}, true)")
            pg.evaluate("window.dispatchEvent(new Event('resize'))")
            foci = focus_points(seg, crossings)
            a, z = seg["p"]
            for k in range(n):
                prog = a + (z - a) * (k / max(1, n - 1))
                pg.evaluate(f"setProgress({prog})")
                if seg.get("cam"):
                    pg.evaluate(f"setCamera({json.dumps(seg['cam'])})")
                pg.evaluate("renderNow()")
                pg.evaluate(OVERLAY_JS, [seg["ch"], seg["cap"], foci, k, bool(seg.get("panel"))])
                if k == 0:
                    pg.evaluate("window.dispatchEvent(new Event('resize'))"); pg.evaluate("renderNow()")
                    pg.evaluate(OVERLAY_JS, [seg["ch"], seg["cap"], foci, k, bool(seg.get("panel"))])
                pg.screenshot(path=str(fdir / f"{k:05d}.jpg"), type="jpeg", quality=88)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(fdir / "%05d.jpg"), "-frames:v", str(n),
                            "-c:v", "h264_videotoolbox", "-b:v", "6000k", "-pix_fmt", "yuv420p", "-r", str(FPS), str(OUT / f"seg_{i:02d}.mp4")], check=True)
            print("segment", i, n, "frames", flush=True)
        b.close()


if __name__ == "__main__":
    durs = durations()
    todo = [int(x) for x in sys.argv[2:]] or list(range(len(story.SEG)))
    lanes = [todo[k::4] for k in range(4)]
    with cf.ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda l: record(l, durs), [l for l in lanes if l]))
    print("ALL SEGMENTS RECORDED")
