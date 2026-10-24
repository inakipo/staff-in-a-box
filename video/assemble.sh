cd "$(dirname "$0")"
ls story_out/seg_*.mp4 | sort | sed "s/^/file '/;s/$/'/" | sed "s#file 'story_out/#file '#" > story_out/video.txt
ls story_audio/p_*.wav | sort | sed "s#story_audio/##;s/^/file '/;s/$/'/" > story_audio/audio.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i story_out/video.txt -c copy story_out/video.mp4
ffmpeg -y -loglevel error -f concat -safe 0 -i story_audio/audio.txt -c copy story_audio/narration.wav
python3 - <<'PY'
import subprocess, story
from pathlib import Path
starts, t, meta = [], 0.0, ";FFMETADATA1\n"
durs = [float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"story_audio/p_{i:02d}.wav"],capture_output=True,text=True).stdout) for i in range(len(story.SEG))]
chap, last = [], None
for i, s in enumerate(story.SEG):
    c = s["ch"].split(":")[0] if s["ch"].startswith("Question") else ("Introduction" if i < 4 else "Wrap-up")
    if c != last: chap.append([c, t]); last = c
    t += durs[i]
for n, (c, st) in enumerate(chap):
    en = chap[n + 1][1] if n + 1 < len(chap) else t
    meta += f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={int(st*1000)}\nEND={int(en*1000)}\ntitle={c}\n"
Path("story_out/chapters.txt").write_text(meta)
print(round(t), "s", [c for c, _ in chap])
PY
ffmpeg -y -loglevel error -i story_out/video.mp4 -i story_audio/narration.wav -i story_out/chapters.txt -map 0:v -map 1:a -map_chapters 2 -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart staff-in-a-box-the-engine.mp4
ls -la staff-in-a-box-the-engine.mp4
